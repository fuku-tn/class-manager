const express = require('express');
const {
  verifyPassword, hashPassword, createSession, setSessionCookie, clearSessionCookie, requireAuth, requireAdmin, sha256,
} = require('../auth');

// Giới hạn đăng nhập sai LƯU TRONG DATABASE (serverless không có bộ nhớ chung): 8 lần sai / 15 phút theo IP+email,
// và 30 lần sai / 15 phút cho riêng một IP (dò nhiều tài khoản). Đăng nhập đúng thì bộ đếm của cặp IP+email bắt đầu lại.
const MAX_ATTEMPTS = 8;
const MAX_PER_IP = 30;
const MIN_PASSWORD = 10;

function passwordProblem(next, current, email) {
  const pw = String(next ?? '');
  if (pw.length < MIN_PASSWORD) return `Mật khẩu mới tối thiểu ${MIN_PASSWORD} ký tự`;
  if (pw.length > 200) return 'Mật khẩu quá dài';
  if (pw === current) return 'Mật khẩu mới phải khác mật khẩu hiện tại';
  if (/^(.)\1+$/.test(pw)) return 'Mật khẩu quá đơn giản';
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 3 && pw.toLowerCase().includes(local)) return 'Mật khẩu không được chứa tên đăng nhập (email)';
  return null;
}

module.exports = (db) => {
  const router = express.Router();
  const ua = (req) => String(req.get('user-agent') || '').slice(0, 200);
  const logEvent = (req, event, { email = null, userId = null } = {}) =>
    db.run('insert into auth_events (event, email, user_id, ip, user_agent) values ($1, $2, $3, $4, $5)',
      [event, email ? String(email).slice(0, 120) : null, userId, req.ip ?? null, ua(req)]).catch(() => {});

  // Số lần sai gần đây của cặp IP+email (từ lần đăng nhập đúng gần nhất) và của riêng IP.
  async function recentFails(email, ip) {
    return db.one(
      `select
         (select count(*)::int from auth_events
           where event in ('login_fail','password_fail') and email = $1 and ip = $2
             and at > greatest(now() - interval '15 minutes',
                  coalesce((select max(at) from auth_events where event = 'login_ok' and email = $1 and ip = $2), '-infinity'::timestamptz))) as by_key,
         (select count(*)::int from auth_events
           where event in ('login_fail','password_fail') and ip = $2 and at > now() - interval '15 minutes') as by_ip`,
      [email, ip ?? '']);
  }
  const locked = async (email, ip) => {
    const r = await recentFails(email, ip);
    return r.by_key >= MAX_ATTEMPTS || r.by_ip >= MAX_PER_IP;
  };

  router.post('/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (await locked(email, req.ip)) {
      await logEvent(req, 'locked', { email });
      return res.status(429).json({ error: 'Đăng nhập sai quá nhiều lần, thử lại sau 15 phút' });
    }
    const user = await db.one('select * from users where email = $1 and active', [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      await logEvent(req, 'login_fail', { email, userId: user?.id ?? null });
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    await logEvent(req, 'login_ok', { email, userId: user.id });
    if (Math.random() < 0.02) db.run("delete from auth_events where at < now() - interval '90 days'").catch(() => {}); // giữ 90 ngày
    setSessionCookie(res, await createSession(db, user.id));
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, can_remind: user.can_remind === true, can_view_potential: user.can_view_potential === true });
  });

  router.post('/logout', async (req, res) => {
    if (req.sessionToken) await db.run('delete from auth_sessions where token_hash = $1', [sha256(req.sessionToken)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => res.json(req.user));

  // Tự đổi mật khẩu: kiểm mật khẩu hiện tại (sai nhiều lần cũng bị khóa tạm), hủy mọi phiên khác của tài khoản này.
  router.post('/password', requireAuth, async (req, res) => {
    const current = String(req.body.current ?? '');
    const next = String(req.body.next ?? '');
    const user = await db.one('select * from users where id = $1', [req.user.id]);
    if (await locked(user.email, req.ip)) return res.status(429).json({ error: 'Nhập sai quá nhiều lần, thử lại sau 15 phút' });
    if (!verifyPassword(current, user.password_hash)) {
      await logEvent(req, 'password_fail', { email: user.email, userId: user.id });
      return res.status(400).json({ error: 'Mật khẩu hiện tại sai' });
    }
    const problem = passwordProblem(next, current, user.email);
    if (problem) return res.status(400).json({ error: problem });
    await db.tx(async (t) => {
      await t.run('update users set password_hash = $1 where id = $2', [hashPassword(next), user.id]);
      await t.run('delete from auth_sessions where user_id = $1 and token_hash <> $2', [user.id, sha256(req.sessionToken ?? '')]);
    });
    await logEvent(req, 'password_changed', { email: user.email, userId: user.id });
    res.json({ ok: true });
  });

  // Nhật ký đăng nhập (admin): 200 sự kiện gần nhất.
  router.get('/events', requireAuth, requireAdmin, async (req, res) => {
    const rows = await db.all(
      `select e.id, e.at, e.event, e.email, e.ip, e.user_agent, u.name as user_name
         from auth_events e left join users u on u.id = e.user_id order by e.id desc limit 200`);
    res.json(rows);
  });

  return router;
};
module.exports.MIN_PASSWORD = MIN_PASSWORD;
