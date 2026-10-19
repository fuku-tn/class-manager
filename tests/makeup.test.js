// Học bù: ghi chú điểm danh "Bù <mã lớp>" ở lớp gốc → lớp được nhắc tới thấy thông báo (học viên, lớp gốc, buổi).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const { parseMakeupNote } = require('../src/services/makeup');

let t, admin, gv, a, b;   // a = EBA121 (lớp gốc), b = EBA122 (lớp học bù)

test('đọc ghi chú học bù: nhiều cách viết mã lớp, có/không có buổi; ghi chú khác thì bỏ qua', () => {
  const p = (s) => parseMakeupNote(s);
  assert.deepEqual(p('Bù EBA122'), { short: 'EBA122', session: null });
  assert.deepEqual(p('bù eba 122'), { short: 'EBA122', session: null });
  assert.deepEqual(p('Học bù lớp EBA122 buổi 1'), { short: 'EBA122', session: 1 });
  assert.deepEqual(p('Nghỉ, bù sang P1.EBA.P122.HY.AA.191026'), { short: 'EBA122', session: null });
  assert.deepEqual(p('Bù BIE-102 (buổi 3)'), { short: 'BIE102', session: 3 });
  assert.deepEqual(p('bu EBA95'), { short: 'EBA095', session: null });
  for (const s of ['Bù khóa sau', 'Vào trễ buổi 2', 'Bù 122', '', null]) assert.equal(p(s), null);
});

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  a = (await admin.post('/api/classes', { code: 'P1.EBA.P121.HY.AA.171026', session_count: 3, hw_count: 1 })).body.id;
  b = (await admin.post('/api/classes', { code: 'P1.EBA.P122.ON.EE.191026', session_count: 3, hw_count: 1 })).body.id;
  await t.db.run("update classes set short_code = 'EBA121', program = 'EBA' where id = $1", [a]);
  await t.db.run("update classes set short_code = 'EBA122', program = 'EBA' where id = $1", [b]);
  await admin.put(`/api/users/${gvId}/classes`, { class_ids: [b] });   // giảng viên chỉ dạy EBA122
  for (const [code, name] of [['P.801', 'An'], ['P.802', 'Bình']]) await admin.post(`/api/classes/${a}/students`, { student_code: code, full_name: name });
  const enr = Object.fromEntries((await admin.get(`/api/classes/${a}/students`)).body.map((s) => [s.student_code, s.id]));
  const ses = (await admin.get(`/api/classes/${a}/sessions`)).body;
  const att = (e, s, status, note) => admin.put(`/api/classes/${a}/attendance`, { enrollment_id: enr[e], session_id: s.id, status, note });
  await att('P.801', ses[0], 'excused', 'Bù EBA122');
  await att('P.801', ses[1], 'excused', 'bù EBA 122 buổi 2');
  await att('P.801', ses[2], 'present', null);
  await att('P.802', ses[0], 'absent', 'Bù khóa sau');           // không có mã lớp → không tính
  await att('P.802', ses[1], 'absent', 'Bù EBA123');             // lớp khác → không hiện ở EBA122
});
after(async () => { await t.close(); });

test('lớp được bù thấy học viên, lớp gốc và các buổi bù; lớp gốc không thấy chính nó', async () => {
  const r = await gv.get(`/api/classes/${b}/makeups`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.length, 1);
  const g = r.body[0];
  assert.deepEqual([g.student_code, g.full_name, g.from_short, g.from_class_id], ['P.801', 'An', 'EBA121', a]);
  assert.deepEqual(g.sessions.map((s) => [s.session_no, s.target_session, s.status]), [[1, null, 'excused'], [2, 2, 'excused']]);
  assert.ok(g.sessions.every((s) => s.key && s.note && s.at));
  assert.deepEqual((await admin.get(`/api/classes/${a}/makeups`)).body, []);
});

test('quyền: giảng viên không dạy lớp gốc vẫn thấy ở lớp mình dạy; không xem được lớp không được phân công', async () => {
  assert.equal((await gv.get(`/api/classes/${a}/makeups`)).status, 403);
});
