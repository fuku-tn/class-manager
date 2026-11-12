// Bảo lưu theo Google Sheet (chủ dự án chốt 12/11/2026): DEFERRAL STATUS = TRUE của sheet PERSONAL = bảo lưu của khóa ghi ở DEFERRAL COURSE.
// Sheet bỏ tick thì chỉ trả về "đang học" khi chính Sheet đã chuyển sang bảo lưu; bảo lưu đặt tay trên web không bị đụng; nhãn STATUS lạ được đếm.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

const TOKEN = 'test-sync-token-deferral';
let t, admin;
const realFetch = global.fetch;

const HEAD = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE', 'DEFERRAL STATUS', 'DEFERRAL COURSE'];
const HEAD_NO_DEF = HEAD.slice(0, 10);
const COURSE = { headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE'],
  rows: [['BIE104', 'P2.BIE.P104.HY.AA.041026', '2026-10-04', '2026-12-20', null], ['BIE105', 'P2.BIE.P105.HY.AA.011126', '2026-11-01', '2027-01-20', null]] };
// row(mã, lớp, deferralStatus, deferralCourse, status)
const row = (sid, course, def, defCourse = null, status = 'Đã thanh toán') => [sid, 'C' + sid, 'Học viên ' + sid, null, null, course, 'Online', 'Female', status, 'Form', def, defCourse];
const sheet = (...rows) => ({ headers: HEAD, rows });

function post(body) {
  return realFetch(`${t.base}/api/sync/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}
const enr = (code, course) => t.db.one(
  `select e.id, e.course_status, e.deferred_by_sheet, e.sheet_status from enrollments e join students s on s.id = e.student_id join classes c on c.id = e.class_id
    where s.student_code = $1 and c.short_code = $2`, [code, course]);
const events = (code) => t.db.all(
  "select event, from_status, to_status, note, source from enrollment_events where student_code = $1 and event = 'status_changed' order by id", [code]);

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  admin = await t.login('admin@x.com');
  await t.db.run("insert into curricula (code, program, name, session_count) values ('BIE-8', 'BIE', 'BIE 8 buổi', 8)");
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('DEFERRAL STATUS = TRUE → bảo lưu khóa đó, ghi sự kiện, đánh dấu do Sheet; FALSE → vẫn đang học', async () => {
  const r = await post({ transactions: sheet(row('P.1', 'BIE104', true, 'BIE104'), row('P.2', 'BIE104', false)), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.deferral_column, true);
  assert.equal(r.body.deferred_from_sheet, 1);
  const a = await enr('P.1', 'BIE104');
  assert.deepEqual([a.course_status, a.deferred_by_sheet, a.sheet_status], ['deferred', true, 'Đã thanh toán']);   // nhãn STATUS giữ nguyên
  assert.deepEqual([(await enr('P.2', 'BIE104')).course_status, (await enr('P.2', 'BIE104')).deferred_by_sheet], ['active', false]);
  const ev = await events('P.1');
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].from_status, ev[0].to_status, ev[0].source], ['active', 'deferred', 'sync']);
  assert.match(ev[0].note, /DEFERRAL STATUS = TRUE.*BIE104/);
});

test('chạy lại cùng dữ liệu không ghi trùng; Sheet bỏ tick (FALSE) thì trả về đang học (chỉ khi do Sheet bảo lưu)', async () => {
  const same = await post({ transactions: sheet(row('P.1', 'BIE104', true, 'BIE104'), row('P.2', 'BIE104', false)), course: COURSE });
  assert.equal(same.body.deferred_from_sheet, 0);
  assert.equal((await events('P.1')).length, 1);
  const back = await post({ transactions: sheet(row('P.1', 'BIE104', false), row('P.2', 'BIE104', false)), course: COURSE });
  assert.equal(back.body.reactivated_from_sheet, 1);
  const a = await enr('P.1', 'BIE104');
  assert.deepEqual([a.course_status, a.deferred_by_sheet], ['active', false]);
  const ev = await events('P.1');
  assert.deepEqual(ev.map((e) => e.to_status), ['deferred', 'active']);
});

test('bảo lưu đặt tay trên web không bị Sheet kéo về đang học', async () => {
  const p2 = await enr('P.2', 'BIE104');
  await t.db.run("update enrollments set course_status = 'deferred' where id = $1", [p2.id]);   // admin đặt tay
  const r = await post({ transactions: sheet(row('P.1', 'BIE104', false), row('P.2', 'BIE104', false)), course: COURSE });
  assert.equal(r.body.reactivated_from_sheet, 0);
  assert.equal((await enr('P.2', 'BIE104')).course_status, 'deferred');
  // Sheet TRUE rồi FALSE trên học viên đã bảo lưu tay: vẫn không đổi, không đánh dấu do Sheet
  await post({ transactions: sheet(row('P.2', 'BIE104', true, 'BIE104')), course: COURSE });
  assert.equal((await enr('P.2', 'BIE104')).deferred_by_sheet, false);
  await post({ transactions: sheet(row('P.2', 'BIE104', false)), course: COURSE });
  assert.equal((await enr('P.2', 'BIE104')).course_status, 'deferred');
});

test('DEFERRAL COURSE khác khóa của dòng: bảo lưu khóa ghi ở DEFERRAL COURSE, khóa của dòng giữ nguyên (dòng nào cũng được, thứ tự nào cũng được)', async () => {
  for (const order of [[row('P.3', 'BIE104', false), row('P.3', 'BIE105', true, 'BIE104')], [row('P.4', 'BIE105', true, 'BIE104'), row('P.4', 'BIE104', false)]]) {
    const r = await post({ transactions: sheet(...order), course: COURSE });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const sid = order[0][0];
    assert.equal((await enr(sid, 'BIE104')).course_status, 'deferred', sid);
    assert.equal((await enr(sid, 'BIE105')).course_status, 'active', sid);
  }
});

test('DEFERRAL COURSE không có trong app: không đổi gì và được đếm; nhãn STATUS lạ được đếm (không bỏ sót âm thầm)', async () => {
  const r = await post({ transactions: sheet(row('P.5', 'BIE104', true, 'BIE999'), row('P.6', 'BIE104', false, null, 'Bảo lưu')), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.deferral_unknown_course, { BIE999: 1 });
  assert.equal((await enr('P.5', 'BIE104')).course_status, 'active');
  assert.deepEqual(r.body.unknown_status_labels, { 'Bảo lưu': 1 });
});

test('Sheet không gửi cột DEFERRAL (Apps Script cũ): không đổi trạng thái bảo lưu nào', async () => {
  await post({ transactions: sheet(row('P.7', 'BIE104', true, 'BIE104')), course: COURSE });
  assert.equal((await enr('P.7', 'BIE104')).course_status, 'deferred');
  const r = await post({ transactions: { headers: HEAD_NO_DEF, rows: [row('P.7', 'BIE104', false).slice(0, 10)] }, course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.deferral_column, false);
  assert.equal((await enr('P.7', 'BIE104')).course_status, 'deferred');
});

test('bỏ tick ở dòng có DEFERRAL COURSE khác khóa của dòng: khóa bị bảo lưu được trả về đang học (không bị kẹt)', async () => {
  await post({ transactions: sheet(row('P.8', 'BIE104', false), row('P.8', 'BIE105', true, 'BIE104')), course: COURSE });
  assert.equal((await enr('P.8', 'BIE104')).course_status, 'deferred');
  const r = await post({ transactions: sheet(row('P.8', 'BIE104', false), row('P.8', 'BIE105', false, 'BIE104')), course: COURSE });
  assert.equal(r.body.reactivated_from_sheet, 1);
  assert.deepEqual([(await enr('P.8', 'BIE104')).course_status, (await enr('P.8', 'BIE104')).deferred_by_sheet], ['active', false]);
  // xóa hẳn ô DEFERRAL (trống) cũng trả về: không còn TRUE nào
  await post({ transactions: sheet(row('P.8', 'BIE104', false), row('P.8', 'BIE105', true, 'BIE104')), course: COURSE });
  assert.equal((await enr('P.8', 'BIE104')).course_status, 'deferred');
  await post({ transactions: sheet(row('P.8', 'BIE104', null), row('P.8', 'BIE105', null)), course: COURSE });
  assert.equal((await enr('P.8', 'BIE104')).course_status, 'active');
});

test('học viên đã nghỉ (dropped) không bị Sheet chuyển sang bảo lưu rồi kéo ngược về đang học', async () => {
  await post({ transactions: sheet(row('P.9', 'BIE104', false)), course: COURSE });
  await t.db.run("update enrollments set course_status = 'dropped' where id = $1", [(await enr('P.9', 'BIE104')).id]);
  const r = await post({ transactions: sheet(row('P.9', 'BIE104', true, 'BIE104')), course: COURSE });
  assert.equal(r.body.deferred_from_sheet, 0);
  assert.equal((await enr('P.9', 'BIE104')).course_status, 'dropped');
  await post({ transactions: sheet(row('P.9', 'BIE104', false)), course: COURSE });
  assert.equal((await enr('P.9', 'BIE104')).course_status, 'dropped');
});

test('dòng "Chưa thanh toán" + TRUE: đi Potential như cũ, không ghi thêm sự kiện bảo lưu mâu thuẫn', async () => {
  await post({ transactions: sheet(row('P.11', 'BIE104', false)), course: COURSE });
  const r = await post({ transactions: sheet(row('P.11', 'BIE104', true, 'BIE104', 'Chưa thanh toán')), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!(await enr('P.11', 'BIE104')));                // không còn trong danh sách lớp (sang Potential)
  assert.equal((await events('P.11')).length, 0);
  assert.equal((await t.db.one("select count(*)::int n from potential_students where student_code = 'P.11'")).n, 1);
});

test('admin đổi trạng thái tay trên web thì không còn là "do Sheet": Sheet bỏ tick không kéo ngược bảo lưu đặt tay', async () => {
  await post({ transactions: sheet(row('P.12', 'BIE104', true, 'BIE104')), course: COURSE });
  const e = await enr('P.12', 'BIE104');
  assert.equal(e.deferred_by_sheet, true);
  const cid = (await t.db.one("select id from classes where short_code = 'BIE104'")).id;
  assert.equal((await admin.put(`/api/classes/${cid}/students/${e.id}`, { course_status: 'active' })).status, 200);
  assert.equal((await enr('P.12', 'BIE104')).deferred_by_sheet, false);
  assert.equal((await admin.put(`/api/classes/${cid}/students/${e.id}`, { course_status: 'deferred' })).status, 200);   // đặt tay bảo lưu
  await post({ transactions: sheet(row('P.12', 'BIE104', false)), course: COURSE });
  assert.equal((await enr('P.12', 'BIE104')).course_status, 'deferred');
});

test('nhãn STATUS lạ chỉ lưu dạng đã che (không để số tiền/email lọt vào nhật ký đồng bộ)', async () => {
  const r = await post({ transactions: sheet(row('P.13', 'BIE104', false, null, 'Đã đóng 3.000.000'), row('P.14', 'BIE104', false, null, 'a@b.com')), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const text = Object.keys(r.body.unknown_status_labels).join(' | ');   // chỉ xét NHÃN (số đếm là chữ số hợp lệ)
  assert.ok(!/\d/.test(text) && !text.includes('a@b.com'), text);
  assert.ok(text.includes('Đã đóng #.###.###'));
  const logged = JSON.stringify((await t.db.one('select summary from sync_runs order by id desc limit 1')).summary);
  assert.ok(!logged.includes('3.000.000') && !logged.includes('a@b.com'));
});

test('chốt chặn: quá nhiều học viên đổi sang bảo lưu cùng lúc thì bỏ riêng phần bảo lưu (không chặn cả lượt đồng bộ), báo trong summary', async () => {
  const many = (def) => Array.from({ length: 230 }, (_, i) => row('P.' + (300 + i), 'BIE105', def, 'BIE105'));
  assert.equal((await post({ transactions: sheet(...many(false)), course: COURSE })).status, 200);
  const r = await post({ transactions: sheet(...many(true)), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.deferred_from_sheet, 0);
  assert.ok(r.body.deferral_blocked >= 230, JSON.stringify(r.body.deferral_blocked));
  assert.equal((await t.db.one("select count(*)::int n from enrollments where course_status = 'deferred' and deferred_by_sheet")).n >= 0, true);
  assert.equal((await t.db.one("select count(*)::int n from enrollments e join students s on s.id = e.student_id where s.student_code like 'P.3__' and e.course_status = 'deferred'")).n, 0);
});

test('tab COMPANY (B2B) cũng có DEFERRAL STATUS: TRUE → bảo lưu, bỏ tick → học lại', async () => {
  const COMPANY_HEAD = [...HEAD, 'COMPANY NAME'];
  const comp = (def) => ({ headers: COMPANY_HEAD, rows: [[...row('B.00901', 'BIE104', def, 'BIE104'), 'Công ty A']] });
  const r = await post({ transactions: sheet(row('P.20', 'BIE104', false)), company: comp(true), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const e = await enr('B.00901', 'BIE104');
  assert.deepEqual([e.course_status, e.deferred_by_sheet], ['deferred', true]);
  assert.equal((await t.db.one("select segment from enrollments where id = $1", [e.id])).segment, 'b2b');
  const back = await post({ transactions: sheet(row('P.20', 'BIE104', false)), company: comp(false), course: COURSE });
  assert.equal(back.body.reactivated_from_sheet, 1);
  assert.equal((await enr('B.00901', 'BIE104')).course_status, 'active');
});

test('cột DEFERRAL có trong Apps Script và danh sách cho phép; không có cột tiền; schema + migration', async () => {
  const fs = require('node:fs'); const path = require('node:path');
  const gs = fs.readFileSync(path.join(__dirname, '..', 'scripts/google-apps-script/sync-transactions.gs'), 'utf8');
  assert.match(gs, /'DEFERRAL STATUS', 'DEFERRAL COURSE'/);
  for (const f of ['src/schema.sql', 'supabase/schema.sql']) assert.match(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /deferred_by_sheet\s+boolean not null default false/, f);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'supabase/migrations/2026-11-12-deferred-by-sheet.sql')));
  assert.ok(!/DEFERRAL DATE|DUE DATE|RE-ENROLLED/.test(gs.split('ALLOWED_TX')[1].split(';')[0]));   // chỉ đúng hai cột cần
});
