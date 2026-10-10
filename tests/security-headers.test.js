const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { HEADERS, CSP } = require('../src/security-headers');

let t;
before(async () => { t = await startTestApp(); });
after(async () => { await t.close(); });

test('Express gửi đủ header bảo mật cho trang và API', async () => {
  for (const url of ['/', '/api/health', '/js/main.js']) {
    const res = await fetch(t.base + url);
    for (const [k, v] of Object.entries(HEADERS)) assert.equal(res.headers.get(k), v, `${url}: thiếu/sai ${k}`);
  }
});

test('vercel.json khai báo đúng cùng bộ header (file tĩnh không đi qua Express)', () => {
  const vj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const rule = vj.headers.find((h) => h.source === '/(.*)');
  assert.ok(rule, 'vercel.json thiếu rule headers cho /(.*)');
  const got = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
  assert.deepEqual(got, HEADERS);
});

test('CSP chặn script ngoài và iframe; trang không còn script inline hay thuộc tính sự kiện inline', () => {
  assert.match(CSP, /script-src 'self'(;|$)/);
  assert.doesNotMatch(CSP, /script-src[^;]*unsafe-(inline|eval)/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /object-src 'none'/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/g)].filter((m) => !/\bsrc=/.test(m[1]));
  assert.equal(inlineScripts.length, 0, 'index.html còn <script> inline (sẽ bị CSP chặn)');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'index.html còn thuộc tính sự kiện inline');
});

test('mã frontend không dùng innerHTML hay eval (chống XSS, tương thích CSP)', () => {
  const dir = path.join(__dirname, '..', 'public', 'js');
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
  walk(dir);
  for (const f of files.filter((f) => /\.(js|mjs)$/.test(f))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\.innerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, `${path.relative(dir, f)} dùng API không an toàn`);
  }
});
