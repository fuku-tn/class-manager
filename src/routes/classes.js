const express = require('express');
const { requireAdmin, requireClassAccess } = require('../auth');
const { buildDashboard } = require('../services/stats');
const realtime = require('../services/realtime');
const { TIMING_SQL, PHASE_DATES_SQL } = require('../services/timing');

const isDate = (v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

module.exports = (db) => {
  const router = express.Router();
  const access = requireClassAccess(db);

  router.get('/', async (req, res) => {
    // B2B: mã lớp có chữ B (P2.BIE.B067...) hoặc có học viên từ COMPANY; B2C: chữ khác B hoặc có học viên cá nhân. Lớp hỗn hợp có cả hai.
    const base = `select c.*, ${TIMING_SQL} as timing, ${PHASE_DATES_SQL}, (select count(*)::int from enrollments e where e.class_id = c.id) as student_count,
      (left(split_part(c.code, '.', 3), 1) = 'B' or exists (select 1 from enrollments e where e.class_id = c.id and e.segment = 'b2b')) as is_b2b,
      (left(split_part(c.code, '.', 3), 1) <> 'B' or exists (select 1 from enrollments e where e.class_id = c.id and e.segment = 'b2c')) as is_b2c,
      (select string_agg(distinct e.company_name, ' · ') from enrollments e where e.class_id = c.id and e.company_name is not null) as companies
      from classes c`;
    const rows = req.user.role === 'admin'
      ? await db.all(`${base} order by c.start_date desc nulls last, c.id desc`)
      : await db.all(`${base} join class_instructors ci on ci.class_id = c.id and ci.user_id = $1 order by c.start_date desc nulls last, c.id desc`, [req.user.id]);
    res.json(rows);
  });

  router.post('/', requireAdmin, async (req, res) => {
    const code = String(req.body.code || '').trim();
    const name = String(req.body.name || '').trim() || code;
    const sessionCount = Math.min(Math.max(Number(req.body.session_count) || 8, 1), 60);
    const hwCount = Math.min(Math.max(Number(req.body.hw_count ?? 6), 0), 30);
    if (!code) return res.status(400).json({ error: 'Cần mã lớp' });
    if (!isDate(req.body.start_date)) return res.status(400).json({ error: 'Ngày bắt đầu phải dạng yyyy-mm-dd' });
    if (await db.one('select 1 as x from classes where code = $1', [code])) return res.status(409).json({ error: 'Mã lớp đã tồn tại' });
    const created = await db.tx(async (t) => {
      const c = await t.one('insert into classes (code, name, phase, start_date) values ($1, $2, $3, $4) returning *',
        [code, name, req.body.phase || null, req.body.start_date || null]);
      await t.run("insert into sessions (class_id, session_no, title) select $1::bigint, n, 'Buổi ' || n from generate_series(1, $2::int) n", [c.id, sessionCount]);
      await t.run("insert into assignments (class_id, kind, seq, title) select $1::bigint, 'hw', n, 'HW ' || n from generate_series(1, $2::int) n", [c.id, hwCount]);
      await t.run("insert into assignments (class_id, kind, seq, title) values ($1, 'capstone', 1, 'Capstone Project')", [c.id]);
      return c;
    });
    res.status(201).json(created);
  });

  router.get('/:classId', access, (req, res) => res.json(req.cls));

  router.put('/:classId', requireAdmin, access, async (req, res) => {
    const { name, phase, start_date, status } = req.body;
    if (!isDate(start_date)) return res.status(400).json({ error: 'Ngày bắt đầu phải dạng yyyy-mm-dd' });
    if (status && !['active', 'finished', 'archived'].includes(status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    const c = await db.one('update classes set name = $1, phase = $2, start_date = $3, status = $4 where id = $5 returning *',
      [name || req.cls.name, phase ?? req.cls.phase, start_date || req.cls.start_date, status || req.cls.status, req.cls.id]);
    res.json(c);
  });

  router.get('/:classId/dashboard', access, async (req, res) => res.json(await buildDashboard(db, req.cls)));

  router.get('/:classId/sessions', access, async (req, res) =>
    res.json(await db.all('select * from sessions where class_id = $1 order by session_no', [req.cls.id])));

  router.put('/:classId/sessions/:sessionId', access, async (req, res) => {
    const s = await db.one('select * from sessions where id = $1 and class_id = $2', [Number(req.params.sessionId) || 0, req.cls.id]);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy buổi học' });
    if (!isDate(req.body.session_date)) return res.status(400).json({ error: 'Ngày phải dạng yyyy-mm-dd' });
    const date = req.body.session_date === undefined ? s.session_date : (req.body.session_date || null);
    const updated = await db.one('update sessions set title = $1, session_date = $2 where id = $3 returning *', [req.body.title ?? s.title, date, s.id]);
    await realtime.publish(req.cls.id, { kind: 'attendance' });
    res.json(updated);
  });

  router.get('/:classId/assignments', access, async (req, res) =>
    res.json(await db.all("select * from assignments where class_id = $1 order by kind = 'capstone', seq", [req.cls.id])));

  router.put('/:classId/assignments/:assignmentId', access, async (req, res) => {
    const a = await db.one('select * from assignments where id = $1 and class_id = $2', [Number(req.params.assignmentId) || 0, req.cls.id]);
    if (!a) return res.status(404).json({ error: 'Không tìm thấy bài tập' });
    if (!isDate(req.body.due_date)) return res.status(400).json({ error: 'Hạn nộp phải dạng yyyy-mm-dd' });
    const due = req.body.due_date === undefined ? a.due_date : (req.body.due_date || null);
    res.json(await db.one('update assignments set title = $1, due_date = $2 where id = $3 returning *', [req.body.title || a.title, due, a.id]));
  });

  return router;
};
