// GPA, xếp loại và Top Performance — NGUỒN DUY NHẤT của các công thức này (như stats.js cho tỉ lệ).
// Quy tắc lấy từ thư mục transcripts/ (Transcript-BIE101/BIE099/BIH98, EBA117/EBA118):
//  • Điểm module (thang 10) → điểm chữ + điểm hệ 4 theo GradeScale; module nhiều bài (vd Data Transformation = HW2 + HW3) lấy TRUNG BÌNH các bài có điểm.
//  • GPA = Σ trọng số × điểm hệ 4 của module, làm tròn 2 số. Trọng số theo chương trình: BIE chia đều, EBA 25/25/25/10/15, BIH 35/20/20/5/5/5/10.
//  • Cấu trúc module từng chương trình (SPECS) dùng chung cho GPA và xuất Transcript (services/transcript.js).
//  • Module đã giao mà học viên làm bài (đã tick nộp) nhưng chưa được chấm thì BỎ QUA (chưa chấm ≠ 0 điểm); chưa nộp và chưa có điểm thì tính 0 (F).
//  • Module chưa có điểm của một học viên tính 0 (F) — nhưng chỉ xét các module ĐÃ GIAO (ít nhất một học viên có điểm) nên GPA giữa khóa là "GPA đến hiện tại";
//    trọng số được chuẩn hóa lại trên các module đã giao.
//  • Xếp loại theo ClassificationScale; GPA < 2.5 = Fail (không tốt nghiệp dù học đủ, làm đủ — admin có thể chỉnh tay kết quả).

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

const ACRONYMS = new Set(['ibcs', 'ai', 'hr', 'mece']);
const titleCase = (s) => String(s).toLowerCase().replace(/[a-z]+/g, (w, off, str) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));

// ---------- Cấu trúc module từng chương trình (đúng như các file Transcript) ----------
// [tên module trong Transcript, trọng số, các bài hợp thành ("loại:số", nhiều bài thì lấy trung bình)]; session = module tính theo điểm danh buổi đó (không có điểm).
// BIE trước BIE104: HW5 là một bài gộp Visualization + Storytelling nên điểm HW5 dùng cho CẢ HAI module 4 và 5 (đúng như Transcript BIE101: 6 module, GPA = TB 6 module).
const BIE_COMMON = [['BUSINESS INTELLIGENCE LITERACY', 1, ['hw:1']], ['DATA TRANSFORMATION', 1, ['hw:2', 'hw:3']], ['DATA MODELING & ANALYSIS', 1, ['hw:4']]];
const BIE_CAP = ['CAPSTONE BUSINESS ANALYTICS PROJECT', 1, ['capstone:1']];
const SPECS = {
  BIE_OLD: [...BIE_COMMON, ['DATA VISUALIZATION (IBCS STANDARD)', 1, ['hw:5']], ['DATA STORYTELLING & DASHBOARD REPORTING', 1, ['hw:5']], BIE_CAP],
  BIE104: [...BIE_COMMON, ['DATA VISUALIZATION (IBCS STANDARD)', 1, ['hw:5']], ['DATA STORYTELLING & DASHBOARD REPORTING', 1, ['hw:6']], BIE_CAP],
  BIE_NEW: [['BUSINESS INTELLIGENCE LITERACY', 1, ['hw:1']], ['DATA TRANSFORMATION', 1, ['hw:2']], ['DATA MODELING & ANALYSIS', 1, ['hw:3']],
    ['DATA VISUALIZATION (IBCS STANDARD)', 1, ['hw:4']], ['DATA STORYTELLING & DASHBOARD REPORTING', 1, ['hw:5']], BIE_CAP],
  EBA: [['MATH FUNCTIONS', 0.25, ['hw:1']], ['AGGREGATE & LOGIC FUNCTIONS', 0.25, ['hw:2']], ['TEXT, TIME & LOOKUP FUNCTIONS', 0.25, ['hw:3']],
    ['DATA MANAGEMENT', 0.1, ['hw:4']], ['CAPSTONE PROJECT', 0.15, ['capstone:1']]],
  // BIH: Mini Project 3 lưu ở bài HW5 (xem ASSIGNMENT_ALIASES) nên module 7 dùng 'hw:5'. Module 6 và 8 tính theo điểm danh buổi 18 / 20, trọng số 0 (không vào GPA).
  BIH: [['DATA TRANSFORMATION', 0.35, ['hw:1', 'hw:2']], ['DATA MODELING & ANALYSIS', 0.2, ['hw:3']], ['DATA VISUALIZATION (IBCS STANDARD)', 0.2, ['mini:1']],
    ['DATA STORYTELLING & DASHBOARD REPORTING', 0.05, ['mini:2']], ['DATA STATISTIC ANALYTICS', 0.05, ['hw:4']],
    ['HR METRIC & WORKFORCE ANALYTICS', 0, [], 18], ['DATA PROBLEM-SOLVING (MECE FRAMEWORK)', 0.05, ['hw:5']],
    ['AI - ASSISTED DECISION MAKING', 0, [], 20], ['CAPSTONE BUSINESS ANALYTICS PROJECT', 0.1, ['capstone:1']]],
};
// Danh sách module theo thứ tự trong Transcript của một lớp; null nếu chương trình chưa có mẫu (PBM, SCA, BIE-6…).
function moduleSpec(shortCode) {
  const m = /^([A-Z]+)(\d+)?/.exec(String(shortCode ?? '').toUpperCase());
  if (!m) return null;
  let key = null;
  if (m[1] === 'BIE' && m[2]) { const n = Number(m[2]); key = n === 104 ? 'BIE104' : n === 107 ? null : n >= 105 ? 'BIE_NEW' : 'BIE_OLD'; }
  else if (m[1] === 'EBA' || m[1] === 'BIH') key = m[1];
  return key ? SPECS[key].map(([name, weight, parts, session]) => ({ name, weight, parts, session: session ?? null })) : null;
}

// Nhóm các bài của lớp thành module. assignments: [{ id, kind, seq, title }]; scoredIds: Set id bài đã có ít nhất một điểm.
// Chỉ trả module có điểm (đã giao) và có trọng số — module theo điểm danh (BIH 6, 8) không vào GPA.
function buildModules(assignments, scoredIds, shortCode) {
  const idOf = new Map(assignments.map((a) => [`${a.kind}:${a.seq}`, a.id]));
  const spec = moduleSpec(shortCode);
  let mods;
  if (spec) {
    mods = spec.filter((m) => m.session == null).map((m) => ({ name: titleCase(m.name), official: m.name, weight: m.weight, ids: m.parts.map((k) => idOf.get(k)).filter((x) => x != null) }));
  } else {   // chương trình chưa có mẫu Transcript: mỗi bài một module, chia đều
    mods = assignments.map((a) => ({ name: a.title, official: String(a.title).toUpperCase(), weight: 1, ids: [a.id] }));
  }
  mods = mods.filter((m) => m.ids.some((id) => scoredIds.has(id)));
  if (!mods.some((m) => m.weight > 0)) for (const m of mods) m.weight = 1;
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
  if (!counted.length || total <= 0) return { gpa: null, classification: null, modules: rows.map((r) => ({ name: r.m.name, official: r.m.official, weight: 0, score: null, letter: null, points: null, pending: true })) };
  let sum = 0;
  const out = rows.map(({ m, score, pending }) => {
    if (pending) return { name: m.name, official: m.official, weight: 0, score: null, letter: null, points: null, pending: true };
    const g = gradeOf(score ?? 0);   // chưa nộp, chưa có điểm = 0 = F
    sum += (m.weight / total) * g.points;
    return { name: m.name, official: m.official, weight: round(m.weight / total, 4), score: score == null ? null : round(score), letter: g.letter, points: g.points, pending: false };
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

module.exports = { GRADE_SCALE, CLASSIFICATION, PASS_GPA, TOP_PERCENT, GPA_SHARE, moduleSpec, titleCase, gradeOf, classify, buildModules, computeGpa, classGpa, performanceScore, topPerformers };
