// Nhập điểm từ danh sách file bài làm trên SharePoint (cột Path · Name · Point, vd scores_STARTTRAIN.csv).
// Dùng: npm run import-score-files -- <file.csv> [--dry-run] [--verbose]
//   Điểm của một bài = tổng điểm các file của học viên đó trong bài (tối đa 10); ghép theo (lớp, tên học viên). Chỉ thêm/cập nhật, KHÔNG xóa;
//   điểm gõ tay trên web được giữ nguyên. --verbose: liệt kê tên học viên không ghép được (chỉ in trên máy bạn).
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { importScoreFiles } = require('../src/services/importScoreFiles');
const { parseCsv } = require('../src/services/backup');
const realtime = require('../src/services/realtime');

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('Dùng: npm run import-score-files -- <file.csv> [--dry-run] [--verbose]'); process.exit(1); }
  const { columns, rows } = parseCsv(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  const keep = columns.filter((c) => ['PATH', 'NAME', 'POINT'].includes(c.trim().toUpperCase()));
  const db = await openDb();
  try {
    const r = await importScoreFiles(db, { headers: keep, rows: rows.map((x) => keep.map((c) => x[c])) }, { dryRun, verbose });
    const { import: imp, unmatched_names: names, class_ids, ...brief } = r;
    console.log(JSON.stringify(brief, null, 2));
    console.log('Kết quả ghi:', JSON.stringify({ ...imp, examples: undefined, class_ids: undefined }));
    if (imp.examples?.no_assignment?.length) console.log('Bài chưa có trong lớp:', imp.examples.no_assignment.join(', '));
    if (names?.length) { console.log('Tên không ghép được (lớp|tên đã bỏ dấu):'); for (const n of names) console.log('  ' + n); }
    if (dryRun) console.log('\n>>> CHẠY THỬ: đã hoàn tác, database không đổi.');
    else if (class_ids?.length) await realtime.publishMany(class_ids.map((classId) => ({ classId, payload: { kind: 'scores' } }))).catch(() => {});
  } finally { await db.close?.(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
