// Quyền theo lớp (chủ dự án chốt 11/11/2026): mọi tài khoản XEM được mọi lớp (đã/đang/sắp diễn ra). Sửa được: admin, tài khoản
// can_all_classes ("Sửa mọi lớp", chỉ thua admin) và giảng viên được phân công lớp đó. Còn lại chỉ xem và bị coi như khách ở phần điểm/Potential/voucher.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, admin, ly, plain, guest, upId, runId, oldId, plainId, lyId;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  lyId = await t.addUser('ly@x.com', 'instructor');
  plainId = await t.addUser('thuong@x.com', 'instructor');
  await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  upId = (await admin.post('/api/classes', { code: 'UP.01', session_count: 3, hw_count: 1, start_date: day(30) })).body.id;
  runId = (await admin.post('/api/classes', { code: 'RUN.01', session_count: 3, hw_count: 1, start_date: day(-3) })).body.id;
  oldId = (await admin.post('/api/classes', { code: 'OLD.01', session_count: 3, hw_count: 1, start_date: day(-200) })).body.id;
  await t.db.run('update classes set end_date = $1 where id = $2', [day(-150), oldId]);
  assert.equal((await admin.put(`/api/users/${lyId}/all-classes`, { can_all_classes: true })).status, 200);
  await admin.put(`/api/users/${plainId}/voucher`, { can_voucher: true });   // cờ riêng vẫn bị bỏ qua ở lớp chỉ xem
  ly = await t.login('ly@x.com'); plain = await t.login('thuong@x.com'); guest = await t.login('khach@x.com');
});
after(async () => { await t.close(); });

test('mọi tài khoản thấy mọi lớp (đã/đang/sắp diễn ra); view_only theo quyền sửa', async () => {
  const codes = (r) => r.body.map((c) => c.code).sort();
  for (const who of [admin, ly, plain, guest]) assert.deepEqual(codes(await who.get('/api/classes')), ['OLD.01', 'RUN.01', 'UP.01']);
  const flag = async (who) => Object.fromEntries((await who.get('/api/classes')).body.map((c) => [c.code, c.view_only]));
  assert.ok(Object.values(await flag(admin)).every((v) => v === undefined));      // admin: không có cờ
  assert.ok(Object.values(await flag(ly)).every((v) => v === false));              // can_all_classes: sửa được hết
  assert.ok(Object.values(await flag(plain)).every((v) => v === true));            // không phân công: chỉ xem
  assert.ok(Object.values(await flag(guest)).every((v) => v === true));            // khách luôn chỉ xem
});

test('tài khoản chỉ xem: đọc được dữ liệu lớp, ghi bị 403 ở mọi lớp', async () => {
  for (const id of [upId, runId, oldId]) {
    for (const who of [plain, guest]) {
      assert.equal((await who.get(`/api/classes/${id}/students`)).status, 200);
      assert.equal((await who.get(`/api/classes/${id}/attendance`)).status, 200);
    }
    const w = await plain.post(`/api/classes/${id}/students`, { student_code: 'X1', full_name: 'Không được' });
    assert.equal(w.status, 403); assert.match(w.body.error, /chỉ được xem/);
    assert.equal((await plain.put(`/api/classes/${id}/attendance`, { enrollment_id: 1, session_id: 1, status: 'present' })).status, 403);
  }
});

test('lớp chỉ xem: như khách ở phần điểm, Potential, voucher (dù cờ riêng đang bật)', async () => {
  assert.equal((await plain.get(`/api/classes/${runId}/scores`)).status, 403);
  assert.equal((await plain.get(`/api/classes/${runId}/potential`)).status, 403);
  assert.equal((await plain.get(`/api/classes/${runId}/vouchers`)).status, 403);   // plain có can_voucher nhưng lớp này chỉ xem
  assert.equal((await admin.get(`/api/classes/${runId}/vouchers`)).status, 200);
});

test('Sửa mọi lớp: ghi được ở mọi lớp nhưng vẫn thua admin (không tạo lớp, không quản lý người dùng)', async () => {
  for (const [id, code] of [[upId, 'A1'], [runId, 'A2'], [oldId, 'A3']]) assert.equal((await ly.post(`/api/classes/${id}/students`, { student_code: code, full_name: 'Được ghi ' + code })).status, 201);
  assert.equal((await ly.post('/api/classes', { code: 'NOPE' })).status, 403);
  assert.equal((await ly.get('/api/users')).status, 403);
  assert.equal((await ly.put(`/api/users/${plainId}/all-classes`, { can_all_classes: true })).status, 403);
});

test('được phân công vẫn sửa được lớp đó, các lớp khác chỉ xem; trang chủ và lịch dùng chung cho mọi tài khoản', async () => {
  assert.equal((await admin.put(`/api/users/${plainId}/classes`, { class_ids: [runId] })).status, 200);
  const f = Object.fromEntries((await plain.get('/api/classes')).body.map((c) => [c.code, c.view_only]));
  assert.deepEqual(f, { 'RUN.01': false, 'UP.01': true, 'OLD.01': true });
  assert.equal((await plain.post(`/api/classes/${runId}/students`, { student_code: 'P1', full_name: 'Được ghi' })).status, 201);
  assert.equal((await plain.post(`/api/classes/${upId}/students`, { student_code: 'P2', full_name: 'Không' })).status, 403);
  const ov = async (who) => (await who.get('/api/overview')).body.totals.classes;
  assert.deepEqual([await ov(plain), await ov(guest), await ov(ly)], Array(3).fill(await ov(admin)));
  assert.equal((await plain.get('/api/schedule/teaching')).status, 200);
});

test('chỉ admin bật/tắt "Sửa mọi lớp"; danh sách người dùng có cờ này; cột có trong cả hai schema', async () => {
  assert.equal((await plain.put(`/api/users/${plainId}/all-classes`, { can_all_classes: true })).status, 403);
  const users = (await admin.get('/api/users')).body;
  assert.equal(users.find((u) => u.id === lyId).can_all_classes, true);
  assert.equal(users.find((u) => u.id === plainId).can_all_classes, false);
  const fs = require('node:fs'); const path = require('node:path');
  for (const f of ['src/schema.sql', 'supabase/schema.sql']) assert.match(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /can_all_classes boolean not null default false/, f);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'supabase/migrations/2026-11-11-all-classes.sql')));
});
