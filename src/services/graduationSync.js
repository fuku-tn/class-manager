// Lưu kết quả tốt nghiệp xét TỰ ĐỘNG vào database (enrollments.graduation_status) để Power BI/báo cáo đọc thẳng (chủ dự án chốt 3/11/2026):
//   - Học viên đủ điều kiện (kết quả tự động = "Đạt") → lưu 'passed' ngay, không cần chờ công bố.
//   - Không còn đủ điều kiện (điểm/điểm danh đổi) mà bản lưu là 'passed' do hệ thống → trả về 'pending'.
//   - Admin đã chỉnh tay (graduation_override) → GIỮ NGUYÊN, không đụng.
//   - "Chưa đạt" KHÔNG được lưu: lớp cũ thiếu điểm danh/bài tập nên kết quả tự động toàn "Chưa đạt" — không phản ánh việc học viên trượt.
//   - Chỉ lớp xét tự động, đã qua giai đoạn nộp & chấm bài (graduation/finished), chưa công bố (công bố là chốt kết quả).
// Công thức xét nằm ở graduation.js/gpa.js; file này chỉ ghi kết quả. Lỗi ở đây không được làm hỏng thao tác chính của người dùng.
const { TIMING_SQL } = require('./timing');
const { loadClassData, computeEnrollmentStats } = require('./stats');
const grad = require('./graduation');
const gpa = require('./gpa');
const { logEvents } = require('./history');

const CLOSED = ['graduation', 'finished'];
const RECENT_DAYS = 45;   // quét định kỳ chỉ lớp kết thúc gần đây; lớp cũ hơn được cập nhật khi có người sửa điểm/điểm danh hoặc chạy import-points

async function syncClass(db, classId) {
  const cls = await db.one(`select c.*, ${TIMING_SQL} as timing from classes c where c.id = $1`, [classId]);
  if (!cls || !cls.curriculum_id || cls.graduation_published_at || !CLOSED.includes(cls.timing)) return { changed: 0 };
  const cur = await db.one('select * from curricula where id = $1', [cls.curriculum_id]);
  const auto = grad.autoRulesFor(cur, cls.short_code);
  if (!auto) return { changed: 0 };

  const data = await loadClassData(db, cls.id);
  const rows = grad.buildAutoRows(data, computeEnrollmentStats(data), auto,
    { program: cls.program, open: false, gpaMap: gpa.classGpa(data, cls.short_code) });
  const enr = new Map((await db.all('select id, student_id, graduation_status, graduation_override from enrollments where class_id = $1', [cls.id])).map((e) => [e.id, e]));

  const todo = [];
  for (const r of rows) {
    const e = enr.get(r.enrollment_id);
    if (!e || e.graduation_override) continue;
    const to = r.auto.result === 'passed' ? 'passed' : (e.graduation_status === 'passed' ? 'pending' : e.graduation_status);
    if (to !== e.graduation_status) todo.push({ r, e, to });
  }
  if (!todo.length) return { changed: 0 };

  let changed = 0;
  await db.tx(async (t) => {
    // Điều kiện nằm ngay trong UPDATE: nếu giữa lúc đọc và lúc ghi admin vừa chỉnh tay/công bố, hoặc kết quả đã đổi, thì KHÔNG ghi đè.
    const done = new Set((await t.all(
      `update enrollments set graduation_status = v.s, graduation_at = now(), graduation_by = null
         from unnest($1::bigint[], $2::text[], $3::text[]) as v(id, s, f)
        where enrollments.id = v.id and enrollments.graduation_override is not true
          and enrollments.graduation_status = v.f
          and exists (select 1 from classes k where k.id = enrollments.class_id and k.graduation_published_at is null)
        returning enrollments.id`,
      [todo.map((x) => x.e.id), todo.map((x) => x.to), todo.map((x) => x.e.graduation_status)])).map((x) => Number(x.id)));
    const wrote = todo.filter((x) => done.has(Number(x.e.id)));
    changed = wrote.length;
    await logEvents(t, wrote.map(({ r, e, to }) => ({
      enrollment_id: e.id, class_id: cls.id, class_code: cls.code, student_id: e.student_id, student_code: r.student_code, full_name: r.full_name,
      event: 'graduation', from_status: e.graduation_status, to_status: to, source: 'sync',
      note: to === 'passed' ? 'Tự lưu: đủ điều kiện tốt nghiệp' : 'Tự lưu: không còn đủ điều kiện tốt nghiệp' })));
  });
  return { changed };
}

// Quét các lớp xét tự động vừa qua giai đoạn nộp & chấm bài (và lớp đang công bố). Mỗi lớp lỗi riêng không chặn lớp khác.
async function syncClasses(db, ids) {
  let changed = 0;
  for (const id of [...new Set(ids)]) changed += (await syncClass(db, id).catch((e) => { console.error('graduationSync', id, e.message); return { changed: 0 }; })).changed;
  return { classes: ids.length, changed };
}

async function syncRecent(db, { days = RECENT_DAYS } = {}) {
  const classes = await db.all(
    `select c.id from classes c where c.curriculum_id is not null and c.graduation_published_at is null
        and ${TIMING_SQL} in ('graduation', 'finished')
        and coalesce(c.end_date, c.start_date + 90) >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - $1::int`, [days]);
  let changed = 0;
  for (const c of classes) changed += (await syncClass(db, c.id).catch((e) => { console.error('graduationSync', c.id, e.message); return { changed: 0 }; })).changed;
  return { classes: classes.length, changed };
}

// Dùng ở route: không bao giờ ném lỗi ra ngoài.
const safe = (fn) => fn.catch((e) => { console.error('graduationSync:', e.message); return { changed: 0 }; });

module.exports = { syncClass, syncClasses, syncRecent, safe };
