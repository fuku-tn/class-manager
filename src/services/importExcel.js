// Nhập file điểm danh (workbook nhiều sheet theo chương trình: BIE-8, BIE-12, BIH, EBA...) vào database.
// Cấu trúc & quy tắc: xem Documents/1-tong-quan/context.md.
//
// QUY TẮC Ô ĐIỂM DANH (chủ dự án xác nhận 2026-10-10):
//   X (hoặc x) = đi học · O = vắng có phép · ô trống = vắng.
//   Ghi chú có "trễ" ở ô X → đi trễ (vẫn tính là đi học). Tỉ lệ chuyên cần tính ở src/services/stats.js:
//   (có mặt + trễ + 0,5 × có phép) ÷ số buổi đã diễn ra.
// QUY TẮC TIỀN: không đọc bất kỳ cột liên quan đến tiền (VOUCHER*, EXPIRATION...). Chỉ đọc các cột trong
//   danh sách cho phép (isAllowedHeader); cột khác không bao giờ được đưa vào bộ nhớ.
// Idempotent: chạy lại không tạo trùng. Không ghi đè ô đã được người dùng sửa trực tiếp trên app (updated_by != null).
const ExcelJS = require('exceljs');
const { logEvents } = require('./history');

const ALLOWED_FIXED = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE ID', 'MODE', 'COURSE STATUS', 'CERTIFICATE STATUS', 'FORM'];
const ALLOWED_PATTERNS = [/^SESSION \d+$/, /^NOTE SS\d+$/, /^HOMEWORK \d+$/, /^NOTE HW\d+$/, /^CAPSTONE PROJECT$/, /^NOTE CP$/, /^PROJECT \d+$/, /^NOTE PROJECT \d+$/];
// Lớp cũ mà cột Capstone nằm ở cột khác (chủ dự án chốt 18/10/2026): BIH073 — "PROJECT 1" lúc đó tương đương Capstone Project.
const CAPSTONE_COLUMN = { BIH073: ['PROJECT 1', 'NOTE PROJECT 1'] };
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
  rows.sort((a, b) => (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0)); // thứ tự khóa cố định giữa các lớp chạy song song

  // Lớp (đã có từ sheet Course) và số buổi theo giáo trình
  const findClass = (field, value) => t.one(
    `select c.id, c.code, c.short_code, c.curriculum_id, cu.session_count from classes c left join curricula cu on cu.id = c.curriculum_id where c.${field} = $1`, [value]);
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
  summary.class_id = cls.id;
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
  const [capKey, capNote] = CAPSTONE_COLUMN[cls.short_code] ?? ['CAPSTONE PROJECT', 'NOTE CP'];
  const hasCapstone = !!col[capKey];
  const assignmentId = {};
  // BIE, BIH chỉ có HW1–HW5: cột HW6+ hoàn toàn trống thì không tạo bài (tránh cột thừa); có tick thì vẫn nhập.
  const fiveHw = ['BIE', 'BIH'].includes(String(code.split('.')[1] ?? '').toUpperCase());
  const asg = hwNos.filter((n) => !(fiveHw && n > 5 && !rows.some((x) => isX(x.get(`HOMEWORK ${n}`)))))
    .map((n) => ({ key: `HOMEWORK ${n}`, kind: 'hw', seq: n, title: `HW ${n}` }));
  if (hasCapstone) asg.push({ key: capKey, kind: 'capstone', seq: 1, title: 'Capstone Project' });
  if (asg.length) {
    const got = await t.all(
      `insert into assignments (class_id, kind, seq, title, collected)
       select $1::bigint, * from unnest($2::text[], $3::int[], $4::text[], $5::boolean[])
       on conflict (class_id, kind, seq) do update set collected = assignments.collected or excluded.collected
       returning id, kind, seq`,
      [cls.id, asg.map((a) => a.kind), asg.map((a) => a.seq), asg.map((a) => a.title), asg.map((a) => rows.some((x) => isX(x.get(a.key))))]);
    const idOf = new Map(got.map((g) => [`${g.kind}:${g.seq}`, g.id]));
    for (const a of asg) assignmentId[a.key] = idOf.get(`${a.kind}:${a.seq}`);
  }

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
    `insert into enrollments (class_id, student_id, customer_id, mode, course_status, certificate_status, form, origin)
     select $1::bigint, u.*, 'import' from unnest($2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]) as u
     on conflict (class_id, student_id) do update set
       customer_id = coalesce(excluded.customer_id, enrollments.customer_id),
       mode = coalesce(excluded.mode, enrollments.mode),
       course_status = case when excluded.course_status = 'active' then enrollments.course_status else excluded.course_status end,
       certificate_status = coalesce(excluded.certificate_status, enrollments.certificate_status),
       form = coalesce(excluded.form, enrollments.form)
     returning id, student_id, course_status, (xmax = 0) as inserted`,
    [cls.id, rows.map((x) => studentIdByCode.get(x.sid)), rows.map((x) => txt(x.get('CUSTOMER ID'))), rows.map(modeOf),
      rows.map((x) => mapCourseStatus(x.get('COURSE STATUS'))), rows.map((x) => txt(x.get('CERTIFICATE STATUS'))), rows.map((x) => txt(x.get('FORM')))]);
  const enrollmentByStudent = new Map(enrolls.map((e) => [e.student_id, e.id]));
  const rowByStudentId = new Map(rows.map((x) => [studentIdByCode.get(x.sid), x]));
  await logEvents(t, enrolls.filter((e) => e.inserted).map((e) => ({
    enrollment_id: e.id, class_id: cls.id, class_code: cls.code, student_id: e.student_id, student_code: rowByStudentId.get(e.student_id)?.sid ?? null,
    full_name: rowByStudentId.get(e.student_id) ? String(rowByStudentId.get(e.student_id).get('FULL NAME')) : null,
    event: 'enrolled', to_status: e.course_status, source: 'import',
  })));
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
  const subCols = asg.filter((a) => a.kind === 'hw').map((a) => [a.key, `NOTE HW${a.seq}`]);
  if (hasCapstone) subCols.push([capKey, capNote]);
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

// opts: { dryRun, sheets: ['BIE-8', ...], classes: ['BIH073', ...] } — mặc định: mọi sheet đang HIỆN có cột SESSION (bỏ sheet ẩn = bản cũ), mọi lớp
const CONCURRENCY = 3; // bằng số kết nối tối thiểu của pool (Vercel: 3)

// Mã lớp đầy đủ → mã ngắn: P2.BIH.P073.HY.EE.130525 → BIH073
const shortOfCode = (code) => { const p = String(code).split('.'); return p.length >= 3 ? `${p[1]}${p[2].replace(/^[A-Za-z]/, '')}`.toUpperCase() : null; };

async function importExcel(db, filePath, { dryRun = false, sheets = null, classes: onlyClasses = null } = {}) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(filePath)) await wb.xlsx.load(filePath); else await wb.xlsx.readFile(filePath); // Buffer: file tải lên từ web
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
      if (onlyClasses && !onlyClasses.includes(shortOfCode(code))) continue;   // chỉ nhập các lớp được chọn
      let g = groups.get(code);
      if (!g) { g = { code, sheet: ws.name, col: table.col, rows: [] }; groups.set(code, g); }
      if (g.sheet !== ws.name) { warnings.push(`[${ws.name}] Lớp ${code} cũng xuất hiện ở sheet ${g.sheet} — bỏ dòng ${x.r}`); continue; }
      g.rows.push(x);
    }
  }
  if (!groups.size) throw new Error('Không tìm thấy sheet điểm danh nào (cần cột STUDENT ID, COURSE ID, FULL NAME, SESSION n)');

  // Mỗi lớp một transaction riêng, chạy song song (mỗi vòng tới database mất ~50-100ms nên tuần tự rất chậm).
  // Chạy thử: mỗi transaction đều bị hoàn tác. Nhập thật: lớp nào xong là được ghi; lỗi giữa chừng thì nhập lại là an toàn.
  const ROLLBACK = Symbol('dry-run');
  const list = [...groups.values()];
  const classes = new Array(list.length);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed) {
      const i = next++;
      if (i >= list.length) return;
      try {
        classes[i] = await db.tx(async (t) => {
          const summary = await importClass(t, list[i], { warnings });
          if (dryRun) throw Object.assign(new Error('dry-run'), { [ROLLBACK]: summary });
          return summary;
        });
      } catch (e) {
        if (e[ROLLBACK]) { classes[i] = e[ROLLBACK]; continue; }
        failed = true;
        throw Object.assign(e, { message: `Lớp ${list[i].code}: ${e.message}` });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  return { classes, warnings, skipped_sheets: skippedSheets, skipped_rows: skippedRows, dry_run: dryRun };
}

module.exports = { importExcel, parseAttendanceCell, mapCourseStatus, isAllowedHeader };
