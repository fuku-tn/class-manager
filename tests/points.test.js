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
  process.env.POINTS_SHEET_SYNC = '1';   // các test dưới dùng đường Sheet (đã tắt mặc định) để thử bộ ghép điểm chung
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
after(async () => { delete process.env.SYNC_TOKEN; delete process.env.POINTS_SHEET_SYNC; await t.close(); });

const scores = () => t.db.all(`select s.student_code, a.kind, a.seq, hs.score::float8 as score, hs.module from homework_scores hs
  join enrollments e on e.id = hs.enrollment_id join students s on s.id = e.student_id join assignments a on a.id = hs.assignment_id
  order by 1, 2, 3`);

test('đọc nhãn bài và điểm: HW2/HW 2/Homework 2, Capstone; điểm dấu phẩy; ngoài 0–10 bị loại', () => {
  assert.deepEqual([parseHw('HW2'), parseHw('hw 12'), parseHw('Homework 3'), parseHw('Capstone Project'), parseHw('Quiz')],
    [{ kind: 'hw', seq: 2 }, { kind: 'hw', seq: 12 }, { kind: 'hw', seq: 3 }, { kind: 'capstone', seq: 1 }, null]);
  // ô HW chỉ ghi số thứ tự (ô số hoặc chữ), các kiểu viết khác; số 0 / số lẻ / chữ lạ thì không nhận
  assert.deepEqual([2, '3', 'HW-04', 'HW_5', 'Bài 6', 'bai tap 7', 0, 2.5, 'HW', '1a'].map(parseHw),
    [{ kind: 'hw', seq: 2 }, { kind: 'hw', seq: 3 }, { kind: 'hw', seq: 4 }, { kind: 'hw', seq: 5 }, { kind: 'hw', seq: 6 }, { kind: 'hw', seq: 7 }, null, null, null, null]);
  const { normalizeCourse } = require('../src/services/importPoints');
  assert.deepEqual(['BIE102', 'bie 102', 'BIE-102', 'BIE95', 'P2.BIE.P102.HY.AA.260726', 'P1.EBA.B084.HY.MA.180925', ' EBA120 ', '', null].map(normalizeCourse),
    ['BIE102', 'BIE102', 'BIE102', 'BIE095', 'BIE102', 'EBA084', 'EBA120', null, null]);
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
  // ví dụ giá trị bị bỏ qua (để sửa Sheet): chỉ nhãn HW / mã lớp, không có mã học viên hay tên
  assert.deepEqual(r.body.examples, { bad_hw: ['Quiz'], bad_point: ['PTS101 HW1: 15'], unknown_class: ['XXX999'], no_assignment: ['PTS101 HW9'], no_enrollment: ['PTS101 HW1'] });
  assert.ok(!JSON.stringify(r.body.examples).includes('P.'));
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

test('Mini Project: tự tạo cột MP cho lớp, lưu điểm, không tính vào % hoàn thành HW; thứ tự HW → MP → Capstone', async () => {
  assert.deepEqual(['Mini Project 1', 'mini project 2', 'MP3', 'Mini Project'].map(parseHw),
    [{ kind: 'mini', seq: 1 }, { kind: 'mini', seq: 2 }, { kind: 'mini', seq: 3 }, null]);
  const r = await post([row('P.5001', 'Mini Project 1', 9, 'Project'), row('P.5002', 'Mini Project 2', '8,5', 'Project'), row('P.5001', 'Mini Project 1', 9.5, 'Project')]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.created_assignments, r.body.inserted, r.body.skipped_no_assignment], [2, 2, 0]);
  const mp = await t.db.all("select seq, title, collected from assignments where class_id = $1 and kind = 'mini' order by seq", [classId]);
  assert.deepEqual(mp, [{ seq: 1, title: 'Mini Project 1', collected: false }, { seq: 2, title: 'Mini Project 2', collected: false }]);
  assert.equal((await scores()).find((x) => x.kind === 'mini' && x.student_code === 'P.5001').score, 9.5);   // dòng sau ghi đè dòng trước
  // chạy lại không tạo thêm cột
  const again = await post([row('P.5001', 'Mini Project 1', 9.5, 'Project'), row('P.5002', 'Mini Project 2', '8,5', 'Project')]);
  assert.equal(again.body.created_assignments, 0);
  // Mini Project không thuộc nhóm HW: bài mini không có trong mẫu số % hoàn thành HW
  const dash = (await admin.get(`/api/classes/${classId}/dashboard`)).body;
  assert.ok(dash.by_assignment.some((x) => x.kind === 'mini'));
  // thứ tự cột trên trang Bài tập và bảng điểm
  const sub = (await admin.get(`/api/classes/${classId}/submissions`)).body.assignments.map((a) => `${a.kind}${a.seq}`);
  assert.deepEqual(sub.filter((k) => k.startsWith('mini')), ['mini1', 'mini2']);
  assert.ok(sub.indexOf('mini1') > sub.lastIndexOf('hw4') && sub.indexOf('mini2') < sub.indexOf('capstone1'), sub.join(' '));
});

test('Sheet điểm đã tắt mặc định (nguồn điểm là file Excel): trả 410, không ghi gì', async () => {
  delete process.env.POINTS_SHEET_SYNC;
  const before = (await scores()).length;
  const r = await post([row('P.5001', 'HW1', 1)]);
  process.env.POINTS_SHEET_SYNC = '1';
  assert.equal(r.status, 410);
  assert.match(r.body.error, /Chấm điểm\.xlsx/);
  assert.equal((await scores()).length, before);
});

test('đọc bảng Point_Transform trong file Excel: chỉ cột cho phép, lấy giá trị công thức, bỏ cột họ tên', async () => {
  const ExcelJS = require('exceljs');
  const { readPointTransform } = require('../src/services/pointsExcel');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tổng điểm');
  ws.addTable({ name: 'Point_Transform', ref: 'A1', columns: ['StudentID', 'Họ và tên', 'Course', 'HW', 'Point', 'Module'].map((name) => ({ name })),
    rows: [['P.5001', 'Tên bí mật', 'PTS101', 'HW1', 8, 'Data Transformation'], ['P.5002', 'Tên bí mật', 'PTS101', 'Mini Project 1', 7.5, 'Project']] });
  ws.getCell('E3').value = { formula: 'SUMIFS(X,Y,Z)', result: 9.25 };   // ô công thức: lấy giá trị Excel đã tính
  const other = wb.addWorksheet('StudentProfile');
  other.addTable({ name: 'StudentProfile', ref: 'A1', columns: [{ name: 'FULL NAME' }, { name: 'EMAIL' }], rows: [['Tên bí mật', 'x@y.z']] });
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const t2 = await readPointTransform(buf);
  assert.deepEqual(t2.headers, ['STUDENTID', 'COURSE', 'HW', 'POINT', 'MODULE']);
  assert.deepEqual(t2.rows, [['P.5001', 'PTS101', 'HW1', 8, 'Data Transformation'], ['P.5002', 'PTS101', 'Mini Project 1', 9.25, 'Project']]);
  assert.ok(!JSON.stringify(t2).includes('Tên bí mật') && !JSON.stringify(t2).includes('x@y.z'));
  await assert.rejects(readPointTransform(buf, { tableName: 'Khong_Co' }), /Không thấy bảng/);
});

test('sao lưu điểm trước khi nhập: ảnh chụp (5 cột + Source) ra CSV, nạp lại CSV đó thì không đổi gì', async () => {
  const { snapshotScores, readPointsCsv } = require('../src/services/pointsExcel');
  const { importPoints } = require('../src/services/importPoints');
  const { toCsv } = require('../src/services/backup');
  const snap = await snapshotScores(t.db);
  assert.ok(snap.rows.length > 0);
  assert.deepEqual(snap.headers, ['STUDENTID', 'COURSE', 'HW', 'POINT', 'MODULE', 'SOURCE']);
  assert.ok(snap.rows.every((r) => /^(HW\d+|Mini Project \d+|Capstone Project)$/.test(r[2]) && /^P\.\d+$/.test(r[0]) && r[1] === 'PTS101'), JSON.stringify(snap.rows));
  const cols = ['StudentID', 'Course', 'HW', 'Point', 'Module', 'Source'];
  const csv = toCsv(cols, snap.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]))));
  assert.ok(!csv.includes('Tên không được lưu'));                       // không có họ tên
  const s = await importPoints(t.db, readPointsCsv(csv), { trustSource: true });
  assert.deepEqual([s.valid, s.inserted, s.updated, s.deleted], [snap.rows.length, 0, 0, 0]);
});

test('BIH: "Mini Project 3" = HW5 (lưu vào bài HW5, không tạo cột MP3); giao diện hiện MP3, thứ tự HW1–4, MP1–3, Capstone', async () => {
  const { applyAlias } = require('../src/services/importPoints');
  assert.deepEqual(applyAlias('BIH098', { kind: 'mini', seq: 3 }), { kind: 'hw', seq: 5 });
  assert.deepEqual(applyAlias('BIE101', { kind: 'mini', seq: 3 }), { kind: 'mini', seq: 3 });
  assert.deepEqual(applyAlias('BIH098', { kind: 'mini', seq: 1 }), { kind: 'mini', seq: 1 });
  const c = await admin.post('/api/classes', { code: 'P2.BIH.P901.HY.EE.010126', session_count: 2, hw_count: 5, start_date: '2026-01-01' });
  await t.db.run("update classes set short_code = 'BIH901', program = 'BIH' where id = $1", [c.body.id]);
  await admin.post(`/api/classes/${c.body.id}/students`, { student_code: 'P.7001', full_name: 'HV BIH' });
  const r = await post([row('P.7001', 'HW1', 8, 'x', 'BIH901'), row('P.7001', 'Mini Project 1', 7, 'x', 'BIH901'), row('P.7001', 'Mini Project 3', 9, 'x', 'BIH901')]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.inserted, r.body.created_assignments], [3, 1]);   // chỉ tạo MP1; MP3 vào HW5
  const got = await t.db.all(`select a.kind, a.seq, hs.score::float8 score from homework_scores hs join assignments a on a.id = hs.assignment_id
    where a.class_id = $1 order by a.kind, a.seq`, [c.body.id]);
  assert.deepEqual(got, [{ kind: 'hw', seq: 1, score: 8 }, { kind: 'hw', seq: 5, score: 9 }, { kind: 'mini', seq: 1, score: 7 }]);
  const { assignmentLabel, sortAssignments } = await import('../public/js/class-filter.mjs');
  const bih = { short_code: 'BIH901', program: 'BIH' };
  const list = [['hw', 1], ['hw', 5], ['capstone', 1], ['mini', 2], ['hw', 4], ['mini', 1]].map(([kind, seq]) => ({ kind, seq }));
  assert.deepEqual(sortAssignments(list, bih).map((a) => assignmentLabel(a, bih)), ['HW1', 'HW4', 'MP1', 'MP2', 'MP3', 'Capstone']);
  assert.deepEqual(sortAssignments(list, { short_code: 'BIE101' }).map((a) => assignmentLabel(a, { short_code: 'BIE101' })), ['HW1', 'HW4', 'HW5', 'MP1', 'MP2', 'Capstone']);
  assert.equal(assignmentLabel({ kind: 'capstone', seq: 1 }, bih, { short: true }), 'CP');
});
