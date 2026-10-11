// Mọi module giao diện phải đọc được (lỗi cú pháp ở một file làm hỏng cả trang, kể cả màn hình đăng nhập).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', 'public', 'js');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(f.name)) files.push(p);
  }
})(root);

test('mọi file trong public/js đều không có lỗi cú pháp', () => {
  assert.ok(files.length > 10);
  const bad = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(f), encoding: 'utf8' });
    if (r.status !== 0) bad.push(`${path.relative(root, f)}: ${String(r.stderr).split('\n').find((l) => /Error/.test(l)) ?? 'lỗi'}`);
  }
  assert.deepEqual(bad, []);
});
