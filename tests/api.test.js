const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, admin, classId, sessions, students;

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  await t.addUser('gv@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  const c = await admin.post('/api/classes', { code: 'TEST.01', session_count: 4, hw_count: 2 });
  classId = c.body.id;
  sessions = (await admin.get(`/api/classes/${classId}/sessions`)).body;
  for (const [code, name] of [['S1', 'An'], ['S2', 'Bình'], ['S3', 'Chi']])
    await admin.post(`/api/classes/${classId}/students`, { student_code: code, full_name: name, mode: 'Online' });
  students = (await admin.get(`/api/classes/${classId}/students`)).body;
});
after(async () => { await t.close(); });

test('chưa đăng nhập bị chặn', async () => {
  const anon = t.client();
  assert.equal((await anon.get('/api/classes')).status, 401);
  assert.equal((await anon.get(`/api/classes/${classId}/dashboard`)).status, 401);
});

test('đăng nhập sai bị từ chối, đúng thì cấp phiên', async () => {
  const c = t.client();
  assert.equal((await c.post('/api/auth/login', { email: 'admin@x.com', password: 'sai' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'admin@x.com', password: 'password123' })).status, 200);
  assert.equal((await c.get('/api/auth/me')).body.role, 'admin');
});

test('giảng viên chỉ thấy lớp được phân công', async () => {
  const gv = await t.login('gv@x.com');
  assert.deepEqual((await gv.get('/api/classes')).body, []);
  assert.equal((await gv.get(`/api/classes/${classId}/students`)).status, 403);
  const gvId = (await t.db.one("select id from users where email = 'gv@x.com'")).id;
  assert.equal((await admin.put(`/api/users/${gvId}/classes`, { class_ids: [classId] })).status, 200);
  assert.equal((await gv.get(`/api/classes/${classId}/students`)).status, 200);
  assert.equal((await gv.post('/api/classes', { code: 'X' })).status, 403); // không phải admin
  assert.equal((await gv.get('/api/users')).status, 403);
});

test('điểm danh: tính tỉ lệ, có phép không tính vào mẫu số', async () => {
  const [a, b] = students;
  const put = (e, s, status) => admin.put(`/api/classes/${classId}/attendance`, { enrollment_id: e.id, session_id: s.id, status });
  assert.equal((await put(a, sessions[0], 'present')).status, 200);
  assert.equal((await put(a, sessions[1], 'late')).status, 200);
  assert.equal((await put(a, sessions[2], 'absent')).status, 200);
  assert.equal((await put(b, sessions[0], 'present')).status, 200);
  assert.equal((await put(b, sessions[1], 'excused')).status, 200);
  const m = (await admin.get(`/api/classes/${classId}/attendance`)).body;
  const rate = (id) => m.rows.find((r) => r.enrollment_id === id).attendance_rate;
  // 3 buổi đã diễn ra. A: (1+1)/3; B: present 1, excused 1, buổi 3 vắng -> 1/(3-1)
  assert.equal(rate(a.id), 0.67);
  assert.equal(rate(b.id), 0.5);
  assert.equal(m.sessions.filter((s) => s.held).length, 3);
});

test('điểm danh: dữ liệu sai bị từ chối', async () => {
  const e = students[0];
  assert.equal((await admin.put(`/api/classes/${classId}/attendance`, { enrollment_id: e.id, session_id: sessions[0].id, status: 'bay' })).status, 400);
  assert.equal((await admin.put(`/api/classes/${classId}/attendance`, { enrollment_id: e.id, session_id: 99999, status: 'present' })).status, 404);
  assert.equal((await admin.put(`/api/classes/${classId}/attendance`, { enrollment_id: 99999, session_id: sessions[0].id, status: 'present' })).status, 404);
});

test('không thể ghi điểm danh chéo lớp', async () => {
  const other = (await admin.post('/api/classes', { code: 'TEST.02' })).body;
  const r = await admin.put(`/api/classes/${other.id}/attendance`, { enrollment_id: students[0].id, session_id: sessions[0].id, status: 'present' });
  assert.equal(r.status, 404);
});

test('điểm danh cả lớp chỉ điền chỗ trống và không ghi đè', async () => {
  const r = await admin.post(`/api/classes/${classId}/sessions/${sessions[3].id}/attendance/bulk`, { status: 'present' });
  assert.equal(r.body.created, 3);
  await admin.put(`/api/classes/${classId}/attendance`, { enrollment_id: students[0].id, session_id: sessions[3].id, status: 'absent' });
  const again = await admin.post(`/api/classes/${classId}/sessions/${sessions[3].id}/attendance/bulk`, { status: 'present' });
  assert.equal(again.body.created, 0);
  const m = (await admin.get(`/api/classes/${classId}/attendance`)).body;
  assert.equal(m.rows.find((x) => x.enrollment_id === students[0].id).cells[sessions[3].id].status, 'absent');
});

test('bài tập: nộp lại không tính hoàn thành; bài chưa thu không tính', async () => {
  const assignments = (await admin.get(`/api/classes/${classId}/assignments`)).body;
  const hw1 = assignments.find((a) => a.kind === 'hw' && a.seq === 1);
  const [a, b] = students;
  const put = (e, status) => admin.put(`/api/classes/${classId}/submissions`, { enrollment_id: e.id, assignment_id: hw1.id, status, challenge: true });
  assert.equal((await put(a, 'submitted')).status, 200);
  assert.equal((await put(b, 'resubmit')).status, 200);
  assert.equal((await admin.put(`/api/classes/${classId}/submissions`, { enrollment_id: a.id, assignment_id: hw1.id, status: 'xyz' })).status, 400);
  const list = (await admin.get(`/api/classes/${classId}/students`)).body;
  const byId = Object.fromEntries(list.map((s) => [s.id, s]));
  assert.equal(byId[a.id].hw_rate, 1); // chỉ HW1 được thu (HW2 chưa có bản ghi)
  assert.equal(byId[b.id].hw_rate, 0);
  assert.equal(byId[students[2].id].hw_missing, 1);
});

test('dashboard tổng hợp đúng', async () => {
  const d = (await admin.get(`/api/classes/${classId}/dashboard`)).body;
  assert.equal(d.totals.enrolled, 3);
  assert.equal(d.totals.held_sessions, 4);
  assert.equal(d.by_session.length, 4);
  assert.equal(d.by_assignment.find((x) => x.seq === 1 && x.kind === 'hw').submitted, 1);
  assert.equal(d.by_assignment.find((x) => x.seq === 2 && x.kind === 'hw').rate, null);
  assert.deepEqual(d.by_mode, [{ mode: 'Online', count: 3 }]);
});

test('thêm học viên trùng trong lớp bị chặn; sửa & bảo lưu', async () => {
  const dup = await admin.post(`/api/classes/${classId}/students`, { student_code: 'S1', full_name: 'An' });
  assert.equal(dup.status, 409);
  const e = students[2];
  const r = await admin.put(`/api/classes/${classId}/students/${e.id}`, { course_status: 'deferred' });
  assert.equal(r.status, 200);
  const row = (await admin.get(`/api/classes/${classId}/students`)).body.find((s) => s.id === e.id);
  assert.equal(row.course_status, 'deferred');
  assert.equal('voucher_amount' in row, false); // không còn dữ liệu voucher/tiền
  assert.equal((await admin.put(`/api/classes/${classId}/students/${e.id}`, { course_status: 'lạ' })).status, 400);
});

test('XSS: tên chứa HTML được lưu nguyên văn dưới dạng text', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const r = await admin.post(`/api/classes/${classId}/students`, { student_code: 'XSS1', full_name: name });
  assert.equal(r.status, 201);
  const row = (await admin.get(`/api/classes/${classId}/students`)).body.find((s) => s.student_code === 'XSS1');
  assert.equal(row.full_name, name); // phía frontend dựng bằng textContent nên không thực thi
});

test('danh sách học viên theo họ tên tiếng Việt: Đ ngay sau D (điểm danh)', async () => {
  const c = await admin.post('/api/classes', { code: 'VI.SORT.01', session_count: 1, hw_count: 0 });
  for (const [code, name] of [['VS5', 'Võ Thị Hạnh'], ['VS1', 'Đặng Lạc Diệp'], ['VS2', 'Dương Văn Bình'], ['VS3', 'Châu Bích Hoa'], ['VS4', 'Hồ Quốc Tuấn']]) {
    await admin.post(`/api/classes/${c.body.id}/students`, { student_code: code, full_name: name });
  }
  const r = await admin.get(`/api/classes/${c.body.id}/attendance`);
  assert.deepEqual(r.body.rows.map((x) => x.full_name), ['Châu Bích Hoa', 'Dương Văn Bình', 'Đặng Lạc Diệp', 'Hồ Quốc Tuấn', 'Võ Thị Hạnh']);
});
