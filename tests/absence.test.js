// Đơn xin nghỉ học qua email: đọc ngày, nhận người gửi thật, đồng bộ, hiện ở lớp đúng buổi, xác nhận → Có phép, quyền, riêng tư, Apps Script.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { parseAbsenceDates, originalSender } = require('../src/services/absence');

const TOKEN = 'absence-test-token';
const realFetch = global.fetch;
let t, admin, gv, guest, classId, otherId, sessions;

const send = (messages, token = TOKEN) => realFetch(`${t.base}/api/sync/absences`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token }, body: JSON.stringify({ messages }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const mail = (id, from, subject, body = '') => ({ id, from, subject, body, received: '2026-10-22T14:04:46Z' });

test('đọc ngày xin nghỉ: một ngày, nhiều ngày, khoảng, có năm, qua năm; bỏ giờ giấc; ưu tiên tiêu đề', () => {
  const r = '2026-10-22T14:04:46Z';
  assert.deepEqual(parseAbsenceDates('Xin nghỉ học ngày 24/10', '', r), ['2026-10-24']);
  assert.deepEqual(parseAbsenceDates('Xin nghỉ học', 'Em xin nghỉ ngày 24 và 25/10 vì bận', r), ['2026-10-24', '2026-10-25']);
  assert.deepEqual(parseAbsenceDates('Xin nghỉ học từ 24/10 đến 26/10', '', r), ['2026-10-24', '2026-10-25', '2026-10-26']);
  assert.deepEqual(parseAbsenceDates('Xin nghỉ học', 'nghỉ 24/10, 25/10 và 31.10.2026', r), ['2026-10-24', '2026-10-25', '2026-10-31']);
  assert.deepEqual(parseAbsenceDates('Xin nghỉ buổi', 'học lúc 18.30 ngày 3-11', r), ['2026-11-03']);
  assert.deepEqual(parseAbsenceDates('Xin nghỉ học 05/01', '', '2026-12-28T00:00:00Z'), ['2027-01-05']);
  assert.deepEqual(parseAbsenceDates('Xin nghỉ 24/10', 'Ngày khác 30/10', r), ['2026-10-24'], 'tiêu đề có ngày thì không đọc nội dung');
  assert.deepEqual(parseAbsenceDates('Xin nghỉ học', 'không có ngày', r), []);
  assert.deepEqual(parseAbsenceDates('Xin nghỉ 31/02', '', r), [], 'ngày không có thật');
  assert.deepEqual(parseAbsenceDates('Xin nghỉ 01/01 đến 30/12', '', r), [], 'khoảng quá dài bị bỏ');
});

test('người gửi thật: Reply-To, From, hoặc dòng From: trong thư chuyển tiếp — không nhận hộp chuyển tiếp', () => {
  assert.equal(originalSender({ from: 'An <an@gmail.com>' }), 'an@gmail.com');
  assert.equal(originalSender({ from: 'academicaffairs.ste@gmail.com', replyTo: 'Bình <Binh@Mail.com>' }), 'binh@mail.com');
  assert.equal(originalSender({ from: 'academicaffairs@starttrain.edu.vn', body: 'Chuyển tiếp\nFrom: Chi Võ <chi@x.com>\nSent: hôm qua' }), 'chi@x.com');
  assert.equal(originalSender({ from: 'academicaffairs.ste@gmail.com', body: 'không có người gửi' }), null);
});

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com'); gv = await t.login('gv@x.com'); guest = await t.login('khach@x.com');
  classId = (await admin.post('/api/classes', { code: 'AB.01', session_count: 3, hw_count: 1 })).body.id;
  otherId = (await admin.post('/api/classes', { code: 'AB.02', session_count: 3, hw_count: 1 })).body.id;
  for (const id of [gvId, gId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [classId] });
  for (const [c, n] of [['A1', 'Võ An'], ['A2', 'Đặng Bình']]) await admin.post(`/api/classes/${classId}/students`, { student_code: c, full_name: n });
  await admin.post(`/api/classes/${otherId}/students`, { student_code: 'A9', full_name: 'Lớp khác' });
  await t.db.run("update students set email = 'an@gmail.com' where student_code = 'A1'");
  await t.db.run("update students set email = 'binh@mail.com' where student_code in ('A2', 'A9')"); // một email gắn với hai mã đang học → ghi cho cả hai
  sessions = (await admin.get(`/api/classes/${classId}/attendance`)).body.sessions;
  // Lịch giảng dạy: buổi 2 của lớp vào 24/10/2026, buổi 3 vào 31/10/2026
  await t.db.run("insert into teaching_schedule (class_id, short_code, session_date, session_no) values ($1, 'AB01', '2026-10-24', 2), ($1, 'AB01', '2026-10-31', 3)", [classId]);
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('đồng bộ: sai mã bị từ chối; thư khớp học viên được ghi ngày; các trường hợp không khớp được đếm riêng', async () => {
  assert.equal((await send([], 'sai-ma')).status, 401);
  const r = await send([
    mail('m1', 'An <an@gmail.com>', 'Xin nghỉ học ngày 24/10'),
    mail('m2', 'academicaffairs.ste@gmail.com', 'Xin nghỉ học', 'From: Ai đó <la@x.com>\nxin nghỉ 25/10'),
    mail('m3', 'binh@mail.com', 'Xin nghỉ học ngày 24/10'),
    mail('m4', 'an@gmail.com', 'Xin nghỉ học', 'Em bận'),
    mail('m5', 'an@gmail.com', 'Báo cáo tuần 24/10'),
    mail('m6', 'academicaffairs.ste@gmail.com', 'Xin nghỉ học 24/10', 'không có người gửi'),
  ]);
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.matched, r.body.added, r.body.unmatched, r.body.no_date, r.body.not_absence, r.body.no_sender], [2, 3, 1, 1, 1, 1]); // m3: một email, hai mã đang học → ghi cho cả hai
  assert.deepEqual([...r.body.unmatched_ids].sort(), ['m2', 'm4', 'm6']);
  const again = await send([mail('m1', 'an@gmail.com', 'Xin nghỉ học ngày 24/10')]); // gửi lại cùng thư: không nhân đôi
  assert.deepEqual([again.body.added, again.body.duplicates], [0, 1]);
});

test('không lưu email người gửi, tiêu đề hay nội dung thư', async () => {
  const cols = (await t.db.all("select column_name from information_schema.columns where table_name = 'absence_requests'")).map((c) => c.column_name);
  assert.deepEqual(cols.sort(), ['absence_date', 'created_at', 'id', 'message_key', 'received_at', 'reviewed_at', 'reviewed_by', 'status', 'student_id']);
  assert.ok(!JSON.stringify(await t.db.all('select * from absence_requests')).includes('an@gmail.com'));
  const run = await t.db.one("select summary from sync_runs where source = 'google-sheet-absences' order by id desc limit 1");
  assert.ok(!JSON.stringify(run).includes('gmail.com'));
});

test('hiện ở lớp đúng buổi: lớp có học viên và buổi trùng ngày mới thấy; lớp khác không', async () => {
  const list = (await admin.get(`/api/classes/${classId}/absences`)).body;
  const a1 = list.find((r) => r.student_code === 'A1');
  assert.deepEqual([a1.absence_date, a1.session_no, a1.status], ['2026-10-24', 2, 'pending']);
  assert.equal(a1.session_id, sessions.find((s) => s.session_no === 2).id);
  assert.deepEqual(list.map((r) => r.student_code).sort(), ['A1', 'A2'], 'email dùng chung: cả hai mã đang học đều có đơn');
  assert.equal((await gv.get(`/api/classes/${classId}/absences`)).body.length, 2);
  assert.equal((await guest.get(`/api/classes/${classId}/absences`)).body.length, 2);
  assert.equal((await admin.get(`/api/classes/${otherId}/absences`)).body.length, 0, 'lớp khác chưa có lịch buổi trùng ngày');
  await send([mail('m7', 'an@gmail.com', 'Xin nghỉ học 29/10')]); // ngày không trùng buổi nào → không hiện
  assert.equal((await admin.get(`/api/classes/${classId}/absences`)).body.length, 2);
});

test('xác nhận → ô điểm danh thành Có phép (P), buổi không tự thành đã diễn ra; khách bị chặn', async () => {
  const r = (await admin.get(`/api/classes/${classId}/absences`)).body.find((x) => x.student_code === 'A1');
  assert.equal((await guest.post(`/api/classes/${classId}/absences/${r.id}/confirm`, {})).status, 403);
  assert.equal((await admin.post(`/api/classes/${classId}/absences/${r.id}/xoa`, {})).status, 404);
  assert.equal((await admin.post(`/api/classes/${classId}/absences/999999/confirm`, {})).status, 404);
  assert.equal((await gv.post(`/api/classes/${classId}/absences/${r.id}/confirm`, {})).status, 200);
  const att = (await admin.get(`/api/classes/${classId}/attendance`)).body;
  assert.equal(att.rows.find((x) => x.student_code === 'A1').cells[r.session_id].status, 'excused');
  assert.equal(att.sessions.find((s) => s.id === r.session_id).held, false);
  assert.equal((await admin.get(`/api/classes/${classId}/absences`)).body.find((x) => x.student_code === 'A1' && x.absence_date === '2026-10-24').status, 'confirmed');
});

test('đã điểm danh có mặt thì xác nhận bị từ chối (409); bỏ qua thì đơn biến mất khỏi danh sách', async () => {
  await send([mail('m8', 'an@gmail.com', 'Xin nghỉ học 31/10')]);
  const r = (await admin.get(`/api/classes/${classId}/absences`)).body.find((x) => x.absence_date === '2026-10-31' && x.student_code === 'A1');
  assert.ok(r);
  await admin.put(`/api/classes/${classId}/attendance`, { enrollment_id: r.enrollment_id, session_id: r.session_id, status: 'present', expected: null });
  assert.equal((await admin.post(`/api/classes/${classId}/absences/${r.id}/confirm`, {})).status, 409);
  assert.equal((await admin.post(`/api/classes/${classId}/absences/${r.id}/dismiss`, {})).status, 200);
  assert.ok(!(await admin.get(`/api/classes/${classId}/absences`)).body.some((x) => x.id === r.id));
});

test('bảng có RLS ở cả hai file schema; Apps Script gọi đúng địa chỉ cấu hình và không chứa mã bí mật', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['src/schema.sql', 'supabase/schema.sql']) {
    const sql = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(sql, /create table if not exists absence_requests/);
    assert.match(sql, /alter table absence_requests enable row level security/);
  }
  const gs = fs.readFileSync(path.join(root, 'scripts/google-apps-script/sync-absences.gs'), 'utf8');
  assert.match(gs, /ABSENCE_URL/);
  assert.match(gs, /X-Sync-Token/);
  assert.ok(!/https?:\/\/[^\s'"]*vercel\.app/.test(gs), 'không ghi sẵn địa chỉ thật trong script');
});

test('thư thật qua Power Automate: tiêu đề "XIN VẮNG…" không có ngày, nội dung là JSON của trigger (giờ nhận, mã thư không bị đọc thành ngày), người gửi ở dòng from:', async () => {
  const body = '{"messageId":"AAMkADI3Nm=","from":"binh@mail.com","received":"2026-10-22T15:16:47+00:00","subject":"[XIN VẮNG BUỔI KHAI GIẢNG KHÓA PBM]",'
    + '"preview":"Dear Team,\r\n\r\nDo có việc đột xuất nên mình xin phép vắng buổi khai giảng diễn ra vào ngày 31/10/2026.\r\n\r\n--\r\nĐoàn Minh Lý\r\nPhone: (+84) 915 96 70 26","webLink":""}\nfrom: binh@mail.com';
  const subject = '[XIN VẮNG BUỔI KHAI GIẢNG KHÓA PBM]';
  assert.deepEqual(parseAbsenceDates(subject, body, '2026-10-22T15:16:47Z'), ['2026-10-31']);
  assert.equal(originalSender({ from: 'Academic Affairs <academicaffairs@starttrain.edu.vn>', body }), 'binh@mail.com');
  assert.equal(originalSender({ from: 'academicaffairs@starttrain.edu.vn', body: body.split('\nfrom:')[0] }), 'binh@mail.com', 'chỉ có JSON: đọc "from" trong JSON');
  assert.deepEqual(parseAbsenceDates('Xin nghỉ', '2026-10-22T15:16:47 giờ nhận', '2026-10-22T15:16:47Z'), [], 'dãy ngày giờ ISO không phải ngày xin nghỉ');
  const r = await send([{ id: 'real1', from: 'Academic Affairs <academicaffairs@starttrain.edu.vn>', subject, body, received: '2026-10-22T15:16:47Z' }]);
  assert.deepEqual([r.body.matched, r.body.not_absence], [1, 0]);
  const list = (await admin.get(`/api/classes/${classId}/absences`)).body.filter((x) => x.absence_date === '2026-10-31' && x.student_code === 'A2');
  assert.equal(list.length, 1, 'ngày 31/10 là buổi 3 của lớp');
});
