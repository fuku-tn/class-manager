// Chép Chart.js vào public/vendor (Vercel không phục vụ node_modules; file tĩnh phải nằm trong public/).
// Chạy lại sau khi nâng cấp chart.js: npm run vendor
const fs = require('node:fs');
const path = require('node:path');
const dest = path.join(__dirname, '..', 'public', 'vendor');
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'), path.join(dest, 'chart.umd.min.js'));
console.log('Đã chép chart.umd.min.js vào public/vendor');
