const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, admin, guest, classId, sessions, enrolls;
const base = () => `/api/classes/${classId}`;
const put = (body) => admin.put(`${base()}/attendance`, body);

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gid = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  classId = (await admin.post('/api/classes', { code: 'AT.01', session_count: 3, hw_count: 1 })).body.id;
  for (const [c, n] of [['S1', 'An'], ['S2', 'Bình'], ['S3', 'Chi'], ['S4', 'Dũng']])
    await admin.post(`${base()}/students`, { student_code: c, full_name: n });
  await admin.put(`/api/users/${gid}/classes`, { class_ids: [classId] });
  guest = await t.login('khach@x.com');
  sessions = (await admin.get(`${base()}/sessions`)).body;
  enrolls = (await admin.get(`${base()}/students`)).body; // theo họ tên: An, Bình, Chi, Dũng
});
after(async () => { await t.close(); });

test('đã bỏ trạng thái "đi trễ": chỉ có mặt / có phép / vắng', async () => {
  const r = await put({ enrollment_id: enrolls[3].id, session_id: sessions[2].id, status: 'late' });
  assert.equal(r.status, 400);
});

test('PUT điểm danh trả về % chuyên cần của học viên và hiện diện/sĩ số của buổi ngay lập tức', async () => {
  const [a, b, c] = enrolls;
  assert.equal((await put({ enrollment_id: a.id, session_id: sessions[0].id, status: 'present' })).status, 200);
  assert.equal((await put({ enrollment_id: b.id, session_id: sessions[0].id, status: 'present' })).status, 200);
  const r = await put({ enrollment_id: c.id, session_id: sessions[0].id, status: 'excused' });
  assert.equal(r.status, 200);
  // buổi 1: 4 sĩ số, 2 có mặt, 1 có phép, 1 vắng (Dũng chưa điểm danh)
  assert.deepEqual(r.body.session, { held: true, roster: 4, attended: 2, excused: 1, absent: 1 });
  // Chi: 1 buổi đã diễn ra, có phép -> 0,5/1
  assert.equal(r.body.enrollment.attendance_rate, 0.5);
  assert.equal(r.body.enrollment.excused, 1);
  // Số liệu trả về khớp với GET
  const m = (await admin.get(`${base()}/attendance`)).body;
  assert.deepEqual(m.sessions.find((s) => s.id === sessions[0].id).summary, r.body.session);
  const rowA = m.rows.find((x) => x.enrollment_id === a.id);
  assert.equal(rowA.attendance_rate, 1);
  assert.equal(rowA.attended, 1);
  // Buổi chưa diễn ra: không có hiện diện
  assert.equal(m.sessions[1].summary.held, false);
  assert.equal(m.sessions[1].summary.attended, 0);
});

test('"Bỏ tất cả" xóa điểm danh cả buổi, buổi quay về chưa diễn ra; khách bị chặn', async () => {
  const s = sessions[0];
  assert.equal((await guest.del(`${base()}/sessions/${s.id}/attendance`)).status, 403);
  const r = await admin.del(`${base()}/sessions/${s.id}/attendance`);
  assert.equal(r.status, 200);
  assert.equal(r.body.deleted, 3);
  const m = (await admin.get(`${base()}/attendance`)).body;
  assert.ok(!m.sessions.find((x) => x.id === s.id).held);
  assert.ok(m.rows.every((row) => row.cells[s.id] == null));
  assert.equal((await admin.del(`${base()}/sessions/99999/attendance`)).status, 404);
  // buổi của lớp khác không xóa được
  const other = (await admin.post('/api/classes', { code: 'AT.02', session_count: 1, hw_count: 0 })).body.id;
  const otherSession = (await admin.get(`/api/classes/${other}/sessions`)).body[0];
  assert.equal((await admin.del(`${base()}/sessions/${otherSession.id}/attendance`)).status, 404);
});
