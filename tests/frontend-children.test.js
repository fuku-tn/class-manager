// replaceChildren/append thô biến false/null thành chữ "false"/"null" trên trang. Phải dùng h()/setChildren (ui.js),
// hoặc lọc trước. Test này quét mã giao diện tìm các lời gọi có tham số dạng `a && b`, `a ? b : null`, `a || b` ở cấp ngoài.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'public', 'js');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(f.name)) files.push(p);
  }
})(root);

// Lấy phần tham số (cân bằng ngoặc) của lời gọi bắt đầu tại vị trí `open` (ký tự '(').
function argsAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return '';
}
// Bỏ nội dung trong ngoặc/chuỗi để chỉ còn toán tử ở cấp ngoài.
function topLevel(args) {
  let out = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

test('replaceChildren/append không nhận tham số có thể là false/null (sẽ hiện chữ "false"/"null")', () => {
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\.(replaceChildren|append)\(/g)) {
      const open = m.index + m[0].length - 1;
      const top = topLevel(argsAt(src, open));
      // && hoặc || hoặc \? ... : null/undefined ở cấp ngoài → nguy cơ
      if (/&&|\|\||\?[^:]*:\s*(null|undefined|false)\b/.test(top)) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(`${path.relative(root, f)}:${line}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
