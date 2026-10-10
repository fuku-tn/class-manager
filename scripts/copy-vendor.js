// Chép thư viện phía trình duyệt vào public/vendor (Vercel không phục vụ node_modules; file tĩnh phải nằm trong public/).
// Chạy lại sau khi nâng cấp chart.js / @supabase/supabase-js: npm run vendor
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const dest = path.join(root, 'public', 'vendor');
fs.mkdirSync(dest, { recursive: true });
const files = [
  ['chart.js/dist/chart.umd.min.js', 'chart.umd.min.js'],
  ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js'],
];
for (const [from, to] of files) {
  fs.copyFileSync(path.join(root, 'node_modules', from), path.join(dest, to));
  console.log(`Đã chép ${to} vào public/vendor`);
}
