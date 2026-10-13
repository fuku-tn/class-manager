const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { openDb } = require('../src/db');
const { importTransactions, stateFromStatus } = require('../src/services/importTransactions');

const MONEY_SENTINEL = 'TIEN-987654321';

async function makeFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'txn-'));
  const tx = new ExcelJS.Workbook();
  const course = tx.addWorksheet('Course');
  course.addRow(['COURSE', 'Sub COURSE ID', 'COURSE ID', 'StartDate', 'EndDate', 'NEXT COURSE', 'GIA KHOA HOC']);
  course.addRow(['BIE101', 'P2.BIE.P101.HY.AA', 'P2.BIE.P101.HY.AA.260726', new Date('2026-07-26'), new Date('2026-09-06'), 'BIE102', MONEY_SENTINEL]);
  course.addRow(['BIE102', 'P2.BIE.P102.HY.MM', 'P2.BIE.P102.HY.MM.060926', new Date('2026-09-06'), new Date('2026-11-01'), '', MONEY_SENTINEL]);
  course.addRow(['EBA070', 'P1.EBA.P070.ON.EE', 'P1.EBA.P070.ON.EE.1905', new Date('2025-05-19'), new Date('2025-06-18'), '', MONEY_SENTINEL]);
  course.addRow(['BIH099', 'P2.BIH.P099.HY.EE', 'P2.BIH.P099.HY.EE.010126', new Date('2026-01-01'), new Date('2026-03-01'), '', MONEY_SENTINEL]);
  const t = tx.addWorksheet('Transactions');
  t.addRow(['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE', 'SO TIEN DA DONG', 'GIAM GIA']);
  t.addRow(['P.1', null, 'Nguyễn An', 'An@X.com', 901234567, 'BIE101', 'Hybrid', 'Female', 'Đã thanh toán', 'Facebook', MONEY_SENTINEL, MONEY_SENTINEL]);
  t.addRow(['P.1', null, 'Nguyễn An', 'an@x.com', 901234567, 'BIE102', 'Online', 'Female', 'Bảo lưu khóa trước', 'Học viên cũ', MONEY_SENTINEL, MONEY_SENTINEL]);
  t.addRow(['P.2', 'B.04.001', 'Trần Bình', 'binh@x.com', 912345678, 'BIE101', 'Offline', 'Male', 'Không tham gia', 'Website', MONEY_SENTINEL, MONEY_SENTINEL]);
  t.addRow(['P.3', null, 'Lê Chi', 'chi@x.com', 923456789, 'EBA070', 'Online', 'Female', 'Scholarship', 'Zalo', MONEY_SENTINEL, MONEY_SENTINEL]);
  t.addRow(['P.4', null, 'Phạm Dũng', 'dung@x.com', 934567890, 'TƯ VẤN', 'Online', 'Male', 'Chưa thanh toán', 'Facebook', MONEY_SENTINEL, MONEY_SENTINEL]);
  t.addRow(['P.5', null, 'Hồ Em', 'em@x.com', 945678901, 'BIH099', 'Online', 'Female', 'Đã cọc', 'Facebook', MONEY_SENTINEL, MONEY_SENTINEL]);
  const txFile = path.join(dir, 'tx.xlsx');
  await tx.xlsx.writeFile(txFile);

  const cur = new ExcelJS.Workbook();
  for (const [name, sessions] of [['BIE-8', 2], ['BIE-12', 3], ['BIH-20', 2], ['BIH-11', 1]]) {
    const ws = cur.addWorksheet(name);
    ws.addRow(['Phase', 'Module', 'Tools', 'Session', 'Hours', 'Content']);
    for (let n = 1; n <= sessions; n++) {
      ws.addRow(['I', n === 1 ? 'Data Transformation' : 'Data Model', 'PowerBI', n, 2, `Nội dung ${n}a`]);
      if (n === 2) ws.addRow(['I', 'Data Storytelling', 'PowerBI', n, 1, 'Nội dung 2b']);
    }
  }
  const curFile = path.join(dir, 'cur.xlsx');
  await cur.xlsx.writeFile(curFile);
  return { txFile, curFile, dir };
}

test('trạng thái: Không tham gia = bảo lưu, Bảo lưu khóa trước đi tiếp, các nhãn khác đang học (nhãn lưu riêng, không có số tiền)', () => {
  assert.deepEqual(stateFromStatus('Không tham gia'), { course_status: 'deferred', carried_over: false });   // hiển thị giống Bảo lưu
  assert.deepEqual(stateFromStatus('Bảo lưu khóa trước'), { course_status: 'active', carried_over: true });
  for (const pay of ['Đã thanh toán', 'Chưa thanh toán', 'Đã cọc', 'Scholarship']) {
    assert.deepEqual(stateFromStatus(pay), { course_status: 'active', carried_over: false }, pay);
  }
});

test('nhập: không có dữ liệu cột tiền nào lọt vào database', async () => {
  const { txFile, curFile } = await makeFiles();
  const db = await openDb({ memory: true });
  await importTransactions(db, { transactionsFile: txFile, curriculumFile: curFile });
  for (const table of ['classes', 'students', 'enrollments', 'curricula', 'curriculum_items', 'sessions']) {
    const hit = await db.one(`select count(*)::int n from ${table} x where to_jsonb(x)::text like $1`, [`%${MONEY_SENTINEL}%`]);
    assert.equal(hit.n, 0, `bảng ${table} chứa dữ liệu cột tiền`);
  }
  // và không có cột nào tên liên quan đến thanh toán trong các bảng này
  const cols = await db.all(`select column_name from information_schema.columns
    where table_name in ('classes','students','enrollments','curricula','curriculum_items') and column_name ~* '(amount|price|money|pay|fee|discount|tien|gia)'`);
  assert.deepEqual(cols, []);
  await db.close();
});

test('nhập: lớp, giáo trình, học viên, ghi danh đúng; lớp cũ theo mẫu mặc định', async () => {
  const { txFile, curFile } = await makeFiles();
  const db = await openDb({ memory: true });
  const s = await importTransactions(db, { transactionsFile: txFile, curriculumFile: curFile });
  assert.equal(s.classes, 4);
  assert.equal(s.skipped_no_course, 0);
  assert.deepEqual(s.skipped_unknown_course, { 'TƯ VẤN': 1 });

  const c = await db.one(`select c.*, cu.code as tpl from classes c left join curricula cu on cu.id = c.curriculum_id where c.short_code = 'BIE101'`);
  assert.equal(c.code, 'P2.BIE.P101.HY.AA.260726');
  assert.equal(c.delivery_mode, 'Hybrid');
  assert.equal(c.shift, 'afternoon');
  assert.equal(c.start_date, '2026-07-26');
  assert.equal(c.next_short_code, 'BIE102');
  assert.equal(c.tpl, 'BIE-8');                // mẫu đã biết
  assert.equal((await db.one(`select cu.code from classes c join curricula cu on cu.id=c.curriculum_id where c.short_code='BIE102'`)).code, 'BIE-12');
  assert.equal((await db.one(`select shift from classes where short_code='BIE102'`)).shift, 'morning');
  assert.equal((await db.one(`select cu.code from classes c join curricula cu on cu.id=c.curriculum_id where c.short_code='BIH099'`)).code, 'BIH-20'); // mặc định cho lớp BI cũ
  assert.equal((await db.one(`select curriculum_id from classes where short_code='EBA070'`)).curriculum_id, null); // chưa có giáo trình

  // buổi học sinh ra từ giáo trình, tên theo module
  const sess = await db.all(`select s.session_no, s.title from sessions s join classes c on c.id=s.class_id where c.short_code='BIE101' order by 1`);
  assert.deepEqual(sess.map((x) => x.session_no), [1, 2]);
  assert.equal(sess[0].title, 'Buổi 1 — Data Transformation');
  assert.equal(sess[1].title, 'Buổi 2 — Data Model + Data Storytelling');

  // học viên: email chữ thường, SĐT khôi phục số 0 đầu, giới tính
  const an = await db.one(`select * from students where student_code = 'P.1'`);
  assert.equal(an.email, 'an@x.com');
  assert.equal(an.phone, '0901234567');
  assert.equal(an.gender, 'Female');
  assert.equal((await db.one('select count(*)::int n from students')).n, 4); // P.4 (TƯ VẤN) bị bỏ

  const en = await db.all(`select s.student_code, c.short_code, e.course_status, e.carried_over, e.registration_source, e.mode
    from enrollments e join students s on s.id=e.student_id join classes c on c.id=e.class_id order by 1, 2`);
  const get = (sid, short) => en.find((x) => x.student_code === sid && x.short_code === short);
  assert.equal(get('P.1', 'BIE101').course_status, 'active');
  assert.equal(get('P.1', 'BIE102').carried_over, true);        // suất chuyển từ khóa trước, KHÔNG phải bảo lưu
  assert.equal(get('P.1', 'BIE102').course_status, 'active');
  assert.equal(get('P.2', 'BIE101').course_status, 'deferred');  // không tham gia (hiển thị giống bảo lưu)
  assert.equal(get('P.3', 'EBA070').carried_over, false);
  assert.equal(get('P.3', 'EBA070').registration_source, 'Zalo');
  await db.close();
});

test('nhập: chạy lại không tạo trùng và không ghi đè trạng thái đã đặt tay', async () => {
  const { txFile, curFile } = await makeFiles();
  const db = await openDb({ memory: true });
  await importTransactions(db, { transactionsFile: txFile, curriculumFile: curFile });
  const count = async () => Promise.all(['classes', 'students', 'enrollments', 'sessions', 'curricula', 'curriculum_items']
    .map(async (t) => (await db.one(`select count(*)::int n from ${t}`)).n));
  const before = await count();
  // người dùng đặt tay "bảo lưu" và sửa tên buổi
  await db.run(`update enrollments set course_status = 'deferred' where student_id = (select id from students where student_code = 'P.1')
                and class_id = (select id from classes where short_code = 'BIE101')`);
  await db.run(`update sessions set title = 'Buổi mở đầu (tên tự đặt)' where session_no = 1
                and class_id = (select id from classes where short_code = 'BIE101')`);
  const again = await importTransactions(db, { transactionsFile: txFile, curriculumFile: curFile });
  assert.deepEqual(await count(), before);
  assert.deepEqual(again.added, { classes: 0, students: 0, enrollments: 0, sessions: 0 });
  assert.equal((await db.one(`select e.course_status from enrollments e join students s on s.id=e.student_id join classes c on c.id=e.class_id
                              where s.student_code='P.1' and c.short_code='BIE101'`)).course_status, 'deferred');
  assert.equal((await db.one(`select s.title from sessions s join classes c on c.id=s.class_id where c.short_code='BIE101' and s.session_no=1`)).title,
    'Buổi mở đầu (tên tự đặt)'); // tên do người dùng tự đặt được giữ nguyên
  await db.close();
});

test('chạy thử (dry-run): không thay đổi database', async () => {
  const { txFile, curFile } = await makeFiles();
  const db = await openDb({ memory: true });
  const s = await importTransactions(db, { transactionsFile: txFile, curriculumFile: curFile, dryRun: true });
  assert.equal(s.added.students, 4);
  assert.equal((await db.one('select count(*)::int n from students')).n, 0);
  assert.equal((await db.one('select count(*)::int n from classes')).n, 0);
  await db.close();
});
