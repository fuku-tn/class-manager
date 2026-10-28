// Danh sách tốt nghiệp: đánh giá "đủ điều kiện" theo quy tắc của giáo trình (cấu hình được) — chỉ là GỢI Ý;
// quyết định cuối cùng do người đặt (enrollments.graduation_status). Sau này sẽ thêm điểm từng Module vào quy tắc.
//
// Quy tắc lấy từ Excel gốc (cột ELIGIBLE): chuyên cần ≥ ngưỡng, số bài HW hoàn thành ≥ yêu cầu, có nộp Capstone.
// Tỉ lệ chuyên cần lấy từ stats.js (công thức chỉ nằm ở đó); ở đây chỉ SO SÁNH với ngưỡng.
const DEFAULT_RULES = { attendance_min: 0.8, hw_pool: null, hw_min: null, capstone: false };

// status: 'none' = chưa có quy định (KHÔNG gợi ý, chỉ đặt kết quả thủ công); 'provisional' = tạm theo Excel cũ; 'confirmed' = admin đã xác nhận.
function rulesFromCurriculum(cur) {
  if (!cur) return { ...DEFAULT_RULES, source: 'default', status: 'none' };
  return {
    status: cur.grad_rules_status ?? 'none',
    attendance_min: cur.grad_attendance_min == null ? DEFAULT_RULES.attendance_min : Number(cur.grad_attendance_min),
    hw_pool: cur.grad_hw_pool ?? null,
    hw_min: cur.grad_hw_min ?? null,
    capstone: !!cur.grad_capstone,
    source: 'curriculum', curriculum_code: cur.code,
  };
}

// Số buổi tối thiểu phải tham gia — Quy định 003/2026/QĐ-STARTTRAIN, Điều 5 (ban hành 14/08/2026).
// Tra theo mã giáo trình trước, sau đó theo mã chương trình. Chương trình không có trong bảng (BIH-11, BSM, DBC, WKS...) thì không áp dụng.
// Điểm (Điều 9, 11) CHƯA đưa vào: chủ dự án sẽ cung cấp điểm thật của các lớp sau.
const MIN_SESSIONS = { 'BIE-8': 6, 'BIE-12': 9, 'BIH-20': 16, EBA: 5, SQL: 4, PBM: 8, DDM: 5, SCA: 7 };
const SESSION_RULE_SOURCE = 'Quy định 003/2026/QĐ-STARTTRAIN';
function minSessionsFor(program, cur) {
  return MIN_SESSIONS[cur?.code] ?? MIN_SESSIONS[String(program ?? '').toUpperCase()] ?? null;
}
// Gắn điều kiện số buổi vào quy tắc. Lớp chưa có quy tắc HW/Capstone (status none) chuyển thành 'partial': chỉ xét số buổi.
function withSessionRule(rules, program, cur) {
  const min = minSessionsFor(program, cur);
  if (min == null) return rules;
  return { ...rules, min_sessions: min, min_sessions_source: SESSION_RULE_SOURCE, status: rules.status === 'none' ? 'partial' : rules.status };
}

// hwStatuses: trạng thái các bài HW của học viên theo thứ tự bài (null = chưa có); capstoneStatus: 'submitted' | ... | null
// Điều kiện số buổi: (có mặt + vắng có phép) ≥ tối thiểu — vắng hợp lệ không bị tính vào số buổi được phép vắng (Điều 6).
// attendance: { attended, excused, held, total }; chưa đủ buổi để chắc chắn thì trả null (chưa gợi ý).
function sessionsCheck(min, { attended = 0, excused = 0, held = 0, total = 0 } = {}) {
  const have = attended + excused;
  let ok = null;
  if (have >= min) ok = true;
  else if (held > 0 && total > 0 && have + Math.max(0, total - held) < min) ok = false;
  return { value: have, min, sessions: true, ok };
}

function evaluateGraduation(rules, { attendanceRate, hwStatuses, capstoneStatus, attendance }) {
  if (rules.status === 'none' && rules.min_sessions == null) return { eligible: null, reasons: [], checks: { attendance: { ok: null }, hw: { done: 0, pool: 0, ok: null }, capstone: { ok: null } } };
  const pool = rules.hw_pool ? hwStatuses.slice(0, rules.hw_pool) : hwStatuses;
  const done = pool.filter((s) => s === 'submitted').length;
  const checks = {
    attendance: rules.min_sessions != null
      ? sessionsCheck(rules.min_sessions, attendance)
      : { value: attendanceRate, min: rules.attendance_min, ok: attendanceRate == null ? null : attendanceRate >= rules.attendance_min },
    hw: rules.hw_min == null
      ? { required: false, done, pool: pool.length, ok: true }
      : { required: true, done, pool: pool.length, min: rules.hw_min, ok: done >= rules.hw_min },
    capstone: rules.capstone ? { required: true, ok: capstoneStatus === 'submitted' } : { required: false, ok: true },
  };
  const reasons = [];
  if (checks.attendance.ok === false) {
    reasons.push(rules.min_sessions != null
      ? `Có mặt ${checks.attendance.value}/${rules.min_sessions} buổi tối thiểu`
      : `Chuyên cần ${Math.round(attendanceRate * 100)}% < ${Math.round(rules.attendance_min * 100)}%`);
  }
  if (checks.hw.ok === false) reasons.push(`HW ${done}/${rules.hw_min}`);
  if (checks.capstone.ok === false) reasons.push('Chưa nộp Capstone');
  // Chưa có buổi nào được điểm danh → chưa đủ dữ liệu để gợi ý
  const eligible = checks.attendance.ok === null ? null : (checks.attendance.ok && checks.hw.ok && checks.capstone.ok);
  return { eligible, reasons, checks };
}

// data: kết quả loadClassData; stats: computeEnrollmentStats(data) (Map enrollment_id -> thống kê)
function buildGraduationRows(data, stats, rules) {
  const hwList = data.assignments.filter((a) => a.kind === 'hw').sort((a, b) => a.seq - b.seq);
  const capstone = data.assignments.find((a) => a.kind === 'capstone');
  const sub = new Map(data.submissions.map((s) => [`${s.enrollment_id}:${s.assignment_id}`, s.status]));
  return data.enrollments
    .filter((e) => e.course_status === 'active' || e.course_status === 'completed')
    .map((e) => {
      const st = stats.get(e.id);
      const hwStatuses = hwList.map((a) => sub.get(`${e.id}:${a.id}`) ?? null);
      const capStatus = capstone ? (sub.get(`${e.id}:${capstone.id}`) ?? null) : null;
      const ev = evaluateGraduation(rules, { attendanceRate: st.attendance_rate, hwStatuses, capstoneStatus: capStatus,
        attendance: { attended: st.attended, excused: st.excused, held: st.held, total: st.sessions_total } });
      return {
        enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, course_status: e.course_status,
        segment: e.segment, company_name: e.company_name,
        attendance_rate: st.attendance_rate, sessions_present: ev.checks.attendance.sessions ? ev.checks.attendance.value : null,
        hw_done: ev.checks.hw.done, hw_pool: ev.checks.hw.pool, capstone_status: capStatus,
        suggestion: { eligible: ev.eligible, reasons: ev.reasons },
        decision: { status: e.graduation_status ?? 'pending', note: e.graduation_note ?? null, by: e.graduation_by_name ?? null, at: e.graduation_at ?? null },
        certificate: { status: e.certificate_status ?? null, number: e.certificate_number ?? null, sent_date: e.certificate_sent_date ?? null },
      };
    });
}

// ---------- Xét TỰ ĐỘNG (chủ dự án chốt 18/10/2026) ----------
// BIE-8, BIE-12, BIH-20, BIH-11, EBA-6 (EBA: 5 buổi theo Quy định + đủ 4 HW + Capstone): Tốt nghiệp = đủ số buổi tối thiểu (Quy định 003/2026; BIH-11 chưa có trong quy định → 9 buổi)
// + làm đủ TẤT CẢ bài đã giao: mọi HW, mọi Mini Project (BIH) và Capstone Project.
// Kết quả tự đổi khi tick HW / điểm danh đổi (tính lại mỗi lần mở trang); khi admin công bố thì kết quả được chốt vào enrollments.
const AUTO_MIN_SESSIONS = { 'BIE-8': 6, 'BIE-12': 9, 'BIH-20': 16, 'BIH-11': 9, 'EBA-6': 5, 'EBA-8': 6 };   // EBA-8: lớp EBA thời 8 buổi (EBA069–073), chủ dự án chốt 6 buổi
const AUTO_SOURCE = { 'BIH-11': 'chủ dự án (chưa có trong Quy định 003/2026)' };
// Số HW tối đa được xét theo chương trình: BIE, BIH có HW1–HW5 (BIH: HW5 = Mini Project 3); EBA có HW1–HW4 + Capstone.
// HW lớn hơn còn sót trong dữ liệu cũ không xét.
const AUTO_HW_MAX = { BIE: 5, BIH: 5, EBA: 4 };
const AUTO_HW_MAX_BY_CLASS = { BIE104: 6 };   // BIE104 có 6 HW (HW5 Data Visualization IBCS, HW6 Data Storytelling); từ BIE105 quay lại 5 HW
// EBA: số HW CỐ ĐỊNH phải làm đủ (chủ dự án: "đủ 4 HW và 1 Capstone"; lớp cũ 8 buổi: 3 HW + Capstone) — HW chưa có tick nào vẫn bắt buộc,
// khớp cột ELIGIBLE trong file "KHÓA EXCEL_ĐIỂM DANH HỌC VIÊN". BIE/BIH: chỉ xét bài đã giao.
const AUTO_FIXED_HW = { 'EBA-6': 4, 'EBA-8': 3 };
// Có điểm thì phải ≥ 6 (thang 10) mới tính là đã làm bài (chủ dự án chốt 18/10/2026); chưa có điểm thì dựa vào tick "Đã nộp".
const PASS_SCORE = 6;
function autoRulesFor(cur, shortCode) {
  const min = AUTO_MIN_SESSIONS[cur?.code];
  if (min == null) return null;
  return { status: 'auto', auto: true, curriculum_code: cur.code, source: 'curriculum', min_sessions: min,
    min_sessions_source: AUTO_SOURCE[cur.code] ?? SESSION_RULE_SOURCE, all_assignments: true, capstone: true, attendance_min: null,
    hw_max: AUTO_HW_MAX_BY_CLASS[String(shortCode ?? '').toUpperCase()] ?? AUTO_HW_MAX[cur.program ?? String(cur.code).split('-')[0]] ?? 5, fixed_hw: AUTO_FIXED_HW[cur.code] ?? null, pass_score: PASS_SCORE };
}

// Tên bài hiển thị (BIH: HW5 chính là Mini Project 3 — khớp ASSIGNMENT_ALIASES trong public/js/class-filter.mjs)
function assignmentName(a, program) {
  if (a.kind === 'capstone') return 'Capstone';
  if (String(program ?? '').toUpperCase() === 'BIH' && a.kind === 'hw' && a.seq === 5) return 'MP3';
  return `${a.kind === 'mini' ? 'MP' : 'HW'}${a.seq}`;
}
const KIND_RANK = { hw: 0, mini: 1, capstone: 2 };

// Bài bắt buộc: HW1–HW5 / Mini Project đã giao (đã có tick ở ít nhất 1 học viên — collected — hoặc đã có điểm) + Capstone
// (bắt buộc nếu lớp có bài Capstone; lớp không có Project thì không có bài này).
// Hoàn thành một bài: có điểm → điểm ≥ 6; chưa có điểm → tick "Đã nộp" (Mini Project không có tick, chỉ có điểm).
function buildAutoRows(data, stats, rules, { scores = [], program, open = false } = {}) {
  const scoreOf = new Map(scores.map((s) => [`${s.enrollment_id}:${s.assignment_id}`, s.score == null ? null : Number(s.score)]));
  const scored = new Set(scoreOf.keys());
  const scoredAsg = new Set(scores.map((s) => s.assignment_id));
  const passScore = rules.pass_score ?? PASS_SCORE;
  let base = data.assignments
    .filter((a) => a.kind === 'capstone' || ((a.collected || scoredAsg.has(a.id)) && !(a.kind === 'hw' && a.seq > (rules.hw_max ?? 99))));
  if (rules.fixed_hw) {   // EBA: luôn bắt buộc HW1..N + Capstone, kể cả bài chưa có trên web (coi như chưa làm)
    const find = (kind, seq) => data.assignments.find((a) => a.kind === kind && a.seq === seq) ?? { id: `virtual-${kind}${seq}`, kind, seq };
    base = [...Array.from({ length: rules.fixed_hw }, (_, i) => find('hw', i + 1)), find('capstone', 1)];
  }
  const required = base
    .map((a) => ({ ...a, name: assignmentName(a, program) }))
    .sort((a, b) => {
      const ra = a.name.startsWith('MP') ? 1 : KIND_RANK[a.kind]; const rb = b.name.startsWith('MP') ? 1 : KIND_RANK[b.kind];
      return ra - rb || Number(a.name.replace(/\D/g, '') || 0) - Number(b.name.replace(/\D/g, '') || 0);
    });
  const sub = new Map(data.submissions.map((s) => [`${s.enrollment_id}:${s.assignment_id}`, s.status]));
  return data.enrollments
    .filter((e) => e.course_status === 'active' || e.course_status === 'completed')
    .map((e) => {
      const st = stats.get(e.id);
      const sess = sessionsCheck(rules.min_sessions, { attended: st.attended, excused: st.excused, held: st.held, total: st.sessions_total });
      const missing = []; const low = [];
      for (const a of required) {
        const k = `${e.id}:${a.id}`;
        if (scoreOf.has(k)) { if (!(scoreOf.get(k) >= passScore)) low.push(`${a.name} (${scoreOf.get(k)})`); }
        else if (sub.get(k) !== 'submitted') missing.push(a.name);
      }
      const reasons = [];
      if (sess.ok === false || (sess.ok === null && open)) reasons.push(`Có mặt ${sess.value}/${rules.min_sessions} buổi`);
      if (missing.length) reasons.push(`Thiếu ${missing.join(', ')}`);
      if (low.length) reasons.push(`Dưới ${passScore} điểm: ${low.join(', ')}`);
      const passed = sess.ok === true && !missing.length && !low.length;
      // Lớp còn đang học / trong thời gian nộp & chấm bài: chưa đủ thì là "Đang học", chưa kết luận "Chưa đạt".
      // Lớp đã qua thời gian chấm mà không có dữ liệu điểm danh: "Chưa đủ dữ liệu".
      const result = passed ? 'passed' : open ? 'in_progress' : sess.ok === null ? 'no_data' : 'failed';
      const capstone = data.assignments.find((a) => a.kind === 'capstone');
      return {
        enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, course_status: e.course_status,
        segment: e.segment, company_name: e.company_name,
        attendance_rate: st.attendance_rate, sessions_present: sess.value, sessions_min: rules.min_sessions,
        hw_done: required.length - missing.length - low.length, hw_pool: required.length, missing, low,
        capstone_status: capstone ? (sub.get(`${e.id}:${capstone.id}`) ?? (scored.has(`${e.id}:${capstone.id}`) ? 'submitted' : null)) : null,
        auto: { result, reasons },
        suggestion: { eligible: result === 'passed' ? true : result === 'failed' ? false : null, reasons },
        decision: { status: e.graduation_status ?? 'pending', note: e.graduation_note ?? null, by: e.graduation_by_name ?? null, at: e.graduation_at ?? null },
        certificate: { status: e.certificate_status ?? null, number: e.certificate_number ?? null, sent_date: e.certificate_sent_date ?? null },
      };
    });
}

function summarize(rows) {
  const s = { total: rows.length, passed: 0, failed: 0, pending: 0, in_progress: 0, suggested_pass: 0, suggested_fail: 0, no_data: 0 };
  for (const r of rows) {
    const k = r.result ?? r.decision.status;   // xét tự động: r.result = kết quả đang hiệu lực (tự động, hoặc đã chốt khi công bố)
    s[k] = (s[k] ?? 0) + 1;
    if (r.auto) continue;
    if (r.suggestion.eligible === true) s.suggested_pass++;
    else if (r.suggestion.eligible === false) s.suggested_fail++;
    else s.no_data++;
  }
  return s;
}

module.exports = { DEFAULT_RULES, MIN_SESSIONS, AUTO_MIN_SESSIONS, minSessionsFor, withSessionRule, rulesFromCurriculum, evaluateGraduation,
  buildGraduationRows, autoRulesFor, buildAutoRows, assignmentName, summarize };
