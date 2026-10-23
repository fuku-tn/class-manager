// Đơn xin nghỉ học qua email: đọc ngày, nhận người gửi thật, đồng bộ, chuông báo NGÀY ở mọi lớp học viên đang học (không xác định buổi), quyền, riêng tư, Apps Script.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { parseAbsenceDates, originalSender, innerSubject } = require('../src/services/absence');

const TOKEN = 'absence-test-token';
const realFetch = global.fetch;
let t, admin, gv, guest, classId, otherId;

const send = (messages, token = TOKEN) => realFetch(`${t.base}/api/sync/absences`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token }, body: JSON.stringify({ messages }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const mail = (id, from, subject, body = '') => ({ id, from, subject, body, received: new Date().toISOString() });
// Ngày tính theo hôm nay (đơn chỉ hiện trong khoảng gần đây, nên không dùng ngày cố định)
const ymd = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const dm = (n) => ymd(n).slice(8, 10) + '/' + ymd(n).slice(5, 7);
const D2 = 2, D3 = 9, DX = 5;   // ba ngày xin nghỉ khác nhau (số ngày kể từ hôm nay)

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
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('đồng bộ: sai mã bị từ chối; thư khớp học viên được ghi ngày; các trường hợp không khớp được đếm riêng', async () => {
  assert.equal((await send([], 'sai-ma')).status, 401);
  const r = await send([
    mail('m1', 'An <an@gmail.com>', `Xin nghỉ học ngày ${dm(D2)}`),
    mail('m2', 'academicaffairs.ste@gmail.com', 'Xin nghỉ học', 'From: Ai đó <la@x.com>\nxin nghỉ 25/10'),
    mail('m3', 'binh@mail.com', `Xin nghỉ học ngày ${dm(D2)}`),
    mail('m4', 'an@gmail.com', 'Xin nghỉ học', 'Em bận'),
    mail('m5', 'an@gmail.com', `Báo cáo tuần ${dm(D2)}`),
    mail('m6', 'academicaffairs.ste@gmail.com', `Xin nghỉ học ${dm(D2)}`, 'không có người gửi'),
  ]);
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.matched, r.body.added, r.body.unmatched, r.body.no_date, r.body.not_absence, r.body.no_sender], [2, 3, 1, 1, 1, 1]); // m3: một email, hai mã đang học → ghi cho cả hai
  assert.deepEqual([...r.body.unmatched_ids].sort(), ['m2', 'm4', 'm6']);
  const again = await send([mail('m1', 'an@gmail.com', `Xin nghỉ học ngày ${dm(D2)}`)]); // gửi lại cùng thư: không nhân đôi
  assert.deepEqual([again.body.added, again.body.duplicates], [0, 1]);
});

test('không lưu email người gửi, tiêu đề hay nội dung thư', async () => {
  const cols = (await t.db.all("select column_name from information_schema.columns where table_name = 'absence_requests'")).map((c) => c.column_name);
  assert.deepEqual(cols.sort(), ['absence_date', 'created_at', 'id', 'message_key', 'received_at', 'reviewed_at', 'reviewed_by', 'status', 'student_id']);
  assert.ok(!JSON.stringify(await t.db.all('select * from absence_requests')).includes('an@gmail.com'));
  const run = await t.db.one("select summary from sync_runs where source = 'google-sheet-absences' order by id desc limit 1");
  assert.ok(!JSON.stringify(run).includes('gmail.com'));
});

test('chuông của MỌI lớp mà học viên đang học báo ngày nghỉ (không có buổi/ô điểm danh nào bị tự xác định)', async () => {
  const list = (await admin.get(`/api/classes/${classId}/absences`)).body;
  assert.deepEqual(list.map((r) => [r.student_code, r.absence_date]).sort(), [['A1', ymd(D2)], ['A2', ymd(D2)]], 'email dùng chung: cả hai mã đang học đều có đơn');
  assert.ok(list.every((r) => r.status === 'pending' && !('session_id' in r) && !('session_no' in r)));
  assert.equal((await gv.get(`/api/classes/${classId}/absences`)).body.length, 2);
  assert.equal((await guest.get(`/api/classes/${classId}/absences`)).body.length, 2);
  const other = (await admin.get(`/api/classes/${otherId}/absences`)).body;
  assert.deepEqual(other.map((r) => [r.student_code, r.absence_date]), [['A9', ymd(D2)]]);
});

test('đơn quá cũ (trước 7 ngày) hoặc sau buổi cuối của lớp không hiện', async () => {
  await send([mail('old1', 'an@gmail.com', `Xin nghỉ học ${dm(-20)}`)]);
  assert.ok(!(await admin.get(`/api/classes/${classId}/absences`)).body.some((r) => r.absence_date === ymd(-20)));
  await t.db.run('update classes set end_date = $2 where id = $1', [otherId, ymd(0)]);
  assert.equal((await admin.get(`/api/classes/${otherId}/absences`)).body.length, 0, 'ngày nghỉ sau buổi cuối của lớp');
  await t.db.run('update classes set end_date = null where id = $1', [otherId]);
});

test('"Đã biết": đơn biến mất khỏi danh sách; không tự ghi điểm danh; khách bị chặn; không có route xác nhận', async () => {
  const get = () => admin.get(`/api/classes/${classId}/absences`).then((r) => r.body);
  const r = (await get()).find((x) => x.student_code === 'A1');
  assert.equal((await guest.post(`/api/classes/${classId}/absences/${r.id}/dismiss`, {})).status, 403);
  assert.equal((await admin.post(`/api/classes/${classId}/absences/999999/dismiss`, {})).status, 404);
  assert.equal((await admin.post(`/api/classes/${otherId}/absences/${r.id}/dismiss`, {})).status, 404, 'đơn của lớp khác');
  assert.equal((await admin.post(`/api/classes/${classId}/absences/${r.id}/confirm`, {})).status, 404, 'không tự ghi Có phép');
  assert.equal((await gv.post(`/api/classes/${classId}/absences/${r.id}/dismiss`, {})).status, 200);
  assert.ok(!(await get()).some((x) => x.id === r.id));
  const att = (await admin.get(`/api/classes/${classId}/attendance`)).body;
  assert.ok(att.rows.every((row) => Object.values(row.cells).every((c) => c === null)), 'điểm danh không bị đổi');
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
  const full = (n) => `${dm(n)}/${ymd(n).slice(0, 4)}`;
  const now = new Date().toISOString();
  // Nội dung thật là JSON dạng chữ: xuống dòng là hai ký tự \r\n (không phải ký tự điều khiển)
  const json = `{"messageId":"AAMkADI3Nm=","from":"binh@mail.com","received":"${now}","subject":"[XIN VẮNG BUỔI KHAI GIẢNG KHÓA PBM]",`
    + `"preview":"Dear Team,\r\n\r\nDo có việc đột xuất nên mình xin phép vắng buổi khai giảng diễn ra vào ngày ${full(D3)}.\r\n\r\n--\r\nĐoàn Minh Lý\r\nPhone: (+84) 915 96 70 26","webLink":""}`;
  const body = `${json}\nfrom: binh@mail.com`;
  const subject = '[XIN VẮNG BUỔI KHAI GIẢNG KHÓA PBM]';
  assert.deepEqual(parseAbsenceDates(subject, body, now), [ymd(D3)]);
  assert.equal(originalSender({ from: 'Academic Affairs <academicaffairs@starttrain.edu.vn>', body }), 'binh@mail.com');
  assert.equal(originalSender({ from: 'academicaffairs@starttrain.edu.vn', body: json }), 'binh@mail.com', 'chỉ có JSON: đọc "from" trong JSON');
  assert.deepEqual(parseAbsenceDates('Xin nghỉ', '2026-10-22T15:16:47 giờ nhận', '2026-10-22T15:16:47Z'), [], 'dãy ngày giờ ISO không phải ngày xin nghỉ');
  const r = await send([{ id: 'real1', from: 'Academic Affairs <academicaffairs@starttrain.edu.vn>', subject, body, received: now }]);
  assert.deepEqual([r.body.matched, r.body.not_absence], [1, 0]);
  const list = (await admin.get(`/api/classes/${classId}/absences`)).body.filter((x) => x.absence_date === ymd(D3));
  assert.deepEqual(list.map((x) => x.student_code), ['A2'], 'ngày xin nghỉ trong nội dung thư được báo ở lớp của học viên');
});

test('flow mới: tiêu đề cố định ABSENCEREQ, dòng From: ở đầu, tiêu đề thật nằm trong JSON; thư chỉ là biểu tượng cảm xúc bị bỏ qua', async () => {
  const day = `${dm(D3)}/${ymd(D3).slice(0, 4)}`;
  const json = (subject, preview) => `{"messageId":"AAMk=","from":"binh@mail.com","received":"${new Date().toISOString()}","subject":"${subject}","preview":"${preview}","webLink":""}`;
  const real = `From: binh@mail.com\n${json(`[BIE102]-Xin vắng học -Ngày ${day}-Võ Bình`, 'Em xin vắng học ạ')}`;
  const reaction = `From: binh@mail.com\n${json(`Re: [BIE102]-Xin vắng học -Ngày ${day}-Võ Bình`, '💖\r\n\r\nBình reacted via Gmail')}`;
  assert.equal(innerSubject(real), `[BIE102]-Xin vắng học -Ngày ${day}-Võ Bình`);
  assert.equal(innerSubject('không có JSON'), null);
  const from = 'Academic Affairs <academicaffairs@starttrain.edu.vn>';
  const r = await send([
    { id: 'f1', from, subject: 'ABSENCEREQ', body: reaction, received: new Date().toISOString() },
    { id: 'f2', from, subject: 'ABSENCEREQ', body: real, received: new Date().toISOString() },
    { id: 'f3', from, subject: 'ABSENCEREQ', body: `From: binh@mail.com\n${json('Báo cáo tuần', 'Gửi anh báo cáo')}`, received: new Date().toISOString() },
  ]);
  assert.deepEqual([r.body.not_absence, r.body.matched], [2, 1], 'phản hồi cảm xúc và thư không phải xin nghỉ bị bỏ qua');
  assert.ok((await admin.get(`/api/classes/${classId}/absences`)).body.some((x) => x.student_code === 'A2' && x.absence_date === ymd(D3)));
});
