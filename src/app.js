const path = require('node:path');
const express = require('express');
const { attachUser, requireAuth, requireAdmin } = require('./auth');

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(attachUser(db));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/users', requireAuth, requireAdmin, require('./routes/users')(db));
  app.use('/api/classes', requireAuth, require('./routes/classes')(db));
  app.use('/api/classes/:classId', requireAuth, require('./routes/classData')(db));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy' }));

  const pub = path.join(__dirname, '..', 'public');
  app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
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
