// Đọc điểm HW từ file Excel "Chấm điểm.xlsx", bảng (Excel Table) "Point_Transform".
// Chỉ lấy đúng các cột cho phép POINT_SYNC_COLUMNS (StudentID, Course, HW, Point, Module) theo tên tiêu đề —
// KHÔNG đọc cột "Họ và tên" hay bảng/sheet khác (StudentProfile…). Ô công thức lấy giá trị đã tính (Excel lưu sẵn).
// Kết quả { headers, rows } đưa thẳng vào importPoints() (cùng bộ ghép/chốt chặn như đồng bộ Sheet trước đây).
const { POINT_SYNC_COLUMNS } = require('./importPoints');

const TABLE_NAME = 'Point_Transform';

const norm = (v) => String(v ?? '').trim().normalize('NFC').toUpperCase().replace(/\s+/g, ' ');
function cellValue(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) return v.result === undefined || (v.result && typeof v.result === 'object' && v.result.error) ? null : v.result;
    if ('formula' in v || 'sharedFormula' in v) return null;   // công thức chưa có giá trị lưu sẵn
    if (v.richText) return v.richText.map((x) => x.text).join('');
    if (v.text != null) return v.text;
    if (v.error) return null;
    return null;
  }
  return v === '' ? null : v;
}
// "A1:F1213" -> { c1: 1, r1: 1, c2: 6, r2: 1213 }
function parseRef(ref) {
  const m = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(String(ref ?? '').trim());
  if (!m) return null;
  const col = (s) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { c1: col(m[1]), r1: Number(m[2]), c2: col(m[3]), r2: Number(m[4]) };
}

async function readPointTransform(file, { tableName = TABLE_NAME } = {}) {
  const ExcelJS = require('exceljs');   // nạp lười
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(file)) await wb.xlsx.load(file); else await wb.xlsx.readFile(file);
  let ws = null; let ref = null;
  for (const sheet of wb.worksheets) {
    for (const [name, t] of Object.entries(sheet.tables ?? {})) {
      if (name.toLowerCase() !== tableName.toLowerCase()) continue;
      ws = sheet; ref = (t.table ?? t).ref ?? (t.table ?? t).tableRef;
    }
  }
  if (!ws) {
    const e = new Error(`Không thấy bảng "${tableName}" trong file Excel`); e.status = 422; e.expose = true; throw e;
  }
  const box = parseRef(ref);
  if (!box) { const e = new Error(`Bảng "${tableName}" có vùng không đọc được (${ref})`); e.status = 422; e.expose = true; throw e; }
  const cols = [];
  for (let c = box.c1; c <= box.c2; c++) {
    const name = norm(cellValue(ws.getRow(box.r1).getCell(c).value));
    if (POINT_SYNC_COLUMNS.includes(name) && !cols.some((x) => x.name === name)) cols.push({ name, c });
  }
  const rows = [];
  for (let r = box.r1 + 1; r <= box.r2; r++) {
    const row = ws.getRow(r);
    const vals = cols.map(({ c }) => cellValue(row.getCell(c).value));
    if (vals.some((v) => v != null)) rows.push(vals);
  }
  return { headers: cols.map((x) => x.name), rows, sheet: ws.name, ref };
}

// Ảnh chụp toàn bộ điểm hiện có trong database, cùng 5 cột như Point_Transform (StudentID, Course, HW, Point, Module) —
// dùng làm bản sao lưu trước mỗi lần nhập; nạp lại được bằng chính importPoints (npm run import-points -- <file.csv>).
async function snapshotScores(db) {
  const rows = await db.all(
    `select s.student_code, c.short_code, a.kind, a.seq, hs.score::float8 as score, hs.module
       from homework_scores hs
       join enrollments e on e.id = hs.enrollment_id join students s on s.id = e.student_id
       join classes c on c.id = e.class_id join assignments a on a.id = hs.assignment_id
      order by c.short_code, s.student_code, case a.kind when 'hw' then 0 when 'mini' then 1 else 2 end, a.seq`);
  const label = (r) => (r.kind === 'capstone' ? 'Capstone Project' : r.kind === 'mini' ? `Mini Project ${r.seq}` : `HW${r.seq}`);
  return { headers: [...POINT_SYNC_COLUMNS.slice(0, 5)], rows: rows.map((r) => [r.student_code, r.short_code, label(r), r.score, r.module]) };
}

// Đọc bản sao lưu CSV (hoặc CSV bất kỳ có các cột trên) thành { headers, rows } cho importPoints; chỉ giữ cột cho phép.
function readPointsCsv(text) {
  const { parseCsv } = require('./backup');
  const { columns, rows } = parseCsv(text);
  const keep = columns.map((c) => ({ c, name: norm(c) })).filter((x, i, arr) => POINT_SYNC_COLUMNS.includes(x.name) && arr.findIndex((y) => y.name === x.name) === i);
  return { headers: keep.map((x) => x.name), rows: rows.map((r) => keep.map((x) => r[x.c])) };
}

module.exports = { readPointTransform, snapshotScores, readPointsCsv, TABLE_NAME, parseRef, cellValue };
