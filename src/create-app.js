const path = require('node:path');
const express = require('express');
const { attachUser, requireAuth, requireAdmin } = require('./auth');

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.VERCEL) app.set('trust proxy', 1); // sau proxy của Vercel: req.ip là IP khách thật
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(attachUser(db));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Chẩn đoán kết nối database: chỉ trả về LOẠI lỗi (không lộ chuỗi kết nối/mật khẩu). Chi tiết xem log máy chủ.
  app.get('/api/health/db', async (_req, res) => {
    try {
      await db.one('select 1 as ok');
      res.json({ ok: true });
    } catch (e) {
      const m = String(e.message);
      const reason = /Thiếu DATABASE_URL/.test(m) ? 'thiếu biến DATABASE_URL'
        : e.code === '28P01' || /password authentication/i.test(m) ? 'sai mật khẩu database'
        : /Tenant or user not found/i.test(m) ? 'sai tên người dùng/mã project trong chuỗi kết nối'
        : /Invalid URL|invalid connection string/i.test(m) ? 'DATABASE_URL không đúng định dạng (kiểm tra dấu ngoặc [ ], ký tự đặc biệt trong mật khẩu)'
        : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET/.test(m + (e.code || '')) ? 'không kết nối được tới máy chủ database'
        : /relation .* does not exist/i.test(m) ? 'chưa tạo bảng (chạy supabase/schema.sql)'
        : 'lỗi khác — xem Runtime Logs trên Vercel';
      console.error('health/db:', m);
      res.status(503).json({ ok: false, reason });
    }
  });
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/users', requireAuth, requireAdmin, require('./routes/users')(db));
  app.use('/api/classes', requireAuth, require('./routes/classes')(db));
  app.use('/api/classes/:classId', requireAuth, require('./routes/classData')(db));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy' }));

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  });
  return app;
}

module.exports = { createApp };
