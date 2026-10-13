const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t;
before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  await t.addUser('giangvien@x.com', 'instructor');
  await t.addUser('khach@x.com', 'guest');
  await t.addUser('khoa@x.com', 'instructor');
});
after(async () => { await t.close(); });

const events = (email) => t.db.all('select event from auth_events where email = $1 order by id', [email]);

test('đăng nhập sai 8 lần thì bị khóa tạm (đếm trong database), kể cả mật khẩu đúng; có ghi nhật ký', async () => {
  const c = t.client();
  for (let i = 0; i < 8; i++) assert.equal((await c.post('/api/auth/login', { email: 'khoa@x.com', password: 'sai-mat-khau' })).status, 401);
  const locked = await c.post('/api/auth/login', { email: 'khoa@x.com', password: 'password123' });
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /15 phút/);
  const ev = (await events('khoa@x.com')).map((e) => e.event);
  assert.equal(ev.filter((x) => x === 'login_fail').length, 8);
  assert.ok(ev.includes('locked'));
  // email khác (cùng IP) vẫn đăng nhập được: khóa theo cặp IP+email
  assert.equal((await t.client().post('/api/auth/login', { email: 'giangvien@x.com', password: 'password123' })).status, 200);
});

test('đăng nhập đúng thì bộ đếm sai của cặp đó bắt đầu lại', async () => {
  const c = t.client();
  for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { email: 'admin@x.com', password: 'sai' });
  assert.equal((await c.post('/api/auth/login', { email: 'admin@x.com', password: 'password123' })).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { email: 'admin@x.com', password: 'sai' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'admin@x.com', password: 'password123' })).status, 200);
});

test('đổi mật khẩu: kiểm mật khẩu hiện tại, độ dài ≥ 10, không chứa email; phiên khác bị hủy; mật khẩu cũ hết dùng', async () => {
  const a = await t.login('giangvien@x.com');
  const other = await t.login('giangvien@x.com');             // một thiết bị khác
  assert.equal((await other.get('/api/auth/me')).status, 200);
  const wrong = await a.post('/api/auth/password', { current: 'khong-dung', next: 'Mat-khau-moi-12' });
  assert.deepEqual([wrong.status, wrong.body.error], [400, 'Mật khẩu hiện tại sai']);
  assert.match((await a.post('/api/auth/password', { current: 'password123', next: 'ngan123' })).body.error, /10 ký tự/);
  assert.match((await a.post('/api/auth/password', { current: 'password123', next: 'xx-giangvien-99' })).body.error, /email/);
  assert.match((await a.post('/api/auth/password', { current: 'password123', next: 'password123' })).body.error, /khác/);
  assert.equal((await a.post('/api/auth/password', { current: 'password123', next: 'Mat-khau-moi-12' })).status, 200);
  assert.equal((await a.get('/api/auth/me')).status, 200);        // phiên đang dùng còn
  assert.equal((await other.get('/api/auth/me')).status, 401);    // phiên khác bị đăng xuất
  assert.equal((await t.client().post('/api/auth/login', { email: 'giangvien@x.com', password: 'password123' })).status, 401);
  assert.equal((await t.client().post('/api/auth/login', { email: 'giangvien@x.com', password: 'Mat-khau-moi-12' })).status, 200);
  const ev = (await events('giangvien@x.com')).map((e) => e.event);
  assert.ok(ev.includes('password_changed') && ev.includes('password_fail'));
});

test('khách không đổi được mật khẩu; tạo tài khoản mới cần mật khẩu ≥ 10 ký tự', async () => {
  const g = await t.login('khach@x.com');
  assert.equal((await g.post('/api/auth/password', { current: 'password123', next: 'Mat-khau-moi-12' })).status, 403);
  const admin = await t.login('admin@x.com');
  const short = await admin.post('/api/users', { email: 'moi@x.com', name: 'Mới', password: '123456789', role: 'instructor' });
  assert.equal(short.status, 400);
  assert.equal((await admin.post('/api/users', { email: 'moi@x.com', name: 'Mới', password: '1234567890', role: 'instructor' })).status, 201);
});

test('nhật ký đăng nhập: chỉ admin xem, không chứa mật khẩu', async () => {
  const admin = await t.login('admin@x.com');
  const gv = await t.login('giangvien@x.com', 'Mat-khau-moi-12');
  assert.equal((await gv.get('/api/auth/events')).status, 403);
  const r = await admin.get('/api/auth/events');
  assert.equal(r.status, 200);
  assert.ok(r.body.length > 0);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes('password123') && !text.includes('Mat-khau-moi-12') && !text.includes('sai-mat-khau'));
  assert.deepEqual(Object.keys(r.body[0]).sort(), ['at', 'email', 'event', 'id', 'ip', 'user_agent', 'user_name']);
});
