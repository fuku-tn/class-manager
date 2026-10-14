const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const { openDb } = require('../src/db');
const { exportAll, importAll } = require('../src/services/backup');

let t, admin, classId, backup;

before(async () => {
  t = await startTestApp();
  await t.addUser('admin@x.com', 'admin');
  admin = await t.login('admin@x.com');
  classId = (await admin.post('/api/classes', { code: 'BK.01', session_count: 3, hw_count: 2 })).body.id;
  for (const [c, n] of [['P.1', 'An'], ['P.2', 'Bình']]) await admin.post(`/api/classes/${classId}/students`, { student_code: c, full_name: n });
  const st = (await admin.get(`/api/classes/${classId}/students`)).body;
  const ses = (await admin.get(`/api/classes/${classId}/sessions`)).body;
  await admin.put(`/api/classes/${classId}/attendance`, { enrollment_id: st[0].id, session_id: ses[0].id, status: 'present', note: 'đúng giờ' });
  await t.db.run("insert into sync_runs (source, ok, summary) values ('google-sheet', true, $1::jsonb)", [JSON.stringify({ a: 1, nested: { b: [1, 2] } })]);
  await t.db.run("insert into homework_scores (enrollment_id, assignment_id, score, module) select $1, id, 8.75, 'Data Modeling' from assignments where class_id = $2 and kind = 'hw' and seq = 1", [st[0].id, classId]);
  backup = await exportAll(t.db);
});
after(async () => { await t.close(); });

test('sao lưu: đủ bảng theo thứ tự khóa ngoại, đếm đúng, không có phiên đăng nhập', () => {
  const { manifest, tables } = backup;
  assert.equal(manifest.app, 'class-manager');
  assert.ok(!manifest.order.includes('auth_sessions'));
  const pos = (n) => manifest.order.indexOf(n);
  assert.ok(pos('classes') < pos('enrollments') && pos('students') < pos('enrollments') && pos('enrollments') < pos('attendance') && pos('sessions') < pos('attendance'));
  assert.equal(manifest.counts.enrollments, 2);
  assert.equal(tables.attendance.length, 1);
  for (const n of manifest.order) assert.equal(tables[n].length, manifest.counts[n], n);
});

test('khôi phục vào database trống: đúng từng bảng, giữ id, jsonb/số thập phân/ngày giờ; bản ghi mới không trùng id', async () => {
  const db2 = await openDb({ memory: true });
  try {
    const r = await importAll(db2, backup);
    assert.equal(r.restored.enrollments, 2);
    for (const n of backup.manifest.order) {
      assert.equal((await db2.one(`select count(*)::int as n from "${n}"`)).n, backup.manifest.counts[n], n);
    }
    const a1 = await db2.one('select status, note, updated_at from attendance');
    assert.deepEqual([a1.status, a1.note, a1.updated_at], [backup.tables.attendance[0].status, 'đúng giờ', backup.tables.attendance[0].updated_at]);
    assert.deepEqual((await db2.one('select summary from sync_runs')).summary, { a: 1, nested: { b: [1, 2] } });
    assert.equal(Number((await db2.one('select score from homework_scores')).score), 8.75);
    const u = await db2.one("select password_hash from users where email = 'admin@x.com'");
    assert.equal(u.password_hash, backup.tables.users[0].password_hash);   // đăng nhập lại được bằng mật khẩu cũ
    const maxId = (await db2.one('select max(id)::int as m from students')).m;
    const fresh = await db2.one("insert into students (student_code, full_name) values ('P.9', 'Mới') returning id");
    assert.ok(fresh.id > maxId);
  } finally { await db2.close(); }
});

test('an toàn: từ chối khôi phục vào database đã có dữ liệu; chạy thử không ghi gì; file lạ bị từ chối', async () => {
  await assert.rejects(importAll(t.db, backup), /đã có dữ liệu/);
  const db3 = await openDb({ memory: true });
  try {
    const r = await importAll(db3, backup, { dryRun: true });
    assert.equal(r.dry_run, true);
    assert.equal((await db3.one('select count(*)::int as n from enrollments')).n, 0);
    await assert.rejects(importAll(db3, { manifest: { app: 'khac' }, tables: {} }), /không phải bản sao lưu/i);
  } finally { await db3.close(); }
});

test('CSV: ghi rồi đọc lại khớp hoàn toàn (NULL khác chuỗi rỗng, dấu phẩy/ngoặc kép/xuống dòng, jsonb, số, true/false) và khôi phục được', async () => {
  const { toCsv, parseCsv, manifestToCsv, manifestFromCsv } = require('../src/services/backup');
  const rows = [{ a: null, b: '', c: 'Nguyễn "Tý", lớp\nB', d: 12, e: true, f: { x: [1, 'y'] }, g: '8.75' }];
  const back = parseCsv(toCsv(['a', 'b', 'c', 'd', 'e', 'f', 'g'], rows)).rows[0];
  assert.deepEqual(back, { a: null, b: '', c: 'Nguyễn "Tý", lớp\nB', d: '12', e: 'true', f: '{"x":[1,"y"]}', g: '8.75' });
  assert.ok(toCsv(['a'], []).startsWith('\ufeff'));                       // BOM để Excel đọc đúng tiếng Việt
  const m2 = manifestFromCsv(manifestToCsv(backup.manifest));
  assert.deepEqual([m2.app, m2.format, m2.order, m2.counts], [backup.manifest.app, backup.manifest.format, backup.manifest.order, backup.manifest.counts]);

  // vòng đầy đủ: sao lưu → CSV → đọc → khôi phục vào DB trống
  await t.db.run("update students set email = '', phone = null where student_code = 'P.2'");
  await t.db.run("update students set full_name = $1 where student_code = 'P.1'", ['An "Út", B\nC']);
  const bk = await exportAll(t.db);
  const fromCsv = Object.fromEntries(bk.manifest.order.map((n) => [n, parseCsv(toCsv(bk.columns[n], bk.tables[n])).rows]));
  const db4 = await openDb({ memory: true });
  try {
    await importAll(db4, { manifest: manifestFromCsv(manifestToCsv(bk.manifest)), tables: fromCsv });
    for (const n of bk.manifest.order) assert.equal((await db4.one(`select count(*)::int as n from "${n}"`)).n, bk.manifest.counts[n], n);
    const p2 = await db4.one("select email, phone from students where student_code = 'P.2'");
    assert.deepEqual(p2, { email: '', phone: null });
    assert.equal((await db4.one("select full_name from students where student_code = 'P.1'")).full_name, 'An "Út", B\nC');
    assert.deepEqual((await db4.one('select summary from sync_runs')).summary, { a: 1, nested: { b: [1, 2] } });
    assert.equal(Number((await db4.one('select score from homework_scores')).score), 8.75);
    const a = await db4.one('select status, updated_at from attendance');
    assert.equal(a.updated_at, bk.tables.attendance[0].updated_at);
  } finally { await db4.close(); }
});
