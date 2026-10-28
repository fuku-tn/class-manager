// Dùng: npm run import -- <file.xlsx> [--dry-run] [--sheets "BIE-8,BIE-12"] [--classes "BIH073,BIE101"]
// Mặc định: mọi sheet đang HIỆN có cột SESSION n (bỏ qua sheet ẩn). --dry-run: chạy thử rồi hoàn tác.
// Quy tắc ô: X = đi học · O = vắng có phép · trống = vắng. KHÔNG đọc cột voucher/tiền.
const path = require('node:path');
const { openDb } = require('../src/db');
const { importExcel } = require('../src/services/importExcel');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const si = args.indexOf('--sheets');
const sheets = si >= 0 ? String(args[si + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : null;
const ci = args.indexOf('--classes');
const classes = ci >= 0 ? String(args[ci + 1] || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--sheets' && args[i - 1] !== '--classes');
if (!file) {
  console.error('Dùng: npm run import -- <file.xlsx> [--dry-run] [--sheets "BIE-8,BIE-12"]');
  process.exit(1);
}
(async () => {
  const db = await openDb();
  try {
    const r = await importExcel(db, path.resolve(file), { dryRun, sheets, classes });
    const pad = (v, n) => String(v).padEnd(n);
    console.log(`${pad('Sheet', 8)}${pad('Lớp', 28)}${pad('HV', 5)}${pad('Buổi', 6)}${pad('Có mặt', 8)}${pad('Có phép', 9)}${pad('Vắng', 6)}${pad('Giữ từ app', 11)}Ghi chú`);
    const total = { students: 0, new_students: 0, present: 0, excused: 0, absent: 0, submissions: 0, kept_from_app: 0, sessions_created: 0 };
    for (const c of r.classes) {
      for (const k of Object.keys(total)) total[k] += c[k] ?? 0;
      console.log(`${pad(c.sheet, 8)}${pad(c.class_code, 28)}${pad(c.students, 5)}${pad(c.sessions_held, 6)}${pad(c.present, 8)}${pad(c.excused, 9)}${pad(c.absent, 6)}${pad(c.kept_from_app, 11)}${c.new_class ? 'LỚP MỚI ' : ''}${c.curriculum_changed ? 'đổi giáo trình ' : ''}${c.new_students ? `+${c.new_students} HV mới` : ''}`);
    }
    console.log('\nTổng:', JSON.stringify(total));
    console.log('Lớp:', r.classes.length, '| sheet bỏ qua:', r.skipped_sheets.join('; ') || '(không)', '| dòng không phải học viên:', r.skipped_rows);
    if (r.warnings.length) {
      console.log(`\nCảnh báo (${r.warnings.length}):`);
      r.warnings.slice(0, 40).forEach((w) => console.log('  -', w));
      if (r.warnings.length > 40) console.log(`  ... và ${r.warnings.length - 40} cảnh báo khác`);
    }
    if (r.dry_run) console.log('\n>>> CHẠY THỬ: đã hoàn tác, database không đổi.');
  } finally {
    await db.close();
  }
})().catch((e) => { console.error('Lỗi import:', e.message); process.exit(1); });
