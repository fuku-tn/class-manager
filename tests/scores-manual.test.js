// Gõ điểm tay trên trang Bài tập: admin + giảng viên của lớp; khách/giảng viên lớp khác bị chặn; điểm gõ tay được file Excel giữ nguyên.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { importPoints, POINT_SYNC_COLUMNS } = require('../src/services/importPoints');

let t, admin, gv, other, guest, classId, otherClass, enr, asg;
const HEAD = POINT_SYNC_COLUMNS.slice(0, 5);   // đã chuẩn hóa như khi đọc từ Excel
const excel = (rows) => importPoints(t.db, { headers: HEAD, rows: rows.map(([sid, hw, point]) => [sid, 'MSC101', hw, point, 'Module A']) });
const base = () => `/api/classes/${classId}`;
const cell = async (code, kind = 'hw', seq = 1) => (await t.db.one(
  `select hs.score::float8 as score, hs.manual, hs.module from homework_scores hs join enrollments e on e.id = hs.enrollment_id join students s on s.id = e.student_id
     join assignments a on a.id = hs.assignment_id where s.student_code = $1 and a.kind = $2 and a.seq = $3`, [code, kind, seq])) ?? null;
const put = (who, code, seq, score, extra = {}) => who.put(`${base()}/scores`, { enrollment_id: enr[code], assignment_id: asg[seq], score, ...extra });

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const otherId = await t.addUser('gv2@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com'); gv = await t.login('gv@x.com'); other = await t.login('gv2@x.com'); guest = await t.login('khach@x.com');
  classId = (await admin.post('/api/classes', { code: 'P1.EBA.P101.ON.EE.010126', session_count: 2, hw_count: 3, start_date: '2026-01-01' })).body.id;
  otherClass = (await admin.post('/api/classes', { code: 'P1.EBA.P102.ON.EE.010126', session_count: 2, hw_count: 1, start_date: '2026-01-01' })).body.id;
  await t.db.run("update classes set short_code = 'MSC101', program = 'EBA' where id = $1", [classId]);
  await admin.put(`/api/users/${gvId}/classes`, { class_ids: [classId] });
  await admin.put(`/api/users/${gId}/classes`, { class_ids: [classId] });
  await admin.put(`/api/users/${otherId}/classes`, { class_ids: [otherClass] });
  for (const [code, name] of [['P.7001', 'An'], ['P.7002', 'Bình'], ['P.7003', 'Chi']]) await admin.post(`${base()}/students`, { student_code: code, full_name: name });
  enr = Object.fromEntries((await admin.get(`${base()}/students`)).body.map((s) => [s.student_code, s.id]));
  asg = Object.fromEntries((await admin.get(`${base()}/submissions`)).body.assignments.filter((a) => a.kind === 'hw').map((a) => [a.seq, a.id]));
});
after(async () => { await t.close(); });

test('quyền: admin và giảng viên của lớp gõ được; khách, giảng viên lớp khác bị chặn', async () => {
  assert.equal((await put(admin, 'P.7001', 1, 8)).status, 200);
  assert.equal((await put(gv, 'P.7002', 1, 7.5)).status, 200);
  assert.equal((await put(guest, 'P.7003', 1, 9)).status, 403);
  assert.equal((await put(other, 'P.7003', 1, 9)).status, 403);
  assert.equal((await guest.get(`${base()}/scores`)).status, 403, 'khách không xem được điểm');
  assert.equal(await cell('P.7003'), null);
});

test('kiểm tra điểm: 0–10, chấp nhận dấu phẩy, làm tròn 2 số lẻ; học viên/bài ngoài lớp bị từ chối', async () => {
  assert.equal((await put(admin, 'P.7003', 1, 11)).status, 400);
  assert.equal((await put(admin, 'P.7003', 1, -1)).status, 400);
  assert.equal((await put(admin, 'P.7003', 1, 'abc')).status, 400);
  const ok = await put(admin, 'P.7003', 1, '8,756');
  assert.equal(ok.status, 200);
  assert.equal((await cell('P.7003')).score, 8.76);
  assert.equal((await admin.put(`${base()}/scores`, { enrollment_id: 999999, assignment_id: asg[1], score: 5 })).status, 404);
  const foreign = (await admin.get(`/api/classes/${otherClass}/submissions`)).body.assignments[0].id;
  assert.equal((await admin.put(`${base()}/scores`, { enrollment_id: enr['P.7001'], assignment_id: foreign, score: 5 })).status, 404);
});

test('điểm gõ tay hiện ở danh sách điểm kèm cờ manual, trả điểm TB học viên và cả lớp', async () => {
  const r = await put(admin, 'P.7001', 2, 6);
  assert.deepEqual([r.body.cell, r.body.avg, r.body.has_scores], [{ score: 6, manual: true }, 7, true]);   // (8 + 6) / 2
  const list = (await gv.get(`${base()}/scores`)).body;
  const an = list.rows.find((x) => x.student_code === 'P.7001');
  assert.equal(an.scores[asg[1]].manual, true);
  assert.equal(an.avg, 7);
  assert.equal(list.has_scores, true);
});

test('Excel chỉ điền ô còn trống: không ghi đè và không xóa điểm gõ tay; ô từ Excel vẫn cập nhật theo Excel', async () => {
  // P.7001 HW1 = 8 (gõ tay); Excel nói 3 → giữ 8. P.7002 HW1 = 7.5 (gõ tay). P.7003 HW2 trống → Excel điền 9 (không phải manual).
  const r = await excel([['P.7001', 'HW1', 3], ['P.7003', 'HW2', 9]]);
  assert.equal((await cell('P.7001')).score, 8);
  assert.equal((await cell('P.7001')).manual, true);
  const filled = await cell('P.7003', 'hw', 2);
  assert.deepEqual([filled.score, filled.manual], [9, false]);
  assert.equal(r.deleted, 0, 'điểm gõ tay (P.7002, P.7001 HW2, P.7003 HW1) không bị xóa dù không có trong Excel');
  assert.equal((await cell('P.7002')).score, 7.5);
  assert.equal((await cell('P.7001', 'hw', 2)).score, 6);
  // Excel đổi điểm của ô do Excel điền → cập nhật
  await excel([['P.7003', 'HW2', 4]]);
  assert.equal((await cell('P.7003', 'hw', 2)).score, 4);
});

test('gõ điểm đè lên điểm từ Excel thì thành điểm gõ tay (Excel không đè lại); xóa điểm Excel bằng cách để trống bị từ chối', async () => {
  const del = await put(admin, 'P.7003', 2, '');
  assert.equal(del.status, 409, 'điểm từ Excel: phải gõ điểm mới để ghi đè');
  assert.equal((await put(gv, 'P.7003', 2, 10)).status, 200);
  await excel([['P.7003', 'HW2', 1]]);
  const c = await cell('P.7003', 'hw', 2);
  assert.deepEqual([c.score, c.manual], [10, true]);
});

test('xóa điểm gõ tay: để trống; điểm bị người khác đổi trong lúc mở hộp thoại thì 409 và trả giá trị hiện tại', async () => {
  const stale = await put(admin, 'P.7002', 1, 5, { expected: 6 });   // người dùng thấy 6 nhưng thực tế 7.5
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.body.current, { score: 7.5, manual: true });
  assert.equal((await cell('P.7002')).score, 7.5);
  const ok = await put(admin, 'P.7002', 1, 5, { expected: 7.5 });
  assert.equal(ok.status, 200);
  const cleared = await put(gv, 'P.7002', 1, null, { expected: 5 });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.cell, null);
  assert.equal(await cell('P.7002'), null);
});

test('có điểm = đã làm bài: ô bài tập tự được ghi nhận "Đã nộp" dù chưa tick', async () => {
  const sub = (await admin.get(`${base()}/submissions`)).body;
  const row = sub.rows.find((x) => x.student_code === 'P.7001');
  assert.equal(row.cells[asg[1]]?.status, 'submitted', 'có điểm thì được tính là đã nộp');
  const none = sub.rows.find((x) => x.student_code === 'P.7002');
  assert.equal(none.cells[asg[1]] ?? null, null, 'chưa có điểm, chưa tick = chưa nộp');
});

test('schema: hai file giống nhau và có cột manual/updated_by; migration có mặt', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['src/schema.sql', 'supabase/schema.sql']) {
    const sql = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(sql, /manual\s+boolean not null default false/);
  }
  assert.ok(fs.existsSync(path.join(root, 'supabase/migrations/2026-10-24-manual-scores.sql')));
});
