// (Công cụ cũ, chỉ dùng một lần) Sao chép dữ liệu từ bản SQLite cũ (legacy/app.sqlite.db) lên Postgres/Supabase.
// Dùng: đặt DATABASE_URL (trong .env hoặc biến môi trường) rồi chạy `npm run migrate-pg`.
// Đã chạy schema (supabase/schema.sql) trước. Script XÓA dữ liệu cũ trong các bảng đích rồi nạp lại,
// nên chạy lại bao nhiêu lần cũng cho cùng kết quả — chỉ dùng khi Postgres đích chưa có dữ liệu thật riêng.
const { Client } = require('pg');
const { DatabaseSync } = require('node:sqlite');
const SQLITE_FILE = process.env.SQLITE_PATH || require('node:path').join(__dirname, '..', 'legacy', 'app.sqlite.db');

const url = process.env.DATABASE_URL;
if (!url) { console.error('Thiếu DATABASE_URL (xem Documents/supabase-guide.md)'); process.exit(1); }

// Thứ tự cha → con. `bool` = cột 0/1 trong SQLite cần đổi sang boolean.
const TABLES = [
  ['users', ['id', 'email', 'name', 'password_hash', 'role', 'active', 'created_at'], ['active']],
  ['classes', ['id', 'code', 'name', 'phase', 'start_date', 'status', 'created_at'], []],
  ['class_instructors', ['class_id', 'user_id'], []],
  ['students', ['id', 'student_code', 'full_name', 'email', 'phone', 'created_at'], []],
  ['enrollments', ['id', 'class_id', 'student_id', 'customer_id', 'mode', 'course_status', 'certificate_status', 'form', 'note', 'created_at'], []],
  ['sessions', ['id', 'class_id', 'session_no', 'title', 'session_date', 'held'], ['held']],
  ['attendance', ['id', 'enrollment_id', 'session_id', 'status', 'note', 'updated_at'], []],
  ['assignments', ['id', 'class_id', 'kind', 'seq', 'title', 'due_date', 'collected'], ['collected']],
  ['submissions', ['id', 'enrollment_id', 'assignment_id', 'status', 'challenge', 'note', 'updated_at'], ['challenge']],
];
const HAS_IDENTITY = new Set(['users', 'classes', 'students', 'enrollments', 'sessions', 'attendance', 'assignments', 'submissions']);

(async () => {
  const sqlite = new DatabaseSync(SQLITE_FILE);
  const pg = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await pg.connect();
  try {
    await pg.query('begin');
    await pg.query(`truncate ${TABLES.map(([t]) => t).join(', ')} restart identity cascade`);
    for (const [table, cols, bools] of TABLES) {
      const rows = sqlite.prepare(`select ${cols.join(', ')} from ${table}`).all();
      const sql = `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`;
      for (const r of rows) await pg.query(sql, cols.map((c) => (bools.includes(c) ? !!r[c] : r[c] ?? null)));
      if (HAS_IDENTITY.has(table))
        await pg.query(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${table}), 0) + 1, false)`);
      console.log(`${table.padEnd(18)} ${rows.length} dòng`);
    }
    await pg.query('commit');
    console.log('Xong. Mở Supabase → Table Editor để xem.');
  } catch (e) {
    await pg.query('rollback');
    console.error('Lỗi, đã hoàn tác:', e.message);
    process.exitCode = 1;
  } finally {
    await pg.end();
  }
})();
