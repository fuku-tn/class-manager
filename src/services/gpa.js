// GPA, xếp loại và Top Performance — NGUỒN DUY NHẤT của các công thức này (như stats.js cho tỉ lệ).
// Quy tắc lấy từ thư mục transcripts/ (Transcript-BIE101/BIE099/BIH98, EBA117/EBA118):
//  • Điểm module (thang 10) → điểm chữ + điểm hệ 4 theo GradeScale; module nhiều bài (vd Data Transformation = HW2 + HW3) lấy TRUNG BÌNH các bài có điểm.
//  • GPA = Σ trọng số × điểm hệ 4 của module, làm tròn 2 số. Trọng số theo chương trình: BIE chia đều, EBA 25/25/25/10/15, BIH 35/20/20/5/5/5/10.
//  • Module đã giao mà học viên làm bài (đã tick nộp) nhưng chưa được chấm thì BỎ QUA (chưa chấm ≠ 0 điểm); chưa nộp và chưa có điểm thì tính 0 (F).
//  • Module chưa có điểm của một học viên tính 0 (F) — nhưng chỉ xét các module ĐÃ GIAO (ít nhất một học viên có điểm) nên GPA giữa khóa là "GPA đến hiện tại";
//    trọng số được chuẩn hóa lại trên các module đã giao.
//  • Xếp loại theo ClassificationScale; GPA < 2.5 = Fail (không tốt nghiệp dù học đủ, làm đủ — admin có thể chỉnh tay kết quả).
const { moduleFor } = require('./scoreModules');

const round = (n, d = 2) => Math.round(n * 10 ** d + 1e-9) / 10 ** d;   // +1e-9: 3.285 → 3.29 như ROUND của Excel (tránh sai số nhị phân)

// [điểm tối thiểu, điểm chữ, điểm hệ 4, diễn giải] — GradeScale của file Transcript
const GRADE_SCALE = [
  [9.7, 'A+', 4, 'Outstanding'], [9.3, 'A', 4, 'Excellent'], [9, 'A-', 3.7, 'Excellent'],
  [8.7, 'B+', 3.3, 'Very Good'], [8.3, 'B', 3, 'Good'], [8, 'B-', 2.7, 'Good'],
  [7.7, 'C+', 2.3, 'Satisfactory'], [7.3, 'C', 2, 'Satisfactory'], [7, 'C-', 1.7, 'Marginal Pass'],
  [6, 'D', 1, 'Minimum Pass'], [0, 'F', 0, 'Fail'],
];
// [GPA tối thiểu, xếp loại] — ClassificationScale
const CLASSIFICATION = [[3.9, 'High Distinction'], [3.7, 'Distinction'], [3.3, 'Merit'], [3, 'Credit'], [2.5, 'Pass'], [0, 'Fail']];
const PASS_GPA = 2.5;

function gradeOf(score) {
  const s = round(Number(score) || 0);
  const [, letter, points, interpretation] = GRADE_SCALE.find(([min]) => s >= min);
  return { letter, points, interpretation, pass: s >= 6 };
}
const classify = (gpa) => (gpa == null ? null : CLASSIFICATION.find(([min]) => gpa >= min)[1]);

// Trọng số theo tên module (tên lấy từ scoreModules.moduleFor). Chương trình không có bảng → chia đều.
const WEIGHTS = {
  EBA: { 'Excel Formulas 1': 0.25, 'Excel Formulas 2': 0.25, 'Excel Formulas 3': 0.25, 'Data Management': 0.1, Project: 0.15 },
  BIH: { 'Data Transformation': 0.35, 'Data Modeling': 0.2, 'Data Visualization': 0.2, 'Dashboard Visualization': 0.05, 'Data Statistics': 0.05, 'Data Problem Solving': 0.05, Project: 0.1 },
};
const programOf = (short) => /^[A-Z]+/.exec(String(short ?? '').toUpperCase())?.[0] ?? '';

// Nhóm các bài của lớp thành module. assignments: [{ id, kind, seq, title }]; scoredIds: Set id bài đã có ít nhất một điểm.
function buildModules(assignments, scoredIds, shortCode) {
  const program = programOf(shortCode);
  const table = WEIGHTS[program] ?? null;
  const byName = new Map();
  for (const a of assignments) {
    // BIH: Mini Project 3 được lưu ở bài HW5 (xem ASSIGNMENT_ALIASES) nhưng Module tra theo mini:3
    const [kind, seq] = program === 'BIH' && a.kind === 'hw' && a.seq === 5 ? ['mini', 3] : [a.kind, a.seq];
    const name = moduleFor(shortCode, kind, seq) ?? a.title;
    if (!byName.has(name)) byName.set(name, { name, ids: [], given: false });
    const m = byName.get(name);
    m.ids.push(a.id);
    if (scoredIds.has(a.id)) m.given = true;
  }
  const mods = [...byName.values()].filter((m) => m.given);
  for (const m of mods) m.weight = table ? (table[m.name] ?? 0) : 1;
  if (!mods.some((m) => m.weight > 0)) for (const m of mods) m.weight = 1;   // không có bảng khớp → chia đều
  return mods;
}

// scoreOf(assignmentId) → điểm 0–10 hoặc null; pendingOf(assignmentId) → true nếu đã nộp (tick) nhưng chưa chấm.
// Trả { gpa, classification, modules: [{ name, weight, score, letter, points, pending }] }; gpa = null nếu chưa có module nào để tính.
function computeGpa(modules, scoreOf, pendingOf = () => false) {
  const rows = modules.map((m) => {
    const parts = m.ids.map(scoreOf).filter((x) => x != null);
    const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
    const pending = score == null && m.ids.some(pendingOf);
    return { m, score, pending };
  });
  const counted = rows.filter((r) => !r.pending);
  const total = counted.reduce((s, r) => s + r.m.weight, 0);
  if (!counted.length || total <= 0) return { gpa: null, classification: null, modules: rows.map((r) => ({ name: r.m.name, weight: 0, score: null, letter: null, points: null, pending: true })) };
  let sum = 0;
  const out = rows.map(({ m, score, pending }) => {
    if (pending) return { name: m.name, weight: 0, score: null, letter: null, points: null, pending: true };
    const g = gradeOf(score ?? 0);   // chưa nộp, chưa có điểm = 0 = F
    sum += (m.weight / total) * g.points;
    return { name: m.name, weight: round(m.weight / total, 4), score: score == null ? null : round(score), letter: g.letter, points: g.points, pending: false };
  });
  const gpa = round(sum);
  return { gpa, classification: classify(gpa), modules: out };
}

// Tính GPA cho cả lớp từ kết quả loadClassData: Map enrollment_id → computeGpa(...).
function classGpa(data, shortCode) {
  const scoreMap = new Map(data.scores.map((s) => [`${s.enrollment_id}:${s.assignment_id}`, s.score == null ? null : Number(s.score)]));
  const scoredIds = new Set(data.scores.map((s) => s.assignment_id));
  const modules = buildModules(data.assignments, scoredIds, shortCode);
  const ticked = new Set(data.submissions.filter((x) => x.status === 'submitted' && !x.from_score).map((x) => `${x.enrollment_id}:${x.assignment_id}`));
  const out = new Map();
  for (const e of data.enrollments) out.set(e.id, computeGpa(modules, (aid) => scoreMap.get(`${e.id}:${aid}`) ?? null, (aid) => ticked.has(`${e.id}:${aid}`)));
  return out;
}

// ---------- Top Performance ----------
// Xếp hạng theo điểm các bài đến hiện tại (GPA đến hiện tại, 70%) và tỉ lệ chuyên cần (30%).
const TOP_PERCENT = 0.1;
const GPA_SHARE = 0.7;
const performanceScore = (gpa, attendanceRate) => round(GPA_SHARE * (gpa / 4) + (1 - GPA_SHARE) * (attendanceRate ?? 0), 4);

// Giống Value Filter "Top 10%" của Excel: lấy ROUNDDOWN(N × 10%) người (tối thiểu 1), người bằng điểm cắt đều được lấy.
// Bảo đảm có ít nhất 1 học viên học Offline: nếu top chưa có thì thêm học viên Offline cao nhất (đánh dấu offline_pick).
// people: [{ gpa, attendance_rate, mode, ... }] — chỉ người đã có GPA.
function topPerformers(people, { percent = TOP_PERCENT } = {}) {
  const ranked = people.filter((p) => p.gpa != null)
    .map((p) => ({ ...p, performance: performanceScore(p.gpa, p.attendance_rate) }))
    .sort((a, b) => b.performance - a.performance || b.gpa - a.gpa || (b.attendance_rate ?? 0) - (a.attendance_rate ?? 0));
  if (!ranked.length) return { total: 0, take: 0, rows: [], has_offline: false };
  const take = Math.max(1, Math.floor(ranked.length * percent));
  const cut = ranked[take - 1].performance;
  const rows = ranked.filter((p, i) => i < take || p.performance === cut).map((p, i) => ({ ...p, rank: i + 1, offline_pick: false }));
  const offline = ranked.findIndex((p) => p.mode === 'Offline');
  if (offline >= 0 && !rows.some((p) => p.mode === 'Offline')) rows.push({ ...ranked[offline], rank: offline + 1, offline_pick: true });
  return { total: ranked.length, take, rows, has_offline: offline >= 0 };
}

module.exports = { GRADE_SCALE, CLASSIFICATION, PASS_GPA, TOP_PERCENT, GPA_SHARE, WEIGHTS, gradeOf, classify, buildModules, computeGpa, classGpa, performanceScore, topPerformers };
