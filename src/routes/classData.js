// Học viên, điểm danh, bài tập của một lớp. Mount tại /api/classes/:classId
const express = require('express');
const { requireAdmin, requireClassAccess, canViewPotential } = require('../auth');
const { loadClassData, computeEnrollmentStats, sessionSummaries, averageScore } = require('../services/stats');
const realtime = require('../services/realtime');
const { logEvents, latestEvents } = require('../services/history');
const { tally } = require('../services/formProfile');
const feedback = require('../services/feedback');
const grad = require('../services/graduation');
const { makeupsFor } = require('../services/makeup');
const { TIMING_SQL, PHASE_DATES_SQL } = require('../services/timing');

const MODES = ['Online', 'Offline', 'Hybrid'];
const COURSE_STATUS = ['active', 'deferred', 'dropped', 'completed'];
const ATT_STATUS = ['present', 'late', 'absent', 'excused'];
const SUB_STATUS = ['submitted', 'resubmit', 'missing'];
const isDate = (v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const httpError = (status, message) => Object.assign(new Error(message), { status });
const id = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);

module.exports = (db) => {
  const router = express.Router({ mergeParams: true });
  router.use(requireClassAccess(db));

  const findEnrollment = (q, classId, enrollmentId) =>
    q.one('select * from enrollments where id = $1 and class_id = $2', [id(enrollmentId), classId]);

  // ---------- Học viên ----------
  router.get('/students', async (req, res) => {
    const data = await loadClassData(db, req.cls.id);
    const stats = computeEnrollmentStats(data);
    const latest = await latestEvents(db, [req.cls.id]);
    // Điểm trung bình các bài có điểm (tab Point); khách không xem điểm.
    const avg = new Map();
    if (req.user.role !== 'guest') {
      const sc = await db.all(`select hs.enrollment_id, hs.score::float8 as score from homework_scores hs
                                 join enrollments e on e.id = hs.enrollment_id where e.class_id = $1`, [req.cls.id]);
      const by = new Map();
      for (const x of sc) (by.get(x.enrollment_id) ?? by.set(x.enrollment_id, []).get(x.enrollment_id)).push(x.score);
      for (const [id, list] of by) avg.set(id, averageScore(list));
    }
    res.json(data.enrollments.map((e) => ({ ...e, ...stats.get(e.id), missing_from_sheet: latest.get(e.id) === 'missing_from_sheet',
      ...(req.user.role !== 'guest' ? { score_avg: avg.get(e.id) ?? null } : {}) })));
  });

  router.post('/students', async (req, res) => {
    const code = str(req.body.student_code);
    const fullName = str(req.body.full_name);
    if (!code || !fullName) return res.status(400).json({ error: 'Cần mã học viên và họ tên' });
    if (req.body.mode && !MODES.includes(req.body.mode)) return res.status(400).json({ error: 'Hình thức học không hợp lệ' });
    const enrollmentId = await db.tx(async (t) => {
      let student = await t.one('select id from students where student_code = $1', [code]);
      if (!student) {
        student = await t.one('insert into students (student_code, full_name, email, phone) values ($1, $2, $3, $4) returning id',
          [code, fullName, str(req.body.email), str(req.body.phone)]);
      }
      if (await t.one('select 1 as x from enrollments where class_id = $1 and student_id = $2', [req.cls.id, student.id]))
        throw httpError(409, 'Học viên đã có trong lớp này');
      const e = await t.one('insert into enrollments (class_id, student_id, mode, customer_id, note) values ($1, $2, $3, $4, $5) returning id',
        [req.cls.id, student.id, req.body.mode || null, str(req.body.customer_id), str(req.body.note)]);
      await logEvents(t, [{ enrollment_id: e.id, class_id: req.cls.id, class_code: req.cls.code, student_id: student.id, student_code: code,
        full_name: fullName, event: 'enrolled', to_status: 'active', source: 'web', actor_id: req.user.id, actor_name: req.user.name }]);
      return e.id;
    });
    res.status(201).json({ id: enrollmentId });
  });

  router.put('/students/:enrollmentId', async (req, res) => {
    const b = req.body;
    if (b.mode && !MODES.includes(b.mode)) return res.status(400).json({ error: 'Hình thức học không hợp lệ' });
    if (b.course_status && !COURSE_STATUS.includes(b.course_status)) return res.status(400).json({ error: 'Trạng thái khóa học không hợp lệ' });
    await db.tx(async (t) => {
      const e = await findEnrollment(t, req.cls.id, req.params.enrollmentId);
      if (!e) throw httpError(404, 'Không tìm thấy học viên trong lớp');
      if (b.course_status && b.course_status !== e.course_status) {
        const stu = await t.one('select student_code, full_name from students where id = $1', [e.student_id]);
        await logEvents(t, [{ enrollment_id: e.id, class_id: req.cls.id, class_code: req.cls.code, student_id: e.student_id,
          student_code: stu.student_code, full_name: stu.full_name, event: 'status_changed', from_status: e.course_status,
          to_status: b.course_status, source: 'web', actor_id: req.user.id, actor_name: req.user.name }]);
      }
      await t.run('update enrollments set mode = $1, course_status = $2, certificate_status = $3, note = $4 where id = $5',
        [b.mode === undefined ? e.mode : (b.mode || null), b.course_status || e.course_status,
          b.certificate_status === undefined ? e.certificate_status : str(b.certificate_status),
          b.note === undefined ? e.note : str(b.note), e.id]);
      if (b.full_name !== undefined || b.email !== undefined || b.phone !== undefined) {
        const s = await t.one('select * from students where id = $1', [e.student_id]);
        await t.run('update students set full_name = $1, email = $2, phone = $3 where id = $4',
          [str(b.full_name) || s.full_name, b.email === undefined ? s.email : str(b.email),
            b.phone === undefined ? s.phone : str(b.phone), s.id]);
      }
    });
    res.json({ ok: true });
  });

  // Gỡ học viên khỏi lớp: chỉ admin, bắt buộc có lý do; ghi nhật ký (kèm số điểm danh/bài tập bị xóa) trong cùng transaction.
  router.delete('/students/:enrollmentId', requireAdmin, async (req, res) => {
    const reason = str(req.body?.reason);
    if (!reason) return res.status(400).json({ error: 'Cần nhập lý do gỡ học viên khỏi lớp' });
    await db.tx(async (t) => {
      const e = await findEnrollment(t, req.cls.id, req.params.enrollmentId);
      if (!e) throw httpError(404, 'Không tìm thấy học viên trong lớp');
      const stu = await t.one('select student_code, full_name from students where id = $1', [e.student_id]);
      const att = (await t.one('select count(*)::int n from attendance where enrollment_id = $1', [e.id])).n;
      const sub = (await t.one('select count(*)::int n from submissions where enrollment_id = $1', [e.id])).n;
      await logEvents(t, [{ enrollment_id: e.id, class_id: req.cls.id, class_code: req.cls.code, student_id: e.student_id,
        student_code: stu.student_code, full_name: stu.full_name, event: 'removed', from_status: e.course_status, source: 'web',
        actor_id: req.user.id, actor_name: req.user.name, note: `${reason} (đã xóa kèm ${att} lượt điểm danh, ${sub} bài tập)`.slice(0, 500) }]);
      await t.run('delete from enrollments where id = $1', [e.id]);
    });
    res.json({ ok: true });
  });

  // Hồ sơ đăng ký (FORM) của lớp: CHỈ admin. Đã loại thông tin cá nhân; có tổng hợp theo lớp.
  router.get('/profiles', requireAdmin, async (req, res) => {
    const rows = await db.all(
      `select r.enrollment_id, r.submitted_at, r.delivery, r.department, r.job_title, r.hr_function, r.industry, r.province,
              r.experience, r.sources, r.material_delivery, r.goals
       from registration_forms r join enrollments e on e.id = r.enrollment_id where e.class_id = $1`, [req.cls.id]);
    const total = (await db.one('select count(*)::int as n from enrollments where class_id = $1', [req.cls.id])).n;
    const arr = (v) => (Array.isArray(v) ? v : []);
    res.json({
      total, with_form: rows.length,
      summary: {
        delivery: tally(rows.map((r) => r.delivery)),
        department: tally(rows.map((r) => r.department)),
        job_title: tally(rows.map((r) => r.job_title)),
        experience: tally(rows.map((r) => r.experience)),
        sources: tally(rows.flatMap((r) => arr(r.sources))),
        goals: tally(rows.flatMap((r) => arr(r.goals))),
        province: tally(rows.map((r) => r.province)),
      },
      items: Object.fromEntries(rows.map((r) => [r.enrollment_id, r])),
    });
  });

  // Khảo sát sau khóa của lớp: CHỈ admin (không có thông tin cá nhân; xem services/feedback.js).
  router.get('/feedback', requireAdmin, async (req, res) => {
    const rows = await db.all('select scores, more_courses, next_courses from course_feedback where class_id = $1', [req.cls.id]);
    res.json({ summary: feedback.summarize(rows), group_labels: feedback.GROUP_LABEL });
  });

  // ---------- Danh sách tốt nghiệp ----------
  const GRAD_STATUS = ['pending', 'passed', 'failed'];
  const isoDate = (v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
  const published = (cls) => !!cls.graduation_published_at;

  const isAutoClass = async (cls) => !!(cls.curriculum_id && grad.autoRulesFor(await db.one('select code from curricula where id = $1', [cls.curriculum_id])));

  async function gradPayload(cls) {
    const [data, cur, meta] = await Promise.all([
      loadClassData(db, cls.id),
      cls.curriculum_id ? db.one('select * from curricula where id = $1', [cls.curriculum_id]) : null,
      db.one(`select ${TIMING_SQL} as timing, ${PHASE_DATES_SQL}, u.name as published_by_name
              from classes c left join users u on u.id = c.graduation_published_by where c.id = $1`, [cls.id]),
    ]);
    // tên người quyết định
    const names = new Map((await db.all('select id, name from users')).map((u) => [u.id, u.name]));
    for (const e of data.enrollments) e.graduation_by_name = e.graduation_by ? names.get(e.graduation_by) ?? null : null;
    const stats = computeEnrollmentStats(data);
    // BIE-8/BIE-12/BIH-20/BIH-11: xét TỰ ĐỘNG (số buổi + đủ mọi bài kể cả Project); giáo trình khác: gợi ý + người đặt như cũ.
    const auto = grad.autoRulesFor(cur);
    let rules; let rows;
    if (auto) {
      const scores = await db.all(`select hs.enrollment_id, hs.assignment_id, hs.score::float8 as score from homework_scores hs
        join enrollments e on e.id = hs.enrollment_id where e.class_id = $1`, [cls.id]);
      rules = auto;
      rows = grad.buildAutoRows(data, stats, auto, { scores, program: cls.program, open: ['upcoming', 'running', 'grading'].includes(meta.timing) });
      // Kết quả hiệu lực: chưa công bố → kết quả tự động (đổi theo tick/điểm danh); đã công bố → kết quả đã chốt lúc công bố.
      for (const r of rows) r.result = published(cls) && r.decision.status !== 'pending' ? r.decision.status : r.auto.result;
    } else {
      rules = grad.withSessionRule(grad.rulesFromCurriculum(cur), cls.program, cur);
      rows = grad.buildGraduationRows(data, stats, rules);
    }
    return {
      class: { id: cls.id, published_at: cls.graduation_published_at ?? null, published_by: meta.published_by_name ?? null,
        timing: meta.timing, last_session_date: meta.last_session_date, grading_until: meta.grading_until, graduation_on: meta.graduation_on,
        has_curriculum: !!cls.curriculum_id },
      rules, summary: grad.summarize(rows), rows,
    };
  }

  router.get('/graduation', async (req, res) => { res.json(await gradPayload(req.cls)); });

  // Học bù: học viên lớp khác được ghi chú điểm danh "Bù <mã lớp này>" (vd "Bù EBA122") — để lớp này biết có ai đến học bù buổi nào.
  router.get('/makeups', async (req, res) => { res.json(await makeupsFor(db, req.cls)); });

  // ---------- Potential: học viên trong sheet PERSONAL nhưng không có tên trong danh sách/điểm danh ----------
  // (Chưa thanh toán, hoặc đã bị xóa khỏi Sheet). Chỉ admin và tài khoản được bật can_view_potential (hiện: Đoàn Ly).
  router.get('/potential', async (req, res) => {
    if (!canViewPotential(req.user)) return res.status(403).json({ error: 'Bạn không có quyền xem danh sách Potential' });
    const rows = await db.all(
      `select p.id, p.student_code, p.full_name, p.last_status, p.reason, p.created_at, p.updated_at, s.email, s.phone,
              (p.snapshot is not null) as has_snapshot
         from potential_students p join students s on s.id = p.student_id
        where p.class_id = $1 order by p.updated_at desc, p.id desc`, [req.cls.id]);
    res.json(rows);
  });

  // Đặt quyết định cho một học viên (giảng viên của lớp hoặc admin; sau khi công bố chỉ admin).
  router.put('/graduation/:enrollmentId', async (req, res) => {
    if (published(req.cls) && req.user.role !== 'admin') return res.status(403).json({ error: 'Danh sách đã công bố, chỉ admin được sửa' });
    const b = req.body;
    if (b.status !== undefined && !GRAD_STATUS.includes(b.status)) return res.status(400).json({ error: 'Kết quả tốt nghiệp không hợp lệ' });
    if (b.status !== undefined && await isAutoClass(req.cls)) return res.status(409).json({ error: 'Lớp này xét tốt nghiệp tự động theo số buổi và bài tập — không đặt kết quả tay' });
    if (!isoDate(b.certificate_sent_date)) return res.status(400).json({ error: 'Ngày gửi chứng chỉ phải dạng yyyy-mm-dd' });
    await db.tx(async (t) => {
      const e = await findEnrollment(t, req.cls.id, req.params.enrollmentId);
      if (!e) throw httpError(404, 'Không tìm thấy học viên trong lớp');
      const status = b.status ?? e.graduation_status;
      const changed = status !== e.graduation_status;
      await t.run(
        `update enrollments set graduation_status = $1, graduation_note = $2, certificate_status = $3, certificate_number = $4,
           certificate_sent_date = $5, graduation_by = $6, graduation_at = now() where id = $7`,
        [status, b.note === undefined ? e.graduation_note : str(b.note)?.slice(0, 500) ?? null,
          b.certificate_status === undefined ? e.certificate_status : str(b.certificate_status)?.slice(0, 40) ?? null,
          b.certificate_number === undefined ? e.certificate_number : str(b.certificate_number)?.slice(0, 60) ?? null,
          b.certificate_sent_date === undefined ? e.certificate_sent_date : (b.certificate_sent_date || null), req.user.id, e.id]);
      if (changed) {
        const stu = await t.one('select student_code, full_name from students where id = $1', [e.student_id]);
        await logEvents(t, [{ enrollment_id: e.id, class_id: req.cls.id, class_code: req.cls.code, student_id: e.student_id,
          student_code: stu.student_code, full_name: stu.full_name, event: 'graduation', from_status: e.graduation_status,
          to_status: status, source: 'web', actor_id: req.user.id, actor_name: req.user.name, note: str(b.note)?.slice(0, 500) ?? null }]);
      }
    });
    res.json({ ok: true });
  });

  // Áp dụng gợi ý cho những học viên CHƯA xét (không đụng quyết định đã đặt).
  router.post('/graduation-apply', async (req, res) => {
    if (published(req.cls) && req.user.role !== 'admin') return res.status(403).json({ error: 'Danh sách đã công bố, chỉ admin được sửa' });
    if (await isAutoClass(req.cls)) return res.status(409).json({ error: 'Lớp này xét tốt nghiệp tự động, không cần áp dụng gợi ý' });
    const p = await gradPayload(req.cls);
    const todo = p.rows.filter((r) => r.decision.status === 'pending' && r.suggestion.eligible !== null);
    if (todo.length) {
      await db.tx(async (t) => {
        const ev = [];
        for (const r of todo) {
          const to = r.suggestion.eligible ? 'passed' : 'failed';
          await t.run('update enrollments set graduation_status = $1, graduation_by = $2, graduation_at = now() where id = $3', [to, req.user.id, r.enrollment_id]);
          ev.push({ enrollment_id: r.enrollment_id, class_id: req.cls.id, class_code: req.cls.code, student_code: r.student_code, full_name: r.full_name,
            event: 'graduation', from_status: 'pending', to_status: to, source: 'web', actor_id: req.user.id, actor_name: req.user.name,
            note: 'Áp dụng gợi ý tự động' });
        }
        await logEvents(t, ev);
      });
    }
    res.json({ applied: todo.length });
  });

  // Công bố / hủy công bố danh sách (admin).
  router.post('/graduation-publish', requireAdmin, async (req, res) => {
    // Xét tự động: chốt kết quả lúc công bố vào enrollments (ghi lịch sử); học viên "Đang học" giữ "Chưa xét".
    const p = (await isAutoClass(req.cls)) ? await gradPayload({ ...req.cls, graduation_published_at: null }) : null;
    await db.tx(async (t) => {
      if (p) {
        const ev = [];
        for (const r of p.rows) {
          const to = r.auto.result === 'passed' || r.auto.result === 'failed' ? r.auto.result : 'pending';
          if (to === r.decision.status) continue;
          await t.run('update enrollments set graduation_status = $1, graduation_by = $2, graduation_at = now() where id = $3', [to, req.user.id, r.enrollment_id]);
          ev.push({ enrollment_id: r.enrollment_id, class_id: req.cls.id, class_code: req.cls.code, student_code: r.student_code, full_name: r.full_name,
            event: 'graduation', from_status: r.decision.status, to_status: to, source: 'web', actor_id: req.user.id, actor_name: req.user.name,
            note: r.auto.reasons.length ? `Xét tự động khi công bố: ${r.auto.reasons.join('; ')}` : 'Xét tự động khi công bố' });
        }
        await logEvents(t, ev);
      }
      await t.run('update classes set graduation_published_at = now(), graduation_published_by = $1 where id = $2', [req.user.id, req.cls.id]);
    });
    res.json({ ok: true });
  });
  router.delete('/graduation-publish', requireAdmin, async (req, res) => {
    await db.run('update classes set graduation_published_at = null, graduation_published_by = null where id = $1', [req.cls.id]);
    res.json({ ok: true });
  });

  // Sửa quy tắc của giáo trình mà lớp đang dùng (admin).
  router.put('/graduation-rules', requireAdmin, async (req, res) => {
    if (!req.cls.curriculum_id) return res.status(409).json({ error: 'Lớp chưa gắn giáo trình nên chưa có quy tắc riêng' });
    const b = req.body;
    const min = Number(b.attendance_min);
    if (!Number.isFinite(min) || min < 0 || min > 1) return res.status(400).json({ error: 'Ngưỡng chuyên cần phải từ 0 đến 100%' });
    const intOrNull = (v) => (v === null || v === '' || v === undefined ? null : Number(v));
    const pool = intOrNull(b.hw_pool);
    const hwMin = intOrNull(b.hw_min);
    for (const v of [pool, hwMin]) if (v !== null && (!Number.isInteger(v) || v < 0 || v > 60)) return res.status(400).json({ error: 'Số bài HW phải là số nguyên không âm' });
    if (pool !== null && hwMin !== null && hwMin > pool) return res.status(400).json({ error: 'Số HW tối thiểu không được lớn hơn số HW xét' });
    await db.run("update curricula set grad_attendance_min = $1, grad_hw_pool = $2, grad_hw_min = $3, grad_capstone = $4, grad_rules_status = 'confirmed' where id = $5",
      [Math.round(min * 100) / 100, pool, hwMin, !!b.capstone, req.cls.curriculum_id]);
    res.json({ ok: true });
  });

  // Lịch sử thay đổi ghi danh của lớp (100 sự kiện gần nhất).
  router.get('/events', async (req, res) => {
    const rows = await db.all(
      `select id, event, student_code, full_name, from_status, to_status, source, actor_name, note, created_at
       from enrollment_events where class_id = $1
        ${canViewPotential(req.user) ? '' : "and event <> 'moved_to_potential'"} order by id desc limit 100`, [req.cls.id]);
    res.json(rows);
  });

  // ---------- Thời gian thực ----------
  // Cấu hình để trình duyệt nghe tin "có thay đổi" của lớp này. null nếu server chưa cấu hình Supabase URL/khóa.
  router.get('/realtime', (req, res) => res.json(realtime.clientConfig(req.cls.id)));

  // Ghi một ô (điểm danh hoặc bài tập) có kiểm tra "ô còn đúng như người dùng đang thấy không".
  // Nếu body có `expected` mà trạng thái hiện tại khác → trả 409 + giá trị hiện tại, KHÔNG ghi đè.
  // Không gửi `expected` → ghi đè như cũ (tương thích API cũ).
  const cellView = (row) => (row ? { status: row.status, note: row.note, by: row.updated_by_name ?? null, at: row.updated_at } : null);
  const conflict = (res, who, current) => res.status(409).json({
    error: who ? `Ô này vừa được ${who} đổi, đã cập nhật lại cho bạn` : 'Ô này vừa được người khác đổi, đã cập nhật lại cho bạn',
    current,
  });

  // Số liệu sau khi ghi: % chuyên cần của học viên + hiện diện/sĩ số của buổi (tính bằng đúng hàm của stats.js).
  async function snapshot(classId, enrollmentId, sessionId) {
    const data = await loadClassData(db, classId);
    const stats = computeEnrollmentStats(data).get(enrollmentId);
    const sess = sessionSummaries(data).get(sessionId);
    return {
      enrollment: stats ? { attendance_rate: stats.attendance_rate, attended: stats.attended, excused: stats.excused, absent: stats.absent } : null,
      session: sess ?? null,
    };
  }

  // ---------- Điểm danh ----------
  router.get('/attendance', async (req, res) => {
    const data = await loadClassData(db, req.cls.id);
    const stats = computeEnrollmentStats(data);
    const cells = new Map();
    for (const a of data.attendance) cells.set(`${a.enrollment_id}:${a.session_id}`, cellView(a));
    const sums = sessionSummaries(data);
    res.json({
      sessions: data.sessions.map((s) => ({ ...s, summary: sums.get(s.id) })),
      rows: data.enrollments.map((e) => ({
        enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, mode: e.mode,
        course_status: e.course_status, attendance_rate: stats.get(e.id).attendance_rate,
        attended: stats.get(e.id).attended, excused: stats.get(e.id).excused, absent: stats.get(e.id).absent,
        cells: Object.fromEntries(data.sessions.map((s) => [s.id, cells.get(`${e.id}:${s.id}`) ?? null])),
      })),
    });
  });

  router.put('/attendance', async (req, res) => {
    const { enrollment_id, session_id, status } = req.body;
    const hasExpected = Object.prototype.hasOwnProperty.call(req.body, 'expected');
    const expected = hasExpected ? req.body.expected : null;
    if (status !== null && !ATT_STATUS.includes(status)) return res.status(400).json({ error: 'Trạng thái điểm danh không hợp lệ' });
    if (hasExpected && expected !== null && !ATT_STATUS.includes(expected)) return res.status(400).json({ error: 'Trạng thái "expected" không hợp lệ' });

    let e, s;
    const out = await db.tx(async (t) => {
      e = await findEnrollment(t, req.cls.id, enrollment_id);
      s = await t.one('select * from sessions where id = $1 and class_id = $2', [id(session_id), req.cls.id]);
      if (!e || !s) throw httpError(404, 'Học viên hoặc buổi học không thuộc lớp này');
      const current = () => t.one(`select a.status, a.note, a.updated_at, u.name as updated_by_name from attendance a
        left join users u on u.id = a.updated_by where a.enrollment_id = $1 and a.session_id = $2`, [e.id, s.id]);
      const cur = await t.one('select status from attendance where enrollment_id = $1 and session_id = $2 for update', [e.id, s.id]);
      if (hasExpected && (cur?.status ?? null) !== expected) return { conflict: await current() };

      if (status === null) {
        await t.run('delete from attendance where enrollment_id = $1 and session_id = $2', [e.id, s.id]);
        // Xóa bản ghi cuối cùng của buổi → buổi quay về "chưa diễn ra" (không kéo tụt tỉ lệ của cả lớp).
        await t.run('update sessions set held = exists (select 1 from attendance where session_id = $1) where id = $1', [s.id]);
        return { cell: null };
      }
      // Phòng đua: hai người cùng tạo ô trống một lúc → bản ghi đến sau bị từ chối nếu có `expected`.
      const rows = await t.all(`insert into attendance (enrollment_id, session_id, status, note, updated_by)
        values ($1, $2, $3, $4, $5)
        on conflict (enrollment_id, session_id) do update
          set status = excluded.status, note = excluded.note, updated_at = now(), updated_by = excluded.updated_by
          where $6::boolean is false or attendance.status is not distinct from $7::text
        returning status`, [e.id, s.id, status, str(req.body.note), req.user.id, hasExpected, expected]);
      if (!rows.length) return { conflict: await current() };
      await t.run('update sessions set held = true where id = $1', [s.id]);
      return { cell: { status, note: str(req.body.note), by: req.user.name, at: new Date().toISOString() } };
    });

    if (out.conflict) return conflict(res, out.conflict.updated_by_name, cellView(out.conflict));
    await realtime.publish(req.cls.id, { kind: 'attendance' });
    res.json({ ok: true, cell: out.cell, ...(await snapshot(req.cls.id, e.id, s.id)) });
  });

  // Điểm danh cả lớp: đặt `status` cho mọi học viên đang học chưa có bản ghi trong buổi này.
  router.post('/sessions/:sessionId/attendance/bulk', async (req, res) => {
    const status = req.body.status || 'present';
    if (!ATT_STATUS.includes(status)) return res.status(400).json({ error: 'Trạng thái điểm danh không hợp lệ' });
    const created = await db.tx(async (t) => {
      const s = await t.one('select * from sessions where id = $1 and class_id = $2', [id(req.params.sessionId), req.cls.id]);
      if (!s) throw httpError(404, 'Không tìm thấy buổi học');
      const n = await t.run(`insert into attendance (enrollment_id, session_id, status, updated_by)
        select id, $1::bigint, $2::text, $4::bigint from enrollments where class_id = $3 and course_status = 'active'
        on conflict do nothing`, [s.id, status, req.cls.id, req.user.id]);
      await t.run('update sessions set held = true where id = $1', [s.id]);
      return n;
    });
    await realtime.publish(req.cls.id, { kind: 'attendance' });
    res.json({ created });
  });

  // Bỏ điểm danh cả buổi: xóa mọi ô của buổi này (buổi quay về "chưa diễn ra").
  router.delete('/sessions/:sessionId/attendance', async (req, res) => {
    const deleted = await db.tx(async (t) => {
      const s = await t.one('select * from sessions where id = $1 and class_id = $2', [id(req.params.sessionId), req.cls.id]);
      if (!s) throw httpError(404, 'Không tìm thấy buổi học');
      const n = await t.run('delete from attendance where session_id = $1', [s.id]);
      await t.run('update sessions set held = false where id = $1', [s.id]);
      return n;
    });
    await realtime.publish(req.cls.id, { kind: 'attendance' });
    res.json({ deleted });
  });

  // ---------- Điểm bài tập (đồng bộ từ tab Point) ----------
  // Admin + giảng viên của lớp xem; khách không. Điểm trung bình tính ở stats.js (averageScore).
  router.get('/scores', async (req, res) => {
    if (req.user.role === 'guest') return res.status(403).json({ error: 'Tài khoản khách không xem được điểm' });
    const [assignments, enrollments, scores] = await Promise.all([
      db.all("select id, kind, seq, title from assignments where class_id = $1 order by case kind when 'hw' then 0 when 'mini' then 1 else 2 end, seq", [req.cls.id]),
      db.all(`select e.id, e.course_status, s.student_code, s.full_name from enrollments e join students s on s.id = e.student_id
               where e.class_id = $1 order by lower(s.full_name), s.id`, [req.cls.id]),
      db.all(`select hs.enrollment_id, hs.assignment_id, hs.score::float8 as score, hs.module from homework_scores hs
                join enrollments e on e.id = hs.enrollment_id where e.class_id = $1`, [req.cls.id]),
    ]);
    const byEnr = new Map();
    for (const x of scores) {
      if (!byEnr.has(x.enrollment_id)) byEnr.set(x.enrollment_id, {});
      byEnr.get(x.enrollment_id)[x.assignment_id] = { score: x.score, module: x.module };
    }
    const rows = enrollments.map((e) => {
      const mine = byEnr.get(e.id) ?? {};
      return { enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, course_status: e.course_status,
        scores: mine, avg: averageScore(Object.values(mine).map((v) => v.score)) };
    });
    const used = new Set(scores.map((x) => x.assignment_id));
    res.json({
      assignments: assignments.filter((a) => used.has(a.id)),
      rows, class_avg: averageScore(scores.map((x) => x.score)), has_scores: scores.length > 0,
    });
  });

  // ---------- Bài tập ----------
  router.get('/submissions', async (req, res) => {
    const data = await loadClassData(db, req.cls.id);
    const stats = computeEnrollmentStats(data);
    const cells = new Map();
    for (const x of data.submissions) cells.set(`${x.enrollment_id}:${x.assignment_id}`, { ...cellView(x), challenge: !!x.challenge });
    res.json({
      assignments: data.assignments,
      rows: data.enrollments.map((e) => ({
        enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, course_status: e.course_status,
        hw_rate: stats.get(e.id).hw_rate,
        cells: Object.fromEntries(data.assignments.map((a) => [a.id, cells.get(`${e.id}:${a.id}`) ?? null])),
      })),
    });
  });

  router.put('/submissions', async (req, res) => {
    const { enrollment_id, assignment_id, status } = req.body;
    const hasExpected = Object.prototype.hasOwnProperty.call(req.body, 'expected');
    const expected = hasExpected ? req.body.expected : null;
    if (status !== null && !SUB_STATUS.includes(status)) return res.status(400).json({ error: 'Trạng thái bài tập không hợp lệ' });
    if (hasExpected && expected !== null && !SUB_STATUS.includes(expected)) return res.status(400).json({ error: 'Trạng thái "expected" không hợp lệ' });

    const out = await db.tx(async (t) => {
      const e = await findEnrollment(t, req.cls.id, enrollment_id);
      const a = await t.one('select * from assignments where id = $1 and class_id = $2', [id(assignment_id), req.cls.id]);
      if (!e || !a) throw httpError(404, 'Học viên hoặc bài tập không thuộc lớp này');
      const current = () => t.one(`select b.status, b.note, b.challenge, b.updated_at, u.name as updated_by_name from submissions b
        left join users u on u.id = b.updated_by where b.enrollment_id = $1 and b.assignment_id = $2`, [e.id, a.id]);
      const cur = await t.one('select status from submissions where enrollment_id = $1 and assignment_id = $2 for update', [e.id, a.id]);
      if (hasExpected && (cur?.status ?? null) !== expected) return { conflict: await current() };

      if (status === null) {
        await t.run('delete from submissions where enrollment_id = $1 and assignment_id = $2', [e.id, a.id]);
        await t.run('update assignments set collected = exists (select 1 from submissions where assignment_id = $1) where id = $1', [a.id]);
        return { cell: null };
      }
      const rows = await t.all(`insert into submissions (enrollment_id, assignment_id, status, challenge, note, updated_by)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (enrollment_id, assignment_id) do update
          set status = excluded.status, challenge = excluded.challenge, note = excluded.note, updated_at = now(), updated_by = excluded.updated_by
          where $7::boolean is false or submissions.status is not distinct from $8::text
        returning status`, [e.id, a.id, status, !!req.body.challenge, str(req.body.note), req.user.id, hasExpected, expected]);
      if (!rows.length) return { conflict: await current() };
      await t.run('update assignments set collected = true where id = $1', [a.id]);
      return { cell: { status, challenge: !!req.body.challenge, note: str(req.body.note), by: req.user.name, at: new Date().toISOString() } };
    });

    if (out.conflict) return conflict(res, out.conflict.updated_by_name, { ...cellView(out.conflict), challenge: !!out.conflict.challenge });
    await realtime.publish(req.cls.id, { kind: 'submissions' });
    res.json({ ok: true, cell: out.cell });
  });

  return router;
};
