// Tổng quan cho trang Home: số lớp đang diễn ra, học viên đang học, chuyên cần trung bình, lớp nổi bật.
// Chỉ tính các lớp người dùng được phép xem (admin: tất cả; giảng viên: lớp được phân công).
const express = require('express');
const { TIMING_SQL } = require('../services/timing');
const { attendanceRate } = require('../services/stats'); // công thức chuyên cần chỉ nằm ở stats.js

const PROGRAM_NAMES = {
  BIE: 'Business Intelligence Essentials', BIH: 'BI HR Analytics', EBA: 'Excel for Business Analytics',
  SIA: 'Sales Incentive Analytics', SCA: 'Sales Incentive Analytics', PBM: 'Practical Business Management',
};

module.exports = (db) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const admin = req.user.role === 'admin';
    const classes = await db.all(
      `select c.id, c.code, c.short_code, c.program, c.delivery_mode, c.shift, c.start_date, c.end_date,
              ${TIMING_SQL} as timing,
              (select count(*)::int from enrollments e where e.class_id = c.id and e.course_status in ('active','completed')) as students,
              (select count(*)::int from sessions s where s.class_id = c.id) as sessions_total,
              (select count(*)::int from sessions s where s.class_id = c.id and s.held) as sessions_held
       from classes c
       ${admin ? '' : 'where c.id in (select class_id from class_instructors where user_id = $1)'}`,
      admin ? [] : [req.user.id]);

    const running = classes.filter((c) => c.timing === 'running');
    const rateRows = running.length ? await db.all(
      `select e.class_id,
              count(*) filter (where a.status in ('present','late'))::int as att,
              count(*) filter (where a.status = 'excused')::int as exc,
              count(*)::int as total
       from enrollments e
       join sessions s on s.class_id = e.class_id and s.held
       left join attendance a on a.enrollment_id = e.id and a.session_id = s.id
       where e.course_status in ('active','completed') and e.class_id = any($1::bigint[])
       group by e.class_id`, [running.map((c) => c.id)]) : [];
    const rateOf = new Map(rateRows.map((r) => [r.class_id, attendanceRate(r.att, r.exc, r.total)]));
    const sum = rateRows.reduce((a, r) => ({ att: a.att + r.att, exc: a.exc + r.exc, total: a.total + r.total }), { att: 0, exc: 0, total: 0 });

    const view = (c) => ({
      id: c.id, short_code: c.short_code, code: c.code, program: c.program, program_name: PROGRAM_NAMES[c.program] ?? c.program,
      delivery_mode: c.delivery_mode, shift: c.shift, start_date: c.start_date, end_date: c.end_date,
      students: c.students, sessions_total: c.sessions_total, sessions_held: c.sessions_held,
      attendance_rate: rateOf.get(c.id) ?? null,
    });
    const byStartDesc = (a, b) => String(b.start_date).localeCompare(String(a.start_date));

    res.json({
      totals: {
        classes: classes.length,
        running: running.length,
        upcoming: classes.filter((c) => c.timing === 'upcoming').length,
        students_active: running.reduce((n, c) => n + c.students, 0),
        attendance_rate: attendanceRate(sum.att, sum.exc, sum.total),
        sessions_held: running.reduce((n, c) => n + c.sessions_held, 0),
      },
      featured: running.sort(byStartDesc).slice(0, 8).map(view),
      upcoming: classes.filter((c) => c.timing === 'upcoming').sort((a, b) => -byStartDesc(a, b)).slice(0, 4).map(view),
    });
  });

  return router;
};
