// Lịch giảng dạy từ bảng Calendar của Google Sheet: đồng bộ (thay toàn bộ), chốt chặn, phân quyền xem, script Apps Script.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers');
const { parseShift, parseDate, parseScheduleRows, SCHEDULE_COLUMNS } = require('../src/services/importSchedule');

const TOKEN = 'schedule-test-token';
const realFetch = global.fetch;
let t, admin, gv, guest, c1, c2;

const HEAD = ['Ngày', 'Buổi', 'Khóa', 'Nội dung', 'Số buổi', 'Hình thức', 'Loại', 'Ghi chú'];
const post = (rows, headers = HEAD, token = TOKEN) => realFetch(`${t.base}/api/sync/schedule`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token },
  body: JSON.stringify({ schedule: { headers, rows } }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const row = (date, shift, course, content, no, note = null, mode = 'Offline', seg = 'B2C') => [date, shift, course, content, no, mode, seg, note];

test('đọc ca, ngày, bảng: S/T/C, yyyy-mm-dd và dd/mm/yyyy; mã khóa chuẩn hóa; cột lạ không đọc', () => {
  assert.deepEqual(['S', 'sáng', 'T', 'Tối', 'C', 'Chiều', 'Cả ngày', 'x', null].map(parseShift),
    ['morning', 'morning', 'evening', 'evening', 'afternoon', 'afternoon', 'full_day', null, null]);
  assert.deepEqual(['2026-09-06', '06/09/2026', '6/9/2026', '31/02/2026', 'abc', ''].map(parseDate), ['2026-09-06', '2026-09-06', '2026-09-06', null, null, null]);
  const p = parseScheduleRows({ headers: [...HEAD, 'Họ tên học viên'], rows: [
    row('2026-09-06', 'S', 'BIE102', 'Power Query', 1, 'Khai giảng').concat(['Không được đọc']),
    row('2026-09-12', 'S', 'bih 98', 'Metrics', '17').concat([null]),
    row('không phải ngày', 'S', 'BIE102', 'x', 2).concat([null]),
    row('2026-09-13', 'S', '', 'x', 3).concat([null]),
    [null, null, null, null, null, null, null, null, null],
  ] });
  assert.deepEqual(p.rows.map((r) => [r.short, r.date, r.shift, r.session_no, r.note]), [['BIE102', '2026-09-06', 'morning', 1, 'Khai giảng'], ['BIH098', '2026-09-12', 'morning', 17, null]]);
  assert.deepEqual([p.total, p.skipped.bad_date, p.skipped.no_course], [4, 1, 1]);
  assert.ok(!JSON.stringify(p).includes('Không được đọc'));
  assert.throws(() => parseScheduleRows({ headers: ['Nội dung'], rows: [] }), /Thiếu cột/);
});

before(async () => {
  process.env.SYNC_TOKEN = TOKEN;
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gvId = await t.addUser('gv@x.com', 'instructor');
  const gId = await t.addUser('khach@x.com', 'guest');
  admin = await t.login('admin@x.com'); gv = await t.login('gv@x.com'); guest = await t.login('khach@x.com');
  c1 = (await admin.post('/api/classes', { code: 'P2.BIE.P102.HY.AA.060926', session_count: 3, start_date: '2026-09-06' })).body.id;
  c2 = (await admin.post('/api/classes', { code: 'P2.BIH.P098.HY.EE.010826', session_count: 3, start_date: '2026-08-01' })).body.id;
  await t.db.run("update classes set short_code = 'BIE102', program = 'BIE' where id = $1", [c1]);
  await t.db.run("update classes set short_code = 'BIH098', program = 'BIH' where id = $1", [c2]);
  await admin.put(`/api/users/${gvId}/classes`, { class_ids: [c1] });
  await admin.put(`/api/users/${gId}/classes`, { class_ids: [c1] });
});
after(async () => { delete process.env.SYNC_TOKEN; await t.close(); });

const all = () => t.db.all('select short_code, session_date::text d, shift, session_no, note, class_id from teaching_schedule order by 1, 2');

test('đồng bộ cần mã; ghi đúng, mã lớp chưa có trong app vẫn lưu (class_id trống); chạy lại không nhân đôi', async () => {
  assert.equal((await post([], HEAD, 'sai')).status, 401);
  const rows = [row('2026-09-06', 'S', 'BIE102', 'Power Query', 1, 'Khai giảng'), row('2026-09-12', 'S', 'BIE102', 'Power Query', 2),
    row('2026-09-15', 'T', 'BIH98', 'Metrics', 20, 'Bế giảng'), row('2026-12-01', 'T', 'XYZ999', 'Lớp lạ', 1)];
  const r = await post(rows);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.valid, r.body.inserted, r.body.unknown_class], [4, 4, 1]);
  assert.deepEqual(r.body.examples.unknown_class, ['XYZ999']);
  const got = await all();
  assert.deepEqual(got.map((x) => [x.short_code, x.d, x.shift, x.session_no, x.note, x.class_id === null]),
    [['BIE102', '2026-09-06', 'morning', 1, 'Khai giảng', false], ['BIE102', '2026-09-12', 'morning', 2, null, false],
      ['BIH098', '2026-09-15', 'evening', 20, 'Bế giảng', false], ['XYZ999', '2026-12-01', 'evening', 1, null, true]]);
  const again = await post(rows);
  assert.equal(again.status, 200);
  assert.equal((await all()).length, 4);
  // Sheet là bản chuẩn: bỏ một dòng thì dòng đó mất
  assert.equal((await post(rows.slice(0, 3))).status, 200);
  assert.equal((await all()).length, 3);
});

test('xem lịch: admin thấy hết; giảng viên/khách chỉ lớp được phân công', async () => {
  await post([row('2026-09-06', 'S', 'BIE102', 'Power Query', 1), row('2026-09-15', 'T', 'BIH98', 'Metrics', 20), row('2026-12-01', 'T', 'XYZ999', 'Lớp lạ', 1)]);
  const a = (await admin.get('/api/schedule/teaching')).body;
  assert.deepEqual(a.map((x) => x.short_code), ['BIE102', 'BIH098', 'XYZ999']);
  for (const who of [gv, guest]) {
    const r = await who.get('/api/schedule/teaching');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((x) => x.short_code), ['BIE102']);
    assert.equal(r.body[0].session_date, '2026-09-06');
  }
  assert.equal((await realFetch(`${t.base}/api/schedule/teaching`)).status, 401);
});

test('chốt chặn: lượt đồng bộ bỗng ít dòng hơn hẳn thì từ chối, giữ lịch cũ; dòng sai được đếm', async () => {
  const many = Array.from({ length: 30 }, (_, i) => row(`2026-10-${String(1 + i % 28).padStart(2, '0')}`, 'S', 'BIE102', `Buổi ${i}`, i + 1));
  assert.equal((await post(many)).status, 200);
  const before = (await all()).length;
  const r = await post([row('2026-11-01', 'S', 'BIE102', 'x', 1)]);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /không cập nhật/);
  assert.equal((await all()).length, before);
  const bad = await post([...many, row('hôm nay', 'S', 'BIE102', 'x', 1), row('2026-11-02', 'S', '', 'x', 1)]);
  assert.deepEqual([bad.status, bad.body.skipped_bad_date, bad.body.skipped_no_course], [200, 1, 1]);
});

test('khớp lịch khai giảng: lớp dời khai giảng cả tuần thì dời cả lịch; lệch không tròn tuần chỉ báo', async () => {
  await t.db.run('delete from teaching_schedule');
  const c3 = (await admin.post('/api/classes', { code: 'P2.PBM.P022.OL.AA.311026', session_count: 3, start_date: '2026-10-31' })).body.id;
  await t.db.run("update classes set short_code = 'PBM022', program = 'PBM' where id = $1", [c3]);
  const rows = [row('2026-10-24', 'S', 'PBM022', 'a', 1, 'Khai giảng'), row('2026-10-31', 'S', 'PBM022', 'b', 9), row('2026-11-07', 'S', 'PBM022', 'c', 10),
    row('2026-09-15', 'T', 'BIH98', 'Metrics', 20), row('2026-08-30', 'S', 'BIE102', 'Lịch chỉ có buổi sau', 6)];
  const r = await post(rows);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.aligned_classes, r.body.misaligned_classes], [1, 0]);
  const got = await t.db.all("select session_date::text d, session_no n, instructor i from teaching_schedule where short_code = 'PBM022' order by 1");
  assert.deepEqual(got.map((x) => [x.d, x.n]), [['2026-10-31', 1], ['2026-11-07', 9], ['2026-11-14', 10]]);
  // BIE102 chỉ có buổi 6 (không bắt đầu từ buổi 1) và BIH098 lệch 45 ngày → không dời
  assert.equal((await t.db.one("select session_date::text d from teaching_schedule where short_code = 'BIE102'")).d, '2026-08-30');
  assert.deepEqual(got.map((x) => x.i), ['Bùi Trường Sơn', 'Phạm Hoài An', 'Phạm Hoài An']);
});

test('lớp chưa có dòng trong Calendar: sinh lịch dự kiến từ ngày khai giảng + thứ học; có dòng thật thì thay', async () => {
  await t.db.run('delete from teaching_schedule');
  const e = (await admin.post('/api/classes', { code: 'P1.EBA.P122.ON.EE.191026', session_count: 6, start_date: '2026-10-19', end_date: '2026-11-04' })).body.id;
  await t.db.run("update classes set short_code = 'EBA122', program = 'EBA', days_of_week = '24', shift = 'evening', end_date = '2026-11-04' where id = $1", [e]);
  assert.equal((await post([row('2026-09-06', 'S', 'BIE102', 'x', 1)])).status, 200);
  const g = await t.db.all("select session_date::text d, session_no n, note, instructor i from teaching_schedule where short_code = 'EBA122' order by 1");
  assert.deepEqual(g.map((x) => x.d), ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04']);
  assert.deepEqual([g[0].note, g[5].note, g[0].i], ['Khai giảng', 'Bế giảng', 'Phạm Hoài An']);
  assert.equal((await post([row('2026-09-06', 'S', 'BIE102', 'x', 1), row('2026-10-20', 'T', 'EBA122', 'Thật', 1)])).status, 200);
  assert.equal((await t.db.all("select 1 from teaching_schedule where short_code = 'EBA122'")).length, 1);
});

test('đổi ngày khai giảng của lớp trên web → lịch dự kiến tự sinh lại khớp ngày mới', async () => {
  await t.db.run('delete from teaching_schedule');
  const e = (await admin.post('/api/classes', { code: 'P1.EBA.P901.ON.EE.191026', session_count: 6, start_date: '2026-10-19' })).body.id;
  await t.db.run("update classes set short_code = 'EBA901', program = 'EBA', days_of_week = '24', shift = 'evening', end_date = '2026-11-04' where id = $1", [e]);
  const first = async () => (await t.db.all("select session_date::text d from teaching_schedule where short_code = 'EBA901' order by 1")).map((x) => x.d);
  assert.equal((await admin.put(`/api/classes/${e}`, { start_date: '2026-10-19' })).status, 200);
  assert.deepEqual((await first()).slice(0, 2), ['2026-10-19', '2026-10-21']);
  assert.equal((await admin.put(`/api/classes/${e}`, { start_date: '2026-10-26' })).status, 200);   // dời 1 tuần
  const dates = await first();
  assert.equal(dates.length, 6);
  assert.deepEqual(dates.slice(0, 2), ['2026-10-26', '2026-10-28']);
});

test('giảng viên mặc định theo chương trình/buổi; Sheet có ghi thì giữ', () => {
  const { defaultInstructor } = require('../src/services/scheduleRules');
  assert.deepEqual([['EBA122', 3], ['EBA122', null], ['PBM022', 8], ['PBM022', 9], ['PBM022', 10], ['PBM022', 11], ['PBM022', null], ['BIE102', 1], ['SCA002', 2], ['BIH103', 11], ['XYZ999', 1]]
    .map(([s, n]) => defaultInstructor(s, n)),
  ['Phạm Hoài An', 'Phạm Hoài An', 'Bùi Trường Sơn', 'Phạm Hoài An', 'Phạm Hoài An', null, null, 'Bùi Trường Sơn', 'Bùi Trường Sơn', 'Bùi Trường Sơn', null]);
});

test('script Apps Script lịch: đúng các cột cho phép, không ghi sẵn mã bí mật, không đụng thuộc tính của script đăng ký', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-schedule.gs'), 'utf8');
  const m = /const SCHEDULE_ALLOWED = \[([^\]]*)\]/.exec(gs);
  assert.ok(m, 'không thấy SCHEDULE_ALLOWED');
  const cols = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(cols, SCHEDULE_COLUMNS);
  assert.ok(!/SYNC_TOKEN\s*=\s*['"][A-Za-z0-9_-]{8,}/.test(gs));
  assert.match(gs, /SCHEDULE_URL/);
  assert.ok(!/\bconst CONFIG\b/.test(gs), 'không được khai báo CONFIG (trùng script đăng ký nếu dán chung một dự án)');
});
