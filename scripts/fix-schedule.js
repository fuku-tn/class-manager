// Áp quy tắc lịch giảng dạy (khớp ngày khai giảng + giảng viên mặc định) lên dữ liệu hiện có, không cần chờ Sheet đồng bộ.
// Dùng: npm run fix-schedule
const { openDb } = require('../src/db');
const { normalizeSchedule } = require('../src/services/scheduleRules');

(async () => {
  const db = await openDb();
  try {
    console.log(await db.tx((t) => normalizeSchedule(t)));
  } finally { await db.close?.(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
