const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

const TOKEN = 'events-test-token';
let t, admin, gv, guest, webClass;
const realFetch = global.fetch;

const TX_HEAD = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE'];
const COURSE = { headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE'],
  rows: [['EBA120', 'P1.EBA.B120.OF.MA.010126', '2026-11-01', '2026-12-01', null]] };
const row = (id, name, status = null) => [id, 'C-' + id, name, `${id.toLowerCase()}@x.com`, '0901111111', 'EBA120', 'Offline', 'Male', status, 'Form'];
const A = row('E.1', 'An'), B = row('E.2', 'Bình'), C = row('E.3', 'Chi');

const sync = (...rows) => realFetch(`${t.base}/api/sync/transactions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN },
  body: JSON.stringify({ transactions: { headers: TX_HEAD, rows }, course: COURSE }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

const events = (where = '', params = []) => t.db.all(`select * from enrollment_events ${where} order by id`, params);
const eba = async () => (await t.db.one("select id from classes where short_code = 'EBA120'")).id;

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  guest = await t.login('khach@x.com');
  webClass = (await admin.post('/api/classes', { code: 'EV.01', session_count: 2, hw_count: 0 })).body.id;
  for (const id of [gvId, gId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [webClass] });
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('web: thêm học viên và đổi trạng thái được ghi vào nhật ký, kèm người thực hiện', async () => {
  const add = await admin.post(`/api/classes/${webClass}/students`, { student_code: 'W.1', full_name: 'Võ Web' });
  assert.equal(add.status, 201);
  const enr = add.body.id;
  const first = await events('where class_id = $1', [webClass]);
  assert.equal(first.length, 1);
  assert.deepEqual([first[0].event, first[0].source, first[0].actor_name, first[0].student_code], ['enrolled', 'web', 'admin', 'W.1']);

  await admin.put(`/api/classes/${webClass}/students/${enr}`, { course_status: 'dropped' });
  await admin.put(`/api/classes/${webClass}/students/${enr}`, { course_status: 'dropped', note: 'ghi chú khác' }); // không đổi trạng thái
  const after = await events('where class_id = $1', [webClass]);
  assert.equal(after.length, 2);
  assert.deepEqual([after[1].event, after[1].from_status, after[1].to_status, after[1].source], ['status_changed', 'active', 'dropped', 'web']);

  const list = (await admin.get(`/api/classes/${webClass}/events`)).body;
  assert.equal(list.length, 2);
  assert.equal(list[0].event, 'status_changed'); // mới nhất trước
});

test('gỡ khỏi lớp: chỉ admin, bắt buộc có lý do, ghi nhật ký có chụp lại thông tin', async () => {
  const enr = (await admin.get(`/api/classes/${webClass}/students`)).body[0].id;
  const sess = (await admin.get(`/api/classes/${webClass}/sessions`)).body[0];
  await admin.put(`/api/classes/${webClass}/attendance`, { enrollment_id: enr, session_id: sess.id, status: 'present' });
  const url = `/api/classes/${webClass}/students/${enr}`;

  assert.equal((await gv.del(url, { reason: 'x' })).status, 403);      // giảng viên không được gỡ
  assert.equal((await guest.del(url, { reason: 'x' })).status, 403);   // khách không được gỡ
  assert.equal((await admin.del(url)).status, 400);                     // thiếu lý do
  assert.equal((await admin.del(url, { reason: '   ' })).status, 400);  // lý do trống
  assert.equal((await t.db.one('select count(*)::int n from enrollments where id = $1', [enr])).n, 1);

  const ok = await admin.del(url, { reason: 'Nhập nhầm lớp' });
  assert.equal(ok.status, 200);
  assert.equal((await t.db.one('select count(*)::int n from enrollments where id = $1', [enr])).n, 0);
  const ev = (await events("where event = 'removed' and class_id = $1", [webClass]))[0];
  assert.equal(ev.student_code, 'W.1');
  assert.equal(ev.full_name, 'Võ Web');
  assert.equal(ev.actor_name, 'admin');
  assert.match(ev.note, /Nhập nhầm lớp/);
  assert.match(ev.note, /1 lượt điểm danh/);
});

test('nhật ký của lớp: chỉ người có quyền vào lớp xem được', async () => {
  const other = (await admin.post('/api/classes', { code: 'EV.02', session_count: 1, hw_count: 0 })).body.id;
  assert.equal((await gv.get(`/api/classes/${other}/events`)).status, 403);
  assert.equal((await guest.get(`/api/classes/${webClass}/events`)).status, 200);
});

test('đồng bộ Sheet: ghi sự kiện thêm mới/đổi trạng thái; chạy lại không ghi trùng', async () => {
  const r = await sync(A, B, C);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = await eba();
  const ev = await events('where class_id = $1', [id]);
  assert.equal(ev.length, 3);
  assert.ok(ev.every((e) => e.event === 'enrolled' && e.source === 'sync' && e.actor_name === null));
  assert.equal((await sync(A, B, C)).status, 200);
  assert.equal((await events('where class_id = $1', [id])).length, 3);

  await sync(A, row('E.2', 'Bình', 'Không tham gia'), C);
  const chg = await events("where class_id = $1 and event = 'status_changed'", [id]);
  assert.equal(chg.length, 1);
  assert.deepEqual([chg[0].student_code, chg[0].from_status, chg[0].to_status], ['E.2', 'active', 'dropped']);
});

test('không còn thấy trong Sheet: chỉ cảnh báo (không tự chuyển nghỉ), không ghi trùng, xuất hiện lại thì ghi nhận', async () => {
  const id = await eba();
  const dropB = row('E.2', 'Bình', 'Không tham gia');
  await sync(A, dropB);                         // C biến mất
  let miss = await events("where class_id = $1 and event = 'missing_from_sheet'", [id]);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].student_code, 'E.3');
  const cStatus = await t.db.one("select e.course_status from enrollments e join students s on s.id = e.student_id where s.student_code = 'E.3'");
  assert.equal(cStatus.course_status, 'active');  // KHÔNG tự đổi sang nghỉ

  await sync(A, dropB);                         // lần nữa: không ghi trùng
  miss = await events("where class_id = $1 and event = 'missing_from_sheet'", [id]);
  assert.equal(miss.length, 1);

  const flagged = (await admin.get(`/api/classes/${id}/students`)).body.find((s) => s.student_code === 'E.3');
  assert.equal(flagged.missing_from_sheet, true);
  assert.equal((await admin.get('/api/import/sync-status')).body.missing, 1);

  await sync(A, dropB, C);                      // xuất hiện lại
  const back = await events("where class_id = $1 and event = 'reappeared'", [id]);
  assert.equal(back.length, 1);
  assert.equal((await admin.get(`/api/classes/${id}/students`)).body.find((s) => s.student_code === 'E.3').missing_from_sheet, false);
});

test('Sheet ít bất thường (xóa nhầm): không dò "không còn trong Sheet"', async () => {
  const id = await eba();
  const before = (await events("where class_id = $1 and event = 'missing_from_sheet'", [id])).length;
  const r = await sync(A);                      // 1 dòng < 50% lần trước (3 dòng)
  assert.equal(r.status, 200);
  assert.equal(r.body.missing_detection_skipped, true);
  assert.equal((await events("where class_id = $1 and event = 'missing_from_sheet'", [id])).length, before);
});

test('admin đã gỡ học viên thì đồng bộ không tự thêm lại', async () => {
  const id = await eba();
  const a = (await admin.get(`/api/classes/${id}/students`)).body.find((s) => s.student_code === 'E.1');
  assert.equal((await admin.del(`/api/classes/${id}/students/${a.id}`, { reason: 'Đăng ký nhầm' })).status, 200);
  const r = await sync(A, row('E.2', 'Bình', 'Không tham gia'), C);
  assert.equal(r.status, 200);
  assert.equal(r.body.skipped_removed, 1);
  const n = await t.db.one("select count(*)::int n from enrollments e join students s on s.id = e.student_id where s.student_code = 'E.1' and e.class_id = $1", [id]);
  assert.equal(n.n, 0);
  // thêm lại thủ công trên web thì được
  assert.equal((await admin.post(`/api/classes/${id}/students`, { student_code: 'E.1', full_name: 'An' })).status, 201);
});
