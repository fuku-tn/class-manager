// Tính tỉ lệ điểm danh / hoàn thành bài tập. Mọi quy tắc tính nằm ở đây (xem Documents/1-tong-quan/context.md).
const ATTENDANCE_THRESHOLD = Number(process.env.ATTENDANCE_THRESHOLD || 0.8);
const MISSING_HW_ALERT = Number(process.env.MISSING_HW_ALERT || 2);

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

// NGUỒN DUY NHẤT của công thức chuyên cần: (có mặt + trễ) ÷ (số lượt đã diễn ra − số lượt vắng có phép).
// Vắng có phép không làm giảm tỉ lệ. Trả null khi chưa có mẫu số.
function attendanceRate(attended, excused, held) {
  const denom = held - excused;
  return denom > 0 ? round(attended / denom) : null;
}

// Tiến độ homework của một học viên: done/total, % làm tròn số nguyên 0–100 (theo bộ kit nhắc bài).
function homeworkProgress(done, total) {
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, complete: total > 0 && done === total };
}

// Thống kê homework cả lớp để gửi group chung — CHỈ số tổng hợp, không có tên.
// rows: mảng các d (mảng 0/1 theo từng bài); labels: nhãn bài. minGroup ≥ 2: nếu có nhóm "k/T bài" chưa đủ mà 0 < n < minGroup
// thì gộp mọi nhóm chưa đủ thành "Chưa đủ T/T bài" để không ai bị nhận ra là người duy nhất trong nhóm.
function classHomeworkStats(rows, labels, { minGroup = 1 } = {}) {
  const N = rows.length;
  const T = labels.length;
  const cnt = rows.map((d) => d.reduce((a, b) => a + b, 0));
  const full = cnt.filter((c) => c === T).length;
  const avg = N && T ? Math.round((cnt.reduce((a, b) => a + b, 0) / (N * T)) * 100) : 0;
  const byCol = labels.map((label, k) => ({ label, n: rows.filter((d) => d[k]).length }));
  let dist = [];
  for (let k = T; k >= 0; k--) dist.push({ k, label: `${k}/${T} bài`, n: cnt.filter((c) => c === k).length, merged: false });
  let mergedNote = false;
  if (minGroup > 1 && dist.some((b) => b.k < T && b.n > 0 && b.n < minGroup)) {
    const rest = dist.filter((b) => b.k < T);
    dist = [dist.find((b) => b.k === T), { k: -1, label: `Chưa đủ ${T}/${T} bài`, n: rest.reduce((a, b) => a + b.n, 0), merged: true }];
    mergedNote = true;
  }
  const remaining = N - full;
  // Còn ít người chưa xong hơn ngưỡng: KPI "x/N hoàn thành" ngầm cho biết có người chưa xong — để người vận hành tự cân nhắc.
  const smallRemainder = remaining > 0 && minGroup > 1 && remaining < minGroup;
  return { N, T, full, avg, byCol, dist, mergedNote, remaining, smallRemainder };
}

// Điểm trung bình của khảo sát (bỏ giá trị trống). null khi không có phiếu nào.
function averageScore(values) {
  const v = values.filter((x) => typeof x === 'number');
  return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}
// NPS trên thang 0–10: (%người ≥ 9) − (%người ≤ 6), làm tròn số nguyên từ −100 đến 100. null khi không có phiếu.
function npsScore(values) {
  const v = values.filter((x) => typeof x === 'number');
  if (!v.length) return null;
  const promoters = v.filter((x) => x >= 9).length;
  const detractors = v.filter((x) => x <= 6).length;
  return Math.round(((promoters - detractors) / v.length) * 100);
}

// Thứ tự họ tên theo bảng chữ cái tiếng Việt (Đ ngay sau D; database xếp theo mã ký tự nên Đ rơi xuống cuối).
const viCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
const compareByName = (a, b) => viCollator.compare(a.full_name ?? '', b.full_name ?? '') || viCollator.compare(a.student_code ?? '', b.student_code ?? '');

const KIND_ORDER = { hw: 0, mini: 1, capstone: 2 };   // thứ tự cột bài: HW → Mini Project → Capstone
async function loadClassData(db, classId) {
  const [sessions, assignments, enrollments, attendance, submissions] = await Promise.all([
    db.all('select * from sessions where class_id = $1 order by session_no', [classId]),
    db.all('select * from assignments where class_id = $1', [classId]),
    db.all(`
      select e.*, s.student_code, s.full_name, s.email, s.phone, s.gender, s.honorific, s.call_name
      from enrollments e
      join students s on s.id = e.student_id
      where e.class_id = $1 order by lower(s.full_name), s.id`, [classId]),
    db.all(`select a.*, u.name as updated_by_name from attendance a join sessions s on s.id = a.session_id
      left join users u on u.id = a.updated_by where s.class_id = $1`, [classId]),
    db.all(`select b.*, u.name as updated_by_name from submissions b join assignments a on a.id = b.assignment_id
      left join users u on u.id = b.updated_by where a.class_id = $1`, [classId]),
  ]);
  enrollments.sort(compareByName);
  assignments.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.seq - b.seq); // HW → Mini Project → Capstone
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
    let hwDone = 0, hwMissing = 0;
    for (const aid of hwIds) {
      const st = subIdx.get(`${e.id}:${aid}`)?.status ?? 'missing';
      if (st === 'submitted') hwDone++; else hwMissing++;
    }
    const cap = capstone && subIdx.get(`${e.id}:${capstone.id}`)?.status;
    stats.set(e.id, {
      attended, absent, excused,
      held: heldIds.size, sessions_total: sessions.length,
      attendance_rate: attendanceRate(attended, excused, heldIds.size),
      hw_done: hwDone, hw_missing: hwMissing,
      hw_rate: hwIds.size > 0 ? round(hwDone / hwIds.size) : null,
      capstone_status: cap ?? null,
    });
  }
  return stats;
}

// Hiện diện / sĩ số của từng buổi. Sĩ số = học viên đang học hoặc đã hoàn thành (cùng tập với Dashboard).
// Buổi đã diễn ra: ô chưa điểm danh tính là vắng. Trả về Map session_id -> { held, roster, attended, late, excused, absent }.
function sessionSummaries({ sessions, enrollments, attendance }) {
  const roster = new Set(enrollments.filter((e) => e.course_status === 'active' || e.course_status === 'completed').map((e) => e.id));
  const raw = new Map(sessions.map((s) => [s.id, { held: !!s.held, present: 0, late: 0, excused: 0 }]));
  for (const a of attendance) {
    const c = raw.get(a.session_id);
    if (c && c.held && roster.has(a.enrollment_id) && a.status in c) c[a.status]++;
  }
  const out = new Map();
  for (const [id, c] of raw) {
    out.set(id, {
      held: c.held, roster: roster.size, attended: c.present + c.late, late: c.late, excused: c.excused,
      absent: c.held ? Math.max(0, roster.size - c.present - c.late - c.excused) : 0,
    });
  }
  return out;
}

const mean = (xs) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

async function buildDashboard(db, cls, { withScores = false } = {}) {
  const data = await loadClassData(db, cls.id);
  const stats = computeEnrollmentStats(data);
  const active = data.enrollments.filter((e) => e.course_status === 'active' || e.course_status === 'completed');

  const bySession = data.sessions.map((s) => {
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    if (s.held) {
      const recorded = new Map(data.attendance.filter((a) => a.session_id === s.id).map((a) => [a.enrollment_id, a.status]));
      for (const e of active) counts[recorded.get(e.id) ?? 'absent']++;
    }
    return {
      session_id: s.id, session_no: s.session_no, title: s.title, held: !!s.held, ...counts,
      rate: s.held ? attendanceRate(counts.present + counts.late, counts.excused, active.length) : null,
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
  // Điểm bài tập (tab Point, thang 10): trung bình các điểm của học viên đang học; null nếu lớp chưa có điểm hoặc người xem là khách.
  let avgScore = null;
  let scoredStudents = 0;
  if (withScores) {
    const ids = active.map((e) => e.id);
    const rows = ids.length ? await db.all('select enrollment_id, score::float8 as score from homework_scores where enrollment_id = any($1::bigint[])', [ids]) : [];
    avgScore = averageScore(rows.map((r) => r.score));
    scoredStudents = new Set(rows.map((r) => r.enrollment_id)).size;
  }
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
      avg_score: avgScore,
      scored_students: scoredStudents,
      at_risk: atRisk.length,
    },
    by_session: bySession,
    by_assignment: byAssignment,
    by_mode: Object.entries(modeCounts).map(([mode, count]) => ({ mode, count })),
    at_risk: atRisk,
  };
}

module.exports = { compareByName, loadClassData, computeEnrollmentStats, sessionSummaries, buildDashboard, attendanceRate, averageScore, npsScore, homeworkProgress, classHomeworkStats, ATTENDANCE_THRESHOLD };
