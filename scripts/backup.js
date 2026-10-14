// Sao lưu toàn bộ dữ liệu ra máy: npm run backup [-- <thư-mục-đích>] [--keep N]
// --keep N: sau khi sao lưu xong, chỉ giữ N bản mới nhất trong private-data/backups/ (dùng cho lịch tự động).
// Mặc định: private-data/backups/<ngày_giờ>/ (git-ignore). Gồm:
//   manifest.json      — thời điểm, số dòng từng bảng, thứ tự khôi phục
//   tables/<bảng>.json — dữ liệu đầy đủ (dùng để khôi phục: npm run restore)
//   xem-nhanh.xlsx     — bản để mở bằng Excel (mỗi bảng một sheet; KHÔNG có mã băm mật khẩu)
// Chỉ ĐỌC database (một transaction chỉ-đọc, ảnh chụp nhất quán).
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { exportAll } = require('../src/services/backup');

const HIDE_IN_EXCEL = { users: ['password_hash'] };

(async () => {
  const args = process.argv.slice(2);
  const ki = args.indexOf('--keep');
  const keep = ki >= 0 ? Number(args[ki + 1]) : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && !(ki >= 0 && i === ki + 1));
  const root = path.join(__dirname, '..', 'private-data', 'backups');
  const stamp = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const dir = path.resolve(positional[0] || path.join(root, stamp));
  const db = await openDb();
  const t0 = Date.now();
  const { manifest, tables } = await exportAll(db);
  fs.mkdirSync(path.join(dir, 'tables'), { recursive: true });
  for (const [name, rows] of Object.entries(tables)) fs.writeFileSync(path.join(dir, 'tables', `${name}.json`), JSON.stringify(rows));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  for (const name of manifest.order) {
    const rows = tables[name];
    const hide = HIDE_IN_EXCEL[name] ?? [];
    const cols = rows.length ? Object.keys(rows[0]).filter((c) => !hide.includes(c)) : [];
    const ws = wb.addWorksheet(name.slice(0, 31));
    ws.addRow(cols);
    for (const r of rows) ws.addRow(cols.map((c) => (r[c] !== null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])));
    ws.getRow(1).font = { bold: true };
  }
  await wb.xlsx.writeFile(path.join(dir, 'xem-nhanh.xlsx'));

  const total = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
  console.log(`Đã sao lưu ${manifest.order.length} bảng, ${total} dòng trong ${((Date.now() - t0) / 1000).toFixed(1)} giây.`);
  for (const n of manifest.order) console.log(`  ${n.padEnd(22)} ${manifest.counts[n]}`);
  console.log(`Thư mục: ${dir}`);
  console.log('Lưu ý: có dữ liệu cá nhân và mã băm mật khẩu — chỉ cất ở nơi an toàn, không gửi qua chat/email.');
  // Giữ N bản mới nhất (chỉ xóa thư mục đúng dạng <yyyy-mm-dd_hhmm> có manifest.json, trong private-data/backups)
  if (Number.isInteger(keep) && keep >= 1) {
    const olds = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d.name) && fs.existsSync(path.join(root, d.name, 'manifest.json')))
      .map((d) => d.name).sort().reverse().slice(keep);
    for (const name of olds) fs.rmSync(path.join(root, name), { recursive: true, force: true });
    if (olds.length) console.log(`Đã xóa ${olds.length} bản cũ (giữ ${keep} bản mới nhất): ${olds.join(', ')}`);
  }
  await db.close?.();
  process.exit(0);
})().catch((e) => { console.error('Sao lưu lỗi:', e.message); process.exit(1); });
