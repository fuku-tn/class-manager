// Voucher Google Maps của học viên: chỉ admin + tài khoản được bật can_voucher; nhập tay; kiểm tra dữ liệu; không lọt ra chỗ khác.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, admin, ly, gv, guest, classId, other, enr;
const base = () => `/api/classes/${classId}`;

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const lyId = await t.addUser('ly.doan@x.com', 'instructor');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com'); ly = await t.login('ly.doan@x.com'); gv = await t.login('gv@x.com'); guest = await t.login('khach@x.com');
  classId = (await admin.post('/api/classes', { code: 'VC.01', session_count: 2, hw_count: 1 })).body.id;
  other = (await admin.post('/api/classes', { code: 'VC.02', session_count: 2, hw_count: 1 })).body.id;
  for (const id of [lyId, gvId, gId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [classId] });
  await admin.put(`/api/users/${lyId}/voucher`, { can_voucher: true });
  for (const [c, n] of [['V1', 'Võ An'], ['V2', 'Đặng Bình'], ['V3', 'Châu Chi']]) await admin.post(`${base()}/students`, { student_code: c, full_name: n });
  await admin.post(`/api/classes/${other}/students`, { student_code: 'V9', full_name: 'Học viên lớp khác' });
  enr = Object.fromEntries((await admin.get(`${base()}/students`)).body.map((s) => [s.student_code, s.id]));
});
after(async () => { await t.close(); });

test('quyền: admin và tài khoản được bật xem/sửa; giảng viên khác và khách bị 403; chỉ admin bật quyền', async () => {
  assert.equal((await admin.get(`${base()}/vouchers`)).status, 200);
  assert.equal((await ly.get(`${base()}/vouchers`)).status, 200);
  assert.equal((await gv.get(`${base()}/vouchers`)).status, 403);
  assert.equal((await guest.get(`${base()}/vouchers`)).status, 403);
  assert.equal((await gv.put(`${base()}/vouchers/${enr.V1}`, { amount: 500000 })).status, 403);
  assert.equal((await ly.put(`/api/users/1/voucher`, { can_voucher: true })).status, 403);
  assert.equal((await ly.get('/api/auth/me')).body.can_voucher, true);
  assert.equal((await gv.get('/api/auth/me')).body.can_voucher, false);
});

test('danh sách theo họ tên tiếng Việt (Đ sau D), chưa có voucher thì trống; ghi và đọc lại đủ 4 cột', async () => {
  const list = (await ly.get(`${base()}/vouchers`)).body;
  assert.deepEqual(list.map((r) => r.full_name), ['Châu Chi', 'Đặng Bình', 'Võ An']);
  assert.ok(list.every((r) => r.amount === null && r.sent_date === null && r.status === null));
  const r = await ly.put(`${base()}/vouchers/${enr.V1}`, { amount: 1500000, sent_date: '2026-10-20', expiration_date: '2026-12-31', status: null });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.amount, r.body.sent_date, r.body.expiration_date, r.body.status], [1500000, '2026-10-20', '2026-12-31', null]);
  assert.equal(r.body.updated_by_name, 'ly.doan');
  // đánh dấu đã dùng; số tiền tự nhập ngoài 4 mức cũng được
  const u = await ly.put(`${base()}/vouchers/${enr.V1}`, { amount: 750000, sent_date: '2026-10-20', expiration_date: '2026-12-31', status: 'Used' });
  assert.deepEqual([u.body.amount, u.body.status], [750000, 'Used']);
  assert.equal((await ly.get(`${base()}/vouchers`)).body.find((x) => x.enrollment_id === enr.V1).status, 'Used');
});

test('kiểm tra dữ liệu: số tiền, ngày, ngày hết hạn trước ngày gửi, trạng thái lạ, học viên lớp khác; xóa trắng thì bỏ dòng', async () => {
  const put = (b, e = enr.V2) => ly.put(`${base()}/vouchers/${e}`, b);
  for (const bad of [{ amount: -1 }, { amount: 1.5 }, { amount: 'abc' }, { amount: 200000000 }]) assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  assert.equal((await put({ sent_date: '31/12/2026' })).status, 400);
  assert.equal((await put({ sent_date: '2026-02-30' })).status, 400);
  assert.equal((await put({ sent_date: '2026-10-20', expiration_date: '2026-10-01' })).status, 400);
  assert.equal((await put({ amount: 500000, status: 'Hết hạn' })).status, 400);
  assert.equal((await put({ amount: 500000 }, 999999)).status, 404);
  const otherEnr = (await admin.get(`/api/classes/${other}/students`)).body[0].id;
  assert.equal((await put({ amount: 500000 }, otherEnr)).status, 404);   // học viên của lớp khác
  assert.equal((await put({ amount: 500000 })).status, 200);
  assert.equal((await put({})).status, 200);                              // xóa trắng
  assert.equal((await t.db.one('select count(*)::int n from enrollment_vouchers where enrollment_id = $1', [enr.V2])).n, 0);
});

test('voucher không lọt ra API khác (học viên, điểm danh, bài tập, dashboard) và xóa học viên thì xóa voucher', async () => {
  await ly.put(`${base()}/vouchers/${enr.V3}`, { amount: 2000000, sent_date: '2026-10-21' });
  for (const p of ['/students', '/attendance', '/submissions', '/dashboard']) {
    const txt = JSON.stringify((await admin.get(`${base()}${p}`)).body);
    assert.ok(!/voucher|2000000/i.test(txt), p);
  }
  assert.equal((await t.db.one('select count(*)::int n from enrollment_vouchers')).n >= 1, true);
  await admin.del(`${base()}/students/${enr.V3}`, { reason: 'thử' });
  assert.equal((await t.db.one('select count(*)::int n from enrollment_vouchers where enrollment_id = $1', [enr.V3])).n, 0);
});

test('bảng có RLS và không có bảng "vouchers" cũ; nhập Excel/Sheet không đọc cột voucher (đã có test riêng)', async () => {
  assert.equal((await t.db.one("select count(*)::int n from information_schema.tables where table_name = 'vouchers'")).n, 0);
  const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'schema.sql'), 'utf8');
  assert.match(sql, /alter table enrollment_vouchers enable row level security/);
  assert.equal(sql.replace(/\r/g, ''), require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8').replace(/\r/g, ''), 'hai file schema phải giống nhau');
});
