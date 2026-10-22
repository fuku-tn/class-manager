// Lớp truy cập Postgres. Hai chế độ cùng giao diện:
//  - openDb()                  → Supabase/Postgres qua DATABASE_URL (pg.Pool)
//  - openDb({ memory: true })  → Postgres trong bộ nhớ (PGlite) cho test, không đụng dữ liệu thật
// Giao diện: db.all(sql, params) · db.one(sql, params) · db.run(sql, params) → số dòng · db.tx(async (t) => …)
// SQL dùng $1, $2… Ngày (date/timestamptz) luôn trả về chuỗi, không phải Date.
const fs = require('node:fs');
const path = require('node:path');
const { Pool, types } = require('pg');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const DATE_OID = 1082, TIMESTAMPTZ_OID = 1184, INT8_OID = 20;

function wrap(exec) {
  return {
    all: async (sql, params = []) => (await exec(sql, params)).rows,
    one: async (sql, params = []) => (await exec(sql, params)).rows[0],
    run: async (sql, params = []) => {
      const r = await exec(sql, params);
      return r.rowCount ?? r.affectedRows ?? 0;
    },
  };
}

async function openDb({ memory = false, url = process.env.DATABASE_URL } = {}) {
  if (memory) {
    const { PGlite } = require('@electric-sql/pglite'); // devDependency
    const lite = new PGlite({ parsers: { [DATE_OID]: (v) => v, [TIMESTAMPTZ_OID]: (v) => v } });
    await lite.exec(SCHEMA);
    return {
      ...wrap((sql, p) => lite.query(sql, p)),
      tx: (fn) => lite.transaction((t) => fn(wrap((sql, p) => t.query(sql, p)))),
      close: () => lite.close(),
    };
  }

  if (!url) throw new Error('Thiếu DATABASE_URL (xem Documents/3-ky-thuat/supabase-guide.md)');
  // Chịu được lỗi dán cấu hình: khoảng trắng, dấu nháy bao quanh, tên biến bị dán kèm, tham số kiểu Prisma.
  url = url.trim().replace(/^DATABASE_URL\s*=\s*/, '').replace(/^["']+|["']+$/g, '');
  try { const u = new URL(url); u.searchParams.delete('pgbouncer'); u.searchParams.delete('connection_limit'); url = u.toString(); } catch { /* để pg báo lỗi rõ */ }
  types.setTypeParser(DATE_OID, (v) => v);
  types.setTypeParser(TIMESTAMPTZ_OID, (v) => v);
  types.setTypeParser(INT8_OID, (v) => Number(v));
  const local = /localhost|127\.0\.0\.1/.test(url);
  // Serverless (Vercel): mỗi instance giữ ít kết nối; dùng Supabase Transaction pooler (cổng 6543) để không cạn kết nối.
  const pool = new Pool({ connectionString: url, max: process.env.VERCEL ? 3 : 5, idleTimeoutMillis: 10000, ssl: local ? false : { rejectUnauthorized: false } });
  pool.on('error', (e) => console.error('Lỗi kết nối Postgres:', e.message));
  await pool.query('select 1'); // báo lỗi sớm nếu sai URL/mật khẩu
  return {
    ...wrap((sql, p) => pool.query(sql, p)),
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap((sql, p) => client.query(sql, p)));
        await client.query('commit');
        return result;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// Bản "lười": trả về ngay đối tượng db dùng được, kết nối thật được mở ở lần gọi đầu.
// Cần cho môi trường serverless nơi module phải xuất ra app đồng bộ (src/index.js).
function openDbLazy(options) {
  let ready = null;
  const get = () => (ready ??= openDb(options).catch((e) => { ready = null; throw e; })); // lỗi thì lần sau thử lại
  return {
    all: async (...a) => (await get()).all(...a),
    one: async (...a) => (await get()).one(...a),
    run: async (...a) => (await get()).run(...a),
    tx: async (...a) => (await get()).tx(...a),
    close: async () => { if (ready) await (await ready).close(); },
  };
}

// Phân loại lỗi kết nối/cấu hình database thành thông điệp tiếng Việt an toàn (không chứa chuỗi kết nối).
// Trả về null nếu không phải lỗi kết nối/cấu hình.
function describeDbError(e) {
  const m = String(e?.message ?? '');
  const code = String(e?.code ?? '');
  if (/Thiếu DATABASE_URL/.test(m)) return 'thiếu biến DATABASE_URL trên máy chủ';
  if (code === '28P01' || /password authentication/i.test(m)) return 'sai mật khẩu database';
  if (/Tenant or user not found/i.test(m)) return 'sai tên người dùng/mã project trong chuỗi kết nối';
  if (/Invalid URL|invalid connection string/i.test(m)) return 'DATABASE_URL không đúng định dạng (kiểm tra dấu ngoặc [ ] và ký tự đặc biệt trong mật khẩu)';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN/.test(m + code)) return 'không kết nối được tới máy chủ database';
  if (code === '42P01' || /relation .* does not exist/i.test(m)) return 'chưa tạo bảng trong database (chạy supabase/schema.sql)';
  if (/too many (clients|connections)|remaining connection slots|max client conn|max clients reached|EMAXCONN/i.test(m + code)) return 'database hết kết nối (dùng Transaction pooler, cổng 6543)';
  return null;
}

module.exports = { openDb, openDbLazy, describeDbError };
