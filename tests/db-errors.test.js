const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeDbError, openDbLazy } = require('../src/db');
const { createApp } = require('../src/create-app');

test('phân loại lỗi cấu hình/kết nối database', () => {
  assert.match(describeDbError(new Error('Thiếu DATABASE_URL (xem ...)')), /thiếu biến DATABASE_URL/);
  assert.match(describeDbError(Object.assign(new Error('max clients reached in session mode - max clients are limited to pool_size: 15'), { code: 'EMAXCONNSESSION' })), /hết kết nối/);
  assert.match(describeDbError(Object.assign(new Error('password authentication failed for user "x"'), { code: '28P01' })), /sai mật khẩu/);
  assert.match(describeDbError(new Error('Invalid URL')), /không đúng định dạng/);
  assert.match(describeDbError(Object.assign(new Error('getaddrinfo ENOTFOUND host'), { code: 'ENOTFOUND' })), /không kết nối được/);
  assert.equal(describeDbError(new Error('lỗi lạ khác')), null); // lỗi không rõ → để 500 chung, không đoán
});

test('thiếu DATABASE_URL: đăng nhập trả 503 với thông điệp rõ ràng, không lộ bí mật', async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const server = await new Promise((r) => { const s = createApp(openDbLazy()).listen(0, () => r(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.c', password: 'x' }),
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /Không kết nối được cơ sở dữ liệu: thiếu biến DATABASE_URL/);
  } finally {
    server.close();
    if (saved) process.env.DATABASE_URL = saved;
  }
});
