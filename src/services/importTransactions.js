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

const ALLOWED_COURSE = ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE'];
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
  BIH098: 'BIH-20', BIH100: 'BIH-20', BIH103: 'BIH-11', BIH106: 'BIH-20',
};
// Lớp BI cũ chưa có mẫu: theo lớp mới gần nhất cùng chương trình.
const DEFAULT_TEMPLATE = { BIE: 'BIE-8', BIH: 'BIH-20' };

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
      template: KNOWN_TEMPLATES[short] ?? DEFAULT_TEMPLATE[program] ?? null,
      template_known: short in KNOWN_TEMPLATES,
    };
  });
}

// STATUS → trạng thái học. Giá trị thanh toán KHÔNG được lưu.
function stateFromStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'không tham gia') return { course_status: 'dropped', carried_over: false };
  if (s === 'bảo lưu khóa trước') return { course_status: 'active', carried_over: true };
  return { course_status: 'active', carried_over: false };
}

function parseTransactions(ws, classByShort) {
  const { rows } = readAllowed(ws, ALLOWED_TX);
  const skipped = { no_course: 0, unknown_course: new Map() };
  const students = new Map();   // STUDENT ID -> thông tin mới nhất
  const enrolls = new Map();    // `${short}|${student}` -> bản ghi
  const emailIds = new Map();
  const phoneIds = new Map();
  const idEmails = new Map();

  for (const r of rows) {
    const sid = txt(r['STUDENT ID']);
    const short = txt(r.COURSE)?.toUpperCase();
    if (!sid) continue;
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
      registration_source: txt(r['REGISTRATION SOURCE']), ...stateFromStatus(r.STATUS),
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

// opts: { transactionsFile, curriculumFile, dryRun }
// Mã các lớp có ghi danh trong file (để báo realtime cho trình duyệt đang mở lớp đó).
const en0 = (enrolls, classId) => enrolls.map((e) => classId.get(e.short_code)).filter(Boolean);

// preserveManual (đồng bộ tự động mỗi phút): thêm mới thì ghi đầy đủ; bản ghi ĐÃ CÓ chỉ được điền chỗ trống,
// không đè tên/email/SĐT/hình thức và không đưa học viên đã nghỉ/bảo lưu về "đang học" (sửa tay trên web được giữ).
// eventSource: 'sync' | 'import' | 'web' (ghi vào nhật ký sự kiện). detectMissing: phát hiện học viên không còn trong Sheet (chỉ đồng bộ tự động).
async function importTransactions(db, { transactionsFile, curriculumFile, dryRun = false, preserveManual = false,
  eventSource = 'import', actor = null, detectMissing = false }) {
  const tw = await loadWorkbook(transactionsFile);
  const courseWs = tw.getWorksheet('Course');
  const txWs = tw.getWorksheet('Transactions');
  if (!courseWs || !txWs) throw new Error('Transactions.xlsx cần có sheet "Course" và "Transactions"');
  const curricula = curriculumFile ? parseCurricula(await loadWorkbook(curriculumFile)) : await curriculaFromDb(db);
  const classes = parseCourse(courseWs);
  const classByShort = new Map(classes.map((c) => [c.short_code, c]));
  const parsed = parseTransactions(txWs, classByShort);
  const byCode = new Map(curricula.map((c) => [c.code, c]));
  const missingTemplates = [...new Set(classes.map((c) => c.template).filter((t) => t && !byCode.has(t)))];
  if (missingTemplates.length) {
    // Nhập tay: dừng để người dùng nạp giáo trình. Đồng bộ tự động: vẫn nhận đăng ký, lớp tạm thời chưa có giáo trình.
    if (!preserveManual) throw new Error(`Thiếu giáo trình cho mẫu: ${missingTemplates.join(', ')}`);
    for (const c of classes) if (missingTemplates.includes(c.template)) c.template = null;
  }

  const summary = {
    curricula: curricula.length, curricula_from_db: !curriculumFile, classes: classes.length, students: parsed.students.length, enrollments: parsed.enrolls.length,
    transactions_rows: parsed.total_rows, skipped_no_course: parsed.skipped.no_course,
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

      // 2) Lớp
      const classRows = await t.all(
        `insert into classes (code, name, short_code, program, delivery_mode, shift, start_date, end_date, next_short_code, curriculum_id)
         select u.code, u.name, u.short_code, u.program, u.delivery_mode, u.shift, u.start_date::date, u.end_date::date, u.next_short_code, cu.id
         from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
           as u(code, name, short_code, program, delivery_mode, shift, start_date, end_date, next_short_code, template)
         left join curricula cu on cu.code = u.template
         on conflict (code) do update set
           name = case when classes.name = classes.code then excluded.name else classes.name end,
           short_code = excluded.short_code, program = excluded.program, delivery_mode = excluded.delivery_mode, shift = excluded.shift,
           start_date = coalesce(excluded.start_date, classes.start_date), end_date = excluded.end_date,
           next_short_code = excluded.next_short_code, curriculum_id = coalesce(excluded.curriculum_id, classes.curriculum_id)
         returning id, code, short_code, curriculum_id`,
        [classes.map((c) => c.code), classes.map((c) => c.name), classes.map((c) => c.short_code), classes.map((c) => c.program),
          classes.map((c) => c.delivery_mode), classes.map((c) => c.shift), classes.map((c) => c.start_date), classes.map((c) => c.end_date),
          classes.map((c) => c.next_short_code), classes.map((c) => c.template)]);
      const classId = new Map(classRows.map((r) => [r.short_code, r.id]));
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
      const prev = new Map((await t.all('select class_id, student_id, course_status from enrollments where class_id = any($1::bigint[])', [involved]))
        .map((r) => [`${r.class_id}:${r.student_id}`, r.course_status]));
      if (preserveManual) {
        // Admin đã chủ động gỡ học viên khỏi lớp: đồng bộ không tự thêm lại (muốn thêm lại thì thêm tay trên web).
        const removed = new Set((await t.all("select distinct class_code, student_code from enrollment_events where event = 'removed'"))
          .map((r) => `${r.class_code}|${r.student_code}`));
        const codeOfShort = new Map(classes.map((c) => [c.short_code, c.code]));
        const before = en.length;
        en = en.filter((e) => !removed.has(`${codeOfShort.get(e.short_code)}|${e.student_code}`)
          || prev.has(`${classId.get(e.short_code)}:${studentId.get(e.student_code)}`));
        summary.skipped_removed = before - en.length;
      }
      const upserted = await t.all(
        `insert into enrollments (class_id, student_id, customer_id, mode, course_status, registration_source, carried_over, origin)
         select u.*, 'sheet' from unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[]) as u
         on conflict (class_id, student_id) do update set origin = 'sheet', ${preserveManual
    ? `customer_id = coalesce(enrollments.customer_id, excluded.customer_id),
           mode = coalesce(enrollments.mode, excluded.mode),
           registration_source = coalesce(enrollments.registration_source, excluded.registration_source),
           carried_over = enrollments.carried_over or excluded.carried_over,
           course_status = case when enrollments.course_status = 'active' and excluded.course_status = 'dropped'
                                then 'dropped' else enrollments.course_status end`
    : `customer_id = coalesce(excluded.customer_id, enrollments.customer_id),
           mode = coalesce(excluded.mode, enrollments.mode),
           registration_source = coalesce(excluded.registration_source, enrollments.registration_source),
           carried_over = excluded.carried_over,
           course_status = case when enrollments.course_status in ('deferred', 'completed') then enrollments.course_status
                                else excluded.course_status end`}
         returning id, class_id, student_id, course_status, (xmax = 0) as inserted`,
        [en.map((e) => classId.get(e.short_code)), en.map((e) => studentId.get(e.student_code)), en.map((e) => e.customer_id), en.map((e) => e.mode),
          en.map((e) => e.course_status), en.map((e) => e.registration_source), en.map((e) => e.carried_over)]);

      // Nhật ký sự kiện (cùng transaction): thêm mới, đổi trạng thái, không còn/lại xuất hiện trong Sheet
      const stuByCode = new Map(st.map((s) => [s.student_code, s]));
      const codeById = new Map(studentRows.map((r) => [r.id, r.student_code]));
      const classCodeById = new Map(classRows.map((r) => [r.id, r.code]));
      const base = (r) => ({
        enrollment_id: r.id, class_id: r.class_id, class_code: classCodeById.get(r.class_id), student_id: r.student_id,
        student_code: codeById.get(r.student_id), full_name: stuByCode.get(codeById.get(r.student_id))?.full_name ?? null,
        source: eventSource, actor_id: actor?.id ?? null, actor_name: actor?.name ?? null,
      });
      const events = [];
      for (const r of upserted) {
        const was = prev.get(`${r.class_id}:${r.student_id}`);
        if (r.inserted) events.push({ ...base(r), event: 'enrolled', to_status: r.course_status });
        else if (was && was !== r.course_status) events.push({ ...base(r), event: 'status_changed', from_status: was, to_status: r.course_status });
      }
      if (detectMissing && involved.length) {
        const present = new Set(upserted.map((r) => `${r.class_id}:${r.student_id}`));
        const latest = await latestEvents(t, involved);
        const cand = await t.all(
          `select e.id, e.class_id, e.student_id, s.student_code, s.full_name, c.code as class_code
           from enrollments e join students s on s.id = e.student_id join classes c on c.id = e.class_id
           where e.class_id = any($1::bigint[]) and e.origin = 'sheet' and e.course_status = 'active'`, [involved]);
        let missing = 0;
        for (const e of cand) {
          if (present.has(`${e.class_id}:${e.student_id}`) || latest.get(e.id) === 'missing_from_sheet') continue;
          missing++;
          events.push({ enrollment_id: e.id, class_id: e.class_id, class_code: e.class_code, student_id: e.student_id, student_code: e.student_code,
            full_name: e.full_name, event: 'missing_from_sheet', from_status: 'active', source: eventSource });
        }
        let back = 0;
        for (const r of upserted) {
          if (latest.get(r.id) !== 'missing_from_sheet') continue;
          back++;
          events.push({ ...base(r), event: 'reappeared', to_status: r.course_status });
        }
        summary.missing_new = missing;
        summary.reappeared = back;
      }
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
