const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let F;
before(async () => { F = await import('../public/js/class-filter.mjs'); });

const sample = [
  { id: 1, short_code: 'BIE101', code: 'P2.BIE.P101.HY.AA.260726', program: 'BIE', timing: 'finished', start_date: '2026-07-26', delivery_mode: 'Hybrid', shift: 'afternoon', student_count: 47 },
  { id: 2, short_code: 'BIH103', code: 'P2.BIH.P103.HY.AA.120926', program: 'BIH', timing: 'running', start_date: '2026-09-12', delivery_mode: 'Hybrid', shift: 'afternoon', student_count: 49 },
  { id: 3, short_code: 'EBA121', code: 'P1.EBA.P121.HY.AA.171026', program: 'EBA', timing: 'upcoming', start_date: '2026-10-17', delivery_mode: 'Hybrid', shift: 'afternoon', student_count: 15 },
  { id: 4, short_code: 'EBA120', code: 'P1.EBA.P120.ON.EE.280926', program: 'EBA', timing: 'running', start_date: '2026-09-28', delivery_mode: 'Online', shift: 'evening', student_count: 16 },
  { id: 5, short_code: 'EBA060', code: 'P1.EBA.P060.HY.AA.0101', program: 'EBA', timing: 'unknown', start_date: null, student_count: 0 },
];

test('lọc lớp: tìm không dấu/không phân biệt hoa thường, nhiều từ khóa là AND', () => {
  assert.equal(F.norm('Đang học Tháng Mười'), 'dang hoc thang muoi');
  assert.deepEqual(F.filterClasses(sample, { q: 'bih 103' }).map((c) => c.short_code), ['BIH103']);
  assert.deepEqual(F.filterClasses(sample, { q: 'EBA online' }).map((c) => c.short_code), ['EBA120']);
  assert.deepEqual(F.filterClasses(sample, { q: '26/07/26' }).map((c) => c.short_code), ['BIE101']);   // theo ngày dd/mm/yy
  assert.deepEqual(F.filterClasses(sample, { q: 'Business Intelligence' }).map((c) => c.short_code), ['BIE101']);
  assert.equal(F.filterClasses(sample, { q: 'không-có-lớp-nào' }).length, 0);
});

test('lọc lớp: theo thời gian và chương trình; đếm; mặc định', () => {
  assert.deepEqual(F.filterClasses(sample, { timing: 'running' }).map((c) => c.id), [2, 4]);
  assert.deepEqual(F.filterClasses(sample, { program: 'EBA', timing: 'upcoming' }).map((c) => c.id), [3]);
  assert.deepEqual(F.countByTiming(sample), { all: 5, running: 2, upcoming: 1, finished: 1, unknown: 1 });
  assert.equal(F.defaultTiming(sample), 'running');                 // có lớp đang học → chỉ hiện lớp đang học
  assert.equal(F.defaultTiming(sample.filter((c) => c.timing !== 'running')), 'all');
  assert.deepEqual(F.programsOf(sample), [{ program: 'EBA', count: 3 }, { program: 'BIE', count: 1 }, { program: 'BIH', count: 1 }]);
});

test('sắp xếp: đang học → sắp mở (gần nhất trước) → đã xong (mới nhất trước) → chưa có ngày', () => {
  assert.deepEqual(F.sortClasses(sample).map((c) => c.short_code), ['EBA120', 'BIH103', 'EBA121', 'BIE101', 'EBA060']);
  assert.equal(F.fmtDate('2026-07-26'), '26/07/26');
  assert.equal(F.fmtDate(null), '');
});

// ---------- API tổng quan ----------
let t, admin, gv, ids;
const day = (offset) => {
  const d = new Date(Date.now() + offset * 864e5);
  return d.toISOString().slice(0, 10);
};

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  ids = {};
  for (const [key, start, end] of [['run', day(-10), day(30)], ['soon', day(20), day(60)], ['old', day(-200), day(-150)]]) {
    const c = (await admin.post('/api/classes', { code: `T.${key}`, start_date: start, session_count: 3, hw_count: 0 })).body;
    await t.db.run('update classes set end_date = $1, short_code = $2, program = $3 where id = $4', [end, key.toUpperCase(), 'BIE', c.id]);
    ids[key] = c.id;
  }
  // lớp đang chạy: 2 học viên, 2 buổi đã diễn ra; A: có mặt + có phép, B: vắng + có mặt
  await admin.post(`/api/classes/${ids.run}/students`, { student_code: 'OA', full_name: 'A' });
  await admin.post(`/api/classes/${ids.run}/students`, { student_code: 'OB', full_name: 'B' });
  const enr = (await admin.get(`/api/classes/${ids.run}/students`)).body;
  const ses = (await admin.get(`/api/classes/${ids.run}/sessions`)).body;
  const A = enr.find((e) => e.student_code === 'OA').id, B = enr.find((e) => e.student_code === 'OB').id;
  const mark = (e, s, status) => admin.put(`/api/classes/${ids.run}/attendance`, { enrollment_id: e, session_id: s.id, status });
  await mark(A, ses[0], 'present'); await mark(A, ses[1], 'excused');
  await mark(B, ses[0], 'absent'); await mark(B, ses[1], 'present');
  await admin.post(`/api/classes/${ids.soon}/students`, { student_code: 'OC', full_name: 'C' });
  await admin.put(`/api/users/${gvId}/classes`, { class_ids: [ids.run] });
});
after(async () => { await t.close(); });

test('tổng quan: đếm lớp theo thời gian, học viên đang học, chuyên cần loại buổi có phép khỏi mẫu số', async () => {
  const r = (await admin.get('/api/overview')).body;
  assert.equal(r.totals.classes, 3);
  assert.equal(r.totals.running, 1);
  assert.equal(r.totals.upcoming, 1);
  assert.equal(r.totals.students_active, 2);                 // chỉ lớp đang chạy
  // A: 1 có mặt / (2 − 1 có phép) = 1;  B: 1 có mặt / 2 = 0.5  → gộp: 2 có mặt / (4 − 1) = 0.67
  assert.equal(r.totals.attendance_rate, 0.67);
  assert.equal(r.featured.length, 1);
  assert.equal(r.featured[0].short_code, 'RUN');
  assert.equal(r.featured[0].sessions_held, 2);
  assert.equal(r.featured[0].sessions_total, 3);
  assert.equal(r.featured[0].attendance_rate, 0.67);
  assert.equal(r.upcoming[0].short_code, 'SOON');
});

test('tổng quan: giảng viên chỉ thấy số liệu của lớp được phân; chưa đăng nhập bị chặn', async () => {
  const r = (await gv.get('/api/overview')).body;
  assert.equal(r.totals.classes, 1);
  assert.equal(r.totals.upcoming, 0);
  assert.equal(r.upcoming.length, 0);
  assert.equal((await t.client().get('/api/overview')).status, 401);
});

test('danh sách lớp trả về timing để bộ lọc dùng', async () => {
  const list = (await admin.get('/api/classes')).body;
  const timing = Object.fromEntries(list.map((c) => [c.short_code, c.timing]));
  assert.deepEqual(timing, { RUN: 'running', SOON: 'upcoming', OLD: 'finished' });
});
