// Điểm từ danh sách FILE BÀI LÀM trên SharePoint (bảng Path · Name · Point do Power Automate xuất, vd scores_STARTTRAIN.csv).
//   Path = "Shared Documents/STARTTRAIN/<CHƯƠNG TRÌNH>/<LỚP>/<TÊN HỌC VIÊN>/[HW1/Basic/…]/<tên file>"; Point = điểm chấm cho từng FILE.
// Mỗi học viên có nhiều file cho cùng một bài (Basic + Challenge, .xlsx + .pbix…) → điểm của bài = TỔNG điểm các file, tối đa 10
// (đối chiếu với điểm Excel hiện có: tổng khớp 97% các bài; max/lần cuối chỉ khớp ~60%).
// File không có mã học viên → ghép theo (lớp, TÊN học viên đã bỏ dấu); trùng tên trong lớp thì bỏ qua và đếm.
// Sau khi ghép thì dùng lại importPoints (bí danh BIH MP3 = HW5, tạo Mini Project, giữ điểm gõ tay…), nhưng KHÔNG xóa điểm nào.
// Tên học viên, đường dẫn, tên file chỉ xử lý trong bộ nhớ, không lưu.
const { importPoints, parseHw, normalizeCourse } = require('./importPoints');

const SCORE_FILE_COLUMNS = ['PATH', 'NAME', 'POINT'];
const MAX_SCORE = 10;
const PROGRAMS = /^[A-Z]{2,5}$/;

// Bỏ dấu, hạ chữ thường, gom khoảng trắng; bỏ số thứ tự đầu ("04. ") và phần trong ngoặc cuối tên.
function normName(s) {
  return String(s ?? '').normalize('NFC').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^\s*\d+\s*[.\-)]\s*/, '').replace(/\(.*?\)\s*$/, '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Nhận diện bài từ phần đường dẫn dưới thư mục học viên (thư mục con + tên file).
const MINI_RE = /(?:mini\s*project|(?<![a-z])mp)\s*[_\-\s]?\s*0?(\d)(?!\d)/i;
const HW_RE = /(?:hw|homework|b[àa]i\s*t[ậa]p|(?<![a-z])bt)\s*[_\-\s]?\s*(?:(?:week|tu[ầa]n)\s*)?0?(\d)(?!\d)/i;
const CAPSTONE_RE = /capstone|(?<![a-z])project(?![\s_\-]*\d)|đồ\s*án/i;
function detectItem(rest) {
  const s = rest.normalize('NFC');
  const mini = MINI_RE.exec(s);
  if (mini) return { kind: 'mini', seq: Number(mini[1]) };
  const hw = HW_RE.exec(s);
  if (hw && Number(hw[1]) >= 1) return { kind: 'hw', seq: Number(hw[1]) };
  if (CAPSTONE_RE.test(s)) return { kind: 'capstone', seq: 1 };
  return null;
}
const hwLabel = (it) => (it.kind === 'capstone' ? 'Capstone Project' : it.kind === 'mini' ? `Mini Project ${it.seq}` : `HW${it.seq}`);

// table = { headers: [...], rows: [[...]] } với cột PATH/NAME/POINT (tên cột không phân biệt hoa thường). Trả các điểm đã gộp theo bài.
function parseScoreFileRows(table) {
  const h = table.headers.map((x) => String(x ?? '').trim().toUpperCase());
  const iPath = h.indexOf('PATH'), iPoint = h.indexOf('POINT');
  if (iPath < 0 || iPoint < 0) { const e = new Error('Thiếu cột Path hoặc Point trong danh sách file điểm'); e.status = 422; e.expose = true; throw e; }
  const out = { groups: new Map(), total: table.rows.length, skipped: { no_point: 0, bad_point: 0, bad_path: 0, no_item: 0 }, noItemSamples: new Set() };
  for (const row of table.rows) {
    const rawPoint = row[iPoint];
    if (rawPoint == null || String(rawPoint).trim() === '') { out.skipped.no_point++; continue; }
    const point = Number(String(rawPoint).trim().replace(',', '.'));
    if (!Number.isFinite(point) || point < 0 || point > 100) { out.skipped.bad_point++; continue; }
    const parts = String(row[iPath] ?? '').split('/').map((x) => x.trim()).filter(Boolean);
    const i = parts.findIndex((x) => x.toUpperCase() === 'STARTTRAIN');
    const [prog, cls, student, ...rest] = i >= 0 ? parts.slice(i + 1) : [];
    const short = prog && PROGRAMS.test(prog.toUpperCase()) && cls && /^[A-Za-z]{2,5}\s*0*\d{1,4}$/.test(cls) ? normalizeCourse(cls) : null;
    if (!short || !student || !rest.length) { out.skipped.bad_path++; continue; }
    const item = detectItem(rest.join('/'));
    if (!item) { out.skipped.no_item++; if (out.noItemSamples.size < 10) out.noItemSamples.add(`${short} ${rest[rest.length - 1].replace(/\.[A-Za-z0-9]{2,5}$/, '').slice(0, 40)}`.replace(student, '<HV>')); continue; }
    const key = `${short}|${normName(student)}|${item.kind}:${item.seq}`;
    const g = out.groups.get(key) ?? { short, name: normName(student), ...item, sum: 0, files: 0 };
    g.sum += point; g.files++;
    out.groups.set(key, g);
  }
  return out;
}

// Bước đọc + ghép (CHỈ ĐỌC database): trả { summary, rows (cho importPoints), details (mã học viên, bài, tổng điểm, số file) }. Dùng chung cho nhập và đối soát.
async function resolveScoreFiles(db, table, { verbose = false } = {}) {
  const parsed = parseScoreFileRows(table);
  const groups = [...parsed.groups.values()];
  const summary = {
    rows: parsed.total, skipped_no_point: parsed.skipped.no_point, skipped_bad_point: parsed.skipped.bad_point,
    skipped_bad_path: parsed.skipped.bad_path, skipped_no_item: parsed.skipped.no_item,
    scores_found: groups.length, capped_at_10: groups.filter((g) => g.sum > MAX_SCORE).length,
    unmatched_students: 0, ambiguous_students: 0, matched: 0, examples: { no_item: [...parsed.noItemSamples], unmatched: [] },
  };
  if (!groups.length) return { summary, rows: [], details: [] };
  const shorts = [...new Set(groups.map((g) => g.short))];
  const enr = await db.all(
    `select c.short_code, s.student_code, s.full_name from enrollments e
       join classes c on c.id = e.class_id join students s on s.id = e.student_id where c.short_code = any($1::text[])`, [shorts]);
  const byName = new Map();   // "LỚP|tên chuẩn hóa" -> Set(mã học viên)
  for (const e of enr) { const k = `${e.short_code}|${normName(e.full_name)}`; (byName.get(k) ?? byName.set(k, new Set()).get(k)).add(e.student_code); }
  const knownClass = new Set(enr.map((e) => e.short_code));
  const rows = []; const details = []; const missed = new Map();
  for (const g of groups) {
    const codes = byName.get(`${g.short}|${g.name}`);
    if (!codes) { if (knownClass.has(g.short)) { summary.unmatched_students++; missed.set(`${g.short}|${g.name}`, g.short); } continue; }
    if (codes.size > 1) { summary.ambiguous_students++; continue; }
    const point = Math.min(MAX_SCORE, Math.round(g.sum * 100) / 100);
    rows.push([[...codes][0], g.short, hwLabel(g), point, null]);
    details.push({ short: g.short, code: [...codes][0], kind: g.kind, seq: g.seq, point, files: g.files, capped: g.sum > MAX_SCORE });
    summary.matched++;
  }
  // Tên không ghép được: đếm theo lớp (không trả tên học viên ra ngoài); chạy tay có --verbose thì liệt kê để sửa tên.
  const perClass = {}; for (const [, c] of missed) perClass[c] = (perClass[c] ?? 0) + 1;
  summary.examples.unmatched = Object.entries(perClass).map(([c, n]) => `${c}: ${n} học viên`);
  if (verbose) summary.unmatched_names = [...missed.keys()];
  return { summary, rows, details };
}

// db: kết nối (hoặc transaction). Trả tổng kết của importPoints + số liệu ghép tên.
async function importScoreFiles(db, table, { dryRun = false, verbose = false } = {}) {
  const { summary, rows } = await resolveScoreFiles(db, table, { verbose });
  if (!rows.length) return summary;
  const imported = await importPoints(db, { headers: ['STUDENTID', 'COURSE', 'HW', 'POINT', 'MODULE'], rows }, { dryRun, source: 'sharepoint', allowDelete: false });
  return { ...summary, import: imported, class_ids: imported.class_ids };
}

module.exports = { importScoreFiles, resolveScoreFiles, parseScoreFileRows, detectItem, normName, SCORE_FILE_COLUMNS };
