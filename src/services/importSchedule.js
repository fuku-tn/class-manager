// Lịch giảng dạy từ bảng "Calendar" của Google Sheet: Ngày · Buổi · Khóa · Nội dung · Số buổi · Hình thức · Loại · Ghi chú (+ Giảng viên, tùy chọn).
// Sheet là bản chuẩn: mỗi lượt đồng bộ THAY TOÀN BỘ lịch (có chốt chặn nếu Sheet bỗng ít dòng hơn hẳn). Chỉ đọc các cột trong SCHEDULE_COLUMNS.
// Không có dữ liệu học viên hay tiền. Mã khóa chuẩn hóa như điểm: "BIH98" → BIH098 (normalizeCourse).
const { normalizeCourse } = require('./importPoints');
const { normalizeSchedule, GENERATED } = require('./scheduleRules');

const SCHEDULE_COLUMNS = ['NGÀY', 'BUỔI', 'KHÓA', 'NỘI DUNG', 'SỐ BUỔI', 'HÌNH THỨC', 'LOẠI', 'GHI CHÚ', 'GIẢNG VIÊN'];
const MIN_KEEP_RATIO = 0.5;   // lượt mới ít hơn 50% số dòng đang có (khi đã có ≥ 20 dòng) → từ chối, không ghi gì
const MIN_GUARD_ROWS = 20;

const nfc = (v) => String(v ?? '').trim().normalize('NFC');
const key = (v) => nfc(v).toUpperCase().replace(/\s+/g, ' ');
const txt = (v, max) => { const s = nfc(v); return s ? s.slice(0, max) : null; };

// "S" / "Sáng" → morning · "C" / "Chiều" → afternoon · "T" / "Tối" → evening · "Cả ngày" / "SC" / "N" → full_day
function parseShift(raw) {
  const s = key(raw);
  if (!s) return null;
  if (['S', 'SÁNG', 'SANG', 'MORNING'].includes(s)) return 'morning';
  if (['C', 'CHIỀU', 'CHIEU', 'AFTERNOON'].includes(s)) return 'afternoon';
  if (['T', 'TỐI', 'TOI', 'EVENING'].includes(s)) return 'evening';
  if (['CẢ NGÀY', 'CA NGAY', 'SC', 'N', 'FULL DAY', 'FULL_DAY'].includes(s)) return 'full_day';
  return null;
}
// yyyy-mm-dd (Apps Script đã đổi) hoặc dd/mm/yyyy; ngày không có thật thì null
function parseDate(raw) {
  const s = nfc(raw);
  let y; let m; let d;
  let mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; } else if ((mt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

function parseScheduleRows(table) {
  const idx = Object.fromEntries(SCHEDULE_COLUMNS.map((c) => [c, (table.headers ?? []).findIndex((h) => key(h) === c)]));
  if (idx['NGÀY'] < 0 || idx['KHÓA'] < 0) {
    const e = new Error('Thiếu cột trong bảng Calendar (cần ít nhất Ngày và Khóa)'); e.status = 422; e.expose = true; throw e;
  }
  const get = (r, c) => (idx[c] >= 0 ? r[idx[c]] : null);
  const out = { rows: [], total: 0, skipped: { bad_date: 0, no_course: 0 }, examples: { bad_date: new Set(), no_course: new Set() } };
  const seen = new Set();
  for (const r of table.rows ?? []) {
    if (!Array.isArray(r)) continue;
    if (r.every((v) => v == null || nfc(v) === '')) continue;   // dòng trống
    out.total++;
    const date = parseDate(get(r, 'NGÀY'));
    if (!date) { out.skipped.bad_date++; if (out.examples.bad_date.size < 5) out.examples.bad_date.add(nfc(get(r, 'NGÀY')).slice(0, 20) || '(trống)'); continue; }
    const short = normalizeCourse(get(r, 'KHÓA'));
    if (!short || !/^[A-Z]{2,5}\d{2,4}$/.test(short)) { out.skipped.no_course++; if (out.examples.no_course.size < 5) out.examples.no_course.add(nfc(get(r, 'KHÓA')).slice(0, 20) || '(trống)'); continue; }
    const no = Number.parseInt(nfc(get(r, 'SỐ BUỔI')), 10);
    const row = {
      short, date, shift: parseShift(get(r, 'BUỔI')), session_no: Number.isInteger(no) && no > 0 && no < 100 ? no : null,
      content: txt(get(r, 'NỘI DUNG'), 200), mode: txt(get(r, 'HÌNH THỨC'), 20), segment: txt(get(r, 'LOẠI'), 10),
      note: txt(get(r, 'GHI CHÚ'), 100), instructor: txt(get(r, 'GIẢNG VIÊN'), 80),
    };
    const k = `${row.short}|${row.date}|${row.session_no ?? ''}|${row.shift ?? ''}`;
    if (seen.has(k)) continue;   // trùng hẳn một dòng: bỏ
    seen.add(k);
    out.rows.push(row);
  }
  return out;
}

async function importSchedule(db, table, { dryRun = false } = {}) {
  const parsed = parseScheduleRows(table);
  const summary = {
    rows: parsed.total, valid: parsed.rows.length, skipped_bad_date: parsed.skipped.bad_date, skipped_no_course: parsed.skipped.no_course,
    unknown_class: 0, inserted: 0, removed: 0, replaced: false, class_ids: [],
    examples: { bad_date: [...parsed.examples.bad_date], no_course: [...parsed.examples.no_course], unknown_class: [] },
  };
  const ROLLBACK = Symbol('rollback');
  try {
    await db.tx(async (t) => {
      const before = (await t.one("select count(*)::int as n from teaching_schedule where content is distinct from $1", [GENERATED])).n;   // chốt chặn chỉ đếm dòng từ Sheet, không đếm dòng tự sinh
      if (before >= MIN_GUARD_ROWS && parsed.rows.length < before * MIN_KEEP_RATIO) {
        const e = new Error(`Lịch mới chỉ có ${parsed.rows.length} dòng hợp lệ so với ${before} dòng đang có — nghi Sheet lỗi, không cập nhật`);
        e.status = 409; e.expose = true; throw e;
      }
      const shorts = [...new Set(parsed.rows.map((r) => r.short))];
      const classes = shorts.length ? await t.all('select id, short_code from classes where short_code = any($1::text[])', [shorts]) : [];
      const classId = new Map(classes.map((c) => [c.short_code, c.id]));
      const unknown = new Set();
      for (const r of parsed.rows) { r.class_id = classId.get(r.short) ?? null; if (!r.class_id) unknown.add(r.short); }
      summary.unknown_class = unknown.size;
      summary.examples.unknown_class = [...unknown].slice(0, 10);
      summary.class_ids = [...new Set(parsed.rows.map((r) => r.class_id).filter(Boolean))];
      summary.removed = before;
      await t.run('delete from teaching_schedule');
      if (parsed.rows.length) {
        const col = (f) => parsed.rows.map(f);
        await t.run(
          `insert into teaching_schedule (class_id, short_code, session_date, shift, session_no, content, mode, segment, note, instructor)
           select * from unnest($1::bigint[], $2::text[], $3::date[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])`,
          [col((r) => r.class_id), col((r) => r.short), col((r) => r.date), col((r) => r.shift), col((r) => r.session_no),
            col((r) => r.content), col((r) => r.mode), col((r) => r.segment), col((r) => r.note), col((r) => r.instructor)]);
      }
      Object.assign(summary, await normalizeSchedule(t));
      summary.inserted = parsed.rows.length;
      summary.replaced = true;
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return summary;
}

module.exports = { importSchedule, parseScheduleRows, parseShift, parseDate, SCHEDULE_COLUMNS };
