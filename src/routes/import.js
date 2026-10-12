// Nhập Excel qua web (chỉ admin). Mount tại /api/import. Thân yêu cầu = nội dung file .xlsx (octet-stream).
// File chỉ nằm trong bộ nhớ lúc xử lý, không lưu đĩa/database. Bộ nhập chỉ đọc cột trong danh sách cho phép (không tiền).
const express = require('express');
const realtime = require('../services/realtime');

const MAX_BYTES = 4 * 1024 * 1024; // Vercel giới hạn thân yêu cầu ~4,5MB
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
let busy = false; // mỗi lần chỉ một lượt nhập (trên mỗi instance)

module.exports = (db) => {
  const router = express.Router(); // đã qua requireAuth + requireAdmin ở create-app.js
  router.use(express.raw({ type: () => true, limit: MAX_BYTES }));

  // Nhật ký đồng bộ tự động từ Google Sheet (5 lần gần nhất).
  router.get('/sync-status', async (_req, res) => {
    const runs = await db.all('select id, ok, summary, error, created_at from sync_runs order by id desc limit 5');
    const missing = (await db.one(
      `select count(*)::int as n from (select distinct on (enrollment_id) enrollment_id, event from enrollment_events
         where enrollment_id is not null order by enrollment_id, id desc) l
       join enrollments e on e.id = l.enrollment_id and e.course_status = 'active' where l.event = 'missing_from_sheet'`)).n;
    const pending = await db.all(
      `select short_code, count(*)::int as n from registration_forms where enrollment_id is null group by short_code order by n desc, short_code limit 20`);
    const formPending = { count: pending.reduce((a, r) => a + r.n, 0), by_class: pending };
    res.json({ enabled: !!process.env.SYNC_TOKEN, runs, missing, form_pending: formPending });
  });

  function readFile(req, res) {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) { res.status(400).json({ error: 'Chưa nhận được file' }); return null; }
    if (!buf.subarray(0, 4).equals(ZIP_MAGIC)) { res.status(400).json({ error: 'File không phải Excel .xlsx' }); return null; }
    return buf;
  }

  async function run(req, res, work) {
    const file = readFile(req, res);
    if (!file) return;
    if (busy) return res.status(409).json({ error: 'Đang có một lượt nhập khác, hãy đợi vài giây rồi thử lại' });
    busy = true;
    try {
      res.json(await work(file, req.query.dry_run === '1'));
    } catch (e) {
      if (e.status) throw e;
      if (/Thiếu giáo trình|Không tìm thấy sheet|cần có sheet|Không thấy/.test(e.message)) return res.status(422).json({ error: e.message });
      if (/zip|central directory|end of data|corrupt|Can't find end/i.test(e.message)) return res.status(400).json({ error: 'Không đọc được file Excel (file hỏng hoặc không đúng định dạng .xlsx)' });
      throw e;
    } finally {
      busy = false;
    }
  }

  // Điểm danh + bài tập từ workbook nhiều sheet (chỉ sheet đang hiện).
  router.post('/attendance', (req, res) => run(req, res, async (file, dryRun) => {
    const { importExcel } = require('../services/importExcel'); // nạp khi dùng: máy chủ không tốn bộ nhớ cho exceljs lúc khởi động
    const s = await importExcel(db, file, { dryRun });
    const classIds = s.classes.map((c) => c.class_id).filter(Boolean);
    if (!dryRun) await realtime.publishMany(classIds.flatMap((classId) => [{ classId, payload: { kind: 'attendance' } }, { classId, payload: { kind: 'submissions' } }]));
    return { ...s, classes: s.classes.map(({ class_id, ...c }) => c), published: dryRun ? 0 : classIds.length };
  }));

  // Lớp, học viên, ghi danh từ Transactions.xlsx (giáo trình lấy từ database).
  router.post('/transactions', (req, res) => run(req, res, async (file, dryRun) => {
    const { importTransactions } = require('../services/importTransactions');
    const { anomaly_details, class_ids = [], ...brief } = await importTransactions(db, { transactionsFile: file, curriculumFile: null, dryRun });
    if (!dryRun) await realtime.publishMany(class_ids.flatMap((classId) => [{ classId, payload: { kind: 'attendance' } }, { classId, payload: { kind: 'submissions' } }]));
    return { ...brief, published: dryRun ? 0 : class_ids.length };
  }));

  return router;
};
