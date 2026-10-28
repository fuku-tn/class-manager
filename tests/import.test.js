const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { openDb } = require('../src/db');
const { importExcel, parseAttendanceCell } = require('../src/services/importExcel');
const { loadClassData, computeEnrollmentStats } = require('../src/services/stats');

const MONEY = 'TIEN-555777999';
const FOOT = 'X'; // chỉ để cho dễ đọc

// Dựng workbook giống file thật: nhiều sheet, tiêu đề ở dòng 5, có cột voucher (tiền).
async function makeWorkbook() {
  const wb = new ExcelJS.Workbook();
  const head = (n12) => ['SUBINDEX', 'STUDENT ID', 'CUSTOMER ID', 'NO.', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE ID', 'MODE', 'COURSE STATUS',
    'ATTENDANCE RATE', 'ELIGIBLE', 'CERTIFICATE STATUS', 'FORM',
    ...Array.from({ length: n12 }, (_, i) => [`SESSION ${i + 1}`, `NOTE SS${i + 1}`]).flat(),
    'HOMEWORK 1', 'NOTE HW1', 'VOUCHER GG MAPS', 'VOUCHER SENT DATE', 'EXPIRATION DATE', 'VOUCHER STATUS'];
  const row = (n12, f) => [1, f.id, null, 1, f.name, f.email ?? null, f.phone ?? null, f.cls, f.mode ?? 'Hybrid', f.status ?? null, 0.5, null, null, null,
    ...Array.from({ length: n12 }, (_, i) => [f.s?.[i] ?? null, f.n?.[i] ?? null]).flat(), f.hw ?? null, null, MONEY, null, null, MONEY];

  // Sheet ẩn (bản cũ) phải bị bỏ qua
  const hidden = wb.addWorksheet('Sheet1', { state: 'hidden' });
  hidden.getRow(5).values = head(2);
  hidden.addRow(row(2, { id: 'P.999', name: 'Người Trong Sheet Ẩn', cls: 'P2.BIE.P070.HY.AA.080625', s: ['X', 'X'] }));

  // Sheet không phải điểm danh
  const list = wb.addWorksheet('List of Students');
  list.addRow(['STUDENT ID', 'COURSE ID', 'FULL NAME']);
  list.addRow(['P.888', 'P2.BIE.P070.HY.AA.080625', 'Không Phải Điểm Danh']);

  // BIE-8: 4 buổi trong sheet để dễ kiểm tra
  const s8 = wb.addWorksheet('BIE-8');
  s8.getRow(5).values = head(4);
  const cls = 'P2.BIE.P070.HY.AA.080625';
  s8.getRow(6).values = row(4, { id: 'P.1', name: 'An', email: 'AN@X.COM', phone: 901111111, cls, s: ['X', 'x', 'O', null], n: [null, null, null, null], hw: 'X' });
  s8.getRow(7).values = row(4, { id: 'P.2', name: 'Bình', cls, s: ['X', 'O', null, null], n: ['Vào trễ', null, null, null], hw: null });
  s8.getRow(8).values = row(4, { id: 'P.3', name: 'Chi', cls, s: [null, 'X', 'X', 'abc'], hw: 'X', status: 'Canceled' });
  s8.getRow(9).values = row(4, { id: 'P.4', name: 'Dũng', cls, s: ['X', 'X\nX', 'X', null], hw: null });
  s8.getRow(10).values = ['Tổng', 'Tổng cộng', null];   // dòng tổng: không phải học viên

  // BIE-12: giáo trình chỉ 3 buổi trong test; sheet có 5 cột, 2 cột cuối có dữ liệu thừa
  const s12 = wb.addWorksheet('BIE-12');
  s12.getRow(5).values = head(5);
  s12.getRow(6).values = row(5, { id: 'P.5', name: 'Em', cls: 'P2.BIE.P071.HY.EE.010725', s: ['X', 'X', 'O', 'X', 'X'] });

  // Lệch chữ P/B so với danh sách lớp: phải khớp lớp có sẵn theo mã ngắn
  const f = wb.addWorksheet('BIF');
  f.getRow(5).values = head(2);
  f.getRow(6).values = row(2, { id: 'P.6', name: 'Giang', cls: 'P2.BIE.P088.HY.MA.080326', s: ['X', null] });

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'att-')), 'diem-danh.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

async function setupDb() {
  const db = await openDb({ memory: true });
  const bie8 = await db.one("insert into curricula (code, program, name, session_count) values ('BIE-8','BIE','BIE 8',4) returning id");
  const bie12 = await db.one("insert into curricula (code, program, name, session_count) values ('BIE-12','BIE','BIE 12',3) returning id");
  await db.run("insert into curriculum_items (curriculum_id, session_no, seq, module) values ($1,1,1,'Data Transformation'),($1,2,1,'Data Model'),($1,2,2,'Data Storytelling'),($1,3,1,'Visualization'),($1,4,1,'Capstone Project')", [bie8.id]);
  // lớp có sẵn (từ sheet Course), mẫu mặc định BIE-8 — file sẽ chỉnh P071 sang BIE-12 theo tên sheet
  await db.run("insert into classes (code, name, short_code, program, curriculum_id) values ('P2.BIE.P070.HY.AA.080625','BIE070','BIE070','BIE',$1)", [bie8.id]);
  await db.run("insert into classes (code, name, short_code, program, curriculum_id) values ('P2.BIE.P071.HY.EE.010725','BIE071','BIE071','BIE',$1)", [bie8.id]);
  await db.run("insert into classes (code, name, short_code, program) values ('P2.BIE.B088.HY.MA.080326','BIE088','BIE088','BIE')");
  return { db, bie8: bie8.id, bie12: bie12.id };
}

const statuses = async (db, shortCode) => {
  const rows = await db.all(`select s.student_code, ss.session_no, a.status, a.note from attendance a
    join enrollments e on e.id = a.enrollment_id join students s on s.id = e.student_id
    join sessions ss on ss.id = a.session_id join classes c on c.id = ss.class_id where c.short_code = $1 order by 1, 2`, [shortCode]);
  const m = {};
  for (const r of rows) (m[r.student_code] ??= {})[r.session_no] = r.status;
  return { m, rows };
};

test('quy tắc ô: X/x = đi học, O = vắng có phép, trống = vắng, chữ khác = vắng + cảnh báo', () => {
  assert.equal(parseAttendanceCell('X').mark, 'present');
  assert.equal(parseAttendanceCell('x').mark, 'present');
  assert.equal(parseAttendanceCell(' o ').mark, 'excused');
  assert.equal(parseAttendanceCell(null).mark, 'absent');
  assert.equal(parseAttendanceCell('').mark, 'absent');
  assert.equal(parseAttendanceCell('Đã báo trước').mark, 'unknown');
  assert.deepEqual(parseAttendanceCell('X\nX'), { mark: 'present' }); // gõ thừa X = một X
});

test('nhập: sheet ẩn bị bỏ qua, ô đúng quy tắc, có phép tính nửa buổi', async () => {
  const file = await makeWorkbook();
  const { db } = await setupDb();
  const r = await importExcel(db, file);
  assert.ok(r.skipped_sheets.some((s) => s.startsWith('Sheet1')));
  assert.ok(r.skipped_sheets.some((s) => s.startsWith('List of Students')));
  assert.equal((await db.one("select count(*)::int n from students where student_code in ('P.999','P.888')")).n, 0);
  assert.equal(r.skipped_rows, 1); // dòng "Tổng"

  const { m } = await statuses(db, 'BIE070');
  // Buổi 4 không ai có X/O → chưa diễn ra → không có bản ghi (không phải "vắng")
  assert.deepEqual(m['P.1'], { 1: 'present', 2: 'present', 3: 'excused' });
  assert.deepEqual(m['P.2'], { 1: 'present', 2: 'excused', 3: 'absent' });  // "Vào trễ" chỉ là ghi chú: đã bỏ trạng thái đi trễ
  assert.deepEqual(m['P.3'], { 1: 'absent', 2: 'present', 3: 'present' }); // 'abc' ở buổi 4 chưa diễn ra
  assert.deepEqual(m['P.4'], { 1: 'present', 2: 'present', 3: 'present' }); // "X\nX" → có mặt
  assert.ok(r.warnings.some((w) => /abc/.test(w)));
  assert.ok(!r.warnings.some((w) => /nhiều dấu X/.test(w))); // gõ hai chữ X trong một ô = một X, không cảnh báo

  // Buổi 4 không ai có X/O → chưa diễn ra, không bị tính là vắng của cả lớp
  const cls = await db.one("select id from classes where short_code = 'BIE070'");
  const data = await loadClassData(db, cls.id);
  assert.deepEqual(data.sessions.filter((s) => s.held).map((s) => s.session_no), [1, 2, 3]);
  const stats = computeEnrollmentStats(data);
  const rateOf = (code) => stats.get(data.enrollments.find((e) => e.student_code === code).id).attendance_rate;
  // An: (2 có mặt + 0,5 có phép)/3 = 0.83; Bình: (1 có mặt + 0,5 có phép)/3 = 0.5; Chi: 2/3; Dũng: 3/3
  assert.equal(rateOf('P.1'), 0.83);
  assert.equal(rateOf('P.2'), 0.5);
  assert.equal(rateOf('P.3'), 0.67);
  assert.equal(rateOf('P.4'), 1);
  await db.close();
});

test('nhập: không đọc cột voucher/tiền và database không có bảng voucher', async () => {
  const file = await makeWorkbook();
  const { db } = await setupDb();
  await importExcel(db, file);
  for (const table of ['students', 'enrollments', 'sessions', 'assignments', 'submissions', 'attendance', 'classes']) {
    const hit = await db.one(`select count(*)::int n from ${table} x where to_jsonb(x)::text like $1`, [`%${MONEY}%`]);
    assert.equal(hit.n, 0, `bảng ${table} chứa dữ liệu cột tiền`);
  }
  const t = await db.one("select count(*)::int n from information_schema.tables where table_name = 'vouchers'");
  assert.equal(t.n, 0);
  await db.close();
});

test('nhập: tên sheet quyết định giáo trình; buổi vượt giáo trình bị bỏ + cảnh báo; tên buổi theo module', async () => {
  const file = await makeWorkbook();
  const { db, bie12 } = await setupDb();
  const r = await importExcel(db, file);
  const c = await db.one("select curriculum_id from classes where short_code = 'BIE071'");
  assert.equal(c.curriculum_id, bie12);                       // sheet "BIE-12" → mẫu BIE-12
  assert.equal(r.classes.find((x) => x.class_code.includes('P071')).curriculum_changed, true);
  const sessions = await db.all("select s.session_no, s.held from sessions s join classes c on c.id=s.class_id where c.short_code='BIE071' order by 1");
  assert.deepEqual(sessions.map((s) => s.session_no), [1, 2, 3]); // giáo trình BIE-12 trong test chỉ có 3 buổi
  assert.ok(r.warnings.some((w) => /SESSION 4/.test(w) && /3 buổi/.test(w)));
  assert.ok(r.warnings.some((w) => /SESSION 5/.test(w)));
  // P.5: X,X,O → 2 có mặt, 1 có phép
  const { m } = await statuses(db, 'BIE071');
  assert.deepEqual(m['P.5'], { 1: 'present', 2: 'present', 3: 'excused' });
  // tên buổi lớp BIE070 theo giáo trình BIE-8
  const titles = await db.all("select s.session_no, s.title from sessions s join classes c on c.id=s.class_id where c.short_code='BIE070' order by 1");
  assert.equal(titles[0].title, 'Buổi 1 — Data Transformation');
  assert.equal(titles[1].title, 'Buổi 2 — Data Model + Data Storytelling');
  await db.close();
});

test('nhập: lệch chữ P/B trong mã lớp thì khớp lớp có sẵn theo mã ngắn, không tạo lớp mới', async () => {
  const file = await makeWorkbook();
  const { db } = await setupDb();
  const before = (await db.one('select count(*)::int n from classes')).n;
  const r = await importExcel(db, file);
  assert.equal((await db.one('select count(*)::int n from classes')).n, before);
  const g = r.classes.find((x) => x.class_code === 'P2.BIE.P088.HY.MA.080326');
  assert.equal(g.new_class, false);
  assert.ok(r.warnings.some((w) => /B088/.test(w)));
  assert.equal((await db.one(`select count(*)::int n from enrollments e join classes c on c.id=e.class_id where c.short_code='BIE088'`)).n, 1);
  await db.close();
});

test('nhập: trạng thái khóa; chạy lại không trùng; không ghi đè ô đã sửa trên app; dry-run không đổi', async () => {
  const file = await makeWorkbook();
  const { db } = await setupDb();
  await importExcel(db, file);
  // Canceled → dropped
  const chi = await db.one("select e.course_status from enrollments e join students s on s.id=e.student_id where s.student_code='P.3'");
  assert.equal(chi.course_status, 'dropped');

  const count = async () => Promise.all(['students', 'enrollments', 'sessions', 'attendance', 'assignments', 'submissions']
    .map(async (t) => (await db.one(`select count(*)::int n from ${t}`)).n));
  const before = await count();
  // Người dùng sửa ô của P.1 buổi 1 trên app (updated_by có giá trị) thành "vắng"; file vẫn ghi X
  const u = await db.one("insert into users (email, name, password_hash, role) values ('gv@x.com','GV','x','instructor') returning id");
  await db.run(`update attendance set status = 'absent', updated_by = $1
                where enrollment_id = (select e.id from enrollments e join students s on s.id=e.student_id where s.student_code='P.1')
                  and session_id = (select s.id from sessions s join classes c on c.id=s.class_id where c.short_code='BIE070' and s.session_no = 1)`, [u.id]);
  const again = await importExcel(db, file);
  assert.deepEqual(await count(), before);
  const { m } = await statuses(db, 'BIE070');
  assert.equal(m['P.1'][1], 'absent');                      // giữ giá trị người dùng đã sửa
  assert.equal(again.classes.find((c) => c.class_code.includes('P070')).kept_from_app, 1);
  // Trạng thái "nghỉ" không bị đưa về "đang học" khi file để trống
  await db.run("update enrollments set course_status = 'dropped' where student_id = (select id from students where student_code='P.2')");
  await importExcel(db, file);
  assert.equal((await db.one("select e.course_status from enrollments e join students s on s.id=e.student_id where s.student_code='P.2'")).course_status, 'dropped');

  // dry-run
  const snapshot = await count();
  await db.run("delete from attendance");
  const dry = await importExcel(db, file, { dryRun: true });
  assert.equal(dry.dry_run, true);
  assert.equal((await db.one('select count(*)::int n from attendance')).n, 0); // vẫn rỗng: đã hoàn tác
  assert.ok(snapshot[3] > 0);
  await db.close();
});

test('nhập: báo lỗi rõ khi không có sheet điểm danh nào', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Trống').addRow(['A', 'B']);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bad-')), 'bad.xlsx');
  await wb.xlsx.writeFile(file);
  const db = await openDb({ memory: true });
  await assert.rejects(importExcel(db, file), /Không tìm thấy sheet điểm danh/);
  await db.close();
});

test('nhập: --classes chỉ nhập lớp được chọn; BIH073 lấy PROJECT 1 làm Capstone; BIE/BIH không tạo cột HW6+ trống', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('BIH');
  ws.getRow(5).values = ['STUDENT ID', 'FULL NAME', 'COURSE ID', 'SESSION 1', 'NOTE SS1', 'HOMEWORK 1', 'HOMEWORK 6', 'PROJECT 1', 'CAPSTONE PROJECT'];
  ws.getRow(6).values = ['P.731', 'Học viên 73', 'P2.BIH.P073.HY.EE.300625', 'X', null, 'X', null, 'X', null];
  ws.getRow(7).values = ['P.732', 'Học viên 73b', 'P2.BIH.P073.HY.EE.300625', 'X', null, null, null, null, null];
  ws.getRow(8).values = ['P.821', 'Học viên 82', 'P2.BIH.P082.HY.EE.010725', 'X', null, 'X', null, 'X', 'X'];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'att-')), 'bih.xlsx');
  await wb.xlsx.writeFile(file);
  const db = await openDb({ memory: true });
  await db.run("insert into classes (code, name, short_code, program) values ('P2.BIH.P073.HY.EE.300625','BIH073','BIH073','BIH'), ('P2.BIH.P082.HY.EE.010725','BIH082','BIH082','BIH')");
  const r = await importExcel(db, file, { classes: ['BIH073'] });
  assert.deepEqual(r.classes.map((c) => c.class_code), ['P2.BIH.P073.HY.EE.300625']);       // BIH082 không bị đụng
  assert.equal((await db.one("select count(*)::int n from enrollments e join classes c on c.id = e.class_id where c.short_code = 'BIH082'")).n, 0);
  const asg = await db.all("select a.kind, a.seq from assignments a join classes c on c.id = a.class_id where c.short_code = 'BIH073' order by 1, 2");
  assert.deepEqual(asg, [{ kind: 'capstone', seq: 1 }, { kind: 'hw', seq: 1 }]);              // không có HW6 trống
  const cap = await db.all(`select s.student_code, b.status from submissions b join assignments a on a.id = b.assignment_id
    join enrollments e on e.id = b.enrollment_id join students s on s.id = e.student_id where a.kind = 'capstone' order by 1`);
  assert.deepEqual(cap, [{ student_code: 'P.731', status: 'submitted' }]);   // ô trống = chưa nộp (không ghi dòng "thiếu")
  await db.close();
});
