// Dùng: npm run create-admin -- email@vd.com "Họ tên" matkhau
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/auth');

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password || password.length < 8) {
  console.error('Dùng: npm run create-admin -- <email> "<Họ tên>" <mật khẩu >= 8 ký tự>');
  process.exit(1);
}
(async () => {
  const db = await openDb();
  await db.run(`insert into users (email, name, password_hash, role) values ($1, $2, $3, 'admin')
    on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash, role = 'admin', active = true`,
  [email.toLowerCase(), name, hashPassword(password)]);
  console.log(`Đã tạo/cập nhật admin ${email}`);
  await db.close();
})().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
