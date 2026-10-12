const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestApp } = require('./helpers');
const fb = require('../src/services/feedback');
const stats = require('../src/services/stats');

let t, admin, gv;
const EMAIL = 'nguoi.tra.loi@example.com';
const NAME = 'Nguyễn Người Trả Lời';
const PHONE = '0987654321';
const FREE = 'Cảm nhận riêng tư không được lưu';

// Tiêu đề giống file thật (gồm cả cột cá nhân, câu hỏi học phí, chữ tự do).
const HEAD = ['Id', 'Start time', 'Completion time', 'Email', 'Name',
  'Trước khi tham gia khóa học.Thông tin khóa học được cung cấp rõ ràng',
  'Trước khi tham gia khóa học.Tôi bị thu hút bởi nội dung khóa học',
  'Trước khi tham gia khóa học.Tôi bị thu hút bởi học phí khóa học',
  'Trong khi tham gia khóa học.Giảng viên có kiến thức vững vàng và truyền đạt nội',
  'Hình thức tham gia offline/online.Tôi hài lòng với trải nghiệm học tập tổng thể',
  'Theo thang điểm từ 1–7, trong đó 1 là RẤT KHÔNG ĐỒNG Ý và 7 là RẤT ĐỒNG Ý, anh/c',
  'Trải nghiệm học tập tổng thể của tôi', 'Tôi sẵn sàng giới thiệu STARTTRAIN cho bạn bè hoặc đồng nghiệp',
  'Tôi cảm nhận sau khóa học là', 'Tôi dự định học thêm các khoá khác tại Starttrain trong tương lai',
  'Khóa học tôi dự định tham gia là', 'Họ và tên của tôi là', 'Số điện thoại của tôi là', 'Email của tôi là', 'Mã khóa học tôi vừa hoàn thành là?'];
const row = (id, c) => [id, 45875.5, 45875.6, EMAIL, NAME, c.pre_info, c.pre_content, c.price, c.instr, c.fmt, 5, c.overall, c.rec, FREE,
  c.more, c.next, NAME, PHONE, EMAIL, c.course];

async function workbook(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('FEEDBACK FORM');
  ws.addRow(HEAD);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  admin = await t.login('admin@x.com');
  gv = await t.login('gv@x.com');
  await t.db.run("insert into classes (code, name, short_code) values ('P1.EBA.P088.ON.EE.131025','EBA088','EBA088'), ('P2.BIE.P076.HY.AA.280725','BIE076','BIE076')");
  const c = (await t.db.one("select id from classes where short_code = 'EBA088'")).id;
  await t.db.run('insert into class_instructors (class_id, user_id) values ($1, $2)', [c, gvId]);
});
after(async () => { await t.close(); });

test('nhận diện mã lớp từ chữ tự do; nhiều mã hoặc không có mã thì để trống', () => {
  assert.equal(fb.classCodeFrom('EBA88'), 'EBA088');
  assert.equal(fb.classCodeFrom('BIE 76'), 'BIE076');
  assert.equal(fb.classCodeFrom('bie78'), 'BIE078');
  assert.equal(fb.classCodeFrom('STARTTRAIN - EBA87 - AA - SAT - SUN 1110'), 'EBA087');
  assert.equal(fb.classCodeFrom('EBA88 - EE - MON - WED 1310'), 'EBA088');
  assert.equal(fb.classCodeFrom('BIE70 và BIH73'), null);
  assert.equal(fb.classCodeFrom('89'), null);
  assert.equal(fb.classCodeFrom('e quên mất'), null);
  assert.deepEqual(fb.nextCourses('Practical Business Management (PBM);Data-driven Business Context (DBC);'), ['PBM', 'DBC']);
  assert.deepEqual([fb.moreCourses('Có'), fb.moreCourses('Có thể'), fb.moreCourses('Không')], ['yes', 'maybe', null]);
});

test('điểm trung bình và NPS (stats.js): ≥9 người giới thiệu, ≤6 người chê, bỏ giá trị trống', () => {
  assert.equal(stats.averageScore([7, 6, null, 5]), 6);
  assert.equal(stats.averageScore([]), null);
  assert.equal(stats.npsScore([10, 10, 9, 8, 6]), 40);         // 3 giới thiệu, 1 chê trên 5 → (3−1)/5
  assert.equal(stats.npsScore([null]), null);
});

test('nhập khảo sát: không lưu email/tên/SĐT/chữ tự do/học phí; gán lớp; chạy lại không nhân đôi', async () => {
  const buf = await workbook([
    row(1, { pre_info: 7, pre_content: 6, price: 3, instr: 7, fmt: 6, overall: 10, rec: 10, more: 'Có', next: 'Practical Business Management (PBM);', course: 'EBA88' }),
    row(2, { pre_info: 5, pre_content: 7, price: 7, instr: 6, fmt: 7, overall: 9, rec: 6, more: 'Có thể', next: '', course: 'EBA 088' }),
    row(3, { pre_info: 7, pre_content: 7, price: 7, instr: 7, fmt: 7, overall: 10, rec: 9, more: 'Có', next: '', course: 'Bie 76' }),
    row(4, { pre_info: 6, pre_content: 6, price: 6, instr: 6, fmt: 6, overall: 8, rec: 8, more: 'Có', next: '', course: 'không nhớ' }),
  ]);
  const dry = await fb.importFeedback(t.db, buf, { dryRun: true });
  assert.deepEqual([dry.rows, dry.matched_class, dry.unmatched], [4, 3, 1]);
  assert.equal((await t.db.one('select count(*)::int n from course_feedback')).n, 0);   // chạy thử không ghi

  const r = await fb.importFeedback(t.db, buf);
  assert.deepEqual([r.inserted, r.updated], [4, 0]);
  const again = await fb.importFeedback(t.db, buf);
  assert.deepEqual([again.inserted, again.updated], [0, 4]);
  assert.equal((await t.db.one('select count(*)::int n from course_feedback')).n, 4);

  const dump = JSON.stringify(await t.db.all('select * from course_feedback'));
  for (const secret of [EMAIL, NAME, PHONE, FREE, 'example.com']) assert.ok(!dump.includes(secret), `không được lưu: ${secret}`);
  // câu hỏi học phí không được lưu; các câu hỏi khác thì có
  const keys = new Set((await t.db.all('select scores from course_feedback')).flatMap((x) => Object.keys(x.scores)));
  assert.ok(keys.has('pre_info') && keys.has('overall') && keys.has('recommend'));
  assert.ok(![...keys].some((k) => /price|fee|hoc_phi/i.test(k)));
  assert.equal(r.columns_read, 6);   // 6 câu hỏi khớp trong workbook thử (cột học phí và cột ma trận không rõ nội dung bị bỏ)
});

test('API khảo sát: chỉ admin; tổng hợp theo lớp và toàn bộ', async () => {
  const all = await admin.get('/api/feedback');
  assert.equal(all.status, 200);
  assert.equal(all.body.summary.n, 4);
  assert.equal(all.body.unmatched, 1);
  assert.equal(all.body.summary.nps, 25);                    // người ≥9: 10, 9 = 2; ≤6: 6 = 1; (2−1)/4 → 25
  const eba = all.body.classes.find((c) => c.short_code === 'EBA088');
  assert.equal(eba.n, 2);
  assert.equal(eba.overall_avg, 9.5);
  assert.equal((await gv.get('/api/feedback')).status, 403);

  const cid = (await t.db.one("select id from classes where short_code = 'EBA088'")).id;
  const one = await admin.get(`/api/classes/${cid}/feedback`);
  assert.equal(one.status, 200);
  assert.equal(one.body.summary.n, 2);
  assert.equal(one.body.summary.more_courses.yes, 1);
  assert.equal((await gv.get(`/api/classes/${cid}/feedback`)).status, 403);   // giảng viên của lớp cũng không xem được
});
