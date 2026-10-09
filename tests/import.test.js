const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { importExcel } = require('../src/services/importExcel');
const { buildDashboard } = require('../src/services/stats');

const FILE = path.join(__dirname, '..', 'danh-sach-hoc-vien-mau.xlsx');

test('import file mẫu khớp số liệu dòng tổng trong Excel', { skip: !fs.existsSync(FILE) }, async () => {
  const db = await openDb({ memory: true });
  const { classes } = await importExcel(db, FILE);
  assert.deepEqual(classes.map((c) => [c.class_code, c.students]), [['P2.BIE.P101.HY.AA.260726', 46], ['P2.BIE.P104.HY.AA.041026', 26]]);
  const cls = await db.one('select * from classes where code = $1', ['P2.BIE.P101.HY.AA.260726']);
  const d = await buildDashboard(db, cls);
  // Dòng 4 trong Excel: số người có mặt từng buổi và số bài nộp từng HW/Capstone.
  assert.deepEqual(d.by_session.map((x) => x.present + x.late), [35, 38, 40, 36, 38, 32, 35, 33]);
  assert.deepEqual(d.by_assignment.map((x) => x.submitted), [42, 38, 39, 37, 27, 0, 32]);
  assert.equal(d.by_assignment.find((x) => x.kind === 'hw' && x.seq === 6).collected, false);
  assert.equal(d.totals.deferred, 2);
  assert.equal((await db.one("select phone from students where student_code = 'P.13027'")).phone, '0901848177');
});

test('lớp P104: chỉ buổi 1 đã diễn ra; giá trị lạ "O" bị tính vắng và có cảnh báo', { skip: !fs.existsSync(FILE) }, async () => {
  const db = await openDb({ memory: true });
  const { warnings } = await importExcel(db, FILE);
  const d = await buildDashboard(db, await db.one('select * from classes where code = $1', ['P2.BIE.P104.HY.AA.041026']));
  assert.equal(d.totals.held_sessions, 1);
  assert.equal(d.by_session[0].present, 19 - 0); // 19 dấu X ở buổi 1
  assert.equal(warnings.filter((w) => /P104/.test(w) && /"O"/.test(w)).length, 2);
});

test('import chạy lại không tạo trùng', { skip: !fs.existsSync(FILE) }, async () => {
  const db = await openDb({ memory: true });
  await importExcel(db, FILE);
  const count = async () => Promise.all(['students', 'enrollments', 'attendance', 'submissions', 'sessions', 'assignments']
    .map(async (t) => (await db.one(`select count(*)::int n from ${t}`)).n));
  const before = await count();
  const s2 = await importExcel(db, FILE);
  assert.deepEqual(await count(), before);
  assert.equal(s2.classes.reduce((n, c) => n + c.new_students, 0), 0);
});

test('import báo lỗi rõ khi file thiếu cột bắt buộc', async () => {
  const ExcelJS = require('exceljs');
  const tmp = path.join(require('node:os').tmpdir(), `bad-${Date.now()}.xlsx`);
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('S').getRow(5).values = ['A', 'B'];
  await wb.xlsx.writeFile(tmp);
  await assert.rejects(importExcel(await openDb({ memory: true }), tmp), /Thiếu cột bắt buộc/);
  fs.unlinkSync(tmp);
});
