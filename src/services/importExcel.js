// Nhập file điểm danh (workbook nhiều sheet theo chương trình: BIE-8, BIE-12, BIH, EBA...) vào database.
// Cấu trúc & quy tắc: xem Documents/context.md.
//
// QUY TẮC Ô ĐIỂM DANH (chủ dự án xác nhận 2026-10-10):
//   X (hoặc x) = đi học · O = vắng có phép · ô trống = vắng.
//   Ghi chú có "trễ" ở ô X → đi trễ (vẫn tính là đi học). Tỉ lệ chuyên cần tính ở src/services/stats.js:
//   (có mặt + trễ) ÷ (số buổi đã diễn ra − số buổi có phép).
// QUY TẮC TIỀN: không đọc bất kỳ cột liên quan đến tiền (VOUCHER*, EXPIRATION...). Chỉ đọc các cột trong
//   danh sách cho phép (isAllowedHeader); cột khác không bao giờ được đưa vào bộ nhớ.
// Idempotent: chạy lại không tạo trùng. Không ghi đè ô đã được người dùng sửa trực tiếp trên app (updated_by != null).
const ExcelJS = require('exceljs');

const ALLOWED_FIXED = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE ID', 'MODE', 'COURSE STATUS', 'CERTIFICATE STATUS', 'FORM'];
const ALLOWED_PATTERNS = [/^SESSION \d+$/, /^NOTE SS\d+$/, /^HOMEWORK \d+$/, /^NOTE HW\d+$/, /^CAPSTONE PROJECT$/, /^NOTE CP$/];
const isAllowedHeader = (k) => ALLOWED_FIXED.includes(k) || ALLOWED_PATTERNS.some((re) => re.test(k));
const STUDENT_ID_RE = /^[A-Za-z]\.\d+$/; // P.13027, B.00312

function cellValue(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
  }
  if (typeof v === 'string') v = v.trim();
  return v === '' || v === undefined ? null : v;
}

const txt = (v) => (v == null || v === '' ? null : String(v).trim() || null);
const normKey = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

function normalizePhone(v) {
  if (v == null) return null;
  const digits = String(v).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 9 ? `0${digits}` : digits; // Excel làm mất số 0 đầu
}

function mapCourseStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'deferred') return 'deferred';
  if (['dropped', 'drop', 'canceled', 'cancelled'].includes(s)) return 'dropped';
  if (s === 'completed') return 'completed';
  return 'active';
}

// Giá trị ô điểm danh → { mark: 'present'|'excused'|'absent'|'unknown' }
function parseAttendanceCell(raw) {
  if (raw == null) return { mark: 'absent' };
  const s = String(raw).trim().toUpperCase();
  if (s === '') return { mark: 'absent' };
  if (s === 'X') return { mark: 'present' };
  if (s === 'O') return { mark: 'excused' };
  if (/^X([\s]+X)+$/.test(s)) return { mark: 'present' };            // vd "X\nX": gõ thừa dấu X, coi là một X
  return { mark: 'unknown' };                                           // chữ khác → vắng, kèm cảnh báo
}
const isX = (raw) => parseAttendanceCell(raw).mark === 'present';

// Đọc một sheet, CHỈ các cột cho phép. Trả null nếu không phải sheet điểm danh.
function readSheet(ws) {
  let headerRow = 0;
  const col = {};
  for (let r = 1; r <= 12 && !headerRow; r++) {
    const tmp = {};
    ws.getRow(r).eachCell((cell, n) => {
      const key = normKey(cellValue(cell));
      if (key && isAllowedHeader(key) && !(key in tmp)) tmp[key] = n;
    });
    if (tmp['STUDENT ID'] && tmp['COURSE ID'] && tmp['FULL NAME']) { headerRow = r; Object.assign(col, tmp); }
  }
  if (!headerRow) return null;
  if (!Object.keys(col).some((k) => /^SESSION \d+$/.test(k))) return null; // vd sheet "List of Students"

  const rows = [];
  let skippedRows = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sid = txt(cellValue(row.getCell(col['STUDENT ID'])));
    if (!sid) continue;
    if (!STUDENT_ID_RE.test(sid)) { skippedRows++; continue; } // dòng tổng/ghi chú
    const get = (name) => (col[name] ? cellValue(row.getCell(col[name])) : null);
    rows.push({ r, sid, get });
  }
  return { col, rows, headerRow, skippedRows };
}

async function importClass(t, { code, sheet, col, rows: allRows }, ctx) {
  const warn = (m) => ctx.warnings.push(`[${sheet} · ${code}] ${m}`);
  const summary = {
    sheet, class_code: code, students: 0, new_students: 0, new_class: false, curriculum_changed: false, sessions_held: 0,
    present: 0, late: 0, excused: 0, absent: 0, submissions: 0, kept_from_app: 0, sessions_created: 0,
  };

  // Trùng STUDENT ID trong cùng lớp: lấy dòng cuối.
  const byId = new Map();
  for (const x of allRows) {
    if (byId.has(x.sid)) warn(`Dòng ${x.r}: STUDENT ID ${x.sid} bị trùng, lấy dòng này thay dòng ${byId.get(x.sid).r}`);
    byId.set(x.sid, x);
  }
  const rows = [];
  for (const x of byId.values()) {
    if (!x.get('FULL NAME')) { warn(`Dòng ${x.r}: thiếu họ tên, bỏ qua`); continue; }
    rows.push(x);
  }

  // Lớp (đã có từ sheet Course) và số buổi theo giáo trình
  const findClass = (field, value) => t.one(
    `select c.id, c.code, c.curriculum_id, cu.session_count from classes c left join curricula cu on cu.id = c.curriculum_id where c.${field} = $1`, [value]);
  let cls = await findClass('code', code);
  if (!cls) {
    // Mã đầy đủ lệch (vd P088 ↔ B088): khớp theo mã ngắn BIE088
    const parts = code.split('.');
    const short = parts.length >= 3 ? `${parts[1]}${parts[2].replace(/^[A-Za-z]/, '')}`.toUpperCase() : null;
    cls = short ? await findClass('short_code', short) : null;
    if (cls) warn(`Mã lớp trong file khác danh sách lớp (${cls.code}) — dùng lớp đã có`);
  }
  if (!cls) {
    const created = await t.one('insert into classes (code, name) values ($1, $1) returning id, code', [code]);
    cls = { id: created.id, code: created.code, curriculum_id: null, session_count: null };
    summary.new_class = true;
    warn('Lớp chưa có trong danh sách lớp (sheet Course) — đã tạo mới');
  }
  // Tên sheet trùng mã giáo trình (BIE-8, BIE-12): đó là mẫu thật của lớp, ưu tiên hơn mẫu mặc định
  const sheetCur = await t.one('select id, session_count from curricula where code = $1', [sheet.trim().toUpperCase()]);
  if (sheetCur && cls.curriculum_id !== sheetCur.id) {
    await t.run('update classes set curriculum_id = $1 where id = $2', [sheetCur.id, cls.id]);
    cls.curriculum_id = sheetCur.id; cls.session_count = sheetCur.session_count;
    summary.curriculum_changed = true;
  }
  const columnNos = Object.keys(col).map((k) => /^SESSION (\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  const maxSessions = cls.session_count ?? Math.max(...columnNos);
  const sessionNos = columnNos.filter((n) => n <= maxSessions);
  for (const n of columnNos.filter((n) => n > maxSessions)) {
    if (rows.some((x) => x.get(`SESSION ${n}`) != null)) warn(`Có dữ liệu ở SESSION ${n} nhưng giáo trình chỉ có ${maxSessions} buổi — bỏ qua cột này`);
  }

  // Ô lạ + ô nhiều X: cảnh báo
  for (const x of rows) for (const n of sessionNos) {
    const p = parseAttendanceCell(x.get(`SESSION ${n}`));
    if (p.mark === 'unknown') warn(`Dòng ${x.r}, SESSION ${n}: giá trị "${String(x.get(`SESSION ${n}`)).replace(/\n/g, '⏎')}" không phải X/O — tính là vắng`);
  }

  // Buổi nào có ít nhất 1 dấu X hoặc O mới coi là đã diễn ra
  const held = (n) => rows.some((x) => ['present', 'excused'].includes(parseAttendanceCell(x.get(`SESSION ${n}`)).mark));
  const heldNos = sessionNos.filter(held);
  summary.sessions_held = heldNos.length;

  // Buổi học: đủ 1..maxSessions, không đổi tên buổi đã có
  const before = (await t.one('select count(*)::int n from sessions where class_id = $1', [cls.id])).n;
  await t.run(`insert into sessions (class_id, session_no, title)
               select $1::bigint, n, 'Buổi ' || n from generate_series(1, $2::int) n on conflict (class_id, session_no) do nothing`, [cls.id, maxSessions]);
  summary.sessions_created = (await t.one('select count(*)::int n from sessions where class_id = $1', [cls.id])).n - before;
  if (cls.curriculum_id) await t.run(
    `update sessions s set title = 'Buổi ' || s.session_no || ' — ' || m.mods
     from (select session_no, string_agg(module, ' + ' order by first_seq) as mods
           from (select session_no, module, min(seq) as first_seq from curriculum_items
                 where curriculum_id = $2 and module is not null group by session_no, module) q
           group by session_no) m
     where s.class_id = $1 and s.session_no = m.session_no and (s.title is null or s.title ~ '^Buổi [0-9]+( —.*)?$')`,
    [cls.id, cls.curriculum_id]);
  if (heldNos.length) await t.run('update sessions set held = true where class_id = $1 and session_no = any($2::int[])', [cls.id, heldNos]);
  const sessionId = new Map((await t.all('select id, session_no from sessions where class_id = $1', [cls.id])).map((s) => [s.session_no, s.id]));

  // Bài tập
  const hwNos = Object.keys(col).map((k) => /^HOMEWORK (\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  const hasCapstone = !!col['CAPSTONE PROJECT'];
  const assignmentId = {};
  const ensureAssignment = async (kind, seq, title, markName) => {
    const collected = rows.some((x) => isX(x.get(markName)));
    const a = await t.one(
      `insert into assignments (class_id, kind, seq, title, collected) values ($1, $2, $3, $4, $5)
       on conflict (class_id, kind, seq) do update set collected = assignments.collected or excluded.collected returning id`,
      [cls.id, kind, seq, title, collected]);
    return a.id;
  };
  for (const n of hwNos) assignmentId[`HOMEWORK ${n}`] = await ensureAssignment('hw', n, `HW ${n}`, `HOMEWORK ${n}`);
  if (hasCapstone) assignmentId['CAPSTONE PROJECT'] = await ensureAssignment('capstone', 1, 'Capstone Project', 'CAPSTONE PROJECT');

  // Học viên (không ghi đè dữ liệu có sẵn bằng ô trống)
  const existing = new Set((await t.all('select student_code from students where student_code = any($1::text[])', [rows.map((x) => x.sid)])).map((r) => r.student_code));
  summary.new_students = rows.filter((x) => !existing.has(x.sid)).length;
  const students = await t.all(
    `insert into students (student_code, full_name, email, phone)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])
     on conflict (student_code) do update set full_name = excluded.full_name,
       email = coalesce(excluded.email, students.email), phone = coalesce(excluded.phone, students.phone)
     returning id, student_code`,
    [rows.map((x) => x.sid), rows.map((x) => String(x.get('FULL NAME'))), rows.map((x) => txt(x.get('EMAIL'))?.toLowerCase() ?? null),
      rows.map((x) => normalizePhone(x.get('PHONE')))]);
  const studentIdByCode = new Map(students.map((s) => [s.student_code, s.id]));

  // Ghi danh: không hạ trạng thái đã có ("nghỉ", "bảo lưu"...) về "đang học" chỉ vì ô trạng thái trống
  const modeOf = (x) => {
    const raw = String(x.get('MODE') || '').trim().toLowerCase();
    const m = ['online', 'offline', 'hybrid'].find((v) => v === raw);
    if (x.get('MODE') && !m) warn(`Dòng ${x.r}: MODE "${x.get('MODE')}" không hợp lệ, để trống`);
    return m ? m[0].toUpperCase() + m.slice(1) : null;
  };
  const enrolls = await t.all(
    `insert into enrollments (class_id, student_id, customer_id, mode, course_status, certificate_status, form)
     select $1::bigint, * from unnest($2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
     on conflict (class_id, student_id) do update set
       customer_id = coalesce(excluded.customer_id, enrollments.customer_id),
       mode = coalesce(excluded.mode, enrollments.mode),
       course_status = case when excluded.course_status = 'active' then enrollments.course_status else excluded.course_status end,
       certificate_status = coalesce(excluded.certificate_status, enrollments.certificate_status),
       form = coalesce(excluded.form, enrollments.form)
     returning id, student_id`,
    [cls.id, rows.map((x) => studentIdByCode.get(x.sid)), rows.map((x) => txt(x.get('CUSTOMER ID'))), rows.map(modeOf),
      rows.map((x) => mapCourseStatus(x.get('COURSE STATUS'))), rows.map((x) => txt(x.get('CERTIFICATE STATUS'))), rows.map((x) => txt(x.get('FORM')))]);
  const enrollmentByStudent = new Map(enrolls.map((e) => [e.student_id, e.id]));
  const enrollmentOf = (x) => enrollmentByStudent.get(studentIdByCode.get(x.sid));

  // Điểm danh
  const att = { e: [], s: [], status: [], note: [] };
  for (const x of rows) for (const n of heldNos) {
    const note = txt(x.get(`NOTE SS${n}`));
    const { mark } = parseAttendanceCell(x.get(`SESSION ${n}`));
    let status = 'absent';
    if (mark === 'present') status = note && /trễ/i.test(note) ? 'late' : 'present';
    else if (mark === 'excused') status = 'excused';
    att.e.push(enrollmentOf(x)); att.s.push(sessionId.get(n)); att.status.push(status); att.note.push(note);
    summary[status] += 1;
  }
  if (att.e.length) {
    // Ô đã được người dùng sửa trực tiếp trên app: giữ nguyên, chỉ đếm để báo cáo
    const kept = await t.all(
      `select enrollment_id, session_id, status from attendance where session_id = any($1::bigint[]) and updated_by is not null`, [[...new Set(att.s)]]);
    const want = new Map(att.e.map((e, i) => [`${e}:${att.s[i]}`, att.status[i]]));
    summary.kept_from_app = kept.filter((k) => want.has(`${k.enrollment_id}:${k.session_id}`) && want.get(`${k.enrollment_id}:${k.session_id}`) !== k.status).length;
    await t.run(
      `insert into attendance (enrollment_id, session_id, status, note)
       select * from unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[])
       on conflict (enrollment_id, session_id) do update set status = excluded.status, note = excluded.note, updated_at = now()
         where attendance.updated_by is null`,
      [att.e, att.s, att.status, att.note]);
  }

  // Bài tập (X = đã nộp, trống = thiếu; chỉ tính bài đã có người nộp)
  const sub = { e: [], a: [], status: [], challenge: [], note: [] };
  const subCols = hwNos.map((n) => [`HOMEWORK ${n}`, `NOTE HW${n}`]);
  if (hasCapstone) subCols.push(['CAPSTONE PROJECT', 'NOTE CP']);
  for (const [valName, noteName] of subCols) {
    if (!rows.some((x) => isX(x.get(valName)))) continue;
    for (const x of rows) {
      const note = txt(x.get(noteName));
      sub.e.push(enrollmentOf(x)); sub.a.push(assignmentId[valName]); sub.note.push(note);
      sub.status.push(isX(x.get(valName)) ? 'submitted' : 'missing');
      sub.challenge.push(!!(note && /challenge/i.test(note) && !/chưa/i.test(note)));
    }
  }
  if (sub.e.length) {
    await t.run(
      `insert into submissions (enrollment_id, assignment_id, status, challenge, note)
       select * from unnest($1::bigint[], $2::bigint[], $3::text[], $4::boolean[], $5::text[])
       on conflict (enrollment_id, assignment_id) do update set status = excluded.status, challenge = excluded.challenge,
         note = excluded.note, updated_at = now()
         where submissions.updated_by is null`,
      [sub.e, sub.a, sub.status, sub.challenge, sub.note]);
  }
  summary.submissions = sub.e.length;
  summary.students = rows.length;
  return summary;
}

// opts: { dryRun, sheets: ['BIE-8', ...] } — mặc định: mọi sheet đang HIỆN có cột SESSION (bỏ sheet ẩn = bản cũ)
async function importExcel(db, filePath, { dryRun = false, sheets = null } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const warnings = [];
  const skippedSheets = [];
  const groups = new Map(); // mã lớp -> { code, sheet, col, rows }
  let skippedRows = 0;

  for (const ws of wb.worksheets) {
    const chosen = sheets ? sheets.includes(ws.name) : ws.state === 'visible';
    if (!chosen) { skippedSheets.push(`${ws.name}${ws.state !== 'visible' ? ' (ẩn)' : ''}`); continue; }
    const table = readSheet(ws);
    if (!table) { skippedSheets.push(`${ws.name} (không phải sheet điểm danh)`); continue; }
    skippedRows += table.skippedRows;
    for (const x of table.rows) {
      const code = txt(x.get('COURSE ID'));
      if (!code) { warnings.push(`[${ws.name}] Dòng ${x.r}: thiếu COURSE ID, bỏ qua`); continue; }
      let g = groups.get(code);
      if (!g) { g = { code, sheet: ws.name, col: table.col, rows: [] }; groups.set(code, g); }
      if (g.sheet !== ws.name) { warnings.push(`[${ws.name}] Lớp ${code} cũng xuất hiện ở sheet ${g.sheet} — bỏ dòng ${x.r}`); continue; }
      g.rows.push(x);
    }
  }
  if (!groups.size) throw new Error('Không tìm thấy sheet điểm danh nào (cần cột STUDENT ID, COURSE ID, FULL NAME, SESSION n)');

  const ROLLBACK = Symbol('dry-run');
  const classes = [];
  try {
    await db.tx(async (t) => {
      for (const g of groups.values()) classes.push(await importClass(t, g, { warnings }));
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return { classes, warnings, skipped_sheets: skippedSheets, skipped_rows: skippedRows, dry_run: dryRun };
}

module.exports = { importExcel, parseAttendanceCell, mapCourseStatus, isAllowedHeader };
