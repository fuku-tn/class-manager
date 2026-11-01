// GPA, xếp loại, Top Performance (gpa.js) — số liệu đối chiếu với thư mục transcripts/ (BIH98: 3.285; EBA117: trọng số 25/25/25/10/15).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const gpa = require('../src/services/gpa');
const { startTestApp } = require('./helpers');

test('thang điểm chữ và xếp loại theo GradeScale / ClassificationScale', () => {
  const g = (s) => gpa.gradeOf(s);
  assert.deepEqual([9.7, 9.69, 9.3, 9, 8.7, 8.3, 8, 7.7, 7.3, 7, 6, 5.99, 0].map((s) => g(s).letter),
    ['A+', 'A', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'F']);
  assert.deepEqual([g(10).points, g(9.4).points, g(7.5).points, g(6).points, g(5.5).points], [4, 4, 2, 1, 0]);
  assert.equal(g(6).pass, true);
  assert.equal(g(5.99).pass, false);
  assert.deepEqual([4, 3.9, 3.89, 3.7, 3.3, 3, 2.99, 2.5, 2.49, 0].map(gpa.classify),
    ['High Distinction', 'High Distinction', 'Distinction', 'Distinction', 'Merit', 'Credit', 'Pass', 'Pass', 'Fail', 'Fail']);
});

// Dựng lớp giả: assignments + điểm của một học viên
const asg = (list) => list.map(([kind, seq], i) => ({ id: i + 1, kind, seq, title: `${kind}${seq}` }));
const forStudent = (short, assignments, scores) => {
  const modules = gpa.buildModules(assignments, new Set(Object.keys(scores).map(Number)), short);
  return gpa.computeGpa(modules, (id) => scores[id] ?? null);
};

test('BIH98: trọng số 35/20/20/5/5/5/10 cho GPA 3.29 như file Transcript (HW1+HW2 trung bình; Mini Project 3 = HW5)', () => {
  const a = asg([['hw', 1], ['hw', 2], ['hw', 3], ['mini', 1], ['mini', 2], ['hw', 4], ['hw', 5], ['capstone', 1]]);
  const r = forStudent('BIH098', a, { 1: 10, 2: 8.8, 3: 7.5, 4: 9.6, 5: 7.75, 6: 9, 7: 7.75, 8: 8.25 });
  assert.equal(r.gpa, 3.29);                       // 3.285 làm tròn như Excel
  assert.equal(r.classification, 'Credit');
  assert.equal(r.modules.find((m) => m.name === 'Data Transformation').score, 9.4);
});

test('EBA: trọng số 25/25/25/10/15; module chưa giao thì chuẩn hóa lại, module đã giao mà chưa nộp = 0', () => {
  const a = asg([['hw', 1], ['hw', 2], ['hw', 3], ['hw', 4], ['capstone', 1]]);
  // mới giao HW1, HW2: 10 và 8 → (0.25×4 + 0.25×2.7)/0.5 = 3.35
  assert.equal(forStudent('EBA120', a, { 1: 10, 2: 8 }).gpa, 3.35);
  // đủ 5 module: 10, 10, 10, 6, 6 → 0.75×4 + 0.1×1 + 0.15×1 = 3.25
  const full = forStudent('EBA117', a, { 1: 10, 2: 10, 3: 10, 4: 6, 5: 6 });
  assert.deepEqual([full.gpa, full.classification], [3.25, 'Credit']);
  // HW3 đã giao (có người có điểm) nhưng học viên này không làm → 0 điểm kéo GPA xuống
  const mod = gpa.buildModules(a, new Set([1, 2, 3]), 'EBA120');
  assert.equal(gpa.computeGpa(mod, (id) => ({ 1: 10, 2: 10 })[id] ?? null).gpa, 2.67);   // (0.25×4 + 0.25×4 + 0)/0.75
});

test('BIE: chia đều; BIE104 6 HW (HW5 IBCS, HW6 Storytelling); đã nộp nhưng chưa chấm thì bỏ qua chứ không tính 0', () => {
  const a = asg([['hw', 1], ['hw', 2], ['hw', 3], ['hw', 4], ['hw', 5], ['hw', 6]]);
  const r = forStudent('BIE104', a, { 1: 10, 2: 8, 3: 8.8, 4: 10, 5: 6, 6: 8 });
  assert.deepEqual(r.modules.map((m) => m.name),
    ['Business Intelligence Literacy', 'Data Transformation', 'Data Modeling', 'Data Visualization (IBCS)', 'Data Storytelling']);
  assert.equal(r.gpa, 2.94);                       // (4 + 3 + 4 + 1 + 2.7)/5 — giống BIE101 trong file Transcript
  const mod = gpa.buildModules(a, new Set([1, 2]), 'BIE104');
  const pend = gpa.computeGpa(mod, (id) => ({ 1: 10 })[id] ?? null, (id) => id === 2);   // HW2 đã nộp, chưa chấm
  assert.equal(pend.gpa, 4);
  assert.equal(pend.modules.find((m) => m.name === 'Data Transformation').pending, true);
  assert.equal(gpa.computeGpa(mod, () => null, (id) => id <= 2).gpa, null);                // chưa có gì để tính
});

test('Top Performance: top 10% kiểu Excel (làm tròn xuống, tối thiểu 1, gồm người bằng điểm cắt), luôn có ít nhất 1 người Offline', () => {
  const mk = (n, gpaV, att, mode = 'Online') => ({ enrollment_id: n, gpa: gpaV, attendance_rate: att, mode });
  const people = Array.from({ length: 47 }, (_, i) => mk(i + 1, 4 - i * 0.05, 1 - i * 0.01));   // 47 → floor(4.7) = 4 người
  const top = gpa.topPerformers(people);
  assert.deepEqual([top.total, top.take, top.rows.length], [47, 4, 4]);
  assert.deepEqual(top.rows.map((r) => r.rank), [1, 2, 3, 4]);
  assert.equal(top.has_offline, false);
  // có người Offline hạng 20 → được thêm vào (đánh dấu), không làm mất 4 người đầu
  const withOff = people.map((p) => (p.enrollment_id === 20 ? { ...p, mode: 'Offline' } : p));
  const t2 = gpa.topPerformers(withOff);
  assert.deepEqual([t2.rows.length, t2.rows.at(-1).enrollment_id, t2.rows.at(-1).offline_pick, t2.rows.at(-1).rank], [5, 20, true, 20]);
  // đã có Offline trong top thì không thêm
  assert.equal(gpa.topPerformers(people.map((p) => (p.enrollment_id === 2 ? { ...p, mode: 'Offline' } : p))).rows.length, 4);
  // lớp nhỏ: tối thiểu 1; người bằng điểm cắt đều vào; chưa có GPA thì bị bỏ
  assert.equal(gpa.topPerformers([mk(1, 3, 0.9), mk(2, 2, 0.8), mk(3, null, 1)]).rows.length, 1);
  assert.equal(gpa.topPerformers([mk(1, 3, 0.9), mk(2, 3, 0.9), mk(3, 2, 0.8)]).rows.length, 2);
  assert.equal(gpa.performanceScore(4, 1), 1);
  assert.equal(gpa.performanceScore(2, 0.5), 0.5);   // 0.7×0.5 + 0.3×0.5 = 0.5
});

// ---------- API: chỉnh tay kết quả tự động, GPA trong danh sách, Top Performance ----------
let t, admin, gv, guest, classId, enr, asgs;
const base = () => `/api/classes/${classId}`;
before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com'); gv = await t.login('gv@x.com'); guest = await t.login('khach@x.com');
  await t.db.run("insert into curricula (code, program, name, session_count) values ('EBA-6','EBA','EBA 6',6)");
  const cur = (await t.db.one("select id from curricula where code = 'EBA-6'")).id;
  classId = (await admin.post('/api/classes', { code: 'P1.EBA.P950.ON.EE.010126', session_count: 5, hw_count: 4, start_date: '2026-01-01' })).body.id;
  await t.db.run("update classes set curriculum_id = $1, short_code = 'EBA950', program = 'EBA', end_date = '2026-02-01' where id = $2", [cur, classId]);
  for (const id of [gvId, gId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [classId] });
  for (const [c, n, m] of [['G1', 'An', 'Online'], ['G2', 'Bình', 'Offline'], ['G3', 'Chi', 'Online']]) {
    await admin.post(`${base()}/students`, { student_code: c, full_name: n, mode: m });
  }
  enr = Object.fromEntries((await admin.get(`${base()}/students`)).body.map((s) => [s.student_code, s.id]));
  const sessions = (await admin.get(`${base()}/sessions`)).body;
  for (const s of sessions) for (const c of ['G1', 'G2', 'G3']) await admin.put(`${base()}/attendance`, { enrollment_id: enr[c], session_id: s.id, status: 'present' });
  asgs = Object.fromEntries((await admin.get(`${base()}/assignments`)).body.map((a) => [`${a.kind}${a.seq}`, a.id]));
  const sc = (c, k, score) => admin.put(`${base()}/scores`, { enrollment_id: enr[c], assignment_id: asgs[k], score });
  // G1 giỏi, G2 làm đủ nhưng điểm thấp (6 → GPA 1.0 < 2.5), G3 khá
  for (const k of ['hw1', 'hw2', 'hw3', 'hw4', 'capstone1']) { await sc('G1', k, 10); await sc('G2', k, 6); await sc('G3', k, 8); }
});
after(async () => { await t.close(); });

test('danh sách tốt nghiệp có GPA + xếp loại; GPA < 2.5 là chưa đạt dù học đủ làm đủ; khách không thấy GPA', async () => {
  const r = (await admin.get(`${base()}/graduation`)).body;
  const by = Object.fromEntries(r.rows.map((x) => [x.student_code, x]));
  assert.deepEqual([by.G1.gpa, by.G1.classification, by.G1.result], [4, 'High Distinction', 'passed']);
  assert.deepEqual([by.G2.gpa, by.G2.classification, by.G2.result], [1, 'Fail', 'failed']);
  assert.ok(by.G2.auto.reasons.includes('GPA dưới 2.5'));
  assert.deepEqual([by.G3.gpa, by.G3.classification], [2.7, 'Pass']);
  assert.deepEqual([by.G1.sessions_attended, by.G1.hw_count, by.G1.hw_rate], [5, 4, 1]);
  const g = (await guest.get(`${base()}/graduation`)).body.rows.find((x) => x.student_code === 'G1');
  assert.deepEqual([g.gpa, g.classification, g.gpa_modules], [null, null, []]);
});

test('admin chỉnh tay kết quả (điểm chấm sai): giữ khi công bố; giảng viên không chỉnh được; trả về tự động', async () => {
  assert.equal((await gv.put(`${base()}/graduation/${enr.G2}`, { status: 'passed' })).status, 409);
  assert.equal((await admin.put(`${base()}/graduation/${enr.G2}`, { status: 'passed' })).status, 200);
  const by = async () => Object.fromEntries((await admin.get(`${base()}/graduation`)).body.rows.map((x) => [x.student_code, x]));
  let r = await by();
  assert.deepEqual([r.G2.result, r.G2.decision.override, r.G2.auto.result], ['passed', true, 'failed']);   // kết quả tự động vẫn là chưa đạt
  assert.equal((await admin.post(`${base()}/graduation-publish`)).status, 200);
  r = await by();
  assert.deepEqual([r.G1.result, r.G2.result, r.G3.result], ['passed', 'passed', 'passed']);
  await admin.del(`${base()}/graduation-publish`);
  r = await by();
  assert.equal(r.G2.result, 'passed');                                             // chỉnh tay vẫn còn sau khi hủy công bố
  assert.equal((await admin.put(`${base()}/graduation/${enr.G2}`, { status: 'pending' })).status, 200);
  r = await by();
  assert.deepEqual([r.G2.result, r.G2.decision.override], ['failed', false]);        // trả về kết quả tự động
});

test('Top Performance: khách 403; 3 học viên → 1 người đầu + người Offline đại diện; có điểm từng module cho biểu đồ radar', async () => {
  assert.equal((await guest.get(`${base()}/top-performance`)).status, 403);
  const r = (await gv.get(`${base()}/top-performance`)).body;
  assert.deepEqual([r.total, r.take, r.has_offline], [3, 1, true]);
  assert.deepEqual(r.rows.map((x) => [x.student_code, x.offline_pick]), [['G1', false], ['G2', true]]);   // G2 học Offline nên được thêm
  assert.equal(r.rows[0].modules.length, 5);
  assert.ok(r.rows[0].modules.every((m) => m.score === 10));
  assert.ok(r.rows[0].performance > r.rows[1].performance);
});
