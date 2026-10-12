const express = require('express');
const {
  verifyPassword, hashPassword, createSession, setSessionCookie, clearSessionCookie, requireAuth, sha256,
} = require('../auth');

// Giới hạn đăng nhập sai theo IP+email (trong bộ nhớ, đủ cho 1 server).
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function tooMany(key) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) return false;
  return rec.count >= MAX_ATTEMPTS;
}
function fail(key) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else rec.count++;
}

module.exports = (db) => {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const key = `${req.ip}|${email}`;
    if (tooMany(key)) return res.status(429).json({ error: 'Đăng nhập sai quá nhiều lần, thử lại sau 15 phút' });
    const user = await db.one('select * from users where email = $1 and active', [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      fail(key);
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    attempts.delete(key);
    setSessionCookie(res, await createSession(db, user.id));
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, can_remind: user.can_remind === true });
  });

  router.post('/logout', async (req, res) => {
    if (req.sessionToken) await db.run('delete from auth_sessions where token_hash = $1', [sha256(req.sessionToken)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => res.json(req.user));

  router.post('/password', requireAuth, async (req, res) => {
    const { current, next } = req.body;
    if (!next || String(next).length < 8) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 8 ký tự' });
    const user = await db.one('select * from users where id = $1', [req.user.id]);
    if (!verifyPassword(String(current || ''), user.password_hash)) return res.status(400).json({ error: 'Mật khẩu hiện tại sai' });
    await db.run('update users set password_hash = $1 where id = $2', [hashPassword(String(next)), user.id]);
    res.json({ ok: true });
  });

  return router;
};
