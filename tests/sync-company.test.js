const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

const TOKEN = 'company-test-token';
let t, admin;
const realFetch = global.fetch;

const TX_HEAD = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE'];
const CO_HEAD = [...TX_HEAD, 'COMPANY NAME', 'DOB', 'FEE'];           // DOB, FEE: phải bị bỏ
const COURSE = { headers: ['COURSE', 'COURSE ID', 'START DATE', 'EXPECTED END DATE', 'NEXT COURSE'], rows: [
  ['EBA130', 'P1.EBA.P130.OF.MA.010126', '2026-11-01', '2026-12-01', null],
  ['EBA131', 'P1.EBA.B131.OF.MA.010126', '2026-11-05', '2026-12-05', null],
] };
const person = (id, name) => [id, 'C-' + id, name, `${id.toLowerCase()}@x.com`, '0901111111', 'EBA130', 'Offline', 'Male', null, 'Form'];
const staff = (id, name, status = null) => [id, 'B.05.001', name, `${id.toLowerCase()}@acme.vn`, '0902222222', 'EBA131', 'Offline', 'Female', status, 'Company', 'ACME Corp', '1990-01-01', 'TIEN-555'];

const sync = (body) => realFetch(`${t.base}/api/sync/transactions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const payload = (people, staffRows, withCompany = true) => ({
  transactions: { headers: TX_HEAD, rows: people },
  ...(withCompany ? { company: { headers: CO_HEAD, rows: staffRows } } : {}),
  course: COURSE,
});

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  admin = await t.login('admin@x.com');
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('COMPANY: học viên B2B được tag, có tên công ty; DOB/FEE không được lưu', async () => {
  const r = await sync(payload([person('B2C.1', 'An')], [staff('B.1', 'Bình'), staff('B.2', 'Chi')]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added.enrollments, 3);
  const rows = await t.db.all(`select s.student_code, e.segment, e.company_name from enrollments e join students s on s.id = e.student_id order by 1`);
  assert.deepEqual(rows, [
    { student_code: 'B.1', segment: 'b2b', company_name: 'ACME Corp' },
    { student_code: 'B.2', segment: 'b2b', company_name: 'ACME Corp' },
    { student_code: 'B2C.1', segment: 'b2c', company_name: null },
  ]);
  assert.ok(!JSON.stringify(r.body).includes('TIEN-555'));
});

test('/api/classes: cờ B2B/B2C và tên công ty theo lớp', async () => {
  const list = (await admin.get('/api/classes')).body;
  const by = Object.fromEntries(list.map((c) => [c.short_code, c]));
  assert.deepEqual([by.EBA130.is_b2c, by.EBA130.is_b2b], [true, false]);
  assert.deepEqual([by.EBA131.is_b2c, by.EBA131.is_b2b], [false, true]);
  assert.equal(by.EBA131.companies, 'ACME Corp');
  assert.equal(by.EBA130.companies, null);
});

test('COMPANY: lớp có cả hai loại hiện ở cả hai bộ lọc', async () => {
  // một học viên cá nhân vào lớp mã B (B2B)
  await sync(payload([person('B2C.1', 'An'), [...person('B2C.9', 'Dũng').slice(0, 5), 'EBA131', 'Online', 'Male', null, 'Form']], [staff('B.1', 'Bình'), staff('B.2', 'Chi')]));
  const c = (await admin.get('/api/classes')).body.find((x) => x.short_code === 'EBA131');
  assert.deepEqual([c.is_b2c, c.is_b2b], [true, true]);
});

test('không gửi COMPANY thì không dò "không còn trong Sheet" cho học viên B2B', async () => {
  const before = (await t.db.one("select count(*)::int n from enrollment_events where event = 'missing_from_sheet'")).n;
  const r = await sync(payload([person('B2C.1', 'An'), [...person('B2C.9', 'Dũng').slice(0, 5), 'EBA131', 'Online', 'Male', null, 'Form']], [], false));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await t.db.one("select count(*)::int n from enrollment_events where event = 'missing_from_sheet'")).n, before);
});

test('COMPANY: thiếu cột bắt buộc thì từ chối; B.2 biến mất khỏi COMPANY thì chỉ cảnh báo', async () => {
  const bad = await sync({ ...payload([person('B2C.1', 'An')], []), company: { headers: ['FULL NAME'], rows: [['x']] } });
  assert.equal(bad.status, 422);
  const r = await sync(payload([person('B2C.1', 'An'), [...person('B2C.9', 'Dũng').slice(0, 5), 'EBA131', 'Online', 'Male', null, 'Form']], [staff('B.1', 'Bình')]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const miss = await t.db.all("select student_code from enrollment_events where event = 'missing_from_sheet'");
  assert.deepEqual(miss.map((m) => m.student_code), ['B.2']);
});

test('COMPANY: các dòng cùng CUSTOMER ID dùng chung tên công ty; thiếu tên thì /api/classes hiện mã khách hàng', async () => {
  const noName = (id, cust, company = null) => [id, cust, 'NV ' + id, `${id.toLowerCase()}@c.vn`, '0905555555', 'EBA131', 'Offline', 'Male', null, 'Company', company, null, null];
  const r = await sync(payload([], [noName('B.11', 'B.07.001', 'Công ty Mặt Trời'), noName('B.12', 'B.07.001'), noName('B.13', 'B.99.009')]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const q = (code) => t.db.one('select e.company_name from enrollments e join students s on s.id = e.student_id where s.student_code = $1', [code]);
  assert.equal((await q('B.11')).company_name, 'Công ty Mặt Trời');
  assert.equal((await q('B.12')).company_name, 'Công ty Mặt Trời');   // cùng CUSTOMER ID: lấy tên từ dòng có tên
  assert.equal((await q('B.13')).company_name, null);                  // chưa có tên ở bất kỳ dòng nào
  const c = (await admin.get('/api/classes')).body.find((x) => x.short_code === 'EBA131');
  assert.match(c.companies, /Công ty Mặt Trời/);
  assert.match(c.companies, /B\.99\.009/);                            // hiện mã khách hàng khi chưa có tên
});
