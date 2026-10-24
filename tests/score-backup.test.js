// Sao lưu điểm: bản chụp có cột Source (manual/excel/sharepoint) và khôi phục từ CSV giữ đúng điểm gõ tay + nguồn; Sheet không tự đặt được SOURCE.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { importPoints, POINT_SYNC_COLUMNS } = require('../src/services/importPoints');
const { snapshotScores, readPointsCsv, writeScoresBackup } = require('../src/services/pointsExcel');

let t, admin, classId, enr, asg;
const HEAD = POINT_SYNC_COLUMNS.slice(0, 5);
const row = (sid, hw, point) => [sid, 'BKP101', hw, point, 'Module A'];
const state = () => t.db.all(`select s.student_code, a.seq, hs.score::float8 as score, hs.manual, hs.source from homework_scores hs
  join enrollments e on e.id = hs.enrollment_id join students s on s.id = e.student_id join assignments a on a.id = hs.assignment_id order by 1, 2`)
  .then((r) => r.map((x) => [x.student_code, x.seq, x.score, x.manual, x.source]));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bkp-'));

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  admin = await t.login('admin@x.com');
  classId = (await admin.post('/api/classes', { code: 'P1.EBA.P101.ON.EE.010126', session_count: 2, hw_count: 3, start_date: '2026-01-01' })).body.id;
  await t.db.run("update classes set short_code = 'BKP101', program = 'EBA' where id = $1", [classId]);
  for (const [c, n] of [['P.9001', 'An'], ['P.9002', 'Bình'], ['P.9003', 'Chi']]) await admin.post(`/api/classes/${classId}/students`, { student_code: c, full_name: n });
  enr = Object.fromEntries((await admin.get(`/api/classes/${classId}/students`)).body.map((s) => [s.student_code, s.id]));
  asg = Object.fromEntries((await admin.get(`/api/classes/${classId}/submissions`)).body.assignments.filter((a) => a.kind === 'hw').map((a) => [a.seq, a.id]));
});
after(async () => { await t.close(); });

test('bản chụp điểm có cột Source (manual = gõ tay, excel, sharepoint); ghi ra file CSV và chỉ giữ bản mới nhất', async () => {
  await importPoints(t.db, { headers: HEAD, rows: [row('P.9001', 'HW1', 7), row('P.9002', 'HW1', 6)] });
  await importPoints(t.db, { headers: HEAD, rows: [row('P.9003', 'HW1', 9)] }, { source: 'sharepoint', allowDelete: false });
  assert.equal((await admin.put(`/api/classes/${classId}/scores`, { enrollment_id: enr['P.9001'], assignment_id: asg[2], score: 8.5 })).status, 200);
  const snap = await snapshotScores(t.db);
  assert.deepEqual(snap.headers, [...HEAD, 'SOURCE']);
  assert.deepEqual(snap.rows.map((r) => [r[0], r[2], r[3], r[5]]), [['P.9001', 'HW1', 7, 'excel'], ['P.9001', 'HW2', 8.5, 'manual'], ['P.9002', 'HW1', 6, 'excel'], ['P.9003', 'HW1', 9, 'sharepoint']]);
  const dir = tmp();
  const b1 = await writeScoresBackup(t.db, dir);
  assert.equal(b1.count, 4);
  const text = fs.readFileSync(b1.file, 'utf8');
  assert.match(text.split('\n')[0], /Source/);
  assert.ok(!/Họ tên|full_name/i.test(text), 'bản sao lưu điểm không có họ tên học viên');
  fs.writeFileSync(path.join(dir, 'private-data', 'backups', 'diem', 'diem_2020-01-01_0000.csv'), 'cu');
  const b2 = await writeScoresBackup(t.db, dir);
  assert.equal(b2.removed >= 1, true);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'private-data', 'backups', 'diem')).filter((f) => f.endsWith('.csv')), [b2.name]);
});

test('khôi phục từ CSV: điểm gõ tay và nguồn trở lại đúng như lúc sao lưu', async () => {
  const before = await state();
  const file = (await writeScoresBackup(t.db, tmp())).file;
  await admin.put(`/api/classes/${classId}/scores`, { enrollment_id: enr['P.9001'], assignment_id: asg[2], score: 1 });   // đổi điểm gõ tay
  await t.db.run('delete from homework_scores where score = 6');                                                          // mất điểm Excel
  await t.db.run("update homework_scores set source = 'excel' where score = 9");                                          // sai nguồn
  assert.notDeepEqual(await state(), before);
  const table = readPointsCsv(fs.readFileSync(file, 'utf8'));
  assert.ok(table.headers.includes('SOURCE'));
  const r = await importPoints(t.db, table, { trustSource: true });
  assert.equal(r.deleted, 0);
  assert.deepEqual(await state(), before);
});

test('Sheet/Excel không thể tự đặt SOURCE: không bật trustSource thì cột SOURCE bị bỏ qua (không tạo điểm gõ tay)', async () => {
  const r = await importPoints(t.db, { headers: [...HEAD, 'SOURCE'], rows: [[...row('P.9002', 'HW3', 5), 'manual']] });
  assert.equal(r.inserted, 1);
  const x = (await state()).find((y) => y[0] === 'P.9002' && y[1] === 3);
  assert.deepEqual([x[3], x[4]], [false, 'excel']);
});
