// Nhận dữ liệu đăng ký từ Google Sheet (Apps Script đẩy sang). Mount tại /api/sync — xác thực bằng mã SYNC_TOKEN,
// KHÔNG dùng phiên đăng nhập. Chỉ nhận các cột trong danh sách cho phép (không tiền): cột khác bị bỏ ngay khi đọc.
// Chỉ thêm/điền chỗ trống; không xóa, không đè sửa tay (xem preserveManual trong importTransactions).
const crypto = require('node:crypto');
const express = require('express');
const realtime = require('../services/realtime');
const { ALLOWED_TX, ALLOWED_COURSE } = require('../services/importTransactions');
const { FORM_COLUMNS, applyForms } = require('../services/formProfile');
const { importPoints, POINT_SYNC_COLUMNS } = require('../services/importPoints');
const { importSchedule } = require('../services/importSchedule');
const { importAbsences } = require('../services/absence');
const { importScoreFiles, SCORE_FILE_COLUMNS } = require('../services/importScoreFiles');

// Tab COURSE của Google Sheet dùng tên cột "START DATE"/"EXPECTED END DATE" (Excel/Power Query đổi thành STARTDATE/ENDDATE).
const COURSE_ALIASES = { 'START DATE': 'STARTDATE', 'EXPECTED END DATE': 'ENDDATE' };
const SYNC_COURSE_COLUMNS = [...ALLOWED_COURSE, ...Object.keys(COURSE_ALIASES)];
// Tab COMPANY (học viên B2B): cùng cột với PERSONAL + tên công ty. Không có cột ngày sinh/tiền.
const SYNC_COMPANY_COLUMNS = [...ALLOWED_TX, 'COMPANY NAME'];

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

// Gộp hai bảng về cùng bộ cột (ALLOWED_TX + COMPANY NAME + SEGMENT).
function mergeSegments(personal, company) {
  const headers = [...ALLOWED_TX, 'COMPANY NAME', 'SEGMENT'];
  // Tên công ty trong Sheet thường chỉ ghi ở một số dòng: các dòng cùng CUSTOMER ID (mã công ty) dùng chung tên.
  if (company) {
    const ci = company.headers.indexOf('CUSTOMER ID');
    const ni = company.headers.indexOf('COMPANY NAME');
    if (ci >= 0 && ni >= 0) {
      const nameOf = new Map();
      for (const r of company.rows) if (r[ci] && r[ni] && !nameOf.has(r[ci])) nameOf.set(r[ci], r[ni]);
      company = { headers: company.headers, rows: company.rows.map((r) => (r[ni] || !nameOf.has(r[ci]) ? r : r.map((v, i) => (i === ni ? nameOf.get(r[ci]) : v)))) };
    }
  }
  const conv = (table, segment) => table.rows.map((r) => headers.map((h) => (h === 'SEGMENT' ? segment : (() => {
    const i = table.headers.indexOf(h);
    return i >= 0 ? r[i] : null;
  })())));
  return { headers, rows: [...conv(personal, 'b2c'), ...(company ? conv(company, 'b2b') : [])] };
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
    const { importTransactions } = require('../services/importTransactions');
    try {
      const tx = pickColumns(req.body?.transactions, ALLOWED_TX);
      if (!tx.headers.includes('STUDENT ID') || !tx.headers.includes('COURSE')) throw httpError(422, 'Thiếu cột STUDENT ID hoặc COURSE trong sheet Transactions');
      // Gộp PERSONAL (B2C) và COMPANY (B2B) thành một bảng có thêm cột SEGMENT + COMPANY NAME.
      let company = null;
      if (req.body?.company) {
        company = pickColumns(req.body.company, SYNC_COMPANY_COLUMNS);
        if (!company.headers.includes('STUDENT ID') || !company.headers.includes('COURSE')) throw httpError(422, 'Thiếu cột STUDENT ID hoặc COURSE trong sheet COMPANY');
      }
      const merged = mergeSegments(tx, company);
      let course;
      if (req.body?.course) {
        course = pickColumns(req.body.course, SYNC_COURSE_COLUMNS, ['STARTDATE', 'ENDDATE', ...Object.keys(COURSE_ALIASES)]);
        // đổi tên cột Google Sheet về tên chuẩn của bộ nhập (nếu tên chuẩn chưa có)
        course.headers = course.headers.map((h) => (COURSE_ALIASES[h] && !course.headers.includes(COURSE_ALIASES[h]) ? COURSE_ALIASES[h] : h));
      } else {
        course = pickColumns(await classesAsCourseTable(), ALLOWED_COURSE, []);
      }
      if (!req.body?.course) { // lấy từ database: ngày đã là chuỗi/Date → chuẩn hóa sang Date UTC
        const di = [course.headers.indexOf('STARTDATE'), course.headers.indexOf('ENDDATE')];
        for (const r of course.rows) for (const i of di) if (i >= 0 && typeof r[i] === 'string') { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r[i]); r[i] = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
      }
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Course').addRows([course.headers, ...course.rows]);
      wb.addWorksheet('Transactions').addRows([merged.headers, ...merged.rows]);

      // Sheet đột nhiên ít hơn hẳn lần trước (xóa nhầm/hỏng): vẫn nhận dòng có mặt nhưng KHÔNG dò "không còn trong Sheet".
      const prevRun = await db.one("select (summary->>'transactions_rows')::int as n from sync_runs where ok and source = 'google-sheet' order by id desc limit 1");
      const suspicious = !!(prevRun?.n && tx.rows.length < prevRun.n * 0.5);
      const { anomaly_details, class_ids = [], columns_read, ...brief } = await importTransactions(db, {
        transactionsFile: wb, curriculumFile: null, dryRun: false, preserveManual: true,
        eventSource: 'sync', detectMissing: !suspicious, guard: true,
        missingSegments: company ? ['b2c', 'b2b'] : ['b2c'], // chưa gửi COMPANY thì không dò B2B
      });
      if (suspicious) brief.missing_detection_skipped = true;
      // Tab FORM: hồ sơ đăng ký (đã bỏ thông tin cá nhân ở Apps Script; máy chủ lọc lại theo FORM_COLUMNS).
      if (req.body?.form) {
        const form = pickColumns(req.body.form, FORM_COLUMNS);
        if (!form.headers.includes('COURSE')) throw httpError(422, 'Thiếu cột Mã lớp trong sheet FORM');
        brief.form = await applyForms(db, form);
      }
      const changed = Object.values(brief.added ?? {}).some((n) => n > 0);
      if (changed) await realtime.publishMany(class_ids.flatMap((classId) => [{ classId, payload: { kind: 'attendance' } }]));
      await log(true, brief, null);
      res.json({ ok: true, ...brief, changed });
    } catch (e) {
      await log(false, null, e.detail ? `${e.message} — ${e.detail}` : e.message).catch(() => {});
      if (/Thiếu giáo trình/.test(e.message)) return res.status(422).json({ error: e.message });
      throw e;
    } finally {
      busy = false;
    }
  });

  // Điểm bài tập từ tab "Point". Chỉ nhận 5 cột cho phép (không có họ tên); ghi riêng ở homework_scores.
  let busyPoints = false;
  router.post('/points', async (req, res) => {
    checkToken(req);
    // Từ 18/10/2026 điểm HW lấy từ file Excel "Chấm điểm.xlsx" (npm run import-points, lịch 12:00) — Sheet điểm không còn được nhận,
    // tránh hai nguồn ghi đè/xóa lẫn nhau. Bật lại tạm bằng POINTS_SHEET_SYNC=1.
    if (process.env.POINTS_SHEET_SYNC !== '1') {
      return res.status(410).json({ error: 'Điểm HW giờ cập nhật từ file Excel "Chấm điểm.xlsx", không nhận từ Google Sheet nữa. Hãy chạy hàm stop() trong Apps Script của Sheet điểm.' });
    }
    if (busyPoints) return res.status(409).json({ error: 'Đang xử lý một lượt đồng bộ điểm khác' });
    busyPoints = true;
    try {
      const table = pickColumns(req.body?.points, POINT_SYNC_COLUMNS);
      const { class_ids = [], ...brief } = await importPoints(db, table);
      if (brief.inserted + brief.updated + brief.deleted > 0) {
        await realtime.publishMany(class_ids.map((classId) => ({ classId, payload: { kind: 'scores' } })));
      }
      await log(true, brief, null, 'google-sheet-points');
      res.json({ ok: true, ...brief, changed: brief.inserted + brief.updated + brief.deleted > 0 });
    } catch (e) {
      await log(false, null, e.message, 'google-sheet-points').catch(() => {});
      throw e;
    } finally {
      busyPoints = false;
    }
  });

  // Lịch giảng dạy từ bảng "Calendar" (Ngày, Buổi, Khóa, Nội dung, Số buổi, Hình thức, Loại, Ghi chú). Sheet là bản chuẩn: thay toàn bộ lịch.
  let busySchedule = false;
  router.post('/schedule', async (req, res) => {
    checkToken(req);
    if (busySchedule) return res.status(409).json({ error: 'Đang xử lý một lượt đồng bộ lịch khác' });
    busySchedule = true;
    try {
      const table = req.body?.schedule;
      if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) throw httpError(400, 'Dữ liệu đồng bộ không đúng định dạng');
      if (table.headers.length > MAX_COLS || table.rows.length > MAX_ROWS) throw httpError(413, 'Dữ liệu đồng bộ quá lớn');
      const { class_ids = [], ...brief } = await importSchedule(db, table);
      await realtime.publishMany(class_ids.map((classId) => ({ classId, payload: { kind: 'schedule' } })));
      await log(true, brief, null, 'google-sheet-schedule');
      res.json({ ok: true, ...brief });
    } catch (e) {
      await log(false, null, e.message, 'google-sheet-schedule').catch(() => {});
      throw e;
    } finally {
      busySchedule = false;
    }
  });

  // Điểm từ danh sách file bài làm trên SharePoint (cột Path · Name · Point): điểm của bài = tổng điểm các file (tối đa 10), ghép theo (lớp, tên học viên).
  // Chỉ thêm/cập nhật điểm do chính nguồn này nhập; không đè điểm Excel, không đè điểm gõ tay, không xóa điểm nào.
  let busyScoreFiles = false;
  router.post('/score-files', async (req, res) => {
    checkToken(req);
    if (busyScoreFiles) return res.status(409).json({ error: 'Đang xử lý một lượt đồng bộ điểm khác' });
    busyScoreFiles = true;
    try {
      const table = pickColumns(req.body?.files, SCORE_FILE_COLUMNS);
      const { class_ids = [], import: imp, ...brief } = await importScoreFiles(db, table);
      if (imp && imp.inserted + imp.updated > 0) await realtime.publishMany(class_ids.map((classId) => ({ classId, payload: { kind: 'scores' } })));
      const out = { ...brief, inserted: imp?.inserted ?? 0, updated: imp?.updated ?? 0, skipped_no_assignment: imp?.skipped_no_assignment ?? 0, examples: { ...brief.examples, no_assignment: imp?.examples?.no_assignment ?? [] } };
      await log(true, out, null, 'google-sheet-scorefiles');
      res.json({ ok: true, ...out, changed: out.inserted + out.updated > 0 });
    } catch (e) {
      await log(false, null, e.message, 'google-sheet-scorefiles').catch(() => {});
      throw e;
    } finally {
      busyScoreFiles = false;
    }
  });

  // Đơn xin nghỉ học qua email: tối đa 100 thư/lượt, mỗi thư { id, from, replyTo, subject, body, received }. Máy chủ chỉ giữ học viên + ngày nghỉ.
  let busyAbsences = false;
  router.post('/absences', async (req, res) => {
    checkToken(req);
    if (busyAbsences) return res.status(409).json({ error: 'Đang xử lý một lượt đồng bộ đơn xin nghỉ khác' });
    busyAbsences = true;
    try {
      const list = req.body?.messages;
      if (!Array.isArray(list)) throw httpError(400, 'Dữ liệu đồng bộ không đúng định dạng');
      if (list.length > 100) throw httpError(413, 'Mỗi lượt tối đa 100 thư');
      const messages = list.filter((m) => m && typeof m === 'object').map((m) => ({
        id: String(m.id ?? '').slice(0, 120), from: String(m.from ?? '').slice(0, 300), replyTo: String(m.replyTo ?? '').slice(0, 300),
        subject: String(m.subject ?? '').slice(0, 300), body: String(m.body ?? '').slice(0, 4000), received: m.received }));
      const { class_ids, ...brief } = await importAbsences(db, messages);
      if (brief.added > 0) await realtime.publishMany(class_ids.map((classId) => ({ classId, payload: { kind: 'absence' } })));
      await log(true, brief, null, 'google-sheet-absences');
      res.json({ ok: true, ...brief, changed: brief.added > 0 });
    } catch (e) {
      await log(false, null, e.message, 'google-sheet-absences').catch(() => {});
      throw e;
    } finally {
      busyAbsences = false;
    }
  });

  async function log(ok, summary, error, source = 'google-sheet') {
    await db.run('insert into sync_runs (source, ok, summary, error) values ($1, $2, $3::jsonb, $4)',
      [source, ok, summary ? JSON.stringify(summary) : null, error ? String(error).slice(0, 300) : null]);
    await db.run('delete from sync_runs where id not in (select id from sync_runs order by id desc limit 200)');
  }

  return router;
};
module.exports.SYNC_COURSE_COLUMNS = SYNC_COURSE_COLUMNS;
module.exports.SYNC_COMPANY_COLUMNS = SYNC_COMPANY_COLUMNS;
module.exports.FORM_COLUMNS = FORM_COLUMNS;
