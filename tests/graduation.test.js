const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const grad = require('../src/services/graduation');

let t, admin, gv, guest, classId, sessions, hw, capstone, enr;
const base = () => `/api/classes/${classId}`;

test('đánh giá điều kiện: chuyên cần, số HW trong nhóm xét, Capstone; thiếu dữ liệu chuyên cần thì chưa gợi ý', () => {
  const rules = { attendance_min: 0.8, hw_pool: 2, hw_min: 2, capstone: true };
  const ok = grad.evaluateGraduation(rules, { attendanceRate: 0.9, hwStatuses: ['submitted', 'submitted', 'missing'], capstoneStatus: 'submitted' });
  assert.equal(ok.eligible, true);
  const lowAtt = grad.evaluateGraduation(rules, { attendanceRate: 0.75, hwStatuses: ['submitted', 'submitted'], capstoneStatus: 'submitted' });
  assert.deepEqual([lowAtt.eligible, lowAtt.reasons], [false, ['Chuyên cần 75% < 80%']]);
  const edge = grad.evaluateGraduation(rules, { attendanceRate: 0.8, hwStatuses: ['submitted', 'resubmit'], capstoneStatus: null });
  assert.equal(edge.eligible, false);                                   // "nộp lại" chưa tính hoàn thành; chưa nộp Capstone
  assert.deepEqual(edge.reasons, ['HW 1/2', 'Chưa nộp Capstone']);
  // HW thứ 3 nằm ngoài nhóm xét (pool = 2) nên không ảnh hưởng
  assert.equal(grad.evaluateGraduation({ ...rules, capstone: false }, { attendanceRate: 0.8, hwStatuses: ['submitted', 'submitted', 'missing'], capstoneStatus: null }).eligible, true);
  assert.equal(grad.evaluateGraduation(rules, { attendanceRate: null, hwStatuses: [], capstoneStatus: null }).eligible, null);
  // không yêu cầu HW/Capstone
  assert.equal(grad.evaluateGraduation({ attendance_min: 1, hw_pool: null, hw_min: null, capstone: false }, { attendanceRate: 1, hwStatuses: [], capstoneStatus: null }).eligible, true);
});

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  guest = await t.login('khach@x.com');
  await t.db.run("insert into curricula (code, program, name, session_count, grad_attendance_min, grad_hw_pool, grad_hw_min, grad_capstone) values ('BIE-8','BIE','BIE 8 buổi',3, 0.80, 2, 2, true)");
  const cur = (await t.db.one("select id from curricula where code = 'BIE-8'")).id;
  classId = (await admin.post('/api/classes', { code: 'GR.01', session_count: 3, hw_count: 3 })).body.id;
  await t.db.run('update classes set curriculum_id = $1 where id = $2', [cur, classId]);
  for (const id of [gvId, gId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [classId] });
  for (const [c, n] of [['G1', 'An'], ['G2', 'Bình'], ['G3', 'Chi']]) await admin.post(`${base()}/students`, { student_code: c, full_name: n });
  enr = Object.fromEntries((await admin.get(`${base()}/students`)).body.map((s) => [s.student_code, s.id]));
  sessions = (await admin.get(`${base()}/sessions`)).body;
  const assignments = (await admin.get(`${base()}/assignments`)).body;
  hw = assignments.filter((a) => a.kind === 'hw').sort((a, b) => a.seq - b.seq);
  capstone = assignments.find((a) => a.kind === 'capstone');
  // 3 buổi đã diễn ra: G1 đi đủ, G2 đi 1/3, G3 đi đủ
  const att = (e, s, status) => admin.put(`${base()}/attendance`, { enrollment_id: enr[e], session_id: s.id, status });
  for (const s of sessions) { await att('G1', s, 'present'); await att('G3', s, 'present'); }
  await att('G2', sessions[0], 'present'); await att('G2', sessions[1], 'absent'); await att('G2', sessions[2], 'absent');
  const sub = (e, a, status) => admin.put(`${base()}/submissions`, { enrollment_id: enr[e], assignment_id: a.id, status });
  await sub('G1', hw[0], 'submitted'); await sub('G1', hw[1], 'submitted'); await sub('G1', capstone, 'submitted');
  await sub('G3', hw[0], 'submitted'); await sub('G3', capstone, 'submitted');            // G3 thiếu HW2
  await sub('G2', hw[0], 'submitted'); await sub('G2', hw[1], 'submitted'); await sub('G2', capstone, 'submitted');
});
after(async () => { await t.close(); });

test('GET tốt nghiệp: gợi ý theo quy tắc giáo trình, tổng hợp, mọi vai trò xem được', async () => {
  const r = await admin.get(`${base()}/graduation`);
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.rules.attendance_min, r.body.rules.hw_pool, r.body.rules.hw_min, r.body.rules.capstone], [0.8, 2, 2, true]);
  const by = Object.fromEntries(r.body.rows.map((x) => [x.student_code, x]));
  assert.equal(by.G1.suggestion.eligible, true);
  assert.equal(by.G2.suggestion.eligible, false);
  assert.match(by.G2.suggestion.reasons[0], /Chuyên cần 33% < 80%/);
  assert.equal(by.G3.suggestion.eligible, false);
  assert.deepEqual(by.G3.suggestion.reasons, ['HW 1/2']);
  assert.deepEqual([r.body.summary.pending, r.body.summary.suggested_pass, r.body.summary.suggested_fail], [3, 1, 2]);
  assert.equal((await gv.get(`${base()}/graduation`)).status, 200);
  assert.equal((await guest.get(`${base()}/graduation`)).status, 200);
});

test('quyết định: giảng viên đặt được, khách thì không; ghi nhật ký; áp dụng gợi ý chỉ cho người chưa xét', async () => {
  assert.equal((await guest.put(`${base()}/graduation/${enr.G1}`, { status: 'passed' })).status, 403);
  assert.equal((await gv.put(`${base()}/graduation/${enr.G3}`, { status: 'passed', note: 'Đặc cách', certificate_status: 'Printed', certificate_number: 'CN-001' })).status, 200);
  assert.equal((await gv.put(`${base()}/graduation/${enr.G3}`, { status: 'sai' })).status, 400);
  const applied = await gv.post(`${base()}/graduation-apply`);
  assert.equal(applied.body.applied, 2);                                   // G1, G2 (G3 đã có quyết định)
  const by = Object.fromEntries((await admin.get(`${base()}/graduation`)).body.rows.map((x) => [x.student_code, x]));
  assert.deepEqual([by.G1.decision.status, by.G2.decision.status, by.G3.decision.status], ['passed', 'failed', 'passed']);
  assert.equal(by.G3.decision.note, 'Đặc cách');
  assert.equal(by.G3.certificate.number, 'CN-001');
  assert.equal(by.G3.decision.by, 'gv');
  const ev = await t.db.all("select student_code, from_status, to_status, actor_name from enrollment_events where event = 'graduation' order by id");
  assert.equal(ev.length, 3);
  assert.deepEqual(ev[0], { student_code: 'G3', from_status: 'pending', to_status: 'passed', actor_name: 'gv' });
});

test('công bố: chỉ admin; sau khi công bố giảng viên bị khóa, admin vẫn sửa được; hủy công bố', async () => {
  assert.equal((await gv.post(`${base()}/graduation-publish`)).status, 403);
  assert.equal((await admin.post(`${base()}/graduation-publish`)).status, 200);
  const g = (await gv.get(`${base()}/graduation`)).body;
  assert.ok(g.class.published_at);
  assert.equal((await gv.put(`${base()}/graduation/${enr.G2}`, { status: 'passed' })).status, 403);
  assert.equal((await gv.post(`${base()}/graduation-apply`)).status, 403);
  assert.equal((await admin.put(`${base()}/graduation/${enr.G2}`, { status: 'passed', note: 'Học bù' })).status, 200);
  assert.equal((await gv.del(`${base()}/graduation-publish`)).status, 403);
  assert.equal((await admin.del(`${base()}/graduation-publish`)).status, 200);
  assert.equal((await gv.put(`${base()}/graduation/${enr.G2}`, { status: 'failed' })).status, 200);
});

test('sửa quy tắc: chỉ admin, kiểm tra hợp lệ, ảnh hưởng gợi ý', async () => {
  const rules = { attendance_min: 0.3, hw_pool: 2, hw_min: 1, capstone: false };
  assert.equal((await gv.put(`${base()}/graduation-rules`, rules)).status, 403);
  assert.equal((await admin.put(`${base()}/graduation-rules`, { ...rules, attendance_min: 1.5 })).status, 400);
  assert.equal((await admin.put(`${base()}/graduation-rules`, { ...rules, hw_pool: 1, hw_min: 2 })).status, 400);
  assert.equal((await admin.put(`${base()}/graduation-rules`, rules)).status, 200);
  const by = Object.fromEntries((await admin.get(`${base()}/graduation`)).body.rows.map((x) => [x.student_code, x]));
  assert.equal(by.G2.suggestion.eligible, true);         // 33% ≥ 30%, HW 2/2 ≥ 1, không bắt buộc Capstone
  assert.equal(by.G3.suggestion.eligible, true);
});

test('lớp chưa gắn giáo trình dùng quy tắc mặc định và không sửa quy tắc được', async () => {
  const other = (await admin.post('/api/classes', { code: 'GR.02', session_count: 2, hw_count: 0 })).body.id;
  const r = (await admin.get(`/api/classes/${other}/graduation`)).body;
  assert.equal(r.rules.source, 'default');
  assert.equal(r.rules.attendance_min, 0.8);
  assert.equal((await admin.put(`/api/classes/${other}/graduation-rules`, { attendance_min: 0.9, capstone: false })).status, 409);
});
