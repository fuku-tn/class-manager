// Học viên, điểm danh, bài tập của một lớp. Mount tại /api/classes/:classId
const express = require('express');
const { requireAdmin, requireClassAccess } = require('../auth');
const { loadClassData, computeEnrollmentStats, sessionSummaries } = require('../services/stats');
const realtime = require('../services/realtime');
const { logEvents, latestEvents } = require('../services/history');

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
    res.json(data.enrollments.map((e) => ({ ...e, ...stats.get(e.id), missing_from_sheet: latest.get(e.id) === 'missing_from_sheet' })));
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

  // Lịch sử thay đổi ghi danh của lớp (100 sự kiện gần nhất).
  router.get('/events', async (req, res) => {
    const rows = await db.all(
      `select id, event, student_code, full_name, from_status, to_status, source, actor_name, note, created_at
       from enrollment_events where class_id = $1 order by id desc limit 100`, [req.cls.id]);
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
