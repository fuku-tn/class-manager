// Sao lưu RIÊNG điểm bài tập (chỉ đọc database): private-data/backups/diem/diem_<ngày_giờ>.csv — chỉ giữ bản mới nhất.
// Cột: StudentID, Course, HW, Point, Module, Source (manual = gõ tay trên web · excel · sharepoint). Khôi phục: npm run import-points -- <file.csv>
// (khôi phục giữ đúng điểm gõ tay và nguồn; điểm Excel không còn trong bản sao lưu thì bị xóa như mọi lần nhập từ Excel).
// Sao lưu cả hệ thống (mọi bảng) là việc khác: npm run backup.
const path = require('node:path');
const { openDb } = require('../src/db');
const { writeScoresBackup } = require('../src/services/pointsExcel');

(async () => {
  const db = await openDb();
  try {
    const b = await writeScoresBackup(db, path.join(__dirname, '..'));
    console.log(`Đã sao lưu ${b.count} điểm → ${b.file}${b.removed ? ` (đã xóa ${b.removed} bản cũ)` : ''}`);
  } finally { await db.close?.(); }
})().then(() => process.exit(0)).catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
