// Học viên, điểm danh, bài tập của một lớp. Mount tại /api/classes/:classId
const express = require('express');
const { requireAdmin, requireClassAccess } = require('../auth');
const { loadClassData, computeEnrollmentStats } = require('../services/stats');

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
    res.json(data.enrollments.map((e) => ({ ...e, ...stats.get(e.id) })));
  });

  async function writeVoucher(t, enrollmentId, v) {
    if (!v) return;
    if (!isDate(v.sent_date) || !isDate(v.expiration_date)) throw httpError(400, 'Ngày voucher phải dạng yyyy-mm-dd');
    if (!v.amount && !v.sent_date && !v.expiration_date && !v.status) {
      await t.run('delete from vouchers where enrollment_id = $1', [enrollmentId]);
      return;
    }
    await t.run(`insert into vouchers (enrollment_id, amount, sent_date, expiration_date, status) values ($1, $2, $3, $4, $5)
      on conflict (enrollment_id) do update set amount = excluded.amount, sent_date = excluded.sent_date,
      expiration_date = excluded.expiration_date, status = excluded.status`,
    [enrollmentId, v.amount ? Number(v.amount) : null, str(v.sent_date), str(v.expiration_date), str(v.status)]);
  }

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
      await writeVoucher(t, e.id, b.voucher);
    });
    res.json({ ok: true });
  });

  router.delete('/students/:enrollmentId', requireAdmin, async (req, res) => {
    const n = await db.run('delete from enrollments where id = $1 and class_id = $2', [id(req.params.enrollmentId), req.cls.id]);
    if (!n) return res.status(404).json({ error: 'Không tìm thấy học viên trong lớp' });
    res.json({ ok: true });
  });

  // ---------- Điểm danh ----------
  router.get('/attendance', async (req, res) => {
    const data = await loadClassData(db, req.cls.id);
    const stats = computeEnrollmentStats(data);
    const cells = new Map();
    for (const a of data.attendance) cells.set(`${a.enrollment_id}:${a.session_id}`, { status: a.status, note: a.note });
    res.json({
      sessions: data.sessions,
      rows: data.enrollments.map((e) => ({
        enrollment_id: e.id, student_code: e.student_code, full_name: e.full_name, mode: e.mode,
        course_status: e.course_status, attendance_rate: stats.get(e.id).attendance_rate,
        cells: Object.fromEntries(data.sessions.map((s) => [s.id, cells.get(`${e.id}:${s.id}`) ?? null])),
      })),
    });
  });

  router.put('/attendance', async (req, res) => {
    const { enrollment_id, session_id, status } = req.body;
    if (status !== null && !ATT_STATUS.includes(status)) return res.status(400).json({ error: 'Trạng thái điểm danh không hợp lệ' });
    await db.tx(async (t) => {
      const e = await findEnrollment(t, req.cls.id, enrollment_id);
      const s = await t.one('select * from sessions where id = $1 and class_id = $2', [id(session_id), req.cls.id]);
      if (!e || !s) throw httpError(404, 'Học viên hoặc buổi học không thuộc lớp này');
      if (status === null) {
        await t.run('delete from attendance where enrollment_id = $1 and session_id = $2', [e.id, s.id]);
      } else {
        await t.run(`insert into attendance (enrollment_id, session_id, status, note) values ($1, $2, $3, $4)
          on conflict (enrollment_id, session_id) do update set status = excluded.status, note = excluded.note, updated_at = now()`,
        [e.id, s.id, status, str(req.body.note)]);
        await t.run('update sessions set held = true where id = $1', [s.id]);
      }
    });
    res.json({ ok: true });
  });

  // Điểm danh cả lớp: đặt `status` cho mọi học viên đang học chưa có bản ghi trong buổi này.
  router.post('/sessions/:sessionId/attendance/bulk', async (req, res) => {
    const status = req.body.status || 'present';
    if (!ATT_STATUS.includes(status)) return res.status(400).json({ error: 'Trạng thái điểm danh không hợp lệ' });
    const created = await db.tx(async (t) => {
      const s = await t.one('select * from sessions where id = $1 and class_id = $2', [id(req.params.sessionId), req.cls.id]);
      if (!s) throw httpError(404, 'Không tìm thấy buổi học');
      const n = await t.run(`insert into attendance (enrollment_id, session_id, status)
        select id, $1::bigint, $2::text from enrollments where class_id = $3 and course_status = 'active'
        on conflict do nothing`, [s.id, status, req.cls.id]);
      await t.run('update sessions set held = true where id = $1', [s.id]);
      return n;
    });
    res.json({ created });
  });

  // ---------- Bài tập ----------
  router.get('/submissions', async (req, res) => {
    const data = await loadClassData(db, req.cls.id);
    const stats = computeEnrollmentStats(data);
    const cells = new Map();
    for (const x of data.submissions) cells.set(`${x.enrollment_id}:${x.assignment_id}`, { status: x.status, challenge: !!x.challenge, note: x.note });
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
    if (status !== null && !SUB_STATUS.includes(status)) return res.status(400).json({ error: 'Trạng thái bài tập không hợp lệ' });
    await db.tx(async (t) => {
      const e = await findEnrollment(t, req.cls.id, enrollment_id);
      const a = await t.one('select * from assignments where id = $1 and class_id = $2', [id(assignment_id), req.cls.id]);
      if (!e || !a) throw httpError(404, 'Học viên hoặc bài tập không thuộc lớp này');
      if (status === null) {
        await t.run('delete from submissions where enrollment_id = $1 and assignment_id = $2', [e.id, a.id]);
      } else {
        await t.run(`insert into submissions (enrollment_id, assignment_id, status, challenge, note) values ($1, $2, $3, $4, $5)
          on conflict (enrollment_id, assignment_id) do update set status = excluded.status, challenge = excluded.challenge,
          note = excluded.note, updated_at = now()`, [e.id, a.id, status, !!req.body.challenge, str(req.body.note)]);
        await t.run('update assignments set collected = true where id = $1', [a.id]);
      }
    });
    res.json({ ok: true });
  });

  return router;
};
