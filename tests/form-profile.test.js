const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const fp = require('../src/services/formProfile');

test('làm gọn mục tiêu tham gia: 8 lựa chọn cố định thành nhãn ngắn, không lưu chữ tự do', () => {
  const raw = 'To improve my thinking skills (Nâng cao tư duy phân tích), To learn more about tools (Thành thạo công cụ), '
    + 'To obtain a certificate (Chứng chỉ chuyên môn), To improve my CV for career opportunities (Cải thiện CV/chuyển Job)';
  assert.deepEqual(fp.goals(raw), ['Tư duy phân tích', 'Thành thạo công cụ', 'Chứng chỉ', 'CV/chuyển việc']);
  assert.deepEqual(fp.goals('To support decision-making in my role (Quản lý và ra quyết định), To enhance my business knowledge (Nâng cao kiến thức kinh doanh)'),
    ['Ra quyết định', 'Kiến thức kinh doanh']);
  assert.deepEqual(fp.goals('To transition into a data/analytics-related role (Chuyển đổi ngành), To meet my company’s training requirements (Theo yêu cầu công ty)'),
    ['Chuyển ngành', 'Theo yêu cầu công ty']);
  assert.deepEqual(fp.goals('một điều gì đó rất riêng tư gõ tự do'), ['Khác']);
  assert.deepEqual(fp.goals(null), []);
});

test('làm gọn nguồn biết đến, phòng ban, kinh nghiệm, hình thức học', () => {
  assert.deepEqual(fp.sources('Social media (Facebook, Instagram, TikTok, LinkedIn...)'), ['Mạng xã hội']);
  assert.deepEqual(fp.sources('Facebook, Instagram, Zalo'), ['Mạng xã hội']);
  assert.deepEqual(fp.sources('Recommendation from friends (Người quen giới thiệu)'), ['Người quen giới thiệu']);
  assert.deepEqual(fp.sources('Through a company / organization requirement (Theo yêu cầu từ công ty / tổ chức)'), ['Công ty/tổ chức']);
  assert.deepEqual(fp.sources('Website (Tìm kiếm trên Google, Bing,...)'), ['Website']);
  assert.deepEqual(fp.sources('Tình cờ thấy trên đường'), ['Khác']);
  assert.equal(fp.vietnamese('Human Resources Department (Phòng Nhân sự)'), 'Phòng Nhân sự');
  assert.equal(fp.vietnamese('Kế toán'), 'Kế toán');
  assert.equal(fp.vietnamese('null'), null);
  assert.deepEqual([1, 2.5, 5, 10, 12, 'null', ''].map(fp.experience), ['0–1 năm', '2–3 năm', '4–5 năm', '6–10 năm', 'Trên 10 năm', null, null]);
  assert.deepEqual(['Training Live Online', 'Training Offline', 'Hybrid Training'].map(fp.delivery), ['Online', 'Offline', 'Hybrid']);
});

test('mã băm email/SĐT: chuẩn hóa như Apps Script (email thường, SĐT 9 số cuối)', () => {
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  assert.equal(fp.hashEmail('  AN@Example.COM '), sha('an@example.com'));
  assert.equal(fp.hashEmail('không phải email'), null);
  const p = fp.hashPhone('0901 234 567');
  assert.equal(p, sha('901234567'));
  assert.equal(fp.hashPhone('901234567'), p);     // Excel làm mất số 0 đầu
  assert.equal(fp.hashPhone('+84 901.234.567'), p);
  assert.equal(fp.hashPhone('123'), null);
});

test('Apps Script: chỉ các cột FORM cho phép; không có cột cá nhân; email/SĐT chỉ được băm', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script', 'sync-transactions.gs'), 'utf8');
  const block = /const FORM_MAP = \{([\s\S]*?)\};/.exec(src)[1];
  const pairs = [...block.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
  // tên chuẩn gửi sang = đúng FORM_COLUMNS của máy chủ (trừ hai cột mã băm)
  assert.deepEqual(pairs.map((p) => p[1]).sort(), fp.FORM_COLUMNS.filter((c) => !/HASH$/.test(c)).sort());
  const keys = pairs.map((p) => p[0]).join('|');
  for (const forbidden of ['HỌ VÀ TÊN', 'GIỚI TÍNH', 'NGÀY SINH', 'ĐỊA CHỈ', 'KỲ VỌNG', 'TÊN CÔNG TY', 'EMAIL', 'SỐ ĐIỆN THOẠI']) {
    assert.ok(!keys.includes(forbidden), `FORM_MAP không được chứa ${forbidden}`);
  }
  assert.match(src, /const FORM_HASHED = \{ 'EMAIL': 'EMAIL HASH', 'SỐ ĐIỆN THOẠI': 'PHONE HASH' \};/);
  assert.match(src, /if \(h === 'EMAIL'\) return hashEmail_\(v\);/);
  assert.match(src, /if \(h === 'SỐ ĐIỆN THOẠI'\) return hashPhone_\(v\);/);
});
