// Header bảo mật dùng chung. Vercel phục vụ file tĩnh (public/) qua CDN nên KHÔNG đi qua Express:
// vercel.json phải có cùng nội dung (test tests/security-headers.test.js kiểm tra hai nơi khớp nhau).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // 'unsafe-inline' cho thuộc tính style (SVG, chiều rộng thanh tiến độ)
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co", // Supabase Realtime
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

module.exports = { CSP, HEADERS };
