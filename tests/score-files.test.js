// Điểm từ danh sách file bài làm SharePoint (Path · Name · Point): nhận diện lớp/học viên/bài, tổng điểm các file, ghép theo tên, thứ tự ưu tiên nguồn.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { parseScoreFileRows, detectItem, normName } = require('../src/services/importScoreFiles');
const { importPoints, POINT_SYNC_COLUMNS } = require('../src/services/importPoints');

const TOKEN = 'scorefiles-test-token';
const realFetch = global.fetch;
let t, admin, classId;
const P = (cls, student, ...rest) => `Shared Documents/STARTTRAIN/BIH/${cls}/${student}/${rest.join('/')}`;
const rowOf = (p, point) => [p, p.split('/').pop().replace(/\.[a-z]+$/i, ''), point];
const table = (rows) => ({ headers: ['Path', 'Name', 'Point'], rows });
const post = (rows, token = TOKEN) => realFetch(`${t.base}/api/sync/score-files`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token },
  body: JSON.stringify({ files: table(rows) }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const score = (code, kind = 'hw', seq = 1) => t.db.one(
  `select hs.score::float8 as score, hs.manual, hs.source from homework_scores hs join enrollments e on e.id = hs.enrollment_id join students s on s.id = e.student_id
     join assignments a on a.id = hs.assignment_id where s.student_code = $1 and a.kind = $2 and a.seq = $3`, [code, kind, seq]).then((r) => r ?? null);

test('nhận diện bài: HW/Homework/Mini Project/Capstone từ thư mục con hoặc tên file; "Project 1" mơ hồ thì bỏ qua', () => {
  assert.deepEqual(detectItem('HW1/Basic/An - BIH96 - HW1.pbix'), { kind: 'hw', seq: 1 });
  assert.deepEqual(detectItem('Homework 2/bai.xlsx'), { kind: 'hw', seq: 2 });
  assert.deepEqual(detectItem('HOMEWORK WEEK 3-DONE/x.xlsx'), { kind: 'hw', seq: 3 });
  assert.deepEqual(detectItem('Mini Project 2/x.pbix'), { kind: 'mini', seq: 2 });
  assert.deepEqual(detectItem('An - BIH98 - MP1.pbix'), { kind: 'mini', seq: 1 });
  assert.deepEqual(detectItem('Capstone Project/final.pbix'), { kind: 'capstone', seq: 1 });
  assert.deepEqual(detectItem('An - BIE102 - Project.pbix'), { kind: 'capstone', seq: 1 });
  assert.equal(detectItem('An - BIH96 - Project 1.pbix'), null);
  assert.equal(detectItem('An - EBA117 - PivotTable - Exercises.xlsx'), null);
  assert.equal(normName('04. PHẠM THỊ Vân  Anh (EBA117)'), 'pham thi van anh');
  assert.equal(normName('Đặng Thị Kim Loan'), 'dang thi kim loan');
});

test('gộp điểm: tổng điểm các file của cùng một bài, tối đa 10; dòng không điểm/không đúng đường dẫn bị bỏ và đếm', () => {
  const r = parseScoreFileRows(table([
    rowOf(P('BIH96', 'Nguyễn Văn An', 'HW1', 'Basic', 'a.pbix'), '5'),
    rowOf(P('BIH96', 'Nguyễn Văn An', 'HW1', 'Challenge', 'b.pbix'), '3.5'),
    rowOf(P('BIH96', 'Nguyễn Văn An', 'HW2', 'c.pbix'), '7,5'),
    rowOf(P('BIH96', 'Nguyễn Văn An', 'HW2', 'd.pbix'), '7,5'),
    rowOf(P('BIH96', 'Nguyễn Văn An', 'HW3', 'e.pbix'), ''),
    rowOf('Shared Documents/STARTTRAIN/BIF/Học viên lẻ/HW1/x.pbix', '9'),
    rowOf(P('BIH96', 'Nguyễn Văn An', 'ghichu.pbix'), '4'),
    rowOf(P('BIH96', 'Nguyễn Văn An', 'HW4', 'f.pbix'), 'abc'),
  ]));
  const g = [...r.groups.values()].map((x) => [x.short, x.name, x.kind, x.seq, Math.round(x.sum * 100) / 100, x.files]);
  assert.deepEqual(g, [['BIH096', 'nguyen van an', 'hw', 1, 8.5, 2], ['BIH096', 'nguyen van an', 'hw', 2, 15, 2]]);
  assert.deepEqual(r.skipped, { no_point: 1, bad_point: 1, bad_path: 1, no_item: 1 });
  assert.throws(() => parseScoreFileRows({ headers: ['A'], rows: [] }), /Thiếu cột/);
});

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  admin = await t.login('admin@x.com');
  classId = (await admin.post('/api/classes', { code: 'P1.BIH.P096.HY.EE.010126', session_count: 2, hw_count: 5, start_date: '2026-01-01' })).body.id;
  await t.db.run("update classes set short_code = 'BIH096', program = 'BIH' where id = $1", [classId]);
  for (const [code, name] of [['P.8001', 'Nguyễn Văn An'], ['P.8002', 'Trần Thị Bình'], ['P.8003', 'Lê Chi'], ['P.8004', 'Lê Chi'], ['P.8005', 'Phạm Dũng']]) {
    await admin.post(`/api/classes/${classId}/students`, { student_code: code, full_name: name });
  }
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('đồng bộ: sai mã bị từ chối; ghép theo tên (bỏ dấu, lớp BIH96 = BIH096); tên trùng và tên lạ được đếm riêng', async () => {
  assert.equal((await post([], 'sai-ma')).status, 401);
  const r = await post([
    rowOf(P('BIH96', 'Nguyen Van An', 'HW1', 'Basic', 'a.pbix'), '5'),
    rowOf(P('BIH96', 'NGUYỄN VĂN AN', 'HW1', 'Challenge', 'b.pbix'), '3'),
    rowOf(P('BIH96', 'Trần Thị Bình', 'HW2', 'c.xlsx'), '9.5'),
    rowOf(P('BIH96', 'Lê Chi', 'HW1', 'd.xlsx'), '8'),
    rowOf(P('BIH96', 'Người Lạ', 'HW1', 'e.xlsx'), '8'),
    rowOf(P('BIH96', 'Phạm Dũng', 'Mini Project 3', 'f.pbix'), '7'),
    rowOf(P('BIH96', 'Phạm Dũng', 'Capstone', 'g.pbix'), '6'),
  ]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.matched, r.body.unmatched_students, r.body.ambiguous_students, r.body.inserted], [4, 1, 1, 4]);
  assert.deepEqual(r.body.examples.unmatched, ['BIH096: 1 học viên']);
  assert.ok(!JSON.stringify(r.body).includes('Người Lạ') && !JSON.stringify(r.body).includes('nguoi la'), 'không trả tên học viên ra ngoài');
  const an = await score('P.8001');
  assert.deepEqual([an.score, an.source, an.manual], [8, 'sharepoint', false]);
  assert.equal((await score('P.8002', 'hw', 2)).score, 9.5);
  assert.equal(await score('P.8003'), null, 'tên trùng không ghi');
  assert.equal((await score('P.8005', 'hw', 5)).score, 7, 'BIH: Mini Project 3 = HW5');
  assert.equal((await score('P.8005', 'capstone', 1)).score, 6);
});

test('thứ tự ưu tiên: gõ tay > Excel > SharePoint; SharePoint tự cập nhật điểm của chính nó; Excel không xóa điểm SharePoint', async () => {
  // gõ tay cho An HW1; Excel cho Bình HW2 = 6
  await admin.put(`/api/classes/${classId}/scores`, { enrollment_id: (await t.db.one("select e.id from enrollments e join students s on s.id = e.student_id where s.student_code = 'P.8001'")).id,
    assignment_id: (await t.db.one("select a.id from assignments a where a.class_id = $1 and a.kind = 'hw' and a.seq = 1", [classId])).id, score: 2 });
  await importPoints(t.db, { headers: POINT_SYNC_COLUMNS.slice(0, 5), rows: [['P.8002', 'BIH096', 'HW2', 6, 'Module A']] });
  assert.deepEqual([(await score('P.8001')).score, (await score('P.8001')).manual], [2, true]);
  assert.deepEqual([(await score('P.8002', 'hw', 2)).score, (await score('P.8002', 'hw', 2)).source], [6, 'excel'], 'Excel ghi đè điểm SharePoint');
  // SharePoint chạy lại với điểm khác: không đè gõ tay, không đè Excel; điểm SharePoint của Dũng được cập nhật
  const r = await post([
    rowOf(P('BIH96', 'Nguyễn Văn An', 'HW1', 'a.pbix'), '9'),
    rowOf(P('BIH96', 'Trần Thị Bình', 'HW2', 'c.xlsx'), '9.5'),
    rowOf(P('BIH96', 'Phạm Dũng', 'Capstone', 'g.pbix'), '8.5'),
  ]);
  assert.equal(r.status, 200);
  assert.equal((await score('P.8001')).score, 2);
  assert.equal((await score('P.8002', 'hw', 2)).score, 6);
  assert.equal((await score('P.8005', 'capstone', 1)).score, 8.5);
  // Excel chạy tiếp (không có điểm của Dũng): không xóa điểm SharePoint
  const ex = await importPoints(t.db, { headers: POINT_SYNC_COLUMNS.slice(0, 5), rows: [['P.8002', 'BIH096', 'HW2', 6, 'Module A']] });
  assert.equal(ex.deleted, 0);
  assert.equal((await score('P.8005', 'capstone', 1)).score, 8.5);
  assert.equal((await score('P.8005', 'hw', 5)).score, 7);
});

test('lỗi và giới hạn: thiếu cột Path/Point báo 422; bài chưa có trong lớp được đếm; không lưu tên/đường dẫn; schema và Apps Script khớp', async () => {
  const bad = await realFetch(`${t.base}/api/sync/score-files`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN },
    body: JSON.stringify({ files: { headers: ['Tên'], rows: [['x']] } }) });
  assert.equal(bad.status, 422);
  const r = await post([rowOf(P('BIH96', 'Nguyễn Văn An', 'HW9', 'z.pbix'), '5')]);
  assert.equal(r.body.skipped_no_assignment, 1);
  const run = await t.db.one("select summary from sync_runs where source = 'google-sheet-scorefiles' order by id desc limit 1");
  assert.ok(!JSON.stringify(run).includes('Nguyễn') && !JSON.stringify(run).includes('Shared Documents'));
  const root = path.join(__dirname, '..');
  for (const f of ['src/schema.sql', 'supabase/schema.sql']) assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /source\s+text not null default 'excel'/);
  const gs = fs.readFileSync(path.join(root, 'scripts/google-apps-script/sync-score-files.gs'), 'utf8');
  assert.match(gs, /SCORE_FILES_URL/);
  assert.match(gs, /X-Sync-Token/);
  assert.ok(!/https?:\/\/[^\s'"]*vercel\.app/.test(gs));
});
