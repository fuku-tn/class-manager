const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, admin, ly, plain, upcomingId, runningId;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const lyId = await t.addUser('ly@x.com', 'instructor');
  await t.addUser('thuong@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  upcomingId = (await admin.post('/api/classes', { code: 'UP.01', session_count: 3, hw_count: 1, start_date: day(30) })).body.id;
  runningId = (await admin.post('/api/classes', { code: 'RUN.01', session_count: 3, hw_count: 1, start_date: day(-3) })).body.id;
  ly = await t.login('ly@x.com');
  plain = await t.login('thuong@x.com');
  assert.equal((await admin.put(`/api/users/${lyId}/view-upcoming`, { can_view_upcoming: true })).status, 200);
  ly = await t.login('ly@x.com');   // đăng nhập lại cho chắc
});
after(async () => { await t.close(); });

test('có quyền xem lớp chưa diễn ra: thấy lớp chưa diễn ra (không thấy lớp đang học), đánh dấu view_only', async () => {
  const list = (await ly.get('/api/classes')).body;
  assert.deepEqual(list.map((c) => c.code), ['UP.01']);
  assert.equal(list[0].view_only, true);
  assert.equal((await plain.get('/api/classes')).body.length, 0);          // không có quyền → không thấy
  assert.equal((await ly.get(`/api/classes/${upcomingId}/students`)).status, 200);
  assert.equal((await ly.get(`/api/classes/${runningId}/students`)).status, 403);   // lớp đang học: chưa phân công thì không xem
  assert.equal((await plain.get(`/api/classes/${upcomingId}/students`)).status, 403);
});

test('chỉ xem: không ghi được vào lớp chưa diễn ra; trang chủ tổng quan có lớp chưa diễn ra', async () => {
  const w = await ly.post(`/api/classes/${upcomingId}/students`, { student_code: 'X1', full_name: 'Không được' });
  assert.equal(w.status, 403);
  assert.match(w.body.error, /chỉ được xem/);
  assert.equal((await ly.put(`/api/classes/${upcomingId}/attendance`, { enrollment_id: 1, session_id: 1, status: 'present' })).status, 403);
  const ov = await ly.get('/api/overview');
  assert.equal(ov.status, 200);
  assert.ok(JSON.stringify(ov.body).includes('UP.01'));
  assert.ok(!JSON.stringify((await plain.get('/api/overview')).body).includes('UP.01'));
});

test('lớp được phân công thì ghi bình thường kể cả khi chưa diễn ra; khi lớp bắt đầu, quyền xem tự hết', async () => {
  const lyId = (await t.db.one("select id from users where email = 'ly@x.com'")).id;
  await admin.put(`/api/users/${lyId}/classes`, { class_ids: [upcomingId] });
  const list = (await ly.get('/api/classes')).body;
  assert.equal(list[0].view_only, false);
  assert.equal((await ly.post(`/api/classes/${upcomingId}/students`, { student_code: 'Y1', full_name: 'Được ghi' })).status, 201);
  await admin.put(`/api/users/${lyId}/classes`, { class_ids: [] });
  await t.db.run("update classes set start_date = $1 where id = $2", [day(-1), upcomingId]);    // lớp bắt đầu
  assert.equal((await ly.get(`/api/classes/${upcomingId}/students`)).status, 403);
});

test('chỉ admin bật/tắt quyền', async () => {
  const id = (await t.db.one("select id from users where email = 'thuong@x.com'")).id;
  assert.equal((await plain.put(`/api/users/${id}/view-upcoming`, { can_view_upcoming: true })).status, 403);
});
