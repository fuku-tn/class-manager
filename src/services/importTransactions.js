// Nhập "Transactions.xlsx" (sheet Course + Transactions) và "session-management.xlsx" (giáo trình) vào database.
//
// QUY TẮC TIỀN (chủ dự án yêu cầu): tuyệt đối không lấy thứ gì liên quan đến tiền.
//  - Chỉ đọc các cột trong danh sách cho phép (ALLOWED_*). Cột khác KHÔNG được đọc vào bộ nhớ.
//  - Cột STATUS trộn trạng thái thanh toán với trạng thái học: chỉ lấy ra 2 sự kiện không phải tiền
//    ("Không tham gia", "Bảo lưu khóa trước"); các giá trị thanh toán bị bỏ, không lưu ở đâu cả.
// Idempotent: chạy lại nhiều lần không tạo trùng.
const ExcelJS = require('exceljs');
const fs = require('node:fs');
const { logEvents, latestEvents } = require('./history');
const { bieHasDefaultCapstone } = require('./scoreModules');

const ALLOWED_COURSE = ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE', 'DAYS OF WEEK'];
const ALLOWED_TX = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE'];
const ALLOWED_CURRICULUM = ['PHASE', 'MODULE', 'TOOLS', 'SESSION', 'HOURS', 'CONTENT'];

const PROGRAM_NAMES = {
  BIE: 'Business Intelligence Essentials',
  BIH: 'Business Intelligence HR Analytics',
  EBA: 'Excel for Business Analytics',
  SIA: 'Sales Incentive Analytics',
  SCA: 'Sales Incentive Analytics',
  PBM: 'Practical Business Management',
};
const DELIVERY = { HY: 'Hybrid', ON: 'Online', OF: 'Offline' };
const SHIFT = { MM: 'morning', AA: 'afternoon', EE: 'evening', MA: 'full_day' };

// Mẫu giáo trình theo lớp (đã chủ dự án xác nhận từ số người đăng ký của từng lớp).
const KNOWN_TEMPLATES = {
  BIE097: 'BIE-8', BIE099: 'BIE-8', BIE101: 'BIE-8', BIE102: 'BIE-12', BIE104: 'BIE-8', BIE105: 'BIE-12',
  // 7 lớp cũ thực tế 12 buổi (có điểm danh buổi 9–12), chủ dự án xác nhận 13/10/2026
  BIE068: 'BIE-12', BIE075: 'BIE-12', BIE078: 'BIE-12', BIE081: 'BIE-12', BIE085: 'BIE-12', BIE090: 'BIE-12', BIE092: 'BIE-12',
  BIH098: 'BIH-20', BIH100: 'BIH-20', BIH103: 'BIH-11', BIH106: 'BIH-20',
  // EBA thời 8 buổi (3 HW + Capstone, tốt nghiệp ≥ 6 buổi) — chủ dự án chốt 18/10/2026
  EBA069: 'EBA-8', EBA070: 'EBA-8', EBA072: 'EBA-8', EBA073: 'EBA-8',
  // Lớp B2B BIE107: 6 buổi, 2 HW + 1 Mini Project (chủ dự án chốt 22/10/2026)
  BIE107: 'BIE-6',
};
// Bài tập mặc định tạo sẵn cho lớp (chỉ thêm bài còn thiếu, không xóa/ghi đè): tra theo giáo trình trước, rồi theo chương trình.
// SCA, PBM: 4 HW (chủ dự án chốt 22/10/2026); BIE107 (BIE-6): HW1, HW2, Mini Project 1; EBA (mọi lớp): 4 HW + 1 Capstone Project (chốt 24/10/2026);
// BIE104: 6 HW (chốt 28/10/2026). Tra theo mã lớp trước, rồi giáo trình, rồi chương trình.
const DEFAULT_ASSIGNMENTS = {
  BIE104: [['hw', 1], ['hw', 2], ['hw', 3], ['hw', 4], ['hw', 5], ['hw', 6]],
  'BIE-6': [['hw', 1], ['hw', 2], ['mini', 1]],
  SCA: [['hw', 1], ['hw', 2], ['hw', 3], ['hw', 4]],
  PBM: [['hw', 1], ['hw', 2], ['hw', 3], ['hw', 4]],
  EBA: [['hw', 1], ['hw', 2], ['hw', 3], ['hw', 4], ['capstone', 1]],
};
// Từ BIE105: 5 HW + Capstone Project (chủ dự án chốt 28/10/2026)
const BIE_NEW_ASSIGNMENTS = [['hw', 1], ['hw', 2], ['hw', 3], ['hw', 4], ['hw', 5], ['capstone', 1]];
const assignmentTitle = (kind, seq) => (kind === 'mini' ? `Mini Project ${seq}` : kind === 'capstone' ? 'Capstone Project' : `HW ${seq}`);
// Lớp BI cũ chưa có mẫu: theo lớp mới gần nhất cùng chương trình.
// EBA mặc định 6 buổi, PBM 10 buổi (chủ dự án chốt 13/10/2026; EBA069/070/072/073 trước đây 8 buổi vẫn giữ buổi đã có).
const OPTIONAL_TEMPLATES = new Set(['EBA-6', 'EBA-8', 'BIE-6', 'PBM-10']); // thiếu trong file giáo trình thì bỏ qua (không dừng nhập)
const DEFAULT_TEMPLATE = { BIE: 'BIE-8', BIH: 'BIH-20', EBA: 'EBA-6', PBM: 'PBM-10' };

const txt = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
function cellValue(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
  }
  return v === undefined ? null : v;
}
const isoDate = (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null);
function normalizePhone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  return d.length === 9 ? `0${d}` : d; // Excel làm mất số 0 đầu
}

// Đọc một sheet nhưng CHỈ các cột trong `allowed`. Cột khác không bị đọc.
function readAllowed(ws, allowed, { headerRow = 1 } = {}) {
  const idx = {};
  ws.getRow(headerRow).eachCell((cell, n) => {
    const key = String(cellValue(cell) ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (allowed.includes(key)) idx[key] = n;
  });
  const out = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec = { _row: r };
    let any = false;
    for (const [k, n] of Object.entries(idx)) {
      const v = cellValue(row.getCell(n));
      rec[k] = v;
      if (v != null && v !== '') any = true;
    }
    if (any) out.push(rec);
  }
  return { columns: Object.keys(idx), rows: out };
}

function parseCurricula(wb) {
  const list = [];
  for (const ws of wb.worksheets) {
    const code = ws.name.trim().toUpperCase();
    const { rows } = readAllowed(ws, ALLOWED_CURRICULUM);
    const items = [];
    const seqBySession = {};
    for (const r of rows) {
      const session = Number(r.SESSION);
      if (!Number.isFinite(session)) continue;
      seqBySession[session] = (seqBySession[session] ?? 0) + 1;
      items.push({
        session_no: session, seq: seqBySession[session], phase: txt(r.PHASE), module: txt(r.MODULE), tools: txt(r.TOOLS),
        hours: r.HOURS == null ? null : Number(r.HOURS), content: txt(r.CONTENT),
      });
    }
    const sessions = [...new Set(items.map((i) => i.session_no))].sort((a, b) => a - b);
    const program = code.split('-')[0];
    list.push({
      code, program, items,
      session_count: sessions.length,
      total_hours: items.reduce((s, i) => s + (i.hours || 0), 0),
      name: `${PROGRAM_NAMES[program] ?? program} — ${sessions.length} buổi`,
      titles: Object.fromEntries(sessions.map((n) => {
        const mods = [];
        for (const i of items) if (i.session_no === n && i.module && !mods.includes(i.module)) mods.push(i.module);
        return [n, `Buổi ${n}${mods.length ? ` — ${mods.join(' + ')}` : ''}`];
      })),
    });
  }
  return list;
}

function parseCourse(ws) {
  const { rows } = readAllowed(ws, ALLOWED_COURSE);
  return rows.filter((r) => r['COURSE ID'] && r.COURSE).map((r) => {
    const short = String(r.COURSE).trim().toUpperCase();
    const code = String(r['COURSE ID']).trim();
    const parts = code.split('.');
    const program = (short.match(/^[A-Z]+/) || [''])[0];
    return {
      code, short_code: short, program,
      name: PROGRAM_NAMES[program] ? `${PROGRAM_NAMES[program]} — ${short}` : code,
      delivery_mode: DELIVERY[parts[3]] ?? null,
      shift: SHIFT[parts[4]] ?? null,
      start_date: isoDate(r.STARTDATE), end_date: isoDate(r.ENDDATE),
      next_short_code: txt(r['NEXT COURSE'])?.toUpperCase() ?? null,
      days_of_week: txt(r['DAYS OF WEEK'])?.toUpperCase().slice(0, 20) ?? null,
      template: KNOWN_TEMPLATES[short] ?? DEFAULT_TEMPLATE[program] ?? null,
      template_known: short in KNOWN_TEMPLATES,
    };
  });
}

// STATUS của Google Sheet. Chủ dự án cho phép lưu NHÃN trạng thái (không bao giờ đọc/lưu số tiền, giá, giảm giá).
const SHEET_STATUSES = ['Đã thanh toán', 'Đã cọc', 'Chưa thanh toán', 'Scholarship', 'Bảo lưu khóa trước', 'Không tham gia'];
const UNPAID = 'Chưa thanh toán';
function sheetStatusOf(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return SHEET_STATUSES.find((x) => x.toLowerCase() === s) ?? null;   // nhãn lạ không được lưu
}

// STATUS → trạng thái học. "Không tham gia" hiển thị/đếm giống "Bảo lưu" (deferred).
function stateFromStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'không tham gia') return { course_status: 'deferred', carried_over: false };
  if (s === 'bảo lưu khóa trước') return { course_status: 'active', carried_over: true };
  return { course_status: 'active', carried_over: false };
}

// Chỉ nhận dòng có ĐỦ mã học viên hợp lệ (P.12345 / B.00312) và mã lớp có trong sheet Course.
// Dòng thiếu mã học viên, mã học viên lạ (#N/A, "-", tên...) hoặc lớp không có trong Course thì bỏ qua và được đếm để báo.
// Bảo lưu / chuyển lớp (STATUS, đổi mã lớp) vẫn đi qua bình thường vì dòng vẫn có đủ hai mã.
const STUDENT_ID_RE = /^[A-Za-z][A-Za-z0-9]{0,5}\.\d{1,9}$/;

function parseTransactions(ws, classByShort) {
  const { rows } = readAllowed(ws, [...ALLOWED_TX, 'COMPANY NAME', 'SEGMENT']);
  const skipped = { no_course: 0, unknown_course: new Map(), no_student_id: 0, invalid_student_id: 0, invalid_samples: [] };
  const students = new Map();   // STUDENT ID -> thông tin mới nhất
  const enrolls = new Map();    // `${short}|${student}` -> bản ghi
  const emailIds = new Map();
  const phoneIds = new Map();
  const idEmails = new Map();

  for (const r of rows) {
    const sid = txt(r['STUDENT ID']);
    const short = txt(r.COURSE)?.toUpperCase();
    if (!sid) { if (short || txt(r['FULL NAME'])) skipped.no_student_id++; continue; }
    if (!STUDENT_ID_RE.test(sid)) {
      skipped.invalid_student_id++;
      if (skipped.invalid_samples.length < 5) skipped.invalid_samples.push(String(sid).slice(0, 20));
      continue;
    }
    if (!short) { skipped.no_course++; continue; }
    if (!classByShort.has(short)) { skipped.unknown_course.set(short, (skipped.unknown_course.get(short) ?? 0) + 1); continue; }

    const email = txt(r.EMAIL)?.toLowerCase() ?? null;
    const phone = normalizePhone(r.PHONE);
    const prev = students.get(sid) ?? {};
    students.set(sid, {
      student_code: sid,
      full_name: txt(r['FULL NAME']) ?? prev.full_name ?? null,
      email: email ?? prev.email ?? null,
      phone: phone ?? prev.phone ?? null,
      gender: ['Female', 'Male'].includes(txt(r.GENDER)) ? txt(r.GENDER) : prev.gender ?? null,
    });
    if (email) { (emailIds.get(email) ?? emailIds.set(email, new Set()).get(email)).add(sid); (idEmails.get(sid) ?? idEmails.set(sid, new Set()).get(sid)).add(email); }
    if (phone && phone.length >= 8) { const k = phone.slice(-9); (phoneIds.get(k) ?? phoneIds.set(k, new Set()).get(k)).add(sid); }

    const mode = ['Online', 'Offline', 'Hybrid'].includes(txt(r.MODE)) ? txt(r.MODE) : null;
    enrolls.set(`${short}|${sid}`, {
      short_code: short, student_code: sid, customer_id: txt(r['CUSTOMER ID']), mode,
      registration_source: txt(r['REGISTRATION SOURCE']), ...stateFromStatus(r.STATUS), sheet_status: sheetStatusOf(r.STATUS),
      segment: txt(r.SEGMENT) === 'b2b' ? 'b2b' : 'b2c', company_name: txt(r['COMPANY NAME']),
    });
  }
  const anomalies = {
    emails_with_many_ids: [...emailIds].filter(([, s]) => s.size > 1).map(([e, s]) => ({ email: e, ids: [...s] })),
    ids_with_many_emails: [...idEmails].filter(([, s]) => s.size > 1).map(([id, s]) => ({ id, emails: [...s] })),
    phones_with_many_ids: [...phoneIds].filter(([, s]) => s.size > 1).map(([p, s]) => ({ phone_tail: p, ids: [...s] })),
  };
  return { students: [...students.values()], enrolls: [...enrolls.values()], skipped, anomalies, total_rows: rows.length };
}

async function loadWorkbook(file) {
  if (file instanceof ExcelJS.Workbook) return file; // workbook dựng sẵn trong bộ nhớ (đồng bộ từ Google Sheet)
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(file)) { await wb.xlsx.load(file); return wb; } // file tải lên từ web
  if (!fs.existsSync(file)) throw new Error(`Không thấy file: ${file}`);
  await wb.xlsx.readFile(file);
  return wb;
}

// Không kèm file giáo trình: dùng giáo trình đã có trong database (đã nhập trước đó).
async function curriculaFromDb(db) {
  const cur = await db.all('select id, code, program, name, session_count, total_hours from curricula');
  const items = await db.all('select curriculum_id, session_no, module from curriculum_items order by curriculum_id, session_no, seq');
  return cur.map((c) => {
    const mine = items.filter((i) => i.curriculum_id === c.id);
    const sessions = [...new Set(mine.map((i) => i.session_no))].sort((a, b) => a - b);
    return {
      ...c, items: [], fromDb: true,
      titles: Object.fromEntries(sessions.map((n) => {
        const mods = [];
        for (const i of mine) if (i.session_no === n && i.module && !mods.includes(i.module)) mods.push(i.module);
        return [n, `Buổi ${n}${mods.length ? ` — ${mods.join(' + ')}` : ''}`];
      })),
    };
  });
}

const GUARD_MIN = 100;     // dưới ngưỡng này luôn cho phép (và chưa kiểm khi database còn ít hơn 200 ghi danh)
const GUARD_RATIO = 0.05;  // hoặc tối đa 5% tổng số ghi danh hiện có
const guardError = (what) => Object.assign(
  new Error(`Đồng bộ bị chặn vì thay đổi bất thường: ${what}. Kiểm tra Google Sheet có bị sắp xếp/sửa dở không rồi thử lại sau ít phút; dữ liệu trong app chưa bị đổi.`),
  { status: 409, expose: true });

// opts: { transactionsFile, curriculumFile, dryRun }
// Mã các lớp có ghi danh trong file (để báo realtime cho trình duyệt đang mở lớp đó).
const en0 = (enrolls, classId) => enrolls.map((e) => classId.get(e.short_code)).filter(Boolean);

// preserveManual (đồng bộ tự động mỗi phút): thêm mới thì ghi đầy đủ; bản ghi ĐÃ CÓ chỉ được điền chỗ trống,
// không đè tên/email/SĐT/hình thức và không đưa học viên đã nghỉ/bảo lưu về "đang học" (sửa tay trên web được giữ).
// eventSource: 'sync' | 'import' | 'web' (ghi vào nhật ký sự kiện). detectMissing: phát hiện học viên không còn trong Sheet (chỉ đồng bộ tự động).
async function importTransactions(db, { transactionsFile, curriculumFile, dryRun = false, preserveManual = false,
  eventSource = 'import', actor = null, detectMissing = false, missingSegments = ['b2c', 'b2b'], guard = false }) {
  const tw = await loadWorkbook(transactionsFile);
  const courseWs = tw.getWorksheet('Course');
  const txWs = tw.getWorksheet('Transactions');
  if (!courseWs || !txWs) throw new Error('Transactions.xlsx cần có sheet "Course" và "Transactions"');
  const curricula = curriculumFile ? parseCurricula(await loadWorkbook(curriculumFile)) : await curriculaFromDb(db);
  const classes = parseCourse(courseWs);
  const classByShort = new Map(classes.map((c) => [c.short_code, c]));
  // Lớp đã có trong app nhưng chưa có dòng trong sheet COURSE (vd lớp B2B tạo tay trên web): vẫn nhận ghi danh từ PERSONAL/COMPANY.
  // Không đụng tới thông tin lớp (chỉ có bảng COURSE mới được sửa ngày/hình thức/giáo trình).
  const extraClasses = await db.all('select id, code, short_code from classes where short_code is not null and not (short_code = any($1::text[]))',
    [classes.map((c) => c.short_code)]);
  for (const x of extraClasses) classByShort.set(x.short_code, { code: x.code, short_code: x.short_code, extra: true });
  const parsed = parseTransactions(txWs, classByShort);
  const byCode = new Map(curricula.map((c) => [c.code, c]));
  const missingTemplates = [...new Set(classes.map((c) => c.template).filter((t) => t && !byCode.has(t)))];
  if (missingTemplates.length) {
    // Nhập tay: dừng để người dùng nạp giáo trình. Đồng bộ tự động: vẫn nhận đăng ký, lớp tạm thời chưa có giáo trình.
    const required = missingTemplates.filter((x) => !OPTIONAL_TEMPLATES.has(x));
    if (!preserveManual && required.length) throw new Error(`Thiếu giáo trình cho mẫu: ${required.join(', ')}`);
    for (const c of classes) if (missingTemplates.includes(c.template)) c.template = null;
  }

  const summary = {
    curricula: curricula.length, curricula_from_db: !curriculumFile, classes: classes.length, students: parsed.students.length, enrollments: parsed.enrolls.length,
    transactions_rows: parsed.total_rows, skipped_no_course: parsed.skipped.no_course,
    skipped_no_student_id: parsed.skipped.no_student_id, skipped_invalid_student_id: parsed.skipped.invalid_student_id,
    invalid_student_id_samples: parsed.skipped.invalid_samples,
    skipped_unknown_course: Object.fromEntries(parsed.skipped.unknown_course),
    classes_with_default_template: classes.filter((c) => c.template && !c.template_known).length,
    classes_without_template: classes.filter((c) => !c.template).length,
    anomalies: {
      emails_with_many_ids: parsed.anomalies.emails_with_many_ids.length,
      ids_with_many_emails: parsed.anomalies.ids_with_many_emails.length,
      phones_with_many_ids: parsed.anomalies.phones_with_many_ids.length,
    },
    anomaly_details: parsed.anomalies,
    columns_read: { course: ALLOWED_COURSE, transactions: ALLOWED_TX },
    dry_run: dryRun,
    preserve_manual: preserveManual,
  };

  const ROLLBACK = Symbol('dry-run');
  try {
    await db.tx(async (t) => {
      const count = async (table) => (await t.one(`select count(*)::int n from ${table}`)).n;
      const before = { classes: await count('classes'), students: await count('students'), enrollments: await count('enrollments'), sessions: await count('sessions') };

      // 1) Giáo trình
      for (const c of curricula) {
        if (c.fromDb) continue; // giáo trình có sẵn trong database: không ghi lại
        const row = await t.one(
          `insert into curricula (code, program, name, session_count, total_hours) values ($1, $2, $3, $4, $5)
           on conflict (code) do update set program = excluded.program, name = excluded.name,
             session_count = excluded.session_count, total_hours = excluded.total_hours returning id`,
          [c.code, c.program, c.name, c.session_count, c.total_hours]);
        c.id = row.id;
        await t.run('delete from curriculum_items where curriculum_id = $1', [c.id]);
        if (c.items.length) await t.run(
          `insert into curriculum_items (curriculum_id, session_no, seq, phase, module, tools, hours, content)
           select $1::bigint, * from unnest($2::int[], $3::int[], $4::text[], $5::text[], $6::text[], $7::numeric[], $8::text[])`,
          [c.id, c.items.map((i) => i.session_no), c.items.map((i) => i.seq), c.items.map((i) => i.phase), c.items.map((i) => i.module),
            c.items.map((i) => i.tools), c.items.map((i) => i.hours), c.items.map((i) => i.content)]);
      }

      // 1b) Sheet đổi COURSE ID của một lớp (vd đổi ngày khai giảng nằm trong mã): lớp vẫn là lớp cũ (nhận diện theo mã ngắn như PBM022)
      //     → đổi mã lớp tại chỗ để KHÔNG tạo lớp trùng (trước đây báo "duplicate key … classes_short_code_key" và cả lượt đồng bộ bị hủy).
      //     Chỉ đổi khi mã ngắn xuất hiện đúng một lần trong sheet và mã mới chưa là của lớp khác.
      //     Sheet còn dòng cũ lẫn dòng mới của cùng một lớp (hay xảy ra khi thêm dòng thay vì sửa dòng cũ): giữ dòng CUỐI (mới nhất), bỏ dòng trước
      //     và ghi vào summary.duplicate_course_rows — thay vì làm hỏng cả lượt đồng bộ.
      summary.duplicate_course_rows = [];
      const lastIndex = new Map();
      classes.forEach((c, i) => lastIndex.set(c.short_code, i));
      for (let i = classes.length - 1; i >= 0; i--) {
        if (lastIndex.get(classes[i].short_code) !== i) { summary.duplicate_course_rows.push(classes[i].short_code); classes.splice(i, 1); }
      }
      const sheetCodes = new Map();
      for (const c of classes) sheetCodes.set(c.short_code, [...(sheetCodes.get(c.short_code) ?? []), c.code]);
      const known = sheetCodes.size ? await t.all('select id, code, name, short_code from classes where short_code = any($1::text[])', [[...sheetCodes.keys()]]) : [];
      summary.renamed_classes = [];
      for (const e of known) {
        const codes = sheetCodes.get(e.short_code);
        if (codes.length !== 1 || codes[0] === e.code) continue;
        if (await t.one('select 1 as x from classes where code = $1', [codes[0]])) continue;
        await t.run('update classes set code = $2, name = case when name = code then $2 else name end where id = $1', [e.id, codes[0]]);
        summary.renamed_classes.push(e.short_code);
      }

      // 2) Lớp
      const classRows = await t.all(
        `insert into classes (code, name, short_code, program, delivery_mode, shift, start_date, end_date, next_short_code, curriculum_id, days_of_week)
         select u.code, u.name, u.short_code, u.program, u.delivery_mode, u.shift, u.start_date::date, u.end_date::date, u.next_short_code, cu.id, u.days_of_week
         from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
           as u(code, name, short_code, program, delivery_mode, shift, start_date, end_date, next_short_code, template, days_of_week)
         left join curricula cu on cu.code = u.template
         on conflict (code) do update set
           name = case when classes.name = classes.code then excluded.name else classes.name end,
           short_code = excluded.short_code, program = excluded.program, delivery_mode = excluded.delivery_mode, shift = excluded.shift,
           start_date = coalesce(excluded.start_date, classes.start_date), end_date = excluded.end_date,
           next_short_code = excluded.next_short_code, curriculum_id = coalesce(excluded.curriculum_id, classes.curriculum_id),
           days_of_week = coalesce(excluded.days_of_week, classes.days_of_week)
         returning id, code, short_code, curriculum_id`,
        [classes.map((c) => c.code), classes.map((c) => c.name), classes.map((c) => c.short_code), classes.map((c) => c.program),
          classes.map((c) => c.delivery_mode), classes.map((c) => c.shift), classes.map((c) => c.start_date), classes.map((c) => c.end_date),
          classes.map((c) => c.next_short_code), classes.map((c) => c.template), classes.map((c) => c.days_of_week ?? null)]);
      const classId = new Map([...classRows, ...extraClasses].map((r) => [r.short_code, r.id]));
      summary.class_ids = [...new Set(en0(parsed.enrolls, classId))];

      // 3) Buổi học theo giáo trình (không ghi đè tên buổi do người dùng tự đặt)
      const ses = { c: [], n: [], title: [] };
      for (const c of classes) {
        const cur = c.template && byCode.get(c.template);
        if (!cur) continue;
        for (const [n, title] of Object.entries(cur.titles)) { ses.c.push(classId.get(c.short_code)); ses.n.push(Number(n)); ses.title.push(title); }
      }
      if (ses.c.length) await t.run(
        `insert into sessions (class_id, session_no, title) select * from unnest($1::bigint[], $2::int[], $3::text[])
         on conflict (class_id, session_no) do update set title = excluded.title
           where sessions.title is null or sessions.title ~ '^Buổi [0-9]+( —.*)?$'`,
        [ses.c, ses.n, ses.title]);

      // 3b) Bài tập mặc định (SCA/PBM 4 HW; BIE-6: HW1, HW2, Mini Project 1) — chỉ thêm bài còn thiếu
      const da = { c: [], kind: [], seq: [], title: [] };
      for (const c of classes) {
        const list = DEFAULT_ASSIGNMENTS[c.short_code] ?? DEFAULT_ASSIGNMENTS[c.template] ?? (c.program === 'BIE' && bieHasDefaultCapstone(c.short_code) ? BIE_NEW_ASSIGNMENTS : DEFAULT_ASSIGNMENTS[c.program]);
        if (!list || !classId.get(c.short_code)) continue;
        for (const [kind, seq] of list) { da.c.push(classId.get(c.short_code)); da.kind.push(kind); da.seq.push(seq); da.title.push(assignmentTitle(kind, seq)); }
      }
      if (da.c.length) await t.run(
        `insert into assignments (class_id, kind, seq, title) select * from unnest($1::bigint[], $2::text[], $3::int[], $4::text[])
         on conflict (class_id, kind, seq) do nothing`, [da.c, da.kind, da.seq, da.title]);

      // 4) Học viên
      const st = parsed.students;
      const studentRows = await t.all(
        `insert into students (student_code, full_name, email, phone, gender)
         select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
         on conflict (student_code) do update set ${preserveManual
    ? `full_name = case when students.full_name is null or students.full_name = students.student_code
                            then coalesce(excluded.full_name, students.full_name) else students.full_name end,
             email = coalesce(students.email, excluded.email), phone = coalesce(students.phone, excluded.phone),
             gender = coalesce(students.gender, excluded.gender)`
    : `full_name = coalesce(excluded.full_name, students.full_name), email = coalesce(excluded.email, students.email),
             phone = coalesce(excluded.phone, students.phone), gender = coalesce(excluded.gender, students.gender)`}
         returning id, student_code`,
        [st.map((s) => s.student_code), st.map((s) => s.full_name ?? s.student_code), st.map((s) => s.email), st.map((s) => s.phone), st.map((s) => s.gender)]);
      const studentId = new Map(studentRows.map((r) => [r.student_code, r.id]));

      // 5) Ghi danh (giữ trạng thái đã đặt tay "bảo lưu"/"hoàn thành")
      let en = parsed.enrolls;
      const involved = [...new Set(en.map((e) => classId.get(e.short_code)).filter(Boolean))];
      const prevRows = await t.all(
        `select id, class_id, student_id, course_status, sheet_status, origin, segment, graduation_status, certificate_status, certificate_number
           from enrollments where class_id = any($1::bigint[])`, [involved]);
      const prevFull = new Map(prevRows.map((r) => [`${r.class_id}:${r.student_id}`, r]));
      const prev = new Map(prevRows.map((r) => [`${r.class_id}:${r.student_id}`, r.course_status]));
      if (preserveManual) {
        // Admin đã chủ động gỡ học viên khỏi lớp: đồng bộ không tự thêm lại (muốn thêm lại thì thêm tay trên web).
        const removed = new Set((await t.all("select distinct class_code, student_code from enrollment_events where event = 'removed'"))
          .map((r) => `${r.class_code}|${r.student_code}`));
        const codeOfShort = new Map([...classes, ...extraClasses].map((c) => [c.short_code, c.code]));
        const before = en.length;
        en = en.filter((e) => !removed.has(`${codeOfShort.get(e.short_code)}|${e.student_code}`)
          || prev.has(`${classId.get(e.short_code)}:${studentId.get(e.student_code)}`));
        summary.skipped_removed = before - en.length;
      }
      const keyOf = (e) => `${classId.get(e.short_code)}:${studentId.get(e.student_code)}`;
      // "Chưa thanh toán" (PERSONAL/B2C): không có tên trong danh sách và điểm danh; chuyển sang bảng Potential.
      const isUnpaid = (e) => e.sheet_status === UNPAID && e.segment === 'b2c';
      const unpaid = en.filter(isUnpaid);
      en = en.filter((e) => !isUnpaid(e));
      const potRows = involved.length ? await t.all('select * from potential_students where class_id = any($1::bigint[])', [involved]) : [];
      const potential = new Map(potRows.map((p) => [`${p.class_id}:${p.student_id}`, p]));
      const newSheet = new Map(en.map((e) => [keyOf(e), e.sheet_status]));

      const upserted = await t.all(
        `insert into enrollments (class_id, student_id, customer_id, mode, course_status, registration_source, carried_over, segment, company_name, sheet_status, origin)
         select u.*, 'sheet' from unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[], $8::text[], $9::text[], $10::text[]) as u
         on conflict (class_id, student_id) do update set origin = 'sheet', segment = excluded.segment, sheet_status = excluded.sheet_status,
           company_name = coalesce(enrollments.company_name, excluded.company_name), ${preserveManual
    ? `customer_id = coalesce(enrollments.customer_id, excluded.customer_id),
           mode = coalesce(enrollments.mode, excluded.mode),
           registration_source = coalesce(enrollments.registration_source, excluded.registration_source),
           carried_over = enrollments.carried_over or excluded.carried_over,
           course_status = case
             when enrollments.course_status = 'active' and excluded.course_status = 'dropped' then 'dropped'
             when excluded.course_status = 'deferred' and enrollments.course_status in ('active', 'dropped') then 'deferred'
             when enrollments.course_status = 'deferred' and enrollments.sheet_status = 'Không tham gia' and excluded.course_status = 'active' then 'active'
             else enrollments.course_status end`
    : `customer_id = coalesce(excluded.customer_id, enrollments.customer_id),
           mode = coalesce(excluded.mode, enrollments.mode),
           registration_source = coalesce(excluded.registration_source, enrollments.registration_source),
           carried_over = excluded.carried_over,
           course_status = case when enrollments.course_status in ('deferred', 'completed') and not (enrollments.sheet_status = 'Không tham gia' and excluded.course_status = 'active')
                                     and not (excluded.course_status = 'deferred' and enrollments.course_status = 'deferred') then enrollments.course_status
                                else excluded.course_status end`}
         returning id, class_id, student_id, course_status, (xmax = 0) as inserted`,
        [en.map((e) => classId.get(e.short_code)), en.map((e) => studentId.get(e.student_code)), en.map((e) => e.customer_id), en.map((e) => e.mode),
          en.map((e) => e.course_status), en.map((e) => e.registration_source), en.map((e) => e.carried_over),
          en.map((e) => e.segment), en.map((e) => e.company_name), en.map((e) => e.sheet_status)]);

      // Chốt chặn (đồng bộ tự động): một lượt không được thêm/chuyển/đánh dấu quá nhiều ghi danh cùng lúc.
      // Sheet đang bị sửa dở (lệch cột, sắp xếp...) từng tạo hơn 1.500 ghi danh sai trong một lượt (13/10/2026).
      // Ném lỗi trong transaction = không ghi gì; muốn nhập khối lượng lớn thì dùng trang Nhập Excel.
      const addedNow = upserted.filter((r) => r.inserted).length;
      const unpaidMovers = unpaid.filter((e) => prevFull.get(keyOf(e))?.origin === 'sheet');
      if (guard) {
        const total = Number((await t.one('select count(*)::int as n from enrollments')).n) - addedNow;   // số ghi danh TRƯỚC lượt này
        const limit = Math.max(GUARD_MIN, Math.ceil(total * GUARD_RATIO));
        if (total >= GUARD_MIN * 2 && addedNow > limit) throw guardError(`định thêm ${addedNow} ghi danh mới cùng lúc (giới hạn ${limit})`);
        if (total >= GUARD_MIN * 2 && unpaidMovers.length > limit) throw guardError(`định chuyển ${unpaidMovers.length} học viên sang Potential (chưa thanh toán) cùng lúc (giới hạn ${limit})`);
      }

      // Nhật ký sự kiện (cùng transaction): thêm mới, đổi trạng thái, đổi trạng thái đăng ký, chuyển Potential, không còn/lại xuất hiện
      const stuByCode = new Map(st.map((s) => [s.student_code, s]));
      const codeById = new Map(studentRows.map((r) => [r.id, r.student_code]));
      const classCodeById = new Map([...classRows, ...extraClasses].map((r) => [r.id, r.code]));
      const nameOf = (studentIdVal) => stuByCode.get(codeById.get(studentIdVal))?.full_name ?? null;
      const base = (r) => ({
        enrollment_id: r.id, class_id: r.class_id, class_code: classCodeById.get(r.class_id), student_id: r.student_id,
        student_code: codeById.get(r.student_id), full_name: nameOf(r.student_id),
        source: eventSource, actor_id: actor?.id ?? null, actor_name: actor?.name ?? null,
      });
      const events = [];
      let statusChanges = 0;
      for (const r of upserted) {
        const k = `${r.class_id}:${r.student_id}`;
        const was = prev.get(k);
        const sheetNow = newSheet.get(k) ?? null;
        if (r.inserted) events.push({ ...base(r), event: 'enrolled', to_status: r.course_status, note: sheetNow ? `Trạng thái Sheet: ${sheetNow}` : null });
        else {
          if (was && was !== r.course_status) events.push({ ...base(r), event: 'status_changed', from_status: was, to_status: r.course_status });
          const sheetWas = prevFull.get(k)?.sheet_status ?? null;
          if (sheetWas && sheetNow && sheetWas !== sheetNow) {
            statusChanges++;
            events.push({ ...base(r), event: 'sheet_status', from_status: sheetWas, to_status: sheetNow });
          }
        }
      }
      summary.sheet_status_changes = statusChanges;

      // Chuyển học viên sang Potential: chụp lại điểm danh/bài tập (để khôi phục nếu họ quay lại), rồi xóa khỏi lớp.
      const movePotential = async (items) => {
        const ids = items.map((i) => i.enrollment_id).filter(Boolean);
        const att = ids.length ? await t.all('select enrollment_id, session_id as s, status as st, note as n from attendance where enrollment_id = any($1::bigint[])', [ids]) : [];
        const sub = ids.length ? await t.all('select enrollment_id, assignment_id as a, status as st, note as n from submissions where enrollment_id = any($1::bigint[])', [ids]) : [];
        const snapOf = (id) => {
          if (!id) return '';
          const a = att.filter((x) => x.enrollment_id === id).map(({ s, st: v, n }) => ({ s, st: v, n }));
          const b = sub.filter((x) => x.enrollment_id === id).map(({ a: aid, st: v, n }) => ({ a: aid, st: v, n }));
          return a.length || b.length ? JSON.stringify({ att: a, sub: b }) : '';
        };
        await t.run(
          `insert into potential_students (class_id, student_id, class_code, student_code, full_name, last_status, reason, snapshot)
           select u.c, u.s, u.cc, u.sc, u.fn, u.ls, u.rs, nullif(u.sn, '')::jsonb
             from unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]) as u(c, s, cc, sc, fn, ls, rs, sn)
           on conflict (class_id, student_id) do update set last_status = excluded.last_status, reason = excluded.reason,
             snapshot = coalesce(excluded.snapshot, potential_students.snapshot), updated_at = now()`,
          [items.map((i) => i.class_id), items.map((i) => i.student_id), items.map((i) => i.class_code), items.map((i) => i.student_code),
            items.map((i) => i.full_name), items.map((i) => i.last_status), items.map((i) => i.reason), items.map((i) => snapOf(i.enrollment_id))]);
        if (ids.length) await t.run('delete from enrollments where id = any($1::bigint[])', [ids]);
        for (const i of items) {
          if (!i.enrollment_id) continue;
          events.push({ enrollment_id: i.enrollment_id, class_id: i.class_id, class_code: i.class_code, student_id: i.student_id, student_code: i.student_code,
            full_name: i.full_name, event: 'moved_to_potential', from_status: i.from_status ?? null, to_status: i.last_status ?? null,
            source: eventSource, actor_id: actor?.id ?? null, actor_name: actor?.name ?? null,
            note: i.reason === 'unpaid' ? 'Chưa thanh toán: không có tên trong danh sách' : 'Không còn trong sheet PERSONAL' });
        }
      };

      const toPotential = [];
      for (const e of unpaid) {
        const cid = classId.get(e.short_code); const sid = studentId.get(e.student_code);
        const ex = prevFull.get(`${cid}:${sid}`);
        if (ex && ex.origin !== 'sheet') continue;          // thêm tay trên web: không đụng
        toPotential.push({
          enrollment_id: ex?.id ?? null, class_id: cid, student_id: sid, class_code: classCodeById.get(cid), student_code: e.student_code,
          full_name: nameOf(sid), last_status: UNPAID, reason: 'unpaid', from_status: ex?.course_status ?? null,
        });
      }

      // Học viên đã thanh toán/được ghi danh trở lại: bỏ khỏi Potential, khôi phục điểm danh/bài tập đã chụp.
      const back = upserted.filter((r) => potential.has(`${r.class_id}:${r.student_id}`));
      let restored = 0;
      for (const r of back) {
        const p = potential.get(`${r.class_id}:${r.student_id}`);
        const snap = typeof p.snapshot === 'string' ? JSON.parse(p.snapshot) : p.snapshot;
        if (r.inserted && snap) {
          if (snap.att?.length) await t.run(
            `insert into attendance (enrollment_id, session_id, status, note)
             select $1::bigint, x.s, case when x.st = 'late' then 'present' else x.st end, x.n from jsonb_to_recordset($2::jsonb) as x(s bigint, st text, n text)
              where exists (select 1 from sessions where id = x.s) on conflict do nothing`, [r.id, JSON.stringify(snap.att)]);
          if (snap.sub?.length) await t.run(
            `insert into submissions (enrollment_id, assignment_id, status, note)
             select $1::bigint, x.a, x.st, x.n from jsonb_to_recordset($2::jsonb) as x(a bigint, st text, n text)
              where exists (select 1 from assignments where id = x.a) on conflict do nothing`, [r.id, JSON.stringify(snap.sub)]);
          restored++;
        }
        events.push({ ...base(r), event: 'reappeared', to_status: r.course_status, note: 'Từ danh sách Potential' });
      }
      if (back.length) await t.run('delete from potential_students where id = any($1::bigint[])',
        [back.map((r) => potential.get(`${r.class_id}:${r.student_id}`).id)]);
      summary.restored_from_potential = restored;

      if (detectMissing && involved.length) {
        const present = new Set([...upserted.map((r) => `${r.class_id}:${r.student_id}`), ...unpaid.map(keyOf)]);
        const latest = await latestEvents(t, involved);
        const cand = await t.all(
          `select e.id, e.class_id, e.student_id, e.course_status, e.segment, e.graduation_status, e.certificate_status, e.certificate_number,
                  s.student_code, s.full_name, c.code as class_code
           from enrollments e join students s on s.id = e.student_id join classes c on c.id = e.class_id
           where e.class_id = any($1::bigint[]) and e.origin = 'sheet' and e.course_status in ('active', 'deferred', 'dropped')
             and e.segment = any($2::text[])`, [involved, missingSegments]);
        const gone = cand.filter((e) => !present.has(`${e.class_id}:${e.student_id}`));
        if (guard && cand.length >= GUARD_MIN * 2 && gone.length > Math.max(GUARD_MIN, Math.ceil(cand.length * GUARD_RATIO))) {
          throw guardError(`định đánh dấu ${gone.length} học viên "không còn trong Sheet" cùng lúc`);
        }
        let missing = 0;
        let removedToPotential = 0;
        for (const e of gone) {
          // PERSONAL (B2C) không còn trong Sheet → xóa khỏi danh sách/điểm danh, chuyển Potential.
          // Không tự xóa nếu đã có kết quả tốt nghiệp/chứng chỉ (chỉ cảnh báo). COMPANY (B2B) chỉ cảnh báo.
          const safe = e.segment === 'b2c' && e.graduation_status === 'pending' && !e.certificate_status && !e.certificate_number;
          if (safe) {
            toPotential.push({ enrollment_id: e.id, class_id: e.class_id, student_id: e.student_id, class_code: e.class_code, student_code: e.student_code,
              full_name: e.full_name, last_status: prevFull.get(`${e.class_id}:${e.student_id}`)?.sheet_status ?? null, reason: 'removed_from_sheet', from_status: e.course_status });
            removedToPotential++;
          } else if (e.course_status === 'active' && latest.get(e.id) !== 'missing_from_sheet') {
            missing++;
            events.push({ enrollment_id: e.id, class_id: e.class_id, class_code: e.class_code, student_id: e.student_id, student_code: e.student_code,
              full_name: e.full_name, event: 'missing_from_sheet', from_status: 'active', source: eventSource });
          }
        }
        let backCount = 0;
        for (const r of upserted) {
          if (latest.get(r.id) !== 'missing_from_sheet') continue;
          backCount++;
          events.push({ ...base(r), event: 'reappeared', to_status: r.course_status });
        }
        summary.missing_new = missing;
        summary.removed_to_potential = removedToPotential;
        summary.reappeared = backCount;
      }
      if (toPotential.length) await movePotential(toPotential);
      summary.moved_to_potential = toPotential.filter((i) => i.enrollment_id).length;   // chỉ người vừa rời danh sách lớp
      summary.potential_rows = toPotential.length;
      summary.events_logged = await logEvents(t, events);

      const after = { classes: await count('classes'), students: await count('students'), enrollments: await count('enrollments'), sessions: await count('sessions') };
      summary.before = before;
      summary.after = after;
      summary.added = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return summary;
}

module.exports = { importTransactions, stateFromStatus, parseCourse, parseCurricula, ALLOWED_TX, ALLOWED_COURSE };
