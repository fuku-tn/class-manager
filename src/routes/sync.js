// Nhận dữ liệu đăng ký từ Google Sheet (Apps Script đẩy sang). Mount tại /api/sync — xác thực bằng mã SYNC_TOKEN,
// KHÔNG dùng phiên đăng nhập. Chỉ nhận các cột trong danh sách cho phép (không tiền): cột khác bị bỏ ngay khi đọc.
// Chỉ thêm/điền chỗ trống; không xóa, không đè sửa tay (xem preserveManual trong importTransactions).
const crypto = require('node:crypto');
const express = require('express');
const realtime = require('../services/realtime');

const MAX_ROWS = 20000;
const MAX_COLS = 60;
const failures = new Map(); // IP -> { count, first } — chặn dò mã
let busy = false;

const norm = (h) => String(h ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true }); // expose: thông điệp an toàn để trả về

// Bảng { headers: [...], rows: [[...]] } -> chỉ giữ cột cho phép, mỗi cột một lần.
function pickColumns(table, allowed, dateCols = []) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) throw httpError(400, 'Dữ liệu đồng bộ không đúng định dạng');
  if (table.headers.length > MAX_COLS || table.rows.length > MAX_ROWS) throw httpError(413, 'Dữ liệu đồng bộ quá lớn');
  const seen = new Set();
  const keep = [];
  table.headers.forEach((h, i) => {
    const k = norm(h);
    if (allowed.includes(k) && !seen.has(k)) { seen.add(k); keep.push([i, k]); }
  });
  const cell = (v, k) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    const s = String(v).trim().slice(0, 500);
    if (dateCols.includes(k)) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    return s === '' ? null : s;
  };
  return {
    headers: keep.map(([, k]) => k),
    rows: table.rows.filter(Array.isArray).map((r) => keep.map(([i, k]) => cell(r[i], k))),
  };
}

module.exports = (db) => {
  const router = express.Router();
  router.use(express.json({ limit: '3mb' }));

  function checkToken(req) {
    const expected = process.env.SYNC_TOKEN;
    if (!expected) throw httpError(503, 'Chưa bật đồng bộ: máy chủ chưa có biến SYNC_TOKEN');
    const rec = failures.get(req.ip);
    if (rec && Date.now() - rec.first < 15 * 60 * 1000 && rec.count >= 20) throw httpError(429, 'Sai mã quá nhiều lần, thử lại sau 15 phút');
    if (!crypto.timingSafeEqual(sha(req.get('x-sync-token') || ''), sha(expected))) {
      const now = Date.now();
      if (!rec || now - rec.first > 15 * 60 * 1000) failures.set(req.ip, { count: 1, first: now }); else rec.count++;
      throw httpError(401, 'Sai mã đồng bộ');
    }
    failures.delete(req.ip);
  }

  async function classesAsCourseTable() {
    const rows = await db.all('select code, short_code, start_date, end_date, next_short_code from classes where short_code is not null');
    return {
      headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE'],
      rows: rows.map((r) => [r.short_code, r.code, r.start_date, r.end_date, r.next_short_code]),
    };
  }

  router.post('/transactions', async (req, res) => {
    checkToken(req);
    if (busy) return res.status(409).json({ error: 'Đang xử lý một lượt đồng bộ khác' });
    busy = true;
    const ExcelJS = require('exceljs');
    const { importTransactions, ALLOWED_TX, ALLOWED_COURSE } = require('../services/importTransactions');
    try {
      const tx = pickColumns(req.body?.transactions, ALLOWED_TX);
      if (!tx.headers.includes('STUDENT ID') || !tx.headers.includes('COURSE')) throw httpError(422, 'Thiếu cột STUDENT ID hoặc COURSE trong sheet Transactions');
      const course = req.body?.course
        ? pickColumns(req.body.course, ALLOWED_COURSE, ['STARTDATE', 'ENDDATE'])
        : pickColumns(await classesAsCourseTable(), ALLOWED_COURSE, []);
      if (!req.body?.course) { // lấy từ database: ngày đã là chuỗi/Date → chuẩn hóa sang Date UTC
        const di = [course.headers.indexOf('STARTDATE'), course.headers.indexOf('ENDDATE')];
        for (const r of course.rows) for (const i of di) if (i >= 0 && typeof r[i] === 'string') { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r[i]); r[i] = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
      }
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Course').addRows([course.headers, ...course.rows]);
      wb.addWorksheet('Transactions').addRows([tx.headers, ...tx.rows]);

      const { anomaly_details, class_ids = [], columns_read, ...brief } = await importTransactions(db, {
        transactionsFile: wb, curriculumFile: null, dryRun: false, preserveManual: true,
      });
      const changed = Object.values(brief.added ?? {}).some((n) => n > 0);
      if (changed) await realtime.publishMany(class_ids.flatMap((classId) => [{ classId, payload: { kind: 'attendance' } }]));
      await log(true, brief, null);
      res.json({ ok: true, ...brief, changed });
    } catch (e) {
      await log(false, null, e.message).catch(() => {});
      if (/Thiếu giáo trình/.test(e.message)) return res.status(422).json({ error: e.message });
      throw e;
    } finally {
      busy = false;
    }
  });

  async function log(ok, summary, error) {
    await db.run('insert into sync_runs (source, ok, summary, error) values ($1, $2, $3::jsonb, $4)',
      ['google-sheet', ok, summary ? JSON.stringify(summary) : null, error ? String(error).slice(0, 300) : null]);
    await db.run('delete from sync_runs where id not in (select id from sync_runs order by id desc limit 200)');
  }

  return router;
};
