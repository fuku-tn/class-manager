// Xét tốt nghiệp TỰ ĐỘNG (BIE-8, BIE-12, BIH-20, BIH-11 — chủ dự án chốt 18/10/2026):
// đủ số buổi tối thiểu + làm đủ mọi bài đã giao (HW, Mini Project, Capstone); kết quả đổi theo tick/điểm danh; công bố thì chốt.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const grad = require('../src/services/graduation');

let t, admin, gv, classId, enr, sessions, asg;
const base = () => `/api/classes/${classId}`;
const byCode = async () => Object.fromEntries((await admin.get(`${base()}/graduation`)).body.rows.map((r) => [r.student_code, r]));

test('bảng số buổi tự động: BIE-8 6, BIE-12 9, BIH-20 16, BIH-11 9, EBA-6 5 (HW1–HW4); giáo trình khác không xét tự động', () => {
  assert.deepEqual(['BIE-8', 'BIE-12', 'BIH-20', 'BIH-11', 'EBA-6'].map((code) => grad.autoRulesFor({ code }).min_sessions), [6, 9, 16, 9, 5]);
  assert.deepEqual(['BIE-8', 'BIH-20', 'EBA-6'].map((code) => grad.autoRulesFor({ code }).hw_max), [5, 5, 4]);
  assert.equal(grad.autoRulesFor({ code: 'PBM-10' }), null);
  assert.equal(grad.autoRulesFor(null), null);
  assert.deepEqual([{ kind: 'hw', seq: 5 }, { kind: 'mini', seq: 1 }, { kind: 'capstone', seq: 1 }].map((a) => grad.assignmentName(a, 'BIH')), ['MP3', 'MP1', 'Capstone']);
  assert.equal(grad.assignmentName({ kind: 'hw', seq: 5 }, 'BIE'), 'HW5');
});

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  await t.db.run("insert into curricula (code, program, name, session_count) values ('BIH-11','BIH','BIH 11 buổi',11)");
  const cur = (await t.db.one("select id from curricula where code = 'BIH-11'")).id;
  classId = (await admin.post('/api/classes', { code: 'P2.BIH.P950.HY.EE.010126', session_count: 10, hw_count: 5 })).body.id;
  await t.db.run("update classes set curriculum_id = $1, short_code = 'BIH950', program = 'BIH', start_date = '2026-01-01', end_date = '2026-02-01' where id = $2", [cur, classId]);
  await admin.put(`/api/users/${gvId}/classes`, { class_ids: [classId] });
  for (const [c, n] of [['A1', 'An'], ['B1', 'Bình'], ['C1', 'Chi']]) await admin.post(`${base()}/students`, { student_code: c, full_name: n });
  enr = Object.fromEntries((await admin.get(`${base()}/students`)).body.map((s) => [s.student_code, s.id]));
  sessions = (await admin.get(`${base()}/sessions`)).body;
  const att = (e, s, status) => admin.put(`${base()}/attendance`, { enrollment_id: enr[e], session_id: s.id, status });
  for (const [i, s] of sessions.entries()) {
    await att('A1', s, 'present'); await att('B1', s, i === 9 ? 'excused' : 'present');   // vắng có phép không bị trừ
    await att('C1', s, i < 8 ? 'present' : 'absent');                                     // C1: 8/9 buổi
  }
  asg = Object.fromEntries((await admin.get(`${base()}/assignments`)).body.map((a) => [`${a.kind}${a.seq}`, a]));
  for (const e of ['A1', 'B1', 'C1']) for (const k of ['hw1', 'hw2', 'hw3', 'hw4', 'hw5', 'capstone1']) {
    await admin.put(`${base()}/submissions`, { enrollment_id: enr[e], assignment_id: asg[k].id, status: 'submitted' });
  }
  // Mini Project 1: chỉ có điểm (không tick) — A1, C1 có điểm; B1 chưa
  asg.mini1 = await t.db.one("insert into assignments (class_id, kind, seq, title) values ($1, 'mini', 1, 'Mini Project 1') returning id", [classId]);
  for (const e of ['A1', 'C1']) await t.db.run('insert into homework_scores (enrollment_id, assignment_id, score) values ($1, $2, 8)', [enr[e], asg.mini1.id]);
});
after(async () => { await t.close(); });

test('kết quả tự động: đủ buổi + đủ mọi bài (HW, MP có điểm, Capstone) mới tốt nghiệp; lý do rõ ràng', async () => {
  const r = await admin.get(`${base()}/graduation`);
  assert.equal(r.status, 200);
  assert.equal(r.body.rules.auto, true);
  assert.equal(r.body.rules.min_sessions, 9);
  const by = Object.fromEntries(r.body.rows.map((x) => [x.student_code, x]));
  assert.deepEqual([by.A1.result, by.A1.hw_done, by.A1.hw_pool], ['passed', 7, 7]);   // HW1–4, MP1, MP3 (=HW5), Capstone
  assert.equal(by.B1.result, 'failed');
  assert.deepEqual(by.B1.missing, ['MP1']);
  assert.equal(by.B1.sessions_present, 10);                                            // 9 có mặt + 1 có phép
  assert.equal(by.C1.result, 'failed');
  assert.deepEqual(by.C1.auto.reasons, ['Có mặt 8/9 buổi']);
  assert.deepEqual([r.body.summary.passed, r.body.summary.failed], [1, 2]);
});

test('không đặt kết quả tay, không "áp dụng gợi ý"; ghi chú / chứng chỉ vẫn sửa được', async () => {
  assert.equal((await gv.put(`${base()}/graduation/${enr.A1}`, { status: 'failed' })).status, 409);
  assert.equal((await gv.post(`${base()}/graduation-apply`)).status, 409);
  assert.equal((await gv.put(`${base()}/graduation/${enr.A1}`, { note: 'Đã nhận', certificate_number: 'CC-01' })).status, 200);
  assert.equal((await byCode()).A1.decision.note, 'Đã nhận');
});

test('đổi tick / điểm danh thì kết quả tự đổi theo', async () => {
  await t.db.run('insert into homework_scores (enrollment_id, assignment_id, score) values ($1, $2, 7)', [enr.B1, asg.mini1.id]);
  await admin.put(`${base()}/attendance`, { enrollment_id: enr.C1, session_id: sessions[8].id, status: 'present' });
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.A1, assignment_id: asg.hw2.id, status: null });
  const by = await byCode();
  assert.deepEqual([by.A1.result, by.B1.result, by.C1.result], ['failed', 'passed', 'passed']);
  assert.deepEqual(by.A1.missing, ['HW2']);
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.A1, assignment_id: asg.hw2.id, status: 'submitted' });
});

test('lớp còn đang học (hoặc đang nộp & chấm bài): chưa đủ thì là "Đang học", chưa kết luận chưa đạt', async () => {
  await t.db.run("update classes set end_date = (now() + interval '30 days')::date where id = $1", [classId]);
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.B1, assignment_id: asg.capstone1.id, status: null });
  const by = await byCode();
  assert.deepEqual([by.A1.result, by.B1.result], ['passed', 'in_progress']);
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.B1, assignment_id: asg.capstone1.id, status: 'submitted' });
  // trong 14 ngày nộp & chấm bài sau buổi cuối: vẫn "Đang học"
  await t.db.run("update classes set end_date = (now() - interval '3 days')::date where id = $1", [classId]);
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.B1, assignment_id: asg.capstone1.id, status: null });
  assert.equal((await byCode()).B1.result, 'in_progress');
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.B1, assignment_id: asg.capstone1.id, status: 'submitted' });
  await t.db.run("update classes set end_date = '2026-02-01' where id = $1", [classId]);
});

test('công bố: chốt kết quả vào enrollments + ghi lịch sử; sau đó tick đổi không làm đổi kết quả; hủy công bố thì tự động lại', async () => {
  await admin.put(`${base()}/attendance`, { enrollment_id: enr.C1, session_id: sessions[8].id, status: 'absent' });   // C1 lại 8/9
  assert.equal((await gv.post(`${base()}/graduation-publish`)).status, 403);
  assert.equal((await admin.post(`${base()}/graduation-publish`)).status, 200);
  const st = Object.fromEntries((await t.db.all('select id, graduation_status from enrollments where class_id = $1', [classId])).map((x) => [x.id, x.graduation_status]));
  assert.deepEqual([st[enr.A1], st[enr.B1], st[enr.C1]], ['passed', 'passed', 'failed']);
  const ev = await t.db.all("select to_status, note from enrollment_events where class_id = $1 and event = 'graduation' order by id", [classId]);
  assert.equal(ev.length, 3);
  assert.match(ev.find((x) => x.to_status === 'failed').note, /Có mặt 8\/9 buổi/);
  await admin.put(`${base()}/attendance`, { enrollment_id: enr.C1, session_id: sessions[8].id, status: 'present' });
  assert.equal((await byCode()).C1.result, 'failed');                                   // đã chốt
  await admin.del(`${base()}/graduation-publish`);
  assert.equal((await byCode()).C1.result, 'passed');                                   // hủy công bố → tự động lại
});

test('có điểm thì phải ≥ 6 mới tính là làm bài; HW6 trở đi không xét; lớp không có bài Capstone thì không bắt buộc', async () => {
  await t.db.run('update homework_scores set score = 5.5 where enrollment_id = $1 and assignment_id = $2', [enr.A1, asg.mini1.id]);
  await t.db.run('insert into homework_scores (enrollment_id, assignment_id, score) values ($1, $2, 6)', [enr.B1, asg.hw2.id]);   // đúng 6 → đạt
  const hw6 = await t.db.one("insert into assignments (class_id, kind, seq, title, collected) values ($1, 'hw', 6, 'HW 6', true) returning id", [classId]);
  let by = await byCode();
  assert.equal(by.A1.result, 'failed');
  assert.deepEqual(by.A1.low, ['MP1 (5.5)']);
  assert.match(by.A1.auto.reasons.join(' '), /Dưới 6 điểm: MP1 \(5\.5\)/);
  assert.deepEqual([by.B1.result, by.B1.hw_pool], ['passed', 7]);                       // HW6 không nằm trong danh sách xét
  // điểm thấp nhưng có tick "Đã nộp": vẫn chưa đạt (điểm quyết định khi đã có điểm)
  await t.db.run('update homework_scores set score = 4 where enrollment_id = $1 and assignment_id = $2', [enr.B1, asg.hw2.id]);
  assert.equal((await byCode()).B1.result, 'failed');
  await t.db.run('delete from homework_scores where enrollment_id = $1 and assignment_id = $2', [enr.B1, asg.hw2.id]);
  await t.db.run('update homework_scores set score = 8 where enrollment_id = $1 and assignment_id = $2', [enr.A1, asg.mini1.id]);
  // lớp không có Project: bỏ bài Capstone thì không còn bắt buộc
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.A1, assignment_id: asg.capstone1.id, status: null });
  assert.deepEqual((await byCode()).A1.missing, ['Capstone']);
  await t.db.run('delete from assignments where id = $1', [asg.capstone1.id]);
  by = await byCode();
  assert.deepEqual([by.A1.result, by.A1.hw_pool], ['passed', 6]);
  await t.db.run('delete from assignments where id = $1', [hw6.id]);
});

test('EBA: luôn bắt buộc đủ HW1–HW4 + Capstone (EBA-8: HW1–HW3), kể cả bài chưa có tick nào', () => {
  const rules = grad.autoRulesFor({ code: 'EBA-6', program: 'EBA' });
  assert.deepEqual([rules.min_sessions, rules.fixed_hw], [5, 4]);
  assert.deepEqual([grad.autoRulesFor({ code: 'EBA-8', program: 'EBA' }).min_sessions, grad.autoRulesFor({ code: 'EBA-8', program: 'EBA' }).fixed_hw], [6, 3]);
  const data = {
    assignments: [{ id: 1, kind: 'hw', seq: 1, collected: true }, { id: 2, kind: 'hw', seq: 2, collected: false }, { id: 9, kind: 'capstone', seq: 1, collected: true }],
    submissions: [{ enrollment_id: 10, assignment_id: 1, status: 'submitted' }, { enrollment_id: 10, assignment_id: 9, status: 'submitted' }],
    enrollments: [{ id: 10, student_code: 'E1', course_status: 'active' }],
  };
  const stats = new Map([[10, { attended: 6, excused: 0, held: 6, sessions_total: 6, attendance_rate: 1 }]]);
  const [r] = grad.buildAutoRows(data, stats, rules, { program: 'EBA' }).map((x) => ({ ...x, result: x.auto.result }));
  assert.equal(r.result, 'failed');
  assert.deepEqual([r.hw_pool, r.missing], [5, ['HW2', 'HW3', 'HW4']]);   // HW2 chưa giao, HW3–4 chưa có trên web: vẫn bắt buộc
});
