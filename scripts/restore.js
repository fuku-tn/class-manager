// Khôi phục bản sao lưu vào một database TRỐNG: npm run restore -- <thư-mục-sao-lưu> [--dry-run]
// Database đích: RESTORE_DATABASE_URL nếu có, không thì DATABASE_URL. Database đích đã có dữ liệu → từ chối (không đè dữ liệu thật).
// Thiếu bảng → tự tạo theo src/schema.sql trước. --dry-run: chạy hết rồi hoàn tác.
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { importAll } = require('../src/services/backup');

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!dir) { console.error('Dùng: npm run restore -- <thư-mục-sao-lưu> [--dry-run]'); process.exit(1); }

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const tables = Object.fromEntries(manifest.order.map((n) => [n, JSON.parse(fs.readFileSync(path.join(dir, 'tables', `${n}.json`), 'utf8'))]));
  const url = process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL;
  let host = '?';
  try { host = new URL(url.trim().replace(/^["']+|["']+$/g, '')).host; } catch { /* để openDb báo lỗi */ }
  console.log(`Khôi phục bản sao lưu lúc ${manifest.created_at} vào ${host}${dryRun ? ' (chạy thử)' : ''}`);
  const db = await openDb({ url });
  const have = new Set((await db.all("select table_name as t from information_schema.tables where table_schema = 'public'")).map((r) => r.t));
  if (manifest.order.some((n) => !have.has(n))) {
    if (dryRun) { console.log('Database đích chưa có đủ bảng — lần chạy thật sẽ tạo theo src/schema.sql.'); process.exit(0); }
    const { Client } = require('pg'); // schema nhiều câu lệnh: chạy bằng truy vấn đơn (không tham số)
    const raw = url.trim().replace(/^["']+|["']+$/g, '');
    const c = new Client({ connectionString: raw, ssl: /localhost|127\.0\.0\.1/.test(raw) ? false : { rejectUnauthorized: false } });
    await c.connect();
    try { await c.query(fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8')); } finally { await c.end(); }
    console.log('Đã tạo bảng theo src/schema.sql');
  }
  const r = await importAll(db, { manifest, tables }, { dryRun });
  for (const [n, c] of Object.entries(r.restored)) console.log(`  ${n.padEnd(22)} ${c}`);
  console.log(dryRun ? '>>> CHẠY THỬ: đã hoàn tác, database không đổi.' : 'Đã khôi phục xong. Mọi người cần đăng nhập lại.');
  process.exit(0);
})().catch((e) => { console.error('Khôi phục lỗi:', e.message); process.exit(1); });
