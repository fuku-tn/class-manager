const { openDb } = require('./db');
const { createApp } = require('./create-app');

(async () => {
  const db = await openDb();
  const port = Number(process.env.PORT || 3000);
  createApp(db).listen(port, () => console.log(`Class Manager chạy tại http://localhost:${port} (Postgres/Supabase)`));
})().catch((e) => { console.error('Không khởi động được:', e.message); process.exit(1); });
