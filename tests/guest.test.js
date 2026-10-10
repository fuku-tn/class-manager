const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');

let t, admin, guest, classId, sessions, students;

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const guestId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  classId = (await admin.post('/api/classes', { code: 'G.01', session_count: 3, hw_count: 2 })).body.id;
  sessions = (await admin.get(`/api/classes/${classId}/sessions`)).body;
  await admin.post(`/api/classes/${classId}/students`, { student_code: 'S1', full_name: 'An' });
  students = (await admin.get(`/api/classes/${classId}/students`)).body;
  await admin.put(`/api/users/${guestId}/classes`, { class_ids: [classId] });
  guest = await t.login('khach@x.com');
});
after(async () => { await t.close(); });

test('khách xem được lớp được phân công (điểm danh, bài tập, dashboard)', async () => {
  assert.equal((await guest.get('/api/auth/me')).body.role, 'guest');
  assert.equal((await guest.get('/api/classes')).body.length, 1);
  for (const p of ['students', 'attendance', 'submissions', 'dashboard', 'sessions'])
    assert.equal((await guest.get(`/api/classes/${classId}/${p}`)).status, 200, p);
});

test('khách không ghi được: điểm danh, bài tập, học viên, buổi học, lớp, mật khẩu', async () => {
  const e = students[0];
  const base = `/api/classes/${classId}`;
  const att = await guest.put(`${base}/attendance`, { enrollment_id: e.id, session_id: sessions[0].id, status: 'present' });
  assert.equal(att.status, 403);
  assert.match(att.body.error, /chỉ được xem/);
  assert.equal((await guest.post(`${base}/sessions/${sessions[0].id}/attendance/bulk`, { status: 'present' })).status, 403);
  assert.equal((await guest.put(`${base}/submissions`, { enrollment_id: e.id, assignment_id: 1, status: 'submitted' })).status, 403);
  assert.equal((await guest.post(`${base}/students`, { student_code: 'S9', full_name: 'Lạ' })).status, 403);
  assert.equal((await guest.put(`${base}/students/${e.id}`, { full_name: 'Đổi tên' })).status, 403);
  assert.equal((await guest.del(`${base}/students/${e.id}`)).status, 403);
  assert.equal((await guest.put(`/api/classes/${classId}/sessions/${sessions[0].id}`, { title: 'x' })).status, 403);
  assert.equal((await guest.post('/api/classes', { code: 'Z' })).status, 403);
  assert.equal((await guest.post('/api/auth/password', { current: 'password123', next: 'matkhaumoi123' })).status, 403);
  assert.equal((await guest.get('/api/users')).status, 403);
  // dữ liệu không đổi
  const m = (await admin.get(`${base}/attendance`)).body;
  assert.equal(m.rows[0].cells[sessions[0].id] ?? null, null);
  assert.equal((await admin.get(`${base}/students`)).body[0].full_name, 'An');
});

test('khách đăng xuất được; không phân lớp thì không thấy lớp nào', async () => {
  assert.equal((await guest.post('/api/auth/logout')).status, 200);
  assert.equal((await guest.get('/api/classes')).status, 401);
  await t.addUser('khach2@x.com', 'guest');
  const g2 = await t.login('khach2@x.com');
  assert.deepEqual((await g2.get('/api/classes')).body, []);
  assert.equal((await g2.get(`/api/classes/${classId}/students`)).status, 403);
});

test('admin tạo được người dùng vai trò khách; schema hai file đều có vai trò guest', async () => {
  const r = await admin.post('/api/users', { email: 'moi@x.com', name: 'Khách mới', password: 'password123', role: 'guest' });
  assert.equal(r.status, 201);
  assert.equal(r.body.role, 'guest');
  for (const f of ['src/schema.sql', 'supabase/schema.sql'])
    assert.match(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /role in \('admin','instructor','guest'\)/, f);
});
