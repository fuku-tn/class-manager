// Cập nhật điểm HW từ file Excel "Chấm điểm.xlsx" (bảng Point_Transform) vào database.
// Dùng: npm run import-points [-- <file.xlsx | bản-sao-lưu.csv>] [--dry-run]
//   Mặc định file: POINTS_XLSX trong .env, nếu không có thì private-data/excel/Chấm điểm.xlsx, rồi "Chấm điểm.xlsx" ở thư mục gốc.
//   Lịch tự động 12:00 hằng ngày: scripts/points-scheduled.cmd (làm mới truy vấn Excel trước rồi mới nhập).
// File là bản chuẩn: điểm sửa thì cập nhật, điểm không còn trong bảng thì xóa (chốt chặn nếu bỗng xóa quá nhiều).
// Trước mỗi lần nhập thật: chụp toàn bộ điểm đang có ra private-data/backups/diem/diem_<ngày_giờ>.csv và CHỈ giữ bản mới nhất.
// Khôi phục điểm về lúc đó: npm run import-points -- private-data/backups/diem/diem_<ngày_giờ>.csv (cột Source giữ nguyên điểm gõ tay / nguồn). Chỉ sao lưu: npm run backup-points
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { importPoints } = require('../src/services/importPoints');
const { readPointTransform, readPointsCsv, writeScoresBackup } = require('../src/services/pointsExcel');
const realtime = require('../src/services/realtime');

const root = path.join(__dirname, '..');
function defaultFile() {
  const cands = [process.env.POINTS_XLSX, path.join(root, 'private-data', 'excel', 'Chấm điểm.xlsx'), path.join(root, 'Chấm điểm.xlsx')].filter(Boolean);
  return cands.find((f) => fs.existsSync(f)) ?? cands[0];
}

// Sao lưu điểm hiện có (trước khi nhập), chỉ giữ 1 bản mới nhất (logic ở src/services/pointsExcel.js).
async function backupScores(db) {
  const b = await writeScoresBackup(db, root);
  console.log(`Sao lưu điểm trước khi nhập: ${b.count} điểm → private-data/backups/diem/${b.name}${b.removed ? ` (đã xóa ${b.removed} bản cũ, chỉ giữ bản mới nhất)` : ''}`);
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = path.resolve(args.find((a) => !a.startsWith('--')) ?? defaultFile());
  if (!fs.existsSync(file)) throw new Error(`Không thấy file: ${file}`);
  const t0 = Date.now();
  const isCsv = /\.csv$/i.test(file);
  const table = isCsv ? readPointsCsv(fs.readFileSync(file, 'utf8')) : await readPointTransform(file);
  console.log(`File: ${file} (sửa lần cuối ${fs.statSync(file).mtime.toLocaleString('vi-VN')})`
    + (isCsv ? '' : ` · bảng Point_Transform ${table.ref} trên sheet "${table.sheet}"`) + ` · ${table.rows.length} dòng · cột: ${table.headers.join(', ')}`);
  const db = await openDb();
  try {
    if (!dryRun) await backupScores(db);
    const { class_ids = [], ...s } = await importPoints(db, table, { dryRun, trustSource: isCsv });
    console.log(`Hợp lệ ${s.valid}/${s.points_rows} · thêm ${s.inserted} · sửa ${s.updated} · xóa ${s.deleted}${s.delete_skipped ? ' (BỎ QUA bước xóa: xóa quá nhiều — kiểm tra file)' : ''}`
      + (s.created_assignments ? ` · tạo ${s.created_assignments} cột Mini Project` : ''));
    const skip = Object.entries(s).filter(([k, v]) => k.startsWith('skipped_') && v).map(([k, v]) => `${k.slice(8)}=${v}`);
    if (skip.length) console.log(`Dòng bị bỏ qua: ${skip.join(', ')} · ví dụ: ${JSON.stringify(s.examples)}`);
    if (dryRun) { console.log('>>> CHẠY THỬ: đã hoàn tác, database không đổi.'); return; }
    await db.run('insert into sync_runs (source, ok, summary) values ($1, true, $2::jsonb)', ['excel-points', JSON.stringify(s)]);
    if (s.inserted + s.updated + s.deleted + (s.created_assignments ?? 0) > 0) {
      await realtime.publishMany(class_ids.map((classId) => ({ classId, payload: { kind: 'scores' } })));
    }
    console.log(`Xong trong ${((Date.now() - t0) / 1000).toFixed(1)} giây.`);
  } catch (e) {
    if (!dryRun) await db.run('insert into sync_runs (source, ok, error) values ($1, false, $2)', ['excel-points', String(e.message).slice(0, 300)]).catch(() => {});
    throw e;
  } finally { await db.close?.(); }
})().then(() => process.exit(0)).catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
