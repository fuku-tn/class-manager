const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const { hashEmail, hashPhone } = require('../src/services/formProfile');

const TOKEN = 'form-test-token';
let t, admin, gv, guest;
const realFetch = global.fetch;

const TX_HEAD = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE'];
const COURSE = { headers: ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE'], rows: [['EBA140', 'P1.EBA.P140.OF.MA.010126', '2026-11-01', '2026-12-01', null]] };
const stu = (id, name, email, phone) => [id, null, name, email, phone, 'EBA140', 'Offline', 'Male', null, 'Form'];
const FORM_HEAD = ['SUBMITTED AT', 'COURSE', 'DELIVERY', 'JOB TITLE', 'EXPERIENCE', 'DEPARTMENT', 'HR FUNCTION', 'INDUSTRY', 'PROVINCE', 'SOURCE',
  'MATERIAL DELIVERY', 'GOALS', 'EMAIL HASH', 'PHONE HASH'];
const form = (at, email, phone, dept, goals = 'To obtain a certificate (Chứng chỉ chuyên môn)') => [
  at, 'EBA140', 'Training Offline', 'Chuyên viên', '3', dept, null, 'Bán lẻ', 'Hà Nội', 'Facebook, Instagram, Zalo', 'Tại nhà', goals,
  hashEmail(email), hashPhone(phone)];

const sync = (people, formTable, extra = {}) => realFetch(`${t.base}/api/sync/transactions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN },
  body: JSON.stringify({ transactions: { headers: TX_HEAD, rows: people }, course: COURSE, ...(formTable ? { form: formTable } : {}), ...extra }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

const A = stu('F.1', 'An', 'an@x.com', '0901111111');
const B = stu('F.2', 'Bình', 'binh@x.com', '0902222222');
const C = stu('F.3', 'Chi', 'shared@x.com', '0903333333');   // C và D dùng chung email -> mơ hồ nếu chỉ có email
const D = stu('F.4', 'Dũng', 'shared@x.com', '0904444444');

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  guest = await t.login('khach@x.com');
  await sync([A, B, C, D], null);
  const cls = (await t.db.one("select id from classes where short_code = 'EBA140'")).id;
  for (const id of [gvId, gId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [cls] });
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

const classId = async () => (await t.db.one("select id from classes where short_code = 'EBA140'")).id;
const enrId = async (code) => (await t.db.one('select e.id from enrollments e join students s on s.id = e.student_id where s.student_code = $1', [code])).id;

test('FORM: ghép theo mã băm email (rồi SĐT) trong đúng lớp; làm gọn; bỏ mã băm khi đã khớp', async () => {
  const r = await sync([A, B, C, D], { headers: FORM_HEAD, rows: [
    form('2026-10-01T09:00:00+07:00', 'an@x.com', '0901111111', 'Human Resources Department (Phòng Nhân sự)',
      'To improve my thinking skills (Nâng cao tư duy phân tích), To learn more about tools (Thành thạo công cụ)'),
    form('2026-10-02T10:00:00+07:00', 'khac@x.com', '+84 902 222 222', 'Sales Department (Phòng Bán hàng)'),   // email lạ, SĐT khớp B
  ] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.form.rows, r.body.form.matched, r.body.form.pending], [2, 2, 0]);
  const rows = await t.db.all(`select s.student_code, f.department, f.experience, f.sources, f.goals, f.email_hash, f.phone_hash, f.delivery
    from registration_forms f join enrollments e on e.id = f.enrollment_id join students s on s.id = e.student_id order by 1`);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].student_code, rows[0].department, rows[0].experience, rows[0].delivery], ['F.1', 'Phòng Nhân sự', '2–3 năm', 'Offline']);
  assert.deepEqual(rows[0].sources, ['Mạng xã hội']);
  assert.deepEqual(rows[0].goals, ['Tư duy phân tích', 'Thành thạo công cụ']);
  assert.equal(rows[1].student_code, 'F.2');
  assert.deepEqual([rows[0].email_hash, rows[0].phone_hash, rows[1].email_hash], [null, null, null]); // đã khớp: không giữ mã băm
});

test('FORM: phiếu không khớp hoặc mơ hồ thành "chờ xử lý"; phiếu mới nhất thắng; cột cá nhân bị bỏ', async () => {
  const withPersonal = { headers: [...FORM_HEAD, 'EMAIL', 'PHONE', 'FULL NAME', 'DOB'], rows: [
    [...form('2026-10-05T09:00:00+07:00', 'an@x.com', '0901111111', 'Kế toán (Phòng Kế toán)'), 'an@x.com', '0901111111', 'An Nguyễn', '1990-01-01'],
    form('2026-10-03T09:00:00+07:00', 'an@x.com', '0901111111', 'Phiếu cũ hơn (Phòng cũ)'),                        // cũ hơn: không đè
    form('2026-10-04T09:00:00+07:00', 'shared@x.com', null, 'Phòng X (Phòng Mơ hồ)'),                              // email dùng chung 2 người
    form('2026-10-04T09:00:00+07:00', 'chualadangky@x.com', '0999999999', 'Phòng Y (Phòng Chờ)'),                  // chưa đăng ký
  ] };
  const r = await sync([A, B, C, D], withPersonal);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.form.matched, r.body.form.pending, r.body.form.ambiguous], [1, 2, 1]);
  const an = await t.db.one('select department, submitted_at from registration_forms where enrollment_id = $1', [await enrId('F.1')]);
  assert.equal(an.department, 'Phòng Kế toán');
  const pending = await t.db.all('select department, email_hash from registration_forms where enrollment_id is null order by department');
  assert.deepEqual(pending.map((p) => p.department), ['Phòng Chờ', 'Phòng Mơ hồ']);
  assert.ok(pending.every((p) => p.email_hash), 'phiếu chờ giữ mã băm để ghép lại sau');
  // không có cột nào chứa thông tin cá nhân thô
  const dump = JSON.stringify(await t.db.all('select * from registration_forms'));
  for (const raw of ['an@x.com', '0901111111', 'An Nguyễn', '1990-01-01', 'shared@x.com']) assert.ok(!dump.includes(raw), `không được lưu: ${raw}`);
});

test('FORM: phiếu chờ được ghép lại khi học viên đăng ký sau', async () => {
  const E = stu('F.5', 'Em', 'chualadangky@x.com', '0999999999');
  const r = await sync([A, B, C, D, E], { headers: FORM_HEAD, rows: [
    form('2026-10-04T09:00:00+07:00', 'chualadangky@x.com', '0999999999', 'Phòng Y (Phòng Chờ)')] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.form.matched, r.body.form.pending], [1, 0]);
  assert.equal((await t.db.one('select count(*)::int n from registration_forms where enrollment_id = $1', [await enrId('F.5')])).n, 1);
});

test('hồ sơ FORM: chỉ admin xem; thẻ chờ xử lý trong sync-status', async () => {
  const id = await classId();
  const p = await admin.get(`/api/classes/${id}/profiles`);
  assert.equal(p.status, 200);
  assert.ok(p.body.with_form >= 1);
  assert.ok(p.body.summary.goals.length >= 1);
  assert.equal((await gv.get(`/api/classes/${id}/profiles`)).status, 403);
  assert.equal((await guest.get(`/api/classes/${id}/profiles`)).status, 403);
  // /students không bao giờ trả hồ sơ FORM
  const students = (await gv.get(`/api/classes/${id}/students`)).body;
  assert.ok(students.length > 0 && students.every((s) => !('department' in s) && !('goals' in s)));
  const st = await admin.get('/api/import/sync-status');
  assert.ok('form_pending' in st.body);
  assert.equal((await gv.get('/api/import/sync-status')).status, 403);
});

test('FORM: thiếu cột Mã lớp thì từ chối', async () => {
  const r = await sync([A], { headers: ['DELIVERY'], rows: [['Online']] });
  assert.equal(r.status, 422);
});
