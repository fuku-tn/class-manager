const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const R = require('../src/services/remind');
const stats = require('../src/services/stats');

let t, admin, privGv, plainGv, guest, classId, enr, hw, cap, sessions;
const base = () => `/api/classes/${classId}`;
const NAMES = ['Đặng Đức Quang', 'Dương Thị Ngọc Duyên', 'Lê Thị An Trinh', 'Nguyễn Thị Thi', 'Nguyễn Văn Thanh', 'Lynchie Nguyen'];

test('tên gọi: 2 từ cuối, bỏ tên đệm Thị/Văn, tên 2 từ, tên ngoại ghi đè', () => {
  assert.equal(R.callName('Đặng Đức Quang'), 'Đức Quang');
  assert.equal(R.callName('Dương Thị Ngọc Duyên'), 'Ngọc Duyên');
  assert.equal(R.callName('Lê Thị An Trinh'), 'An Trinh');
  assert.equal(R.callName('Nguyễn Thị Thi'), 'Thi');
  assert.equal(R.callName('Nguyễn Văn Thanh'), 'Thanh');
  assert.equal(R.callName('Trần An'), 'An');
  assert.equal(R.callName('Lynchie Nguyen', 'Lynchie'), 'Lynchie');
  assert.equal(R.joinVi(['HW3']), 'HW3');
  assert.equal(R.joinVi(['HW3', 'HW4']), 'HW3 và HW4');
  assert.equal(R.joinVi(['HW2', 'HW3', 'HW4']), 'HW2, HW3 và HW4');
});

test('tin nhắn: đủ bài / thiếu một phần / chưa làm bài nào / Capstone / Anh-Chị', () => {
  const hdr = ['HOMEWORK 1', 'HOMEWORK 2', 'HOMEWORK 3', 'HOMEWORK 4'];
  const o = { hdr, cls: 'EBA', scope: 'các tuần đã học' };
  assert.equal(R.buildMessage({ name: 'Đặng Đức Quang', d: [1, 1, 1, 1], honorific: 'Anh' }, o),
    'Anh Đức Quang ơi, em check HW lớp EBA thấy anh đã hoàn thành đầy đủ homework các tuần đã học (HW1, HW2, HW3 và HW4) rồi. Cảm ơn anh đã nộp bài nhé!');
  assert.equal(R.buildMessage({ name: 'Nguyễn Thị Thi', d: [1, 1, 0, 0], honorific: 'Chị' }, o),
    'Chị Thi ơi, em check HW lớp EBA thấy mình chỉ còn HW3 và HW4 nữa là hoàn thành đầy đủ homework các tuần đã học (HW1, HW2, HW3 và HW4). Nếu bài nào đang có vướng mắc, chị cứ nhắn em, em hỗ trợ liền ạ!');
  // chưa làm bài nào: không có đoạn "(HW1, ...)"
  const none = R.buildMessage({ name: 'Nguyễn Văn Thanh', d: [0, 0, 0, 0], honorific: 'Anh' }, o);
  assert.match(none, /còn HW1, HW2, HW3 và HW4 nữa/);
  assert.ok(!none.includes('(HW1'));
  // Capstone
  const cap = R.buildMessage({ name: 'Đặng Đức Quang', d: [1, 1, 0], honorific: 'Anh' }, { hdr: ['HOMEWORK 1', 'HOMEWORK 2', 'CAPSTONE PROJECT'], cls: 'BIE', scope: 'tuần đầu tiên' });
  assert.match(cap, /chỉ còn 2 file của Capstone Project nữa là hoàn thành đầy đủ homework tuần đầu tiên \(HW1, HW2 và Capstone PROJECT\)|chỉ còn 2 file của Capstone Project nữa/);
});

test('thống kê lớp: đối chiếu ví dụ của kit (19 học viên, 4 HW → đủ 18/19, trung bình 97%) và nhóm ẩn danh', () => {
  const rows = Array.from({ length: 19 }, () => [1, 1, 1, 1]);
  rows[0] = [1, 1, 0, 0];                 // 1 người 2/4
  const st = stats.classHomeworkStats(rows, ['HOMEWORK 1', 'HOMEWORK 2', 'HOMEWORK 3', 'HOMEWORK 4'], { minGroup: 1 });
  assert.deepEqual([st.N, st.T, st.full, st.avg], [19, 4, 18, 97]);
  assert.deepEqual(st.byCol.map((c) => c.n), [19, 19, 18, 18]);
  assert.equal(st.dist.find((b) => b.k === 2).n, 1);
  assert.equal(st.mergedNote, false);
  // minGroup = 2: nhóm "2/4 bài" chỉ có 1 người → gộp mọi nhóm chưa đủ
  const m = stats.classHomeworkStats(rows, ['HW1', 'HW2', 'HW3', 'HW4'], { minGroup: 2 });
  assert.equal(m.mergedNote, true);
  assert.deepEqual(m.dist.map((b) => [b.label, b.n]), [['4/4 bài', 18], ['Chưa đủ 4/4 bài', 1]]);
  assert.equal(m.smallRemainder, true);    // chỉ còn 1 người chưa xong, nhỏ hơn ngưỡng
  assert.deepEqual(stats.homeworkProgress(2, 4), { done: 2, total: 4, pct: 50, complete: false });
  assert.deepEqual(stats.homeworkProgress(0, 0), { done: 0, total: 0, pct: 0, complete: false });
});

test('chuẩn hoá bảng dán: X/✓ là hoàn thành, ô lạ cảnh báo, trùng tên, cột lạ bị bỏ', () => {
  const r = R.parseTable('FULL NAME\tHOMEWORK 1\tHW 2\tCAPSTONE PROJECT\tGhi chú\nNguyễn An\tX\t\tx\tok\nNguyễn An\t✓\tabc\t\t\n\t\t\t\t\n');
  assert.deepEqual(r.columns.map((c) => [c.kind, c.seq]), [['hw', 1], ['hw', 2], ['capstone', 1]]);
  assert.deepEqual(r.students.map((s) => s.done), [[1, 0, 1], [1, 0, 0]]);
  assert.ok(r.warnings.some((w) => /Trùng tên/.test(w)));
  assert.ok(r.warnings.some((w) => /giá trị lạ \(abc\)/.test(w)));
  assert.ok(r.warnings.some((w) => /Ghi chú/.test(w)));
});

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const privId = await t.addUser('thuan@x.com', 'instructor');
  const plainId = await t.addUser('an@x.com', 'instructor');
  const guestId = await t.addUser('khach@x.com', 'guest');
  await t.db.run('update users set can_remind = true where id = $1', [privId]);
  admin = await t.login('admin@x.com');
  privGv = await t.login('thuan@x.com');
  plainGv = await t.login('an@x.com');
  guest = await t.login('khach@x.com');
  classId = (await admin.post('/api/classes', { code: 'P1.EBA.P120.ON.EE.280926', session_count: 2, hw_count: 3 })).body.id;
  await t.db.run("update classes set short_code = 'EBA120', program = 'EBA' where id = $1", [classId]);
  for (const id of [privId, plainId, guestId]) await admin.put(`/api/users/${id}/classes`, { class_ids: [classId] });
  for (const [i, n] of NAMES.entries()) await admin.post(`${base()}/students`, { student_code: `R${i}`, full_name: n });
  await t.db.run("update students set gender = 'Male' where student_code in ('R0', 'R4')");
  enr = Object.fromEntries((await admin.get(`${base()}/students`)).body.map((s) => [s.student_code, s.id]));
  const assignments = (await admin.get(`${base()}/assignments`)).body;
  hw = assignments.filter((a) => a.kind === 'hw').sort((a, b) => a.seq - b.seq);
  cap = assignments.find((a) => a.kind === 'capstone');
  sessions = (await admin.get(`${base()}/sessions`)).body;
  const sub = (e, a, status) => admin.put(`${base()}/submissions`, { enrollment_id: enr[e], assignment_id: a.id, status });
  // HW1, HW2 đã thu; HW3 và Capstone chưa thu (không có ô nào)
  await sub('R0', hw[0], 'submitted'); await sub('R0', hw[1], 'submitted');
  await sub('R1', hw[0], 'submitted'); await sub('R1', hw[1], 'resubmit');          // nộp lại: chưa tính hoàn thành
  await sub('R2', hw[0], 'submitted'); await sub('R2', hw[1], 'submitted');
  // R3, R4, R5: chưa làm bài nào
});
after(async () => { await t.close(); });

test('GET: bài đã thu thành cột; nộp lại không tính; tài khoản có quyền nhận tin nhắn đúng mẫu', async () => {
  const r = await privGv.get(`${base()}/remind`);
  assert.equal(r.status, 200);
  assert.equal(r.body.privileged, true);
  assert.deepEqual(r.body.hdr, ['HOMEWORK 1', 'HOMEWORK 2']);                 // HW3 và Capstone chưa thu → không có cột
  const by = Object.fromEntries(r.body.students.map((s) => [s.student_code, s]));
  assert.deepEqual([by.R0.done, by.R0.total, by.R0.pct, by.R0.complete], [2, 2, 100, true]);
  assert.deepEqual([by.R1.done, by.R1.pct], [1, 50]);                           // resubmit chưa tính
  assert.deepEqual([by.R3.done, by.R3.pct], [0, 0]);
  assert.equal(by.R0.honorific, 'Anh');                                         // theo giới tính Male
  assert.equal(by.R1.honorific, 'Chị');
  assert.equal(by.R0.message, 'Anh Đức Quang ơi, em check HW lớp EBA thấy anh đã hoàn thành đầy đủ homework các tuần đã học (HW1 và HW2) rồi. Cảm ơn anh đã nộp bài nhé!');
  assert.match(by.R1.message, /^Chị Ngọc Duyên ơi, em check HW lớp EBA thấy mình chỉ còn HW2 nữa là hoàn thành đầy đủ homework các tuần đã học \(HW1 và HW2\)\./);
  assert.ok(!by.R3.message.includes('(HW1'));                                   // chưa làm bài nào
  assert.equal(r.body.config.cls_label, 'EBA');
  assert.equal(r.body.config.theme, 'excel-green');
  assert.match(r.body.snap_date, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.match(r.body.snap_time, /^\d{2}:\d{2}$/);   // giờ:phút (giờ Việt Nam) in trên thẻ
});

test('phân quyền: giảng viên không có quyền chỉ xem tiến độ — không có tin nhắn, xưng hô, cấu hình, tổng quan', async () => {
  const r = await plainGv.get(`${base()}/remind`);
  assert.equal(r.status, 200);
  assert.equal(r.body.privileged, false);
  assert.equal(r.body.students.length, NAMES.length);
  const raw = JSON.stringify(r.body);
  assert.ok(r.body.students.every((s) => s.message === undefined && s.honorific === undefined && s.call_name === undefined));
  assert.ok(!raw.includes('em check HW') && !raw.includes('Cảm ơn'), 'không được lộ nội dung tin nhắn');
  assert.equal(r.body.config, undefined);
  assert.equal((await plainGv.get(`${base()}/remind/overview`)).status, 403);
  assert.equal((await plainGv.put(`${base()}/remind/config`, { scope: 'x' })).status, 403);
  assert.equal((await plainGv.put(`${base()}/remind/students/${enr.R0}`, { honorific: 'Chị' })).status, 403);
  assert.equal((await plainGv.post(`${base()}/remind/import`, { table: 'a' })).status, 403);
  // khách: không dùng được phần này
  assert.equal((await guest.get(`${base()}/remind`)).status, 403);
  // admin luôn có quyền; giảng viên chưa được phân lớp thì bị chặn như các route khác
  assert.equal((await admin.get(`${base()}/remind`)).body.privileged, true);
  const other = (await admin.post('/api/classes', { code: 'OTHER.01', session_count: 1, hw_count: 0 })).body.id;
  assert.equal((await privGv.get(`/api/classes/${other}/remind`)).status, 403);
});

test('bật/tắt quyền nhắc bài trong quản lý người dùng (chỉ admin)', async () => {
  const id = (await t.db.one("select id from users where email = 'an@x.com'")).id;
  assert.equal((await plainGv.put(`/api/users/${id}/remind`, { can_remind: true })).status, 403);
  assert.equal((await admin.put(`/api/users/${id}/remind`, { can_remind: true })).status, 200);
  assert.equal((await plainGv.get(`${base()}/remind`)).body.privileged, true);   // hiệu lực ngay (đọc quyền từ database)
  assert.equal((await admin.put(`/api/users/${id}/remind`, { can_remind: false })).status, 200);
  assert.equal((await plainGv.get(`${base()}/remind`)).body.privileged, false);
  const users = (await admin.get('/api/users')).body;
  assert.equal(users.find((u) => u.email === 'thuan@x.com').can_remind, true);
});

test('cấu hình lớp, xưng hô và tên gọi được lưu và đổi nội dung tin nhắn', async () => {
  assert.equal((await privGv.put(`${base()}/remind/config`, { cls_label: 'EBA120', scope: 'tuần đầu tiên', min_group: 2, theme: 'bie-ocean-blue' })).status, 200);
  assert.equal((await privGv.put(`${base()}/remind/config`, { theme: 'khong-co' })).status, 400);
  assert.equal((await privGv.put(`${base()}/remind/config`, { min_group: 0 })).status, 400);
  assert.equal((await privGv.put(`${base()}/remind/students/${enr.R0}`, { honorific: 'Chị', call_name: 'Quang' })).status, 200);
  assert.equal((await privGv.put(`${base()}/remind/students/${enr.R0}`, { honorific: 'Sếp' })).status, 400);
  const r = (await privGv.get(`${base()}/remind`)).body;
  assert.deepEqual([r.config.cls_label, r.config.scope, r.config.min_group, r.config.theme], ['EBA120', 'tuần đầu tiên', 2, 'bie-ocean-blue']);
  const q = r.students.find((s) => s.student_code === 'R0');
  assert.equal(q.message, 'Chị Quang ơi, em check HW lớp EBA120 thấy chị đã hoàn thành đầy đủ homework tuần đầu tiên (HW1 và HW2) rồi. Cảm ơn chị đã nộp bài nhé!');
  assert.equal(q.honorific_custom, true);
  // honorific = null: quay về mặc định theo giới tính
  await privGv.put(`${base()}/remind/students/${enr.R0}`, { honorific: null, call_name: '' });
  const again = (await privGv.get(`${base()}/remind`)).body.students.find((s) => s.student_code === 'R0');
  assert.deepEqual([again.honorific, again.call_name], ['Anh', null]);
});

test('tổng quan lớp: có số liệu tổng hợp, KHÔNG có tên học viên, ngưỡng ẩn danh áp dụng', async () => {
  const r = await privGv.get(`${base()}/remind/overview?min_group=1`);
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.N, r.body.T, r.body.full], [6, 2, 2]);              // R0, R2 đủ 2/2
  assert.deepEqual(r.body.byCol.map((c) => c.n), [3, 2]);
  const raw = JSON.stringify(r.body);
  for (const n of NAMES) assert.ok(!raw.includes(n), `tổng quan không được chứa tên: ${n}`);
  for (const code of ['R0', 'R1']) assert.ok(!raw.includes(`"${code}"`));
  const m = await privGv.get(`${base()}/remind/overview?min_group=3&title=Tiêu đề thử`);
  assert.equal(m.body.title, 'Tiêu đề thử');
  assert.equal(m.body.min_group, 3);
});

test('nạp bảng: chạy thử không ghi; áp dụng chỉ ghi X, không đè ô sửa tay; tạo bài chưa có', async () => {
  const table = ['FULL NAME\tHOMEWORK 1\tHOMEWORK 2\tHOMEWORK 3',
    'Lê Thị An Trinh\tX\tX\tX',          // R2: HW1,2 đã có; HW3 mới
    'NGUYEN THI THI\tX\t\t',             // R3: khớp không dấu/hoa thường
    'Lynchie Nguyen\t\tX\t',             // R5
    'Người Lạ Hoắc\tX\tX\tX'].join('\n'); // không có trong lớp
  const dry = await privGv.post(`${base()}/remind/import?dry_run=1`, { table });
  assert.equal(dry.status, 200);
  assert.deepEqual([dry.body.matched, dry.body.unmatched, dry.body.dry_run], [3, ['Người Lạ Hoắc'], true]);
  assert.equal((await t.db.one('select count(*)::int n from submissions s join enrollments e on e.id = s.enrollment_id where e.student_id = (select student_id from enrollments where id = $1)', [enr.R3])).n, 0);

  // sửa tay một ô trước khi áp dụng: R5 HW2 đặt "thiếu" bằng tay → phải giữ nguyên
  await admin.put(`${base()}/submissions`, { enrollment_id: enr.R5, assignment_id: hw[1].id, status: 'missing' });
  const ok = await privGv.post(`${base()}/remind/import`, { table });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.kept_manual, 1);
  assert.ok(ok.body.already_done >= 2);
  const r = (await privGv.get(`${base()}/remind`)).body;
  assert.deepEqual(r.hdr, ['HOMEWORK 1', 'HOMEWORK 2', 'HOMEWORK 3']);        // HW3 giờ đã thu
  const by = Object.fromEntries(r.students.map((s) => [s.student_code, s]));
  assert.deepEqual(by.R2.d, [1, 1, 1]);
  assert.deepEqual(by.R3.d, [1, 0, 0]);
  assert.deepEqual(by.R5.d, [0, 0, 0]);                                         // ô sửa tay được giữ
  assert.equal((await admin.post(`${base()}/remind/import`, { table: '' })).status, 422);
});
