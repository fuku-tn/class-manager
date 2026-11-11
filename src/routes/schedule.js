// Lịch giảng dạy (đọc): GET /api/schedule/teaching. Mỗi người chỉ thấy lịch của lớp mình được xem
// (cùng quy tắc với /api/classes: mọi tài khoản thấy lịch của mọi lớp có trong app; mã lớp chưa có trong app chỉ admin thấy).
const express = require('express');

module.exports = (db) => {
  const router = express.Router();
  router.get('/teaching', async (req, res) => {
    const base = `select t.id, t.class_id, t.short_code, t.session_date, t.shift, t.session_no, t.content, t.mode, t.segment, t.note, t.instructor,
                         c.code as class_code, c.program
                    from teaching_schedule t left join classes c on c.id = t.class_id`;
    const rows = req.user.role === 'admin'
      ? await db.all(`${base} order by t.session_date, t.short_code, t.session_no nulls last`)
      : await db.all(`${base} where t.class_id is not null order by t.session_date, t.short_code, t.session_no nulls last`);
    res.json(rows.map((r) => ({ ...r, session_date: String(r.session_date).slice(0, 10) })));
  });
  return router;
};
