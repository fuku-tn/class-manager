// Lịch giảng dạy (đọc): GET /api/schedule/teaching. Mỗi người chỉ thấy lịch của lớp mình được xem
// (cùng quy tắc với /api/classes: admin thấy hết, kể cả mã lớp chưa có trong app; giảng viên/khách chỉ lớp được phân công
// và lớp chưa diễn ra nếu được bật can_view_upcoming).
const express = require('express');
const { TIMING_SQL } = require('../services/timing');

module.exports = (db) => {
  const router = express.Router();
  router.get('/teaching', async (req, res) => {
    const base = `select t.id, t.class_id, t.short_code, t.session_date, t.shift, t.session_no, t.content, t.mode, t.segment, t.note, t.instructor,
                         c.code as class_code, c.program
                    from teaching_schedule t left join classes c on c.id = t.class_id`;
    const rows = req.user.role === 'admin'
      ? await db.all(`${base} order by t.session_date, t.short_code, t.session_no nulls last`)
      : await db.all(`${base} where t.class_id in (select id from classes cc where cc.id in (select class_id from class_instructors where user_id = $1)
                        or ($2::boolean and (select ${TIMING_SQL} from classes c where c.id = cc.id) = 'upcoming'))
                      order by t.session_date, t.short_code, t.session_no nulls last`,
        [req.user.id, req.user.can_view_upcoming === true && req.user.role !== 'guest']);
    res.json(rows.map((r) => ({ ...r, session_date: String(r.session_date).slice(0, 10) })));
  });
  return router;
};
