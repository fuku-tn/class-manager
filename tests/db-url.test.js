const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serverlessUrl } = require('../src/db');

const SESSION = 'postgresql://postgres.abcd:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
test('trên Vercel: Session pooler (5432) tự chuyển sang Transaction pooler (6543); nơi khác giữ nguyên', () => {
  assert.match(serverlessUrl(SESSION, { VERCEL: '1' }), /pooler\.supabase\.com:6543\/postgres$/);
  assert.match(serverlessUrl(SESSION.replace(':5432', ''), { VERCEL: '1' }), /:6543\//);   // không ghi cổng = 5432
  assert.equal(serverlessUrl(SESSION, {}), SESSION);                                          // máy cá nhân giữ Session pooler
  assert.equal(serverlessUrl(SESSION, { VERCEL: '1', DB_KEEP_SESSION_POOLER: '1' }), SESSION); // có thể tắt
  const tx = SESSION.replace(':5432', ':6543');
  assert.equal(serverlessUrl(tx, { VERCEL: '1' }), tx);                                       // đã là 6543 thì giữ
  const direct = 'postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres';
  assert.equal(serverlessUrl(direct, { VERCEL: '1' }), direct);                               // kết nối trực tiếp không đụng tới
  assert.equal(serverlessUrl('không phải url', { VERCEL: '1' }), 'không phải url');
});
