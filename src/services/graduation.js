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

// hwStatuses: trạng thái các bài HW của học viên theo thứ tự bài (null = chưa có); capstoneStatus: 'submitted' | ... | null
function evaluateGraduation(rules, { attendanceRate, hwStatuses, capstoneStatus }) {
  if (rules.status === 'none') return { eligible: null, reasons: [], checks: { attendance: { ok: null }, hw: { done: 0, pool: 0, ok: null }, capstone: { ok: null } } };
  const pool = rules.hw_pool ? hwStatuses.slice(0, rules.hw_pool) : hwStatuses;
  const done = pool.filter((s) => s === 'submitted').length;
  const checks = {
    attendance: { value: attendanceRate, min: rules.attendance_min, ok: attendanceRate == null ? null : attendanceRate >= rules.attendance_min },
    hw: rules.hw_min == null
      ? { required: false, done, pool: pool.length, ok: true }
      : { required: true, done, pool: pool.length, min: rules.hw_min, ok: done >= rules.hw_min },
    capstone: rules.capstone ? { required: true, ok: capstoneStatus === 'submitted' } : { required: false, ok: true },
  };
  const reasons = [];
  if (checks.attendance.ok === false) reasons.push(`Chuyên cần ${Math.round(attendanceRate * 100)}% < ${Math.round(rules.attendance_min * 100)}%`);
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
      const ev = evaluateGraduation(rules, { attendanceRate: st.attendance_rate, hwStatuses, capstoneStatus: capStatus });
      return {
        enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, course_status: e.course_status,
        segment: e.segment, company_name: e.company_name,
        attendance_rate: st.attendance_rate, hw_done: ev.checks.hw.done, hw_pool: ev.checks.hw.pool, capstone_status: capStatus,
        suggestion: { eligible: ev.eligible, reasons: ev.reasons },
        decision: { status: e.graduation_status ?? 'pending', note: e.graduation_note ?? null, by: e.graduation_by_name ?? null, at: e.graduation_at ?? null },
        certificate: { status: e.certificate_status ?? null, number: e.certificate_number ?? null, sent_date: e.certificate_sent_date ?? null },
      };
    });
}

function summarize(rows) {
  const s = { total: rows.length, passed: 0, failed: 0, pending: 0, suggested_pass: 0, suggested_fail: 0, no_data: 0 };
  for (const r of rows) {
    s[r.decision.status] = (s[r.decision.status] ?? 0) + 1;
    if (r.suggestion.eligible === true) s.suggested_pass++;
    else if (r.suggestion.eligible === false) s.suggested_fail++;
    else s.no_data++;
  }
  return s;
}

module.exports = { DEFAULT_RULES, rulesFromCurriculum, evaluateGraduation, buildGraduationRows, summarize };
