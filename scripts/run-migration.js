// Chạy một file .sql lên database (theo DATABASE_URL). Dùng: node scripts/run-migration.js supabase/migrations/<file>.sql
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const file = process.argv[2];
if (!file) { console.error('Dùng: node scripts/run-migration.js <file.sql>'); process.exit(1); }
const url = (process.env.DATABASE_URL || '').trim().replace(/^["']+|["']+$/g, '');
if (!url) { console.error('Thiếu DATABASE_URL'); process.exit(1); }
(async () => {
  const c = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('begin');
    await c.query(fs.readFileSync(path.resolve(file), 'utf8'));
    await c.query('commit');
    console.log('Đã chạy:', file);
  } catch (e) {
    await c.query('rollback').catch(() => {});
    console.error('Lỗi, đã hoàn tác:', e.message);
    process.exitCode = 1;
  } finally { await c.end(); }
})();
