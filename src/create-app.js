const path = require('node:path');
const express = require('express');
const { attachUser, requireAuth, requireAdmin } = require('./auth');
const { describeDbError } = require('./db');
const { HEADERS } = require('./security-headers');

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.VERCEL) app.set('trust proxy', 1); // sau proxy của Vercel: req.ip là IP khách thật
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
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
      const reason = describeDbError(e) ?? 'lỗi khác — xem Runtime Logs trên Vercel';
      console.error('health/db:', m);
      res.status(503).json({ ok: false, reason });
    }
  });
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/users', requireAuth, requireAdmin, require('./routes/users')(db));
  app.use('/api/overview', requireAuth, require('./routes/overview')(db));
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
    // Lỗi cấu hình/kết nối database: báo rõ để người triển khai tự sửa (thông điệp không chứa bí mật).
    const dbReason = describeDbError(err);
    if (dbReason) return res.status(503).json({ error: `Không kết nối được cơ sở dữ liệu: ${dbReason}` });
    res.status(500).json({ error: 'Lỗi máy chủ' });
  });
  return app;
}

module.exports = { createApp };
