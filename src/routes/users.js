const express = require('express');
const { hashPassword } = require('../auth');

module.exports = (db) => {
  const router = express.Router(); // đã được bảo vệ requireAdmin ở app.js

  router.get('/', async (_req, res) => {
    const users = await db.all('select id, email, name, role, active, can_remind, can_view_upcoming, can_view_potential, can_voucher from users order by name');
    const links = await db.all('select class_id, user_id from class_instructors');
    res.json(users.map((u) => ({ ...u, class_ids: links.filter((l) => l.user_id === u.id).map((l) => l.class_id) })));
  });

  router.post('/', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    const role = ['admin', 'guest'].includes(req.body.role) ? req.body.role : 'instructor';
    if (!email.includes('@') || !name) return res.status(400).json({ error: 'Cần email hợp lệ và họ tên' });
    if (password.length < 10) return res.status(400).json({ error: 'Mật khẩu tối thiểu 10 ký tự' });
    if (await db.one('select 1 as x from users where email = $1', [email])) return res.status(409).json({ error: 'Email đã tồn tại' });
    const r = await db.one('insert into users (email, name, password_hash, role) values ($1, $2, $3, $4) returning id',
      [email, name, hashPassword(password), role]);
    res.status(201).json({ id: r.id, email, name, role });
  });

  router.put('/:id/classes', async (req, res) => {
    const id = Number(req.params.id);
    const ids = Array.isArray(req.body.class_ids) ? req.body.class_ids.map(Number).filter(Number.isSafeInteger) : null;
    if (!ids) return res.status(400).json({ error: 'class_ids phải là mảng' });
    if (!Number.isSafeInteger(id) || !await db.one('select 1 as x from users where id = $1', [id])) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    await db.tx(async (t) => {
      await t.run('delete from class_instructors where user_id = $1', [id]);
      await t.run('insert into class_instructors (class_id, user_id) select id, $2::bigint from classes where id = any($1::bigint[])', [ids, id]);
    });
    res.json({ ok: true });
  });

  // Bật/tắt quyền dùng tin nhắn nhắc bài + chụp ảnh (admin luôn có quyền, không cần bật).
  router.put('/:id/remind', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || !await db.one('select 1 as x from users where id = $1', [id])) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    await db.run('update users set can_remind = $1 where id = $2', [!!req.body.can_remind, id]);
    res.json({ ok: true });
  });

  // Bật/tắt quyền xem danh sách Potential (admin luôn xem được).
  router.put('/:id/view-potential', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || !await db.one('select 1 as x from users where id = $1', [id])) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    await db.run('update users set can_view_potential = $1 where id = $2', [!!req.body.can_view_potential, id]);
    res.json({ ok: true });
  });

  // Bật/tắt quyền xem/sửa voucher Google Maps của học viên (admin luôn có).
  router.put('/:id/voucher', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || !await db.one('select 1 as x from users where id = $1', [id])) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    await db.run('update users set can_voucher = $1 where id = $2', [!!req.body.can_voucher, id]);
    res.json({ ok: true });
  });

  // Bật/tắt quyền xem (chỉ xem) mọi lớp chưa diễn ra.
  router.put('/:id/view-upcoming', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || !await db.one('select 1 as x from users where id = $1', [id])) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    await db.run('update users set can_view_upcoming = $1 where id = $2', [!!req.body.can_view_upcoming, id]);
    res.json({ ok: true });
  });

  router.put('/:id/active', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id)) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (id === req.user.id) return res.status(400).json({ error: 'Không thể tự khóa tài khoản của mình' });
    await db.run('update users set active = $1 where id = $2', [!!req.body.active, id]);
    if (!req.body.active) await db.run('delete from auth_sessions where user_id = $1', [id]);
    res.json({ ok: true });
  });

  return router;
};
