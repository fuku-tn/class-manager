const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const realtime = require('../src/services/realtime');

let t, an, binh, classId, e1, e2, session, hw;
const published = [];
const realPublish = realtime.publish;

before(async () => {
  realtime.publish = async (cid, payload) => { published.push({ cid, payload }); return true; }; // không gọi mạng
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  const gv1 = await t.addUser('an@x.com', 'instructor');
  const gv2 = await t.addUser('binh@x.com', 'instructor');
  const admin = await t.login('admin@x.com');
  classId = (await admin.post('/api/classes', { code: 'RT.01', session_count: 2, hw_count: 1 })).body.id;
  for (const id of [gv1, gv2]) await admin.put(`/api/users/${id}/classes`, { class_ids: [classId] });
  for (const c of ['A', 'B']) await admin.post(`/api/classes/${classId}/students`, { student_code: c, full_name: `HV ${c}` });
  const st = (await admin.get(`/api/classes/${classId}/students`)).body;
  [e1, e2] = st.map((s) => s.id);
  session = (await admin.get(`/api/classes/${classId}/sessions`)).body[0];
  hw = (await admin.get(`/api/classes/${classId}/assignments`)).body.find((a) => a.kind === 'hw');
  an = await t.login('an@x.com');
  binh = await t.login('binh@x.com');
});
after(async () => { realtime.publish = realPublish; await t.close(); });

const att = (c, body) => c.put(`/api/classes/${classId}/attendance`, { enrollment_id: e1, session_id: session.id, ...body });
const cell = async (c) => (await c.get(`/api/classes/${classId}/attendance`)).body.rows.find((r) => r.enrollment_id === e1).cells[session.id];

test('hai người cùng thấy ô trống: người đến sau bị từ chối (409), không ghi đè', async () => {
  const r1 = await att(an, { status: 'present', expected: null });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.cell.by, 'an');
  const r2 = await att(binh, { status: 'late', expected: null }); // Bình vẫn thấy ô trống
  assert.equal(r2.status, 409);
  assert.equal(r2.body.current.status, 'present');
  assert.equal(r2.body.current.by, 'an');
  assert.match(r2.body.error, /an/);
  assert.equal((await cell(binh)).status, 'present'); // dữ liệu của An còn nguyên
});

test('đúng trạng thái đang thấy thì ghi được; ghi nhận người sửa', async () => {
  const r = await att(binh, { status: 'late', expected: 'present' });
  assert.equal(r.status, 200);
  const c = await cell(an);
  assert.equal(c.status, 'late');
  assert.equal(c.by, 'binh');
  assert.ok(c.at);
});

test('xóa ô bằng dữ liệu cũ bị chặn; không gửi expected thì giữ hành vi cũ (ghi đè)', async () => {
  const stale = await att(an, { status: null, expected: 'present' }); // thực tế đang là late
  assert.equal(stale.status, 409);
  assert.equal((await cell(an)).status, 'late');
  const legacy = await att(an, { status: 'absent' }); // API cũ, không có expected
  assert.equal(legacy.status, 200);
  assert.equal((await cell(binh)).status, 'absent');
});

test('expected không hợp lệ bị từ chối', async () => {
  assert.equal((await att(an, { status: 'present', expected: 'bay' })).status, 400);
});

test('mỗi lần ghi thành công đều phát tin realtime theo lớp; bị từ chối thì không', async () => {
  published.length = 0;
  await att(an, { status: 'present', expected: 'absent' });
  assert.deepEqual(published.map((p) => [p.cid, p.payload.kind]), [[classId, 'attendance']]);
  published.length = 0;
  await att(binh, { status: 'late', expected: 'absent' }); // sai expected
  assert.equal(published.length, 0);
  await an.post(`/api/classes/${classId}/sessions/${session.id}/attendance/bulk`, { status: 'present' });
  assert.equal(published.at(-1).payload.kind, 'attendance');
});

test('bài tập: cùng cơ chế chặn ghi đè và ghi người sửa', async () => {
  const put = (c, body) => c.put(`/api/classes/${classId}/submissions`, { enrollment_id: e2, assignment_id: hw.id, ...body });
  assert.equal((await put(an, { status: 'submitted', expected: null, challenge: true })).status, 200);
  const r = await put(binh, { status: 'missing', expected: null });
  assert.equal(r.status, 409);
  assert.equal(r.body.current.status, 'submitted');
  assert.equal(r.body.current.challenge, true);
  assert.equal(published.at(-1).payload.kind, 'submissions');
  const sub = (await an.get(`/api/classes/${classId}/submissions`)).body.rows.find((x) => x.enrollment_id === e2).cells[hw.id];
  assert.equal(sub.by, 'an');
});

test('cấu hình realtime: không lộ khi chưa cấu hình, có kênh riêng theo lớp khi đã cấu hình', async () => {
  const saved = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_PUBLISHABLE_KEY, n1: process.env.NEXT_PUBLIC_SUPABASE_URL, n2: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    assert.equal((await an.get(`/api/classes/${classId}/realtime`)).body, null);
    process.env.SUPABASE_URL = 'https://abc.supabase.co/'; process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x';
    const cfg = (await an.get(`/api/classes/${classId}/realtime`)).body;
    assert.equal(cfg.url, 'https://abc.supabase.co');
    assert.match(cfg.channel, /^cls-\d+-[0-9a-f]{20}$/);
    assert.notEqual(cfg.channel, realtime.channelFor(classId + 1)); // mỗi lớp một kênh
    const anon = t.client();
    assert.equal((await anon.get(`/api/classes/${classId}/realtime`)).status, 401); // phải đăng nhập mới lấy được tên kênh
  } finally {
    const set = (k, v) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
    set('SUPABASE_URL', saved.u); set('SUPABASE_PUBLISHABLE_KEY', saved.k);
    set('NEXT_PUBLIC_SUPABASE_URL', saved.n1); set('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', saved.n2);
  }
});

test('xóa bản ghi cuối cùng của buổi/bài → quay về "chưa diễn ra/chưa thu"', async () => {
  const admin = await t.login('admin@x.com');
  const cid = (await admin.post('/api/classes', { code: 'RT.02', session_count: 2, hw_count: 1 })).body.id;
  await admin.post(`/api/classes/${cid}/students`, { student_code: 'Z1', full_name: 'HV Z' });
  const enr = (await admin.get(`/api/classes/${cid}/students`)).body[0].id;
  const ses = (await admin.get(`/api/classes/${cid}/sessions`)).body[0];
  const asg = (await admin.get(`/api/classes/${cid}/assignments`)).body.find((x) => x.kind === 'hw');
  const heldNow = async () => (await admin.get(`/api/classes/${cid}/sessions`)).body[0].held;
  const collectedNow = async () => (await admin.get(`/api/classes/${cid}/assignments`)).body.find((x) => x.kind === 'hw').collected;

  await admin.put(`/api/classes/${cid}/attendance`, { enrollment_id: enr, session_id: ses.id, status: 'present' });
  assert.equal(await heldNow(), true);
  await admin.put(`/api/classes/${cid}/attendance`, { enrollment_id: enr, session_id: ses.id, status: null });
  assert.equal(await heldNow(), false);

  await admin.put(`/api/classes/${cid}/submissions`, { enrollment_id: enr, assignment_id: asg.id, status: 'submitted' });
  assert.equal(await collectedNow(), true);
  await admin.put(`/api/classes/${cid}/submissions`, { enrollment_id: enr, assignment_id: asg.id, status: null });
  assert.equal(await collectedNow(), false);
});
