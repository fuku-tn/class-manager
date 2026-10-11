const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

const TOKEN = 'test-sync-token-123';
let t, admin, instructor;
const realFetch = global.fetch;

const TX_HEAD = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE', 'PRICE', 'PAID AMOUNT'];
const MONEY = 'TIEN-987654';
const tx = (...rows) => ({ headers: TX_HEAD, rows: rows.map((r) => [...r, MONEY, MONEY]) });
const COURSE = { headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE', 'PRICE'],
  rows: [['BIE104', 'P2.BIE.P104.HY.AA.041026', '2026-10-04', '2026-12-20', null, MONEY]] };
const A = ['P.1', 'C1', 'Nguyễn An', 'AN@X.COM', 901111111, 'BIE104', 'Online', 'Male', null, 'Form'];
const B = ['P.2', 'C2', 'Trần Bình', 'binh@x.com', '0902222222', 'BIE104', 'Offline', 'Female', null, 'Form'];

function post(body, token = TOKEN) {
  return realFetch(`${t.base}/api/sync/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Sync-Token': token } : {}) }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  await t.addUser('gv@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  instructor = await t.login('gv@x.com');
  await t.db.run("insert into curricula (code, program, name, session_count) values ('BIE-8', 'BIE', 'BIE 8 buổi', 8)");
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('đồng bộ: cần đúng mã; chưa cấu hình thì tắt', async () => {
  assert.equal((await post({ transactions: tx(A), course: COURSE }, null)).status, 401);
  assert.equal((await post({ transactions: tx(A), course: COURSE }, 'sai-ma')).status, 401);
  const saved = process.env.SYNC_TOKEN;
  delete process.env.SYNC_TOKEN;
  assert.equal((await post({ transactions: tx(A), course: COURSE })).status, 503);
  process.env.SYNC_TOKEN = saved;
  assert.equal((await t.db.one('select count(*)::int n from students')).n, 0);
});

test('đồng bộ: tạo lớp, học viên, ghi danh; bỏ cột tiền; chạy lại không đổi gì', async () => {
  const r = await post({ transactions: tx(A, B), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.changed, true);
  assert.equal(r.body.added.students, 2);
  assert.equal(r.body.added.enrollments, 2);
  assert.ok(!JSON.stringify(r.body).includes(MONEY));
  const cls = await t.db.one("select short_code, start_date, end_date, delivery_mode, curriculum_id from classes where short_code = 'BIE104'");
  assert.equal(cls.start_date, '2026-10-04'); // không lệch múi giờ
  assert.equal(cls.end_date, '2026-12-20');
  assert.ok(cls.curriculum_id);
  const st = await t.db.one("select email, phone, gender from students where student_code = 'P.1'");
  assert.deepEqual(st, { email: 'an@x.com', phone: '0901111111', gender: 'Male' });
  const again = await post({ transactions: tx(A, B), course: COURSE });
  assert.equal(again.body.changed, false);
  assert.equal(again.body.added.students, 0);
});

test('đồng bộ không đè sửa tay: tên, trạng thái "đã nghỉ"; vẫn nhận học viên mới và "Không tham gia"', async () => {
  await t.db.run("update students set full_name = 'Tên sửa tay' where student_code = 'P.1'");
  await t.db.run("update enrollments set course_status = 'dropped' where student_id = (select id from students where student_code = 'P.1')");
  const C = ['P.3', 'C3', 'Lê Chi', 'chi@x.com', '0903333333', 'BIE104', 'Hybrid', 'Female', null, 'Form'];
  const Bdrop = [...B]; Bdrop[8] = 'Không tham gia';
  const r = await post({ transactions: tx(A, Bdrop, C) });   // không gửi sheet Course: dùng danh sách lớp trong database
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added.students, 1);
  const q = (code) => t.db.one(`select s.full_name, e.course_status from students s join enrollments e on e.student_id = s.id where s.student_code = $1`, [code]);
  assert.deepEqual(await q('P.1'), { full_name: 'Tên sửa tay', course_status: 'dropped' });
  assert.equal((await q('P.2')).course_status, 'dropped');   // sheet báo không tham gia
  assert.equal((await q('P.3')).course_status, 'active');
});

test('đồng bộ: thiếu cột bắt buộc, dữ liệu sai, lớp thiếu giáo trình vẫn nhận', async () => {
  assert.equal((await post({ transactions: { headers: ['FULL NAME'], rows: [['x']] }, course: COURSE })).status, 422);
  assert.equal((await post({ transactions: 'khong-phai-bang' })).status, 400);
  const course2 = { headers: COURSE.headers, rows: [['EBA120', 'P1.EBA.B120.OF.MA.010126', '2026-11-01', '2026-12-01', null, MONEY]] };
  const row = ['P.9', null, 'Võ Em', 'em@x.com', null, 'EBA120', 'Offline', null, null, 'Form'];
  const r = await post({ transactions: tx(row), course: course2 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await t.db.one("select count(*)::int n from classes where short_code = 'EBA120'")).n, 1);
});

test('nhật ký đồng bộ: admin xem được, giảng viên không', async () => {
  const s = await admin.get('/api/import/sync-status');
  assert.equal(s.status, 200);
  assert.equal(s.body.enabled, true);
  assert.ok(s.body.runs.length >= 3);
  assert.equal(s.body.runs[0].ok, true);
  assert.equal((await instructor.get('/api/import/sync-status')).status, 403);
  assert.ok(!JSON.stringify(s.body).includes(MONEY));
});

test('script Apps Script dùng đúng danh sách cột cho phép như máy chủ và không nhắc tới tiền', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { ALLOWED_TX, ALLOWED_COURSE } = require('../src/services/importTransactions');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-transactions.gs'), 'utf8');
  const list = (name) => JSON.parse(new RegExp(`const ${name} = (\\[.*?\\]);`).exec(src)[1].replace(/'/g, '"'));
  assert.deepEqual(list('ALLOWED_TX'), ALLOWED_TX);
  assert.deepEqual(list('ALLOWED_COURSE'), ALLOWED_COURSE);
  for (const col of [...ALLOWED_TX, ...ALLOWED_COURSE]) assert.ok(!/price|amount|paid|voucher|fee|giá|tiền|payment/i.test(col), col);
  assert.ok(!/SYNC_TOKEN\s*=\s*['"][^'"]+['"]/.test(src), 'không được ghi sẵn mã bí mật trong script');
});
