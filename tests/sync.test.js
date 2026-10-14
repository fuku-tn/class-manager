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
  assert.equal((await q('P.2')).course_status, 'deferred');   // sheet báo không tham gia (hiển thị giống bảo lưu)
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
  const { ALLOWED_TX } = require('../src/services/importTransactions');
  const { SYNC_COURSE_COLUMNS, SYNC_COMPANY_COLUMNS } = require('../src/routes/sync');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-transactions.gs'), 'utf8');
  const list = (name) => JSON.parse(new RegExp(`const ${name} = (\\[.*?\\]);`).exec(src)[1].replace(/'/g, '"'));
  assert.deepEqual(list('ALLOWED_TX'), ALLOWED_TX);
  assert.deepEqual(list('ALLOWED_COURSE'), SYNC_COURSE_COLUMNS);
  assert.match(src, /const ALLOWED_COMPANY = ALLOWED_TX\.concat\(\['COMPANY NAME'\]\);/);
  assert.deepEqual([...ALLOWED_TX, 'COMPANY NAME'], SYNC_COMPANY_COLUMNS);
  for (const col of [...ALLOWED_TX, ...SYNC_COURSE_COLUMNS]) assert.ok(!/price|amount|paid|voucher|fee|giá|tiền|payment/i.test(col), col);
  assert.ok(!/SYNC_TOKEN\s*=\s*['"][^'"]+['"]/.test(src), 'không được ghi sẵn mã bí mật trong script');
});

test('đồng bộ: tab COURSE của Google Sheet (START DATE / EXPECTED END DATE) được nhận đúng', async () => {
  const gsCourse = { headers: ['COURSE', 'Sub COURSE ID', 'COURSE ID', 'START DATE', 'EXPECTED END DATE', 'NEXT COURSE', 'LINK MS TEAMS', 'PASS CODE', 'TOTAL REVENUE'],
    rows: [['SIA130', 'x', 'P2.SIA.P130.ON.EE.150126', '2026-12-01', '2027-02-10', null, 'https://teams.example/' + MONEY, MONEY, MONEY]] };
  const row = ['P.77', null, 'Đỗ Phúc', 'phuc@x.com', null, 'SIA130', 'Online', null, null, 'Form'];
  const r = await post({ transactions: tx(row), course: gsCourse });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = await t.db.one("select start_date, end_date, delivery_mode, shift from classes where short_code = 'SIA130'");
  assert.deepEqual(c, { start_date: '2026-12-01', end_date: '2027-02-10', delivery_mode: 'Online', shift: 'evening' });
  assert.ok(!JSON.stringify(r.body).includes('teams.example') && !JSON.stringify(r.body).includes(MONEY));
});

test('script Apps Script tự tìm dòng tiêu đề bằng TextFinder (không đọc cả hàng tổng chứa tiền)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-transactions.gs'), 'utf8');
  assert.match(src, /createTextFinder\(keyHeader\)\.matchEntireCell\(true\)/);
  assert.match(src, /HEADER_ROW: 0/);
  assert.match(src, /FALLBACK_HEADER_ROW: 2/);
  // tiêu đề chỉ được đọc đúng một dòng (tên cột), không đọc nhiều dòng đầu
  assert.match(src, /getRange\(headerRow, 1, 1, lastCol\)/);
});

test('script Apps Script: tham số sự kiện của trigger không bị coi là "ép gửi"', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-transactions.gs'), 'utf8');
  assert.match(src, /function syncNow\(forceArg\)/);
  assert.match(src, /const force = forceArg === true;/);
  assert.match(src, /syncNow\(true\)/);
});

test('chốt chặn đồng bộ: một lượt thêm hoặc đánh dấu "không còn" quá nhiều ghi danh thì bị từ chối, không ghi gì', async () => {
  const mk = (n, course, from = 0) => Array.from({ length: n }, (_, i) =>
    [`G.${from + i}`, `CG${from + i}`, `Học viên ${from + i}`, `g${from + i}@x.com`, `09${String(10000000 + from + i)}`, course, 'Online', 'Male', null, 'Form']);
  const COURSES = { headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE'], rows: [
    ['GRD1', 'P2.BIE.P201.HY.AA.041026', '2026-10-04', '2026-12-20'], ['GRD2', 'P2.BIE.P202.HY.AA.041026', '2026-10-04', '2026-12-20']] };
  // database đang trống/ít: lượt đầu nạp 300 ghi danh vẫn được (chưa kiểm khi < 200 ghi danh)
  const first = await post({ transactions: tx(...mk(300, 'GRD1')), course: COURSES });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const countBefore = (await t.db.one('select count(*)::int n from enrollments')).n;
  // Sheet bị lệch: 300 người cùng lúc "chuyển" sang lớp khác → thêm 300 mới + 300 "không còn" → bị chặn
  const bad = await post({ transactions: tx(...mk(300, 'GRD2')), course: COURSES });
  assert.equal(bad.status, 409);
  assert.match(bad.body.error, /Đồng bộ bị chặn/);
  assert.equal((await t.db.one('select count(*)::int n from enrollments')).n, countBefore);   // không ghi gì
  assert.equal((await t.db.one("select count(*)::int n from enrollment_events where event = 'missing_from_sheet'")).n, 0);
  // thay đổi nhỏ (5 người mới) vẫn qua bình thường
  const ok = await post({ transactions: tx(...mk(300, 'GRD1'), ...mk(5, 'GRD1', 1000)), course: COURSES });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.added.enrollments, 5);
});

test('đồng bộ chỉ nhận dòng có đủ mã học viên hợp lệ và mã lớp có trong sheet Course; bảo lưu/chuyển lớp vẫn đi bình thường', async () => {
  const mkRow = (id, course, status = null) => [id, 'CX', `Người ${id}`, `${String(id).replace(/\W/g, '')}@x.com`, '0903333333', course, 'Online', 'Male', status, 'Form'];
  const ok = mkRow('P.7001', 'BIE104');
  const noId = mkRow('', 'BIE104');                  // có tên + lớp nhưng chưa có mã học viên
  const bad1 = mkRow('#N/A', 'BIE104');
  const bad2 = mkRow('Nguyễn Văn A', 'BIE104');
  const noCourse = mkRow('P.7002', '');
  const unknown = mkRow('P.7003', 'TƯ VẤN');
  const r = await post({ transactions: tx(ok, noId, bad1, bad2, noCourse, unknown), course: COURSE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added.students, 1);
  assert.equal(r.body.added.enrollments, 1);
  assert.deepEqual([r.body.skipped_no_student_id, r.body.skipped_invalid_student_id, r.body.skipped_no_course], [1, 2, 1]);
  assert.deepEqual(r.body.invalid_student_id_samples, ['#N/A', 'Nguyễn Văn A']);
  assert.deepEqual(r.body.skipped_unknown_course, { 'TƯ VẤN': 1 });
  assert.equal((await t.db.one("select count(*)::int n from students where student_code in ('P.7002','P.7003')")).n, 0);
  // "Bảo lưu khóa trước" (học viên chuyển từ khóa trước sang) và "Không tham gia" vẫn đi qua bình thường khi dòng có đủ hai mã
  const carry = await post({ transactions: tx(mkRow('P.7004', 'BIE104', 'Bảo lưu khóa trước'), mkRow('P.7005', 'BIE104', 'Không tham gia')), course: COURSE });
  assert.equal(carry.status, 200, JSON.stringify(carry.body));
  const rows = await t.db.all("select s.student_code, e.course_status, e.carried_over from enrollments e join students s on s.id = e.student_id where s.student_code in ('P.7004','P.7005') order by 1");
  assert.deepEqual(rows, [{ student_code: 'P.7004', course_status: 'active', carried_over: true }, { student_code: 'P.7005', course_status: 'deferred', carried_over: false }]);
});

test('giáo trình mặc định: EBA 6 buổi, PBM 10 buổi tự tạo danh sách buổi; 7 lớp BIE cũ dùng BIE-12', async () => {
  await t.db.run("insert into curricula (code, program, name, session_count, total_hours) values ('EBA-6','EBA','EBA 6 buổi',6,0), ('PBM-10','PBM','PBM 10 buổi',10,0), ('BIE-12','BIE','BIE 12 buổi',12,0) on conflict (code) do nothing");
  await t.db.run("insert into curriculum_items (curriculum_id, session_no, seq) select c.id, n, 1 from curricula c cross join generate_series(1, c.session_count) n where c.code in ('EBA-6','PBM-10','BIE-12') on conflict do nothing");
  const course = { headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE'], rows: [
    ['EBA131', 'P1.EBA.P131.ON.EE.150126', '2026-12-01', '2026-12-30'],
    ['PBM030', 'P5.PBM.P030.HY.MM.150126', '2026-12-01', '2027-01-30'],
    ['BIE068', 'P2.BIE.P068.HY.EE.050525', '2025-05-05', '2025-06-13']] };
  const mk = (id, c) => [id, 'CT', `Người ${id}`, `${id.replace(/\W/g, '')}@x.com`, '0904444444', c, 'Online', 'Male', null, 'Form'];
  const r = await post({ transactions: tx(mk('P.8001', 'EBA131'), mk('P.8002', 'PBM030'), mk('P.8003', 'BIE068')), course });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const n = async (short) => (await t.db.one('select count(*)::int n, max(cu.code) cur from sessions s join classes c on c.id = s.class_id left join curricula cu on cu.id = c.curriculum_id where c.short_code = $1', [short]));
  assert.deepEqual(await n('EBA131'), { n: 6, cur: 'EBA-6' });
  assert.deepEqual(await n('PBM030'), { n: 10, cur: 'PBM-10' });
  assert.deepEqual(await n('BIE068'), { n: 12, cur: 'BIE-12' });
});

test('STATUS: "Chưa thanh toán" (PERSONAL) không có trong danh sách/điểm danh mà vào Potential; thanh toán xong thì vào lớp; ghi lại lịch sử đổi trạng thái; không có số tiền', async () => {
  const course = { headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE'], rows: [['PAY101', 'P1.EBA.P101.ON.EE.150126', '2026-12-01', '2026-12-30']] };
  const r = (id, status) => [id, 'CP', `Người ${id}`, `${id.replace(/\W/g, '')}@x.com`, '0905555555', 'PAY101', 'Online', 'Male', status, 'Form'];
  const enrolled = async (code) => (await t.db.one("select count(*)::int n from enrollments e join students s on s.id = e.student_id where s.student_code = $1", [code])).n;
  const pot = async (code) => t.db.one("select reason, last_status from potential_students where student_code = $1", [code]);
  // lần 1: P.9001 chưa thanh toán, P.9002 đã cọc, P.9003 đã thanh toán, P.9004 scholarship
  let res = await post({ transactions: tx(r('P.9001', 'Chưa thanh toán'), r('P.9002', 'Đã cọc'), r('P.9003', 'Đã thanh toán'), r('P.9004', 'Scholarship')), course });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([await enrolled('P.9001'), await enrolled('P.9002'), await enrolled('P.9003'), await enrolled('P.9004')], [0, 1, 1, 1]);
  assert.deepEqual(await pot('P.9001'), { reason: 'unpaid', last_status: 'Chưa thanh toán' });
  // lần 2: P.9002 đặt cọc → đã thanh toán (ghi lịch sử); P.9001 thanh toán xong → vào lớp, rời Potential
  res = await post({ transactions: tx(r('P.9001', 'Đã thanh toán'), r('P.9002', 'Đã thanh toán'), r('P.9003', 'Đã thanh toán'), r('P.9004', 'Scholarship')), course });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await enrolled('P.9001'), 1);
  assert.ok(!(await pot('P.9001')));
  const hist = await t.db.all("select student_code, event, from_status, to_status from enrollment_events where event = 'sheet_status' order by id");
  assert.deepEqual(hist, [{ student_code: 'P.9002', event: 'sheet_status', from_status: 'Đã cọc', to_status: 'Đã thanh toán' }]);
  assert.equal((await t.db.one("select sheet_status from enrollments e join students s on s.id = e.student_id where s.student_code = 'P.9002'")).sheet_status, 'Đã thanh toán');
  // đã vào lớp rồi mới chuyển "Chưa thanh toán" → rời danh sách, vào Potential
  res = await post({ transactions: tx(r('P.9001', 'Chưa thanh toán'), r('P.9002', 'Đã thanh toán'), r('P.9003', 'Đã thanh toán'), r('P.9004', 'Scholarship')), course });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await enrolled('P.9001'), 0);
  assert.equal((await pot('P.9001')).reason, 'unpaid');
  // số tiền không bao giờ có trong các bảng mới
  for (const table of ['potential_students', 'enrollment_events', 'enrollments']) {
    const hit = await t.db.one(`select count(*)::int n from ${table} x where to_jsonb(x)::text like $1`, [`%${MONEY}%`]);
    assert.equal(hit.n, 0, table);
  }
  // nhãn lạ (ví dụ có số tiền) không được lưu
  res = await post({ transactions: tx(r('P.9003', 'Đã trả 5.000.000'), r('P.9002', 'Đã thanh toán'), r('P.9004', 'Scholarship'), r('P.9001', 'Chưa thanh toán')), course });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await t.db.one("select sheet_status from enrollments e join students s on s.id = e.student_id where s.student_code = 'P.9003'")).sheet_status, null);
});

test('tab COURSE: đọc cột DAYS OF WEEK (thứ học), không đọc cột tiền; định dạng thứ học', async () => {
  const course = { headers: ['COURSE', 'COURSE ID', 'START DATE', 'EXPECTED END DATE', 'DAYS OF WEEK', 'FULL PAYMENT', 'TOTAL REVENUE'],
    rows: [['DOW101', 'P1.EBA.P101.ON.EE.150126', '2026-12-01', '2026-12-30', '78', MONEY, MONEY]] };
  const r = await post({ transactions: tx(['P.6101', 'CD', 'Người D', 'd@x.com', '0906666666', 'DOW101', 'Online', 'Male', null, 'Form']), course });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = await t.db.one("select days_of_week from classes where short_code = 'DOW101'");
  assert.equal(c.days_of_week, '78');
  const hit = await t.db.one('select count(*)::int n from classes x where to_jsonb(x)::text like $1', [`%${MONEY}%`]);
  assert.equal(hit.n, 0);
  const { formatDays } = await import('../public/js/class-filter.mjs');
  assert.deepEqual(['24', '78', '35', '8', 'S78', '', null].map(formatDays), ['T2, T4', 'T7, CN', 'T3, T5', 'CN', 'T7, CN (S)', '', '']);
});

test('Lịch tuần: khai giảng theo start_date, buổi học theo thứ học trong khoảng start..end', async () => {
  const { classEventOn, weekdaysOf } = await import('../public/js/class-filter.mjs');
  assert.deepEqual([...weekdaysOf('S78')].sort(), [0, 6]);
  // 2026-10-14 là Thứ 4; lớp học T2, T4 từ 12/10 đến 21/10
  const c = { start_date: '2026-10-12', end_date: '2026-10-21', days_of_week: '24' };
  const at = (day, cls = c) => classEventOn(cls, day);
  assert.equal(at('2026-10-12'), 'open');           // ngày khai giảng (Thứ 2) là khai giảng, không lặp thành buổi học
  assert.equal(at('2026-10-14'), 'teach');          // Thứ 4
  assert.equal(at('2026-10-15'), null);             // Thứ 5: không học
  assert.equal(at('2026-10-19'), 'teach');          // Thứ 2 tuần sau
  assert.equal(at('2026-10-26'), null);             // quá end_date
  assert.equal(at('2026-10-05'), null);             // trước khai giảng
  assert.equal(at('2026-10-18', { ...c, days_of_week: '78' }), 'teach');   // 8 = Chủ nhật
  assert.equal(at('2026-10-14', { ...c, days_of_week: null }), null);      // chưa có thứ học: chỉ hiện khai giảng
  assert.equal(at('2026-10-12', { ...c, days_of_week: null }), 'open');
  assert.equal(at('2026-10-12', { ...c, start_date: null }), null);
});
