const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { parseHw, parseScore } = require('../src/services/importPoints');

const TOKEN = 'points-test-token';
const realFetch = global.fetch;
let t, admin, gv, guest, classId;

const HEAD = ['StudentID', 'Họ và tên', 'Course', 'HW', 'Point', 'Module'];
const row = (id, hw, point, module = 'Data Transformation', course = 'PTS101') => [id, 'Tên không được lưu ' + id, course, hw, point, module];
const post = (rows, headers = HEAD) => realFetch(`${t.base}/api/sync/points`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN },
  body: JSON.stringify({ points: { headers, rows } }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  guest = await t.login('khach@x.com');
  const c = await admin.post('/api/classes', { code: 'P1.EBA.P101.ON.EE.010126', session_count: 3, hw_count: 4, start_date: '2026-01-01' });
  classId = c.body.id;
  await t.db.run("update classes set short_code = 'PTS101', program = 'EBA' where id = $1", [classId]);
  for (const id of [gvId, gId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [classId] });
  for (const [code, name] of [['P.5001', 'An'], ['P.5002', 'Bình'], ['P.5003', 'Chi']]) await admin.post(`/api/classes/${classId}/students`, { student_code: code, full_name: name });
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

const scores = () => t.db.all(`select s.student_code, a.kind, a.seq, hs.score::float8 as score, hs.module from homework_scores hs
  join enrollments e on e.id = hs.enrollment_id join students s on s.id = e.student_id join assignments a on a.id = hs.assignment_id
  order by 1, 2, 3`);

test('đọc nhãn bài và điểm: HW2/HW 2/Homework 2, Capstone; điểm dấu phẩy; ngoài 0–10 bị loại', () => {
  assert.deepEqual([parseHw('HW2'), parseHw('hw 12'), parseHw('Homework 3'), parseHw('Capstone Project'), parseHw('Quiz')],
    [{ kind: 'hw', seq: 2 }, { kind: 'hw', seq: 12 }, { kind: 'hw', seq: 3 }, { kind: 'capstone', seq: 1 }, null]);
  assert.deepEqual([parseScore(8.8), parseScore('9,5'), parseScore('10'), parseScore(0), parseScore(11), parseScore(-1), parseScore('x'), parseScore(null)],
    [8.8, 9.5, 10, 0, null, null, null, null]);
});

test('đồng bộ điểm: cần mã; ghép theo StudentID + Course + HW; không lưu họ tên; chạy lại không đổi', async () => {
  const noTok = await realFetch(`${t.base}/api/sync/points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noTok.status, 401);
  const r = await post([row('P.5001', 'HW1', 8), row('P.5001', 'HW2', 8.8), row('P.5002', 'HW1', 10), row('P.5003', 'HW2', '7,5', 'Data Modeling')]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.valid, r.body.inserted, r.body.updated, r.body.changed], [4, 4, 0, true]);
  assert.deepEqual(await scores(), [
    { student_code: 'P.5001', kind: 'hw', seq: 1, score: 8, module: 'Data Transformation' },
    { student_code: 'P.5001', kind: 'hw', seq: 2, score: 8.8, module: 'Data Transformation' },
    { student_code: 'P.5002', kind: 'hw', seq: 1, score: 10, module: 'Data Transformation' },
    { student_code: 'P.5003', kind: 'hw', seq: 2, score: 7.5, module: 'Data Modeling' },
  ]);
  // họ tên trong Sheet không được lưu ở bất kỳ đâu
  const hit = await t.db.one("select count(*)::int n from homework_scores x where to_jsonb(x)::text like '%Tên không được lưu%'");
  assert.equal(hit.n, 0);
  const again = await post([row('P.5001', 'HW1', 8), row('P.5001', 'HW2', 8.8), row('P.5002', 'HW1', 10), row('P.5003', 'HW2', '7,5', 'Data Modeling')]);
  assert.deepEqual([again.body.inserted, again.body.updated, again.body.changed], [0, 0, false]);
});

test('sửa điểm trong Sheet thì cập nhật; điểm bị xóa khỏi Sheet thì bị xóa; dòng sai được đếm, không làm hỏng', async () => {
  const r = await post([
    row('P.5001', 'HW1', 9), row('P.5001', 'HW2', 8.8), row('P.5003', 'HW2', 7.5, 'Data Modeling'),   // P.5002 HW1 bị xóa; P.5001 HW1 sửa 8 → 9
    row('#N/A', 'HW1', 5), row('P.5002', 'Quiz', 5), row('P.5002', 'HW1', 15), row('P.5002', 'HW1', 6, 'X', 'XXX999'),   // sai mã / nhãn / điểm / lớp lạ
    row('P.9999', 'HW1', 5),      // không có ghi danh
    row('P.5001', 'HW9', 5),      // lớp không có HW9
  ]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.updated, r.body.deleted, r.body.skipped_bad_student_id, r.body.skipped_bad_hw, r.body.skipped_bad_point,
    r.body.skipped_unknown_class, r.body.skipped_no_enrollment, r.body.skipped_no_assignment], [1, 1, 1, 1, 1, 1, 1, 1]);
  const s = await scores();
  assert.equal(s.find((x) => x.student_code === 'P.5001' && x.seq === 1).score, 9);
  assert.equal(s.some((x) => x.student_code === 'P.5002'), false);
});

test('chốt chặn: một lượt bỗng xóa quá nhiều điểm (Sheet lỗi) thì không xóa gì', async () => {
  // 60 học viên × 2 HW = 120 điểm (nạp thẳng DB), rồi Sheet chỉ còn 1 dòng
  await t.db.run("insert into students (student_code, full_name) select 'P.6' || lpad(n::text, 3, '0'), 'HV ' || n from generate_series(1, 60) n");
  await t.db.run("insert into enrollments (class_id, student_id) select $1, id from students where student_code like 'P.6%'", [classId]);
  await t.db.run(`insert into homework_scores (enrollment_id, assignment_id, score)
    select e.id, a.id, 7 from enrollments e join students s on s.id = e.student_id cross join assignments a
     where e.class_id = $1 and a.class_id = $1 and a.kind = 'hw' and a.seq <= 2 and s.student_code like 'P.6%'`, [classId]);
  const before = (await scores()).length;
  assert.ok(before >= 120);
  const r = await post([row('P.5001', 'HW1', 9)]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.delete_skipped, true);
  assert.equal(r.body.deleted, 0);
  assert.equal((await scores()).length, before);
});

test('xem điểm: admin và giảng viên của lớp xem được (kèm điểm TB); khách bị 403', async () => {
  await t.db.run('delete from homework_scores');
  await post([row('P.5001', 'HW1', 9), row('P.5001', 'HW2', 8), row('P.5002', 'HW1', 6)]);
  const a = await admin.get(`/api/classes/${classId}/scores`);
  assert.equal(a.status, 200);
  assert.equal(a.body.has_scores, true);
  const by = Object.fromEntries(a.body.rows.map((r) => [r.student_code, r]));
  assert.equal(by['P.5001'].avg, 8.5);                 // (9 + 8) / 2
  assert.equal(by['P.5002'].avg, 6);
  assert.equal(by['P.5003'].avg, null);
  assert.equal(a.body.class_avg, 7.67);                // (9 + 8 + 6) / 3
  assert.equal((await gv.get(`/api/classes/${classId}/scores`)).status, 200);
  assert.equal((await guest.get(`/api/classes/${classId}/scores`)).status, 403);
});

test('script Apps Script riêng cho Sheet điểm: chỉ 5 cột, không có cột họ tên, khớp máy chủ, không ghi sẵn mã bí mật', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-points.gs'), 'utf8');
  const { POINT_COLUMNS } = require('../src/services/importPoints');
  const list = JSON.parse(/const ALLOWED_POINT = (\[.*?\]);/.exec(src)[1].replace(/'/g, '"'));
  assert.deepEqual(list, POINT_COLUMNS);
  assert.ok(!list.some((c) => /TÊN|NAME/i.test(c)));
  assert.match(src, /function syncNow\(forceArg\)/);
  assert.match(src, /const force = forceArg === true;/);
  assert.match(src, /createTextFinder\(keyHeader\)\.matchEntireCell\(true\)/);
  assert.ok(!/SYNC_TOKEN\s*=\s*['"][^'"]+['"]/.test(src), 'không ghi sẵn mã bí mật');
  // script đăng ký (PERSONAL) giữ nguyên, không đụng tới điểm
  const tx = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-transactions.gs'), 'utf8');
  assert.ok(!/Point|syncPoints_/.test(tx));
});

test('danh sách học viên có điểm TB (không cho khách)', async () => {
  await t.db.run('delete from homework_scores');
  await post([row('P.5001', 'HW1', 9), row('P.5001', 'HW2', 8)]);
  const a = (await admin.get(`/api/classes/${classId}/students`)).body.find((s) => s.student_code === 'P.5001');
  assert.equal(a.score_avg, 8.5);
  const g = (await guest.get(`/api/classes/${classId}/students`)).body.find((s) => s.student_code === 'P.5001');
  assert.equal('score_avg' in g, false);
});

test('Dashboard: điểm TB của lớp (không cho khách)', async () => {
  await t.db.run('delete from homework_scores');
  await post([row('P.5001', 'HW1', 9), row('P.5001', 'HW2', 8), row('P.5002', 'HW1', 6)]);
  const a = (await admin.get(`/api/classes/${classId}/dashboard`)).body.totals;
  assert.equal(a.avg_score, 7.67);            // (9 + 8 + 6) / 3
  assert.equal(a.scored_students, 2);
  const g = (await guest.get(`/api/classes/${classId}/dashboard`)).body.totals;
  assert.equal(g.avg_score, null);
});
