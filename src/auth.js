const crypto = require('node:crypto');

const SESSION_DAYS = 7;
const COOKIE = 'sid';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.run('insert into auth_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [sha256(token), userId, expires]);
  return token;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Gắn req.user nếu cookie hợp lệ.
function attachUser(db) {
  return async (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    req.sessionToken = token;
    try {
      if (token) {
        const row = await db.one(
          `select u.id, u.email, u.name, u.role from auth_sessions s
           join users u on u.id = s.user_id
           where s.token_hash = $1 and s.expires_at > now() and u.active`, [sha256(token)]);
        if (row) req.user = { ...row };
      }
      next();
    } catch (e) { next(e); }
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Cần quyền admin' });
  next();
}

// Kiểm tra quyền truy cập lớp :classId (admin xem tất cả, giảng viên chỉ lớp được phân công).
function requireClassAccess(db) {
  return async (req, res, next) => {
    const classId = Number(req.params.classId);
    if (!Number.isSafeInteger(classId)) return res.status(404).json({ error: 'Không tìm thấy lớp' });
    const cls = await db.one('select * from classes where id = $1', [classId]);
    if (!cls) return res.status(404).json({ error: 'Không tìm thấy lớp' });
    if (req.user.role !== 'admin') {
      const ok = await db.one('select 1 as x from class_instructors where class_id = $1 and user_id = $2', [classId, req.user.id]);
      if (!ok) return res.status(403).json({ error: 'Bạn không được phân công lớp này' });
    }
    req.cls = { ...cls };
    next();
  };
}

module.exports = {
  hashPassword, verifyPassword, createSession, setSessionCookie, clearSessionCookie,
  attachUser, requireAuth, requireAdmin, requireClassAccess, sha256,
};
