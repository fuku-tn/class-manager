// Lớp mặc định theo chương trình: SCA/PBM 4 HW; BIE107 (BIE-6) 6 buổi + HW1, HW2, Mini Project 1; lớp tạo tay trên web (chưa có dòng COURSE) vẫn nhận ghi danh.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

const TOKEN = 'defaults-test-token';
const realFetch = global.fetch;
let t;
const HEAD = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE', 'COMPANY NAME', 'SEGMENT'];
const row = (id, course, seg = 'b2c', company = null) => [id, null, 'HV ' + id, null, null, course, 'Offline', null, null, 'Form', company, seg];
const post = (rows, course) => realFetch(`${t.base}/api/sync/transactions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN },
  body: JSON.stringify({ transactions: { headers: HEAD.slice(0, 10), rows: rows.map((r) => r.slice(0, 10)) }, company: { headers: HEAD, rows: rows.filter((r) => r[11] === 'b2b') }, course }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const COURSE = { headers: ['COURSE', 'COURSE ID', 'START DATE', 'EXPECTED END DATE'], rows: [
  ['SCA003', 'P5.SCA.P003.HY.EE.011126', '2026-11-01', '2026-12-01'],
  ['PBM023', 'P5.PBM.P023.ON.EE.011126', '2026-11-01', '2026-12-01'],
  ['EBA130', 'P1.EBA.P130.ON.EE.011126', '2026-11-01', '2026-12-01'],
] };
const asg = (short) => t.db.all(`select a.kind || a.seq as k from assignments a join classes c on c.id = a.class_id where c.short_code = $1 order by a.kind, a.seq`, [short]).then((r) => r.map((x) => x.k));

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.db.run("insert into curricula (code, program, name, session_count) values ('PBM-10', 'PBM', 'PBM 10', 10), ('BIE-6', 'BIE', 'BIE 6 buổi', 6)");
  const cu = await t.db.one("select id from curricula where code = 'BIE-6'");
  await t.db.run("insert into curriculum_items (curriculum_id, session_no, seq) select $1, n, 1 from generate_series(1, 6) n", [cu.id]);
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

test('đồng bộ tạo sẵn 4 HW cho lớp SCA và PBM; chương trình khác (EBA) không tự có bài tập', async () => {
  const r = await post([row('P.1', 'SCA003'), row('P.2', 'PBM023'), row('P.3', 'EBA130')], COURSE);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(await asg('SCA003'), ['hw1', 'hw2', 'hw3', 'hw4']);
  assert.deepEqual(await asg('PBM023'), ['hw1', 'hw2', 'hw3', 'hw4']);
  assert.deepEqual(await asg('EBA130'), []);
  // chạy lại không nhân đôi; bài đã có tick không bị đụng
  await post([row('P.1', 'SCA003'), row('P.2', 'PBM023')], COURSE);
  assert.deepEqual(await asg('SCA003'), ['hw1', 'hw2', 'hw3', 'hw4']);
});

test('lớp tạo tay (BIE107, B2B) chưa có dòng COURSE vẫn nhận học viên từ COMPANY; mã lớp lạ vẫn bị bỏ qua', async () => {
  await t.db.run("insert into classes (code, name, short_code, program, curriculum_id) values ('P2.BIE.B107.HY.MA.161026', 'BIE107', 'BIE107', 'BIE', (select id from curricula where code = 'BIE-6'))");
  const before = await t.db.one("select name, start_date::text d from classes where short_code = 'BIE107'");
  const r = await post([row('P.10', 'BIE107', 'b2b', 'Công ty A'), row('P.11', 'BIE107', 'b2b', 'Công ty A'), row('P.12', 'ZZZ999', 'b2b', 'Công ty B')], COURSE);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const e = await t.db.all("select s.student_code, e.segment, e.company_name from enrollments e join students s on s.id = e.student_id join classes c on c.id = e.class_id where c.short_code = 'BIE107' order by 1");
  assert.deepEqual(e.map((x) => [x.student_code, x.segment, x.company_name]), [['P.10', 'b2b', 'Công ty A'], ['P.11', 'b2b', 'Công ty A']]);
  assert.deepEqual(Object.keys(r.body.skipped_unknown_course), ['ZZZ999']);   // (dòng B2B có mặt ở cả PERSONAL và COMPANY nên đếm hai lần)
  assert.deepEqual(await t.db.one("select name, start_date::text d from classes where short_code = 'BIE107'"), before);   // thông tin lớp không bị sheet ghi đè
  // lần đồng bộ sau: học viên B2B đã có không bị đánh dấu/chuyển đi
  const again = await post([row('P.10', 'BIE107', 'b2b', 'Công ty A')], COURSE);
  assert.equal(again.status, 200);
  assert.equal((await t.db.one("select count(*)::int n from enrollments e join classes c on c.id = e.class_id where c.short_code = 'BIE107'")).n, 2);
});
