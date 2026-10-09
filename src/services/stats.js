// Tính tỉ lệ điểm danh / hoàn thành bài tập. Mọi quy tắc tính nằm ở đây (xem Documents/context.md).
const ATTENDANCE_THRESHOLD = Number(process.env.ATTENDANCE_THRESHOLD || 0.8);
const MISSING_HW_ALERT = Number(process.env.MISSING_HW_ALERT || 2);

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

async function loadClassData(db, classId) {
  const [sessions, assignments, enrollments, attendance, submissions] = await Promise.all([
    db.all('select * from sessions where class_id = $1 order by session_no', [classId]),
    db.all('select * from assignments where class_id = $1', [classId]),
    db.all(`
      select e.*, s.student_code, s.full_name, s.email, s.phone,
             v.amount as voucher_amount, v.sent_date as voucher_sent_date,
             v.expiration_date as voucher_expiration_date, v.status as voucher_status
      from enrollments e
      join students s on s.id = e.student_id
      left join vouchers v on v.enrollment_id = e.id
      where e.class_id = $1 order by lower(s.full_name), s.id`, [classId]),
    db.all('select a.* from attendance a join sessions s on s.id = a.session_id where s.class_id = $1', [classId]),
    db.all('select b.* from submissions b join assignments a on a.id = b.assignment_id where a.class_id = $1', [classId]),
  ]);
  assignments.sort((a, b) => (a.kind === b.kind ? a.seq - b.seq : a.kind === 'hw' ? -1 : 1)); // hw trước capstone
  return { sessions, assignments, enrollments, attendance, submissions };
}

function indexBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) map.set(keyFn(r), r);
  return map;
}

// Trả về map enrollment_id -> thống kê.
function computeEnrollmentStats({ sessions, assignments, enrollments, attendance, submissions }) {
  const heldIds = new Set(sessions.filter((s) => s.held).map((s) => s.id));
  const hwIds = new Set(assignments.filter((a) => a.kind === 'hw' && a.collected).map((a) => a.id));
  const attIdx = indexBy(attendance, (a) => `${a.enrollment_id}:${a.session_id}`);
  const subIdx = indexBy(submissions, (s) => `${s.enrollment_id}:${s.assignment_id}`);
  const capstone = assignments.find((a) => a.kind === 'capstone');

  const stats = new Map();
  for (const e of enrollments) {
    let attended = 0, excused = 0, absent = 0;
    for (const sid of heldIds) {
      const st = attIdx.get(`${e.id}:${sid}`)?.status ?? 'absent';
      if (st === 'present' || st === 'late') attended++;
      else if (st === 'excused') excused++;
      else absent++;
    }
    const denom = heldIds.size - excused;
    let hwDone = 0, hwMissing = 0;
    for (const aid of hwIds) {
      const st = subIdx.get(`${e.id}:${aid}`)?.status ?? 'missing';
      if (st === 'submitted') hwDone++; else hwMissing++;
    }
    const cap = capstone && subIdx.get(`${e.id}:${capstone.id}`)?.status;
    stats.set(e.id, {
      attended, absent, excused,
      attendance_rate: denom > 0 ? round(attended / denom) : null,
      hw_done: hwDone, hw_missing: hwMissing,
      hw_rate: hwIds.size > 0 ? round(hwDone / hwIds.size) : null,
      capstone_status: cap ?? null,
    });
  }
  return stats;
}

const mean = (xs) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

async function buildDashboard(db, cls) {
  const data = await loadClassData(db, cls.id);
  const stats = computeEnrollmentStats(data);
  const active = data.enrollments.filter((e) => e.course_status === 'active' || e.course_status === 'completed');

  const bySession = data.sessions.map((s) => {
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    if (s.held) {
      const recorded = new Map(data.attendance.filter((a) => a.session_id === s.id).map((a) => [a.enrollment_id, a.status]));
      for (const e of active) counts[recorded.get(e.id) ?? 'absent']++;
    }
    const denom = active.length - counts.excused;
    return {
      session_id: s.id, session_no: s.session_no, title: s.title, held: !!s.held, ...counts,
      rate: s.held && denom > 0 ? round((counts.present + counts.late) / denom) : null,
    };
  });

  const byAssignment = data.assignments.map((a) => {
    const counts = { submitted: 0, resubmit: 0, missing: 0 };
    if (a.collected) {
      const recorded = new Map(data.submissions.filter((x) => x.assignment_id === a.id).map((x) => [x.enrollment_id, x.status]));
      for (const e of active) counts[recorded.get(e.id) ?? 'missing']++;
    }
    return {
      assignment_id: a.id, kind: a.kind, seq: a.seq, title: a.title, collected: !!a.collected, ...counts,
      rate: a.collected && active.length ? round(counts.submitted / active.length) : null,
    };
  });

  const modeCounts = {};
  for (const e of active) modeCounts[e.mode || 'Chưa rõ'] = (modeCounts[e.mode || 'Chưa rõ'] || 0) + 1;

  const atRisk = active.map((e) => ({ e, s: stats.get(e.id) }))
    .filter(({ s }) => (s.attendance_rate != null && s.attendance_rate < ATTENDANCE_THRESHOLD) || s.hw_missing >= MISSING_HW_ALERT)
    .map(({ e, s }) => ({
      enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, mode: e.mode,
      attendance_rate: s.attendance_rate, hw_missing: s.hw_missing,
    }))
    .sort((a, b) => (a.attendance_rate ?? 1) - (b.attendance_rate ?? 1));

  const stat = (e) => stats.get(e.id);
  return {
    class: cls,
    thresholds: { attendance: ATTENDANCE_THRESHOLD, missing_hw: MISSING_HW_ALERT },
    totals: {
      enrolled: data.enrollments.length,
      active: active.length,
      deferred: data.enrollments.filter((e) => e.course_status === 'deferred').length,
      dropped: data.enrollments.filter((e) => e.course_status === 'dropped').length,
      held_sessions: data.sessions.filter((s) => s.held).length,
      total_sessions: data.sessions.length,
      avg_attendance_rate: mean(active.map(stat).map((s) => s.attendance_rate).filter((x) => x != null)),
      avg_hw_rate: mean(active.map(stat).map((s) => s.hw_rate).filter((x) => x != null)),
      at_risk: atRisk.length,
    },
    by_session: bySession,
    by_assignment: byAssignment,
    by_mode: Object.entries(modeCounts).map(([mode, count]) => ({ mode, count })),
    at_risk: atRisk,
  };
}

module.exports = { loadClassData, computeEnrollmentStats, buildDashboard, ATTENDANCE_THRESHOLD };
