// Khảo sát sau khóa (sheet "FEEDBACK FORM" của Microsoft Forms) → bảng course_feedback.
//
// QUYỀN RIÊNG TƯ / TIỀN (chủ dự án chốt): KHÔNG lưu email, họ tên, số điện thoại, câu trả lời chữ tự do ("cảm nhận",
// "cần cải thiện"), và KHÔNG lấy câu hỏi về học phí (liên quan đến tiền). Các cột đó không được đọc vào bộ nhớ:
// bộ nhập chỉ đọc những cột khớp danh sách QUESTIONS/cột điều khiển bên dưới.
const fs = require('node:fs');
const { averageScore, npsScore } = require('./stats');

// [khóa, nhãn ngắn, nhóm, thang điểm, đoạn tiêu đề (chữ thường) để nhận cột, exact?]
const QUESTIONS = [
  ['pre_info', 'Thông tin khóa học rõ ràng', 'pre', 7, 'thông tin khóa học được cung cấp rõ ràng'],
  ['pre_content', 'Bị thu hút bởi nội dung khóa học', 'pre', 7, 'bị thu hút bởi nội dung khóa học'],
  ['pre_instructor', 'Bị thu hút bởi giảng viên', 'pre', 7, 'bị thu hút bởi giảng viên'],
  ['pre_advisor', 'Tư vấn viên giải đáp rõ ràng', 'pre', 7, 'tư vấn viên giải đáp'],
  ['dur_content', 'Nội dung thiết thực', 'during', 7, 'nội dung khóa học có tính thiết thực'],
  ['dur_instructor', 'Giảng viên vững kiến thức, truyền đạt tốt', 'during', 7, 'giảng viên có kiến thức vững vàng'],
  ['dur_method', 'Phương pháp, tài liệu và hỗ trợ', 'during', 7, 'phương pháp giảng dạy, tài liệu học tập'],
  ['dur_practice', 'Thời lượng học và bài tập thực hành', 'during', 7, 'thời lượng học và các bài tập'],
  ['dur_inspire', 'Được truyền cảm hứng và hứng thú', 'during', 7, 'học viên cảm thấy được truyền cảm hứng'],
  ['dur_materials', 'Tài liệu học tập đáp ứng nhu cầu', 'during', 7, 'tài liệu học tập đáp ứng nhu cầu'],
  ['dur_academic', 'Bộ phận học thuật giải đáp kịp thời', 'during', 7, 'bộ phận học thuật giải đáp'],
  ['dur_duration', 'Thời lượng phù hợp với nội dung', 'during', 7, 'thời lượng phù hợp với nội dung'],
  ['dur_exercise', 'Bài tập thực hành củng cố kiến thức', 'during', 7, 'bài tập thực hành trong khóa học'],
  ['dur_record', 'Record sau buổi học củng cố kiến thức', 'during', 7, 'record sau buổi học'],
  ['dur_motivated', 'Được truyền cảm hứng để học tập', 'during', 7, 'tôi được truyền cảm hứng để học tập'],
  ['dur_interest', 'Hứng thú suốt quá trình học', 'during', 7, 'tôi cảm thấy hứng thú trong suốt'],
  ['fmt_satisfied', 'Hài lòng với trải nghiệm theo hình thức học', 'format', 7, 'tôi hài lòng với trải nghiệm học tập tổng thể'],
  ['fmt_infra', 'Hạ tầng học tập (nền tảng/phòng học)', 'format', 7, 'hạ tầng học tập'],
  ['fmt_av', 'Chất lượng âm thanh, hình ảnh, thiết bị', 'format', 7, 'chất lượng âm thanh'],
  ['fmt_support', 'Được hỗ trợ kịp thời khi gặp vấn đề', 'format', 7, 'tôi nhận được hỗ trợ kịp thời'],
  ['fmt_space', 'Không gian học tập', 'format', 7, 'không gian học tập'],
  ['fmt_facility', 'Cơ sở vật chất lớp học', 'format', 7, 'cơ sở vật chất lớp học'],
  ['overall', 'Trải nghiệm học tập tổng thể (thang 10)', 'overall', 10, 'trải nghiệm học tập tổng thể của tôi', true],
  ['recommend', 'Sẵn sàng giới thiệu STARTTRAIN (thang 10)', 'overall', 10, 'tôi sẵn sàng giới thiệu starttrain'],
];
const GROUP_LABEL = { pre: 'Trước khi tham gia', during: 'Trong khi tham gia', format: 'Hình thức học (online/offline)', overall: 'Tổng thể' };
const PROGRAMS = 'BIE|BIH|EBA|SIA|SCA|PBM|BSM|DDM|SQL|CDA|DBC';

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const num = (v, scale) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 1 && n <= scale ? n : null;
};

// "EBA88", "BIE 76", "STARTTRAIN - EBA87 - AA - SAT - SUN 1110" -> "EBA088". Nhiều mã khác nhau hoặc không có mã -> null.
function classCodeFrom(text) {
  const re = new RegExp(`\\b(${PROGRAMS})\\s*0*(\\d{1,3})\\b`, 'gi');
  const found = new Set();
  for (const m of String(text ?? '').matchAll(re)) found.add(`${m[1].toUpperCase()}${m[2].padStart(3, '0')}`);
  return found.size === 1 ? [...found][0] : null;
}

// "Practical Business Management (PBM);Data-driven ..." -> ["PBM", "Data-driven ..."]
function nextCourses(text) {
  if (text == null || String(text).trim() === '') return [];
  const out = [];
  for (const part of String(text).split(/[;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const code = /\(([A-Za-z]{2,5})\)/.exec(part);
    const label = (code ? code[1].toUpperCase() : part.replace(/\s*\(.*$/, '')).trim().slice(0, 60);
    if (label && !out.includes(label)) out.push(label);
  }
  return out.slice(0, 6);
}

function moreCourses(v) {
  const s = norm(v);
  if (s === 'có') return 'yes';
  if (s === 'có thể') return 'maybe';
  return null;
}

const toDate = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400000)); // số ngày Excel
  return null;
};

// source: đường dẫn file hoặc Buffer. Trả về thống kê; dryRun → hoàn tác.
async function importFeedback(db, source, { dryRun = false } = {}) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) await wb.xlsx.load(source);
  else {
    if (!fs.existsSync(source)) throw new Error(`Không thấy file: ${source}`);
    await wb.xlsx.readFile(source);
  }
  const ws = wb.worksheets.find((w) => norm(w.name) === 'feedback form');
  if (!ws) throw new Error('Không thấy sheet "FEEDBACK FORM"');

  // Chỉ nhận cột có tiêu đề khớp danh sách; cột khác (email, tên, SĐT, học phí, chữ tự do) không được đọc.
  const cols = {};
  const q = {};
  ws.getRow(1).eachCell((cell, i) => {
    const h = norm(typeof cell.value === 'object' && cell.value ? (cell.value.result ?? cell.value.text ?? '') : cell.value);
    if (h === 'id') cols.id = i;
    else if (h === 'completion time') cols.completed = i;
    else if (h.includes('mã khóa học tôi vừa hoàn thành')) cols.course = i;
    else if (h.includes('dự định học thêm')) cols.more = i;
    else if (h.includes('khóa học tôi dự định tham gia')) cols.next = i;
    else {
      const hit = QUESTIONS.find(([key, , , , frag, exact]) => !q[key] && (exact ? h === frag : h.includes(frag)));
      if (hit) q[hit[0]] = i;
    }
  });
  if (!cols.id) throw new Error('Thiếu cột Id trong sheet FEEDBACK FORM');
  const cell = (row, i) => {
    if (!i) return null;
    const v = row.getCell(i).value;
    return v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? null) : v;
  };

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const id = cell(row, cols.id);
    if (id == null || id === '') continue;
    const scores = {};
    for (const [key, , , scale] of QUESTIONS) {
      const v = num(cell(row, q[key]), scale);
      if (v != null) scores[key] = v;
    }
    const courseText = cell(row, cols.course);
    rows.push({
      source_key: `ms-forms:${id}`, short_code: classCodeFrom(courseText), submitted_at: toDate(cell(row, cols.completed)),
      scores, more_courses: moreCourses(cell(row, cols.more)), next_courses: nextCourses(cell(row, cols.next)),
    });
  }

  const ROLLBACK = Symbol('dry-run');
  const summary = { rows: rows.length, matched_class: 0, unmatched: 0, inserted: 0, updated: 0, columns_read: Object.keys(q).length, dry_run: dryRun };
  try {
    await db.tx(async (t) => {
      const classes = await t.all('select id, upper(short_code) as sc from classes where short_code is not null');
      const byShort = new Map(classes.map((c) => [c.sc, c.id]));
      const existing = new Set((await t.all('select source_key from course_feedback')).map((r) => r.source_key));
      for (const r of rows) {
        const classId = r.short_code ? byShort.get(r.short_code) ?? null : null;
        if (classId) summary.matched_class++; else summary.unmatched++;
        if (existing.has(r.source_key)) summary.updated++; else summary.inserted++;
        await t.run(
          `insert into course_feedback (source_key, class_id, short_code, submitted_at, scores, more_courses, next_courses)
           values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
           on conflict (source_key) do update set class_id = excluded.class_id, short_code = excluded.short_code,
             submitted_at = excluded.submitted_at, scores = excluded.scores, more_courses = excluded.more_courses,
             next_courses = excluded.next_courses`,
          [r.source_key, classId, r.short_code, r.submitted_at, JSON.stringify(r.scores), r.more_courses, JSON.stringify(r.next_courses)]);
      }
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return summary;
}

// rows: bản ghi course_feedback (scores là object). Tính trung bình/NPS bằng hàm chung của stats.js.
function summarize(rows) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const avgOf = (key) => averageScore(rows.map((r) => r.scores?.[key]));
  const questions = QUESTIONS.map(([key, label, group, scale]) => {
    const vals = rows.map((r) => r.scores?.[key]).filter((v) => v != null);
    return { key, label, group, scale, n: vals.length, avg: averageScore(vals) };
  });
  const more = { yes: 0, maybe: 0 };
  for (const r of rows) if (r.more_courses in more) more[r.more_courses]++;
  const tally = new Map();
  for (const r of rows) for (const c of arr(r.next_courses)) tally.set(c, (tally.get(c) ?? 0) + 1);
  return {
    n: rows.length,
    overall_avg: avgOf('overall'),
    nps: npsScore(rows.map((r) => r.scores?.recommend)),
    recommend_avg: avgOf('recommend'),
    more_courses: more,
    next_courses: [...tally].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    questions,
  };
}

module.exports = { QUESTIONS, GROUP_LABEL, classCodeFrom, nextCourses, moreCourses, importFeedback, summarize };
