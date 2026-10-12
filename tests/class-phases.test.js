const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, admin, gv, F;
const ids = {};

// Ngày hôm nay theo múi giờ Việt Nam (khớp TODAY_SQL), cộng/trừ n ngày.
const vn = (n = 0) => new Date(Date.now() + 7 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);

// (tên, ngày bắt đầu, ngày kết thúc = buổi cuối, giai đoạn mong đợi)
const CASES = [
  ['SOON', vn(+5), vn(+40), 'upcoming'],
  ['RUNA', vn(-30), vn(+10), 'running'],
  ['RUNB', vn(-40), vn(0), 'running'],        // hôm nay là buổi cuối: vẫn đang học
  ['GRD1', vn(-50), vn(-1), 'grading'],       // ngày đầu sau buổi cuối
  ['GRD2', vn(-60), vn(-14), 'grading'],      // đúng +14 ngày: còn trong hạn nộp bài
  ['GRAD1', vn(-70), vn(-15), 'graduation'],  // +15: bắt đầu giai đoạn công bố
  ['GRAD2', vn(-80), vn(-28), 'graduation'],  // đúng +28: còn công bố tốt nghiệp
  ['FIN', vn(-90), vn(-29), 'finished'],      // +29: đã kết thúc hẳn
];
// Lớp B2B (mã có chữ B): kết thúc ngay trong ngày buổi cuối, không có +14 ngày chấm bài / +14 ngày công bố
const B2B_CASES = [
  ['P1.EBA.B900.OF.MA.010126', vn(-20), vn(0), 'running'],      // hôm nay là buổi cuối: vẫn đang học
  ['P1.EBA.B901.OF.MA.010126', vn(-20), vn(-1), 'finished'],    // hôm sau đã kết thúc (lớp cá nhân sẽ là nộp & chấm bài)
  ['P1.EBA.P902.OF.MA.010126', vn(-20), vn(-1), 'grading'],     // đối chứng: lớp cá nhân cùng ngày
];

before(async () => {
  F = await import('../public/js/class-filter.mjs');
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  for (const [code, start, end] of CASES) {
    ids[code] = (await t.db.one('insert into classes (code, name, short_code, start_date, end_date) values ($1, $1, $1, $2, $3) returning id', [code, start, end])).id;
    await t.db.run("insert into students (student_code, full_name) values ($1, $1) on conflict do nothing", ['S-' + code]);
    await t.db.run("insert into enrollments (class_id, student_id) select $1, id from students where student_code = $2", [ids[code], 'S-' + code]);
  }
  for (const [code, start, end] of B2B_CASES) {
    ids[code] = (await t.db.one('insert into classes (code, name, short_code, start_date, end_date) values ($1, $1, $1, $2, $3) returning id', [code, start, end])).id;
  }
  await admin.put(`/api/users/${gvId}/classes`, { class_ids: [ids.GRD1] });
});
after(async () => { await t.close(); });

test('giai đoạn của lớp: đang học → nộp & chấm bài (+14 ngày) → công bố tốt nghiệp (+14 ngày) → kết thúc', async () => {
  const list = (await admin.get('/api/classes')).body;
  const timing = Object.fromEntries(list.map((c) => [c.code, c.timing]));
  for (const [code, , , expected] of CASES) assert.equal(timing[code], expected, code);
});

test('lớp B2B kết thúc trong ngày buổi cuối; các mốc ngày trùng buổi cuối', async () => {
  const list = (await admin.get('/api/classes')).body;
  const by = Object.fromEntries(list.map((c) => [c.code, c]));
  for (const [code, , , expected] of B2B_CASES) assert.equal(by[code].timing, expected, code);
  const b = by['P1.EBA.B901.OF.MA.010126'];
  assert.deepEqual([b.last_session_date, b.grading_until, b.graduation_on], [vn(-1), vn(-1), vn(-1)]);
  const p = by['P1.EBA.P902.OF.MA.010126'];
  assert.deepEqual([p.grading_until, p.graduation_on], [vn(+13), vn(+27)]);
});

test('lớp trả về các mốc ngày: buổi cuối, hạn nộp bài (+14), công bố tốt nghiệp (+28)', async () => {
  const c = (await admin.get('/api/classes')).body.find((x) => x.code === 'GRD1');
  assert.equal(c.last_session_date, vn(-1));
  assert.equal(c.grading_until, vn(+13));
  assert.equal(c.graduation_on, vn(+27));
  // không có ngày kết thúc: buổi cuối = ngày bắt đầu + 90
  await t.db.run("update classes set end_date = null where code = 'RUNA'");
  const noEnd = (await admin.get('/api/classes')).body.find((x) => x.code === 'RUNA');
  const start = new Date(vn(-30)); start.setUTCDate(start.getUTCDate() + 90);
  assert.equal(noEnd.last_session_date, start.toISOString().slice(0, 10));
  await t.db.run("update classes set end_date = $1 where code = 'RUNA'", [vn(+10)]);
});

test('tổng quan trang chủ: lớp nộp/chấm bài và công bố tốt nghiệp vẫn là lớp hoạt động', async () => {
  const r = (await admin.get('/api/overview')).body;
  assert.equal(r.totals.running, 3);          // + lớp B2B đang ở buổi cuối
  assert.equal(r.totals.grading, 3);          // + lớp cá nhân đối chứng
  assert.equal(r.totals.graduation, 2);
  assert.equal(r.totals.active, 8);
  const order = r.featured.map((c) => c.timing);
  assert.deepEqual(order, [...order].sort((a, b) => ['running', 'grading', 'graduation'].indexOf(a) - ['running', 'grading', 'graduation'].indexOf(b)));
  assert.ok(r.featured.every((c) => ['running', 'grading', 'graduation'].includes(c.timing)));
  assert.ok(r.featured.every((c) => c.grading_until && c.graduation_on));
  assert.ok(!r.featured.some((c) => c.short_code === 'FIN' || c.short_code === 'SOON'));
  // giảng viên chỉ thấy lớp được phân (đang ở giai đoạn chấm bài)
  const g = (await gv.get('/api/overview')).body;
  assert.equal(g.totals.grading, 1);
  assert.equal(g.featured.length, 1);
});

test('bộ lọc phía trình duyệt: nhóm "Đang hoạt động", chip và mặc định', async () => {
  const list = (await admin.get('/api/classes')).body;
  const counts = F.countByTiming(list);
  assert.deepEqual([counts.running, counts.grading, counts.graduation, counts.active, counts.upcoming, counts.finished], [3, 3, 2, 8, 1, 2]);
  assert.equal(F.filterClasses(list, { timing: 'active' }).length, 8);
  assert.equal(F.filterClasses(list, { timing: 'grading' }).length, 3);
  assert.equal(F.defaultTiming(list), 'active');   // có lớp đang chấm bài/công bố → mặc định hiện cả nhóm
  assert.deepEqual(F.timingChipKeys(counts), ['all', 'active', 'running', 'grading', 'graduation', 'upcoming', 'finished']);
  // chỉ có lớp đang học: không lặp chip "Đang hoạt động"
  const onlyRunning = list.filter((c) => c.timing === 'running');
  assert.equal(F.defaultTiming(onlyRunning), 'running');
  assert.deepEqual(F.timingChipKeys(F.countByTiming(onlyRunning)), ['all', 'running']);
  // sắp xếp: đang học, nộp & chấm bài, công bố tốt nghiệp, sắp mở, đã kết thúc
  const order = F.sortClasses(list).map((c) => c.timing);
  assert.deepEqual([...new Set(order)], ['running', 'grading', 'graduation', 'upcoming', 'finished']);
});
