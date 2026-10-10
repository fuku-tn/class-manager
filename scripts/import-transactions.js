// Dùng: npm run import-tx -- <Transactions.xlsx> <session-management.xlsx> [--dry-run]
// --dry-run: chạy thử toàn bộ rồi hoàn tác, chỉ in kết quả.
// KHÔNG đọc cột tiền: chỉ các cột trong danh sách cho phép (xem src/services/importTransactions.js).
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { importTransactions } = require('../src/services/importTransactions');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [transactionsFile, curriculumFile] = args.filter((a) => !a.startsWith('--'));
if (!transactionsFile) {
  console.error('Dùng: npm run import-tx -- <Transactions.xlsx> [session-management.xlsx] [--dry-run]');
  process.exit(1);
}
(async () => {
  const db = await openDb();
  try {
    const s = await importTransactions(db, {
      transactionsFile: path.resolve(transactionsFile),
      curriculumFile: curriculumFile ? path.resolve(curriculumFile) : null,
      dryRun,
    });
    const { anomaly_details, ...brief } = s;
    console.log(JSON.stringify(brief, null, 2));
    const a = anomaly_details;
    if (a.emails_with_many_ids.length || a.ids_with_many_emails.length || a.phones_with_many_ids.length) {
      fs.mkdirSync('data', { recursive: true });
      const out = path.join('data', 'bao-cao-trung-lap.csv'); // data/ và *.csv đã git-ignore
      const lines = ['loai,khoa,gia_tri'];
      a.emails_with_many_ids.forEach((x) => lines.push(`email có nhiều mã học viên,${x.email},${x.ids.join(' / ')}`));
      a.ids_with_many_emails.forEach((x) => lines.push(`mã học viên có nhiều email,${x.id},${x.emails.join(' / ')}`));
      a.phones_with_many_ids.forEach((x) => lines.push(`số điện thoại (…${x.phone_tail}) có nhiều mã,${x.phone_tail},${x.ids.join(' / ')}`));
      fs.writeFileSync(out, '﻿' + lines.join('\n'));
      console.log(`Đã ghi báo cáo trùng lặp (chỉ máy bạn, không lên GitHub): ${out}`);
    }
    if (dryRun) console.log('>>> CHẠY THỬ: đã hoàn tác, database không đổi.');
  } finally {
    await db.close();
  }
})().catch((e) => { console.error('Lỗi import:', e.message); process.exit(1); });
