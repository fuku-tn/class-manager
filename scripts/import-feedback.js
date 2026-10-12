// Dùng: npm run import-feedback -- <file.xlsx> [--dry-run]
// Nhập sheet "FEEDBACK FORM" (khảo sát sau khóa). KHÔNG lấy email/họ tên/SĐT, chữ tự do và câu hỏi học phí.
const path = require('node:path');
const { openDb } = require('../src/db');
const { importFeedback } = require('../src/services/feedback');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('Dùng: npm run import-feedback -- <file.xlsx> [--dry-run]'); process.exit(1); }
(async () => {
  const db = await openDb();
  try {
    const s = await importFeedback(db, path.resolve(file), { dryRun });
    console.log(JSON.stringify(s, null, 2));
    if (dryRun) console.log('>>> CHẠY THỬ: đã hoàn tác, database không đổi.');
  } finally { await db.close(); }
})().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
