// Nhập danh sách học viên từ file Excel (cấu trúc xem Documents/context.md, mục "File Excel mẫu").
// Idempotent: chạy lại nhiều lần không tạo trùng; ghi đè điểm danh/bài tập theo file.
const ExcelJS = require('exceljs');

const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;

// Chủ đề từng buổi (dòng 3 trong file mẫu): Buổi 1-3, 4-5, 6-8.
const DEFAULT_SESSION_TITLES = {
  1: 'Data Transformation', 2: 'Data Transformation', 3: 'Data Transformation',
  4: 'Data Storytelling & Data Model', 5: 'Data Storytelling & Data Model',
  6: 'Data Visualization', 7: 'Data Visualization', 8: 'Data Visualization',
};

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

const isoDate = (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null);
const isMark = (v) => typeof v === 'string' && v.toLowerCase() === 'x';

function normalizePhone(v) {
  if (v == null) return null;
  const digits = String(v).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 9 ? `0${digits}` : digits; // Excel làm mất số 0 đầu
}

function mapCourseStatus(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'deferred') return 'deferred';
  if (s === 'dropped' || s === 'drop') return 'dropped';
  if (s === 'completed') return 'completed';
  return 'active';
}

async function readSheet(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File Excel không có sheet nào');

  // Map tên cột (chuẩn hóa) -> số cột.
  const col = {};
  ws.getRow(HEADER_ROW).eachCell((cell, n) => {
    const key = String(cellValue(cell) ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (key) col[key] = n;
  });
  for (const required of ['STUDENT ID', 'FULL NAME', 'COURSE ID'])
    if (!col[required]) throw new Error(`Thiếu cột bắt buộc "${required}" ở dòng ${HEADER_ROW}`);

  const rows = [];
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (name) => (col[name] ? cellValue(row.getCell(col[name])) : null);
    const studentCode = get('STUDENT ID');
    if (!studentCode) continue;
    rows.push({ r, get });
  }
  return { col, rows };
}

const isoOrNull = (v) => isoDate(v);
const txt = (v) => (v == null || v === '' ? null : String(v));

// Nhập các dòng của MỘT lớp (đã lọc theo COURSE ID). Dùng insert hàng loạt (unnest) để ít vòng gọi mạng tới Supabase.
async function importClass(db, col, allRows, code, warnings) {
  const sessionNos = Object.keys(col).map((k) => /^SESSION (\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  const hwNos = Object.keys(col).map((k) => /^HOMEWORK (\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  const hasCapstone = !!col['CAPSTONE PROJECT'];

  // Trùng STUDENT ID trong cùng lớp: lấy dòng cuối, báo cảnh báo.
  const byCode = new Map();
  for (const x of allRows) {
    const c = String(x.get('STUDENT ID')).trim();
    if (byCode.has(c)) warnings.push(`[${code}] Dòng ${x.r}: STUDENT ID ${c} bị trùng, lấy dòng này thay dòng ${byCode.get(c).r}`);
    byCode.set(c, x);
  }
  const rows = [];
  for (const [c, x] of byCode) {
    if (!x.get('FULL NAME')) { warnings.push(`[${code}] Dòng ${x.r}: thiếu họ tên, bỏ qua`); continue; }
    rows.push({ ...x, studentCode: c });
  }

  // Giá trị lạ (khác X/trống) ở ô buổi/bài: coi như không có mặt/không nộp, nhưng báo để người dùng biết.
  const markNames = [...sessionNos.map((n) => `SESSION ${n}`), ...hwNos.map((n) => `HOMEWORK ${n}`), ...(hasCapstone ? ['CAPSTONE PROJECT'] : [])];
  for (const x of rows) for (const name of markNames) {
    const v = x.get(name);
    if (v != null && !isMark(v)) warnings.push(`[${code}] Dòng ${x.r}, ${name}: giá trị "${v}" không phải X — tính là vắng/thiếu`);
  }

  // Buổi/bài nào có ít nhất 1 dấu X mới coi là đã diễn ra/đã thu.
  const anyMark = (name) => rows.some((x) => isMark(x.get(name)));
  const summary = { class_code: code, students: 0, new_students: 0, attendance: 0, submissions: 0 };

  await db.tx(async (t) => {
    const cls = await t.one(
      'insert into classes (code, name) values ($1, $1) on conflict (code) do update set code = excluded.code returning id', [code]);

    // Buổi học
    const sessionId = {};
    for (const n of sessionNos) {
      const title = DEFAULT_SESSION_TITLES[n] ? `Buổi ${n} — ${DEFAULT_SESSION_TITLES[n]}` : `Buổi ${n}`;
      const s = await t.one(
        `insert into sessions (class_id, session_no, title, held) values ($1, $2, $3, $4)
         on conflict (class_id, session_no) do update set held = sessions.held or excluded.held returning id`,
        [cls.id, n, title, anyMark(`SESSION ${n}`)]);
      sessionId[n] = s.id;
    }

    // Bài tập
    const assignmentId = {};
    const ensureAssignment = async (kind, seq, title, markName) => {
      const a = await t.one(
        `insert into assignments (class_id, kind, seq, title, collected) values ($1, $2, $3, $4, $5)
         on conflict (class_id, kind, seq) do update set collected = assignments.collected or excluded.collected returning id`,
        [cls.id, kind, seq, title, anyMark(markName)]);
      return a.id;
    };
    for (const n of hwNos) assignmentId[`HOMEWORK ${n}`] = await ensureAssignment('hw', n, `HW ${n}`, `HOMEWORK ${n}`);
    if (hasCapstone) assignmentId['CAPSTONE PROJECT'] = await ensureAssignment('capstone', 1, 'Capstone Project', 'CAPSTONE PROJECT');

    // Học viên (người)
    const existing = new Set((await t.all('select student_code from students where student_code = any($1::text[])', [rows.map((x) => x.studentCode)]))
      .map((r) => r.student_code));
    summary.new_students = rows.filter((x) => !existing.has(x.studentCode)).length;
    const students = await t.all(
      `insert into students (student_code, full_name, email, phone)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])
       on conflict (student_code) do update set full_name = excluded.full_name, email = excluded.email, phone = excluded.phone
       returning id, student_code`,
      [rows.map((x) => x.studentCode), rows.map((x) => String(x.get('FULL NAME'))), rows.map((x) => txt(x.get('EMAIL'))), rows.map((x) => normalizePhone(x.get('PHONE')))]);
    const studentIdByCode = new Map(students.map((s) => [s.student_code, s.id]));

    // Ghi danh
    const modeOf = (x) => {
      const raw = String(x.get('MODE') || '').trim().toLowerCase();
      const m = ['online', 'offline', 'hybrid'].find((v) => v === raw);
      if (x.get('MODE') && !m) warnings.push(`[${code}] Dòng ${x.r}: MODE "${x.get('MODE')}" không hợp lệ, để trống`);
      return m ? m[0].toUpperCase() + m.slice(1) : null;
    };
    const enrolls = await t.all(
      `insert into enrollments (class_id, student_id, customer_id, mode, course_status, certificate_status, form)
       select $1::bigint, * from unnest($2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
       on conflict (class_id, student_id) do update set customer_id = excluded.customer_id, mode = excluded.mode,
         course_status = excluded.course_status, certificate_status = excluded.certificate_status, form = excluded.form
       returning id, student_id`,
      [cls.id, rows.map((x) => studentIdByCode.get(x.studentCode)), rows.map((x) => txt(x.get('CUSTOMER ID'))), rows.map(modeOf),
        rows.map((x) => mapCourseStatus(x.get('COURSE STATUS'))), rows.map((x) => txt(x.get('CERTIFICATE STATUS'))), rows.map((x) => txt(x.get('FORM')))]);
    const enrollmentByStudent = new Map(enrolls.map((e) => [e.student_id, e.id]));
    const enrollmentOf = (x) => enrollmentByStudent.get(studentIdByCode.get(x.studentCode));

    // Điểm danh
    const att = { e: [], s: [], status: [], note: [] };
    for (const x of rows) for (const n of sessionNos) {
      if (!anyMark(`SESSION ${n}`)) continue; // buổi chưa diễn ra
      const note = txt(x.get(`NOTE SS${n}`));
      att.e.push(enrollmentOf(x)); att.s.push(sessionId[n]); att.note.push(note);
      att.status.push(isMark(x.get(`SESSION ${n}`)) ? (note && /trễ/i.test(note) ? 'late' : 'present') : 'absent');
    }
    if (att.e.length) await t.run(
      `insert into attendance (enrollment_id, session_id, status, note)
       select * from unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[])
       on conflict (enrollment_id, session_id) do update set status = excluded.status, note = excluded.note`,
      [att.e, att.s, att.status, att.note]);
    summary.attendance = att.e.length;

    // Bài tập
    const sub = { e: [], a: [], status: [], challenge: [], note: [] };
    const subCols = hwNos.map((n) => [`HOMEWORK ${n}`, `NOTE HW${n}`]);
    if (hasCapstone) subCols.push(['CAPSTONE PROJECT', 'NOTE CP']);
    for (const x of rows) for (const [valName, noteName] of subCols) {
      if (!anyMark(valName)) continue; // bài chưa thu
      const note = txt(x.get(noteName));
      sub.e.push(enrollmentOf(x)); sub.a.push(assignmentId[valName]); sub.note.push(note);
      sub.status.push(isMark(x.get(valName)) ? 'submitted' : 'missing');
      sub.challenge.push(!!(note && /challenge/i.test(note) && !/chưa/i.test(note)));
    }
    if (sub.e.length) await t.run(
      `insert into submissions (enrollment_id, assignment_id, status, challenge, note)
       select * from unnest($1::bigint[], $2::bigint[], $3::text[], $4::boolean[], $5::text[])
       on conflict (enrollment_id, assignment_id) do update set status = excluded.status, challenge = excluded.challenge, note = excluded.note`,
      [sub.e, sub.a, sub.status, sub.challenge, sub.note]);
    summary.submissions = sub.e.length;

    // Voucher
    const vr = rows.filter((x) => x.get('VOUCHER GG MAPS') != null || x.get('VOUCHER SENT DATE') || x.get('EXPIRATION DATE') || x.get('VOUCHER STATUS'));
    if (vr.length) await t.run(
      `insert into vouchers (enrollment_id, amount, sent_date, expiration_date, status)
       select * from unnest($1::bigint[], $2::int[], $3::date[], $4::date[], $5::text[])
       on conflict (enrollment_id) do update set amount = excluded.amount, sent_date = excluded.sent_date,
         expiration_date = excluded.expiration_date, status = excluded.status`,
      [vr.map(enrollmentOf), vr.map((x) => (typeof x.get('VOUCHER GG MAPS') === 'number' ? x.get('VOUCHER GG MAPS') : null)),
        vr.map((x) => isoOrNull(x.get('VOUCHER SENT DATE'))), vr.map((x) => isoOrNull(x.get('EXPIRATION DATE'))), vr.map((x) => txt(x.get('VOUCHER STATUS')))]);

    summary.students = rows.length;
  });
  return summary;
}

// Nhập file Excel; mỗi COURSE ID khác nhau trong sheet là một lớp riêng.
async function importExcel(db, filePath, { classCode } = {}) {
  const { col, rows } = await readSheet(filePath);
  if (!rows.length) throw new Error('Không có dòng học viên nào');
  const warnings = [];
  const groups = new Map();
  for (const x of rows) {
    const code = classCode || String(x.get('COURSE ID') || '').trim();
    if (!code) { warnings.push(`Dòng ${x.r}: thiếu COURSE ID, bỏ qua`); continue; }
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(x);
  }
  if (!groups.size) throw new Error('Không xác định được mã lớp (COURSE ID)');
  const classes = [];
  for (const [code, list] of groups) classes.push(await importClass(db, col, list, code, warnings));
  return { classes, warnings };
}

module.exports = { importExcel };
