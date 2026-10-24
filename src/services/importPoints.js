// Điểm bài tập từ tab "Point" của Google Sheet: StudentID · Course · HW · Point · Module.
// Chỉ đọc đúng 5 cột này (KHÔNG đọc cột Họ và tên). Ghép theo (mã lớp, mã học viên, HW) với ghi danh/bài tập đã có.
// Điểm thang 10, lưu riêng ở homework_scores (không đổi trạng thái nộp bài). Bảng Sheet là bản chuẩn: điểm không còn
// trong Sheet bị xóa (có chốt chặn nếu bỗng xóa quá nhiều).
const POINT_COLUMNS = ['STUDENTID', 'COURSE', 'HW', 'POINT', 'MODULE'];
const POINT_SYNC_COLUMNS = [...POINT_COLUMNS, 'STUDENT ID'];   // chấp nhận cả "Student ID"

const STUDENT_ID_RE = /^[A-Za-z][A-Za-z0-9]{0,5}\.\d{1,9}$/;
const DELETE_MIN = 50;      // dưới ngưỡng này luôn được xóa
const DELETE_RATIO = 0.2;   // hoặc tối đa 20% điểm hiện có của các lớp trong lượt

const txt = (v) => (v == null ? null : (String(v).trim() || null));
const EXAMPLES = 10;   // số giá trị mẫu (khác nhau) của dòng bị bỏ qua, để người dùng sửa Sheet — chỉ nhãn HW / mã lớp, không có thông tin cá nhân
const addExample = (set, v) => { if (v != null && set.size < EXAMPLES) set.add(String(v).trim().slice(0, 40)); };

// Số thứ tự HW: "HW2" / "HW 2" / "HW-02" / "Homework 2" / "Bài 2" / chỉ số "2" (ô số 2) -> { kind: 'hw', seq: 2 };
// "Capstone…" -> { kind: 'capstone', seq: 1 }; "Mini Project 2" / "MP2" -> { kind: 'mini', seq: 2 }
function parseHw(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 1 && raw <= 99 ? { kind: 'hw', seq: raw } : null;
  const s = String(raw ?? '').trim().normalize('NFC');
  const m = /^(?:(?:HW|HOMEWORK|BÀI(?:\s*TẬP)?|BAI(?:\s*TAP)?)\s*[-_.#:]?\s*)?0*(\d{1,2})$/i.exec(s);
  if (m && Number(m[1]) >= 1) return { kind: 'hw', seq: Number(m[1]) };
  if (/^capstone/i.test(s)) return { kind: 'capstone', seq: 1 };
  const mini = /^(?:MINI\s*PROJECT|MINI|MP)\s*[-_.#:]?\s*0*(\d{1,2})$/i.exec(s);
  if (mini && Number(mini[1]) >= 1) return { kind: 'mini', seq: Number(mini[1]) };
  return null;
}
// Mã lớp viết tắt: "BIE102" / "bie 102" / "BIE-102" / "BIE95" / mã đầy đủ "P2.BIE.P102.HY.AA.260726" -> "BIE102"
function normalizeCourse(raw) {
  const s = txt(raw)?.toUpperCase().normalize('NFC');
  if (!s) return null;
  const full = /^[A-Z]\d*\.([A-Z]{2,5})\.[A-Z]?(\d{1,4})(?!\d)/.exec(s);
  if (full) return full[1] + full[2].padStart(3, '0');
  const short = /^([A-Z]{2,5})[\s._-]*0*(\d{1,4})$/.exec(s);
  if (short) return short[1] + short[2].padStart(3, '0');
  return s.replace(/\s+/g, '');
}
// 8 / "8,8" / "9.5" -> số 0..10 (làm tròn 2 chữ số); ngoài khoảng hoặc không phải số -> null
function parseScore(raw) {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 100) / 100;
}

// Bài tương đương theo chương trình (theo chữ đầu mã lớp): BIH "Mini Project 3" chính là HW5 → lưu vào bài HW5 của lớp
// (giữ tick nộp, % HW, tốt nghiệp như HW5; giao diện hiện tên MP3). Phải khớp ASSIGNMENT_ALIASES (chiều ngược) trong public/js/class-filter.mjs.
const POINT_ALIASES = { BIH: { 'mini:3': { kind: 'hw', seq: 5 } } };
function applyAlias(short, hw) {
  const prog = /^([A-Z]+)/.exec(short)?.[1];
  return POINT_ALIASES[prog]?.[`${hw.kind}:${hw.seq}`] ?? hw;
}

function parsePointRows(table) {
  const h = table.headers;
  const col = (...names) => names.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iSid = col('STUDENTID', 'STUDENT ID'), iCourse = col('COURSE'), iHw = col('HW'), iPoint = col('POINT'), iModule = col('MODULE');
  const out = { entries: new Map(), skipped: { bad_student_id: 0, bad_hw: 0, bad_point: 0, no_course: 0 }, total: table.rows.length, badHw: new Set(), badPoint: new Set() };
  if ([iSid, iCourse, iHw, iPoint].some((i) => i < 0)) {
    const e = new Error('Thiếu cột trong tab Point (cần StudentID, Course, HW, Point)');
    e.status = 422; e.expose = true; throw e;
  }
  for (const r of table.rows) {
    const sid = txt(r[iSid]);
    const short = normalizeCourse(r[iCourse]);
    if (!sid && !short && r[iHw] == null && r[iPoint] == null) { out.total--; continue; }   // dòng trống
    if (!sid || !STUDENT_ID_RE.test(sid)) { out.skipped.bad_student_id++; continue; }
    if (!short) { out.skipped.no_course++; continue; }
    const raw = parseHw(r[iHw]);
    const hw = raw && applyAlias(short, raw);
    if (!hw) { out.skipped.bad_hw++; addExample(out.badHw, r[iHw]); continue; }
    const score = parseScore(r[iPoint]);
    if (score == null) { out.skipped.bad_point++; addExample(out.badPoint, `${short} ${txt(r[iHw]) ?? ''}: ${r[iPoint] == null ? '(trống)' : r[iPoint]}`); continue; }
    out.entries.set(`${short}|${sid}|${hw.kind}:${hw.seq}`, { short, sid, ...hw, score, module: (txt(iModule >= 0 ? r[iModule] : null) ?? '').slice(0, 60) || null });
  }
  return out;
}

async function importPoints(db, table, { dryRun = false } = {}) {
  const parsed = parsePointRows(table);
  const entries = [...parsed.entries.values()];
  const summary = {
    points_rows: parsed.total, valid: entries.length,
    skipped_bad_student_id: parsed.skipped.bad_student_id, skipped_bad_hw: parsed.skipped.bad_hw,
    skipped_bad_point: parsed.skipped.bad_point, skipped_no_course: parsed.skipped.no_course,
    skipped_unknown_class: 0, skipped_no_enrollment: 0, skipped_no_assignment: 0,
    inserted: 0, updated: 0, deleted: 0, delete_skipped: false, class_ids: [], created_assignments: 0,
    examples: { bad_hw: [...parsed.badHw], bad_point: [...parsed.badPoint], unknown_class: [], no_assignment: [], no_enrollment: [] },
  };
  const unknownClass = new Set(); const noAssignment = new Set(); const noEnrollment = new Set();
  if (!entries.length) return summary;

  const ROLLBACK = Symbol('rollback');
  try {
    await db.tx(async (t) => {
      const shorts = [...new Set(entries.map((e) => e.short))];
      const classes = await t.all('select id, short_code from classes where short_code = any($1::text[])', [shorts]);
      const classId = new Map(classes.map((c) => [c.short_code, c.id]));
      const ids = classes.map((c) => c.id);
      // Mini Project chưa có ở lớp thì tạo (lớp không có sẵn bài Mini Project như HW/Capstone)
      const minis = [...new Map(entries.filter((e) => e.kind === 'mini' && classId.has(e.short))
        .map((e) => [`${classId.get(e.short)}|${e.seq}`, [classId.get(e.short), e.seq]])).values()];
      if (minis.length) {
        const made = await t.all(
          `insert into assignments (class_id, kind, seq, title)
           select c, 'mini', s, 'Mini Project ' || s from unnest($1::bigint[], $2::int[]) as u(c, s)
           on conflict (class_id, kind, seq) do nothing returning id`, [minis.map((m) => m[0]), minis.map((m) => m[1])]);
        summary.created_assignments = made.length;
      }
      const enr = ids.length ? await t.all(
        `select e.id, e.class_id, s.student_code from enrollments e join students s on s.id = e.student_id where e.class_id = any($1::bigint[])`, [ids]) : [];
      const enrId = new Map(enr.map((e) => [`${e.class_id}|${e.student_code}`, e.id]));
      const asg = ids.length ? await t.all('select id, class_id, kind, seq from assignments where class_id = any($1::bigint[])', [ids]) : [];
      const asgId = new Map(asg.map((a) => [`${a.class_id}|${a.kind}:${a.seq}`, a.id]));

      const rows = [];
      const usedClasses = new Set();
      for (const e of entries) {
        const cid = classId.get(e.short);
        if (!cid) { summary.skipped_unknown_class++; addExample(unknownClass, e.short); continue; }
        const eid = enrId.get(`${cid}|${e.sid}`);
        if (!eid) { summary.skipped_no_enrollment++; addExample(noEnrollment, `${e.short} ${e.kind === 'capstone' ? 'Capstone' : `${e.kind === 'mini' ? 'MP' : 'HW'}${e.seq}`}`); continue; }
        const aid = asgId.get(`${cid}|${e.kind}:${e.seq}`);
        if (!aid) { summary.skipped_no_assignment++; addExample(noAssignment, `${e.short} ${e.kind === 'capstone' ? 'Capstone' : `${e.kind === 'mini' ? 'MP' : 'HW'}${e.seq}`}`); continue; }
        rows.push({ eid, aid, score: e.score, module: e.module });
        usedClasses.add(cid);
      }
      summary.class_ids = [...usedClasses];
      summary.examples.unknown_class = [...unknownClass];
      summary.examples.no_assignment = [...noAssignment];
      summary.examples.no_enrollment = [...noEnrollment];

      if (rows.length) {
        const res = await t.all(
          `insert into homework_scores (enrollment_id, assignment_id, score, module)
           select * from unnest($1::bigint[], $2::bigint[], $3::numeric[], $4::text[])
           on conflict (enrollment_id, assignment_id) do update set score = excluded.score, module = excluded.module, updated_at = now()
             where homework_scores.manual is false   -- điểm gõ tay trên web được giữ nguyên: Excel chỉ điền ô còn trống / cập nhật điểm từ Excel
               and (homework_scores.score is distinct from excluded.score or homework_scores.module is distinct from excluded.module)
           returning (xmax = 0) as inserted`,
          [rows.map((r) => r.eid), rows.map((r) => r.aid), rows.map((r) => r.score), rows.map((r) => r.module)]);
        summary.inserted = res.filter((r) => r.inserted).length;
        summary.updated = res.length - summary.inserted;
      }

      // Sheet là bản chuẩn: điểm không còn trong Sheet (của các lớp có mặt trong lượt này) bị xóa — có chốt chặn.
      if (usedClasses.size) {
        const keep = new Set(rows.map((r) => `${r.eid}|${r.aid}`));
        const existing = await t.all(
          `select hs.id, hs.enrollment_id, hs.assignment_id from homework_scores hs join enrollments e on e.id = hs.enrollment_id
            where e.class_id = any($1::bigint[]) and hs.manual is false`, [[...usedClasses]]);   // điểm gõ tay không bao giờ bị xóa theo Excel
        const gone = existing.filter((x) => !keep.has(`${x.enrollment_id}|${x.assignment_id}`));
        if (gone.length) {
          if (gone.length > Math.max(DELETE_MIN, Math.ceil(existing.length * DELETE_RATIO))) summary.delete_skipped = true;
          else { await t.run('delete from homework_scores where id = any($1::bigint[])', [gone.map((x) => x.id)]); summary.deleted = gone.length; }
        }
      }
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return summary;
}

module.exports = { importPoints, parsePointRows, parseHw, parseScore, normalizeCourse, applyAlias, POINT_ALIASES, POINT_COLUMNS, POINT_SYNC_COLUMNS };
