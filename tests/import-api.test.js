const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestApp } = require('./helpers');

let t, admin, instructor, guest;

// Workbook điểm danh nhỏ, có một cột tiền để chắc chắn không bị đọc/trả về.
async function attendanceBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('BIE-8');
  ws.getRow(5).values = ['STUDENT ID', 'FULL NAME', 'COURSE ID', 'SESSION 1', 'SESSION 2', 'VOUCHER STATUS'];
  ws.getRow(6).values = ['P.1', 'An', 'P2.BIE.P070.HY.AA.080625', 'X', 'O', 'TIEN-999'];
  ws.getRow(7).values = ['P.2', 'Bình', 'P2.BIE.P070.HY.AA.080625', 'X', null, 'TIEN-999'];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  await t.addUser('gv@x.com', 'instructor');
  await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com');
  instructor = await t.login('gv@x.com');
  guest = await t.login('khach@x.com');
});
after(async () => { await t.close(); });

test('nhập Excel qua web: chỉ admin', async () => {
  const buf = await attendanceBuffer();
  assert.equal((await t.client().upload('/api/import/attendance', buf)).status, 401);
  assert.equal((await instructor.upload('/api/import/attendance', buf)).status, 403);
  assert.equal((await guest.upload('/api/import/attendance', buf)).status, 403);
});

test('từ chối file rỗng hoặc không phải .xlsx, báo lỗi tiếng Việt', async () => {
  const empty = await admin.upload('/api/import/attendance', Buffer.alloc(0));
  assert.equal(empty.status, 400);
  const txt = await admin.upload('/api/import/attendance', Buffer.from('không phải excel'));
  assert.equal(txt.status, 400);
  assert.match(txt.body.error, /xlsx/);
  // zip hợp lệ nhưng không có sheet điểm danh -> 422
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Khác').addRow(['a', 'b']);
  const r = await admin.upload('/api/import/attendance', Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(r.status, 422);
  // Transactions thiếu sheet Course/Transactions -> 422
  const tx = await admin.upload('/api/import/transactions', Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(tx.status, 422);
});

test('chạy thử không đổi database; nhập thật ghi lớp, học viên, điểm danh và không đọc cột tiền', async () => {
  const buf = await attendanceBuffer();
  const count = async () => (await t.db.one('select count(*)::int n from students')).n;

  const dry = await admin.upload('/api/import/attendance?dry_run=1', buf);
  assert.equal(dry.status, 200);
  assert.equal(dry.body.dry_run, true);
  assert.equal(await count(), 0);

  const real = await admin.upload('/api/import/attendance', buf);
  assert.equal(real.status, 200);
  assert.equal(real.body.dry_run, false);
  assert.equal(real.body.classes.length, 1);
  assert.equal(real.body.classes[0].students, 2);
  assert.equal(await count(), 2);
  assert.ok(!JSON.stringify(real.body).includes('TIEN-999'), 'không được trả về dữ liệu tiền');
  const origins = (await t.db.all('select distinct origin from enrollments')).map((r) => r.origin);
  assert.deepEqual(origins, ['import']); // ghi danh từ file điểm danh không bị dò "không còn trong Sheet"
  const att = await t.db.one("select count(*)::int n from attendance");
  assert.ok(att.n >= 3);

  // nhập lại an toàn (không nhân đôi)
  const again = await admin.upload('/api/import/attendance', buf);
  assert.equal(again.status, 200);
  assert.equal(await count(), 2);
});
