const { openDb } = require('../src/db');
const { createApp } = require('../src/create-app');
const { hashPassword } = require('../src/auth');

// Khởi động app với DB trong bộ nhớ; trả về client có cookie riêng cho mỗi người dùng.
async function startTestApp() {
  const db = await openDb({ memory: true });
  const server = await new Promise((resolve) => { const s = createApp(db).listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  function client() {
    let cookie = '';
    const call = async (method, url, body) => {
      const res = await fetch(base + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      let json = null;
      try { json = await res.json(); } catch { /* không có body */ }
      return { status: res.status, body: json };
    };
    // Gửi nội dung file thô (octet-stream), dùng cho /api/import.
    const upload = async (url, buf) => {
      const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(cookie ? { Cookie: cookie } : {}) }, body: buf });
      let json = null;
      try { json = await res.json(); } catch { /* không có body */ }
      return { status: res.status, body: json };
    };
    return {
      upload,
      get: (u) => call('GET', u), post: (u, b) => call('POST', u, b ?? {}),
      put: (u, b) => call('PUT', u, b ?? {}), del: (u, b) => call('DELETE', u, b),
    };
  }

  async function addUser(email, role = 'instructor', password = 'password123') {
    const r = await db.one('insert into users (email, name, password_hash, role) values ($1, $2, $3, $4) returning id',
      [email, email.split('@')[0], hashPassword(password), role]);
    return r.id;
  }

  async function login(email, password = 'password123') {
    const c = client();
    const r = await c.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login thất bại: ${r.status}`);
    return c;
  }

  return { db, base, client, addUser, login, close: async () => { server.close(); await db.close(); } };
}

module.exports = { startTestApp };
