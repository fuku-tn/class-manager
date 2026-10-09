// Dùng: npm run import -- <file.xlsx> [mã-lớp]
// Không có mã-lớp: mỗi COURSE ID khác nhau trong sheet là một lớp riêng.
const path = require('node:path');
const { openDb } = require('../src/db');
const { importExcel } = require('../src/services/importExcel');

const [file, classCode] = process.argv.slice(2);
if (!file) {
  console.error('Dùng: npm run import -- <file.xlsx> [mã-lớp]');
  process.exit(1);
}
(async () => {
  const db = await openDb();
  const { classes, warnings } = await importExcel(db, path.resolve(file), { classCode });
  await db.close();
  {
    for (const s of classes)
      console.log(`Đã nhập lớp ${s.class_code}: ${s.students} học viên (${s.new_students} mới), ${s.attendance} bản ghi điểm danh, ${s.submissions} bản ghi bài tập.`);
    warnings.forEach((w) => console.warn('Cảnh báo:', w));
  }
})().catch((e) => { console.error('Lỗi import:', e.message); process.exit(1); });
