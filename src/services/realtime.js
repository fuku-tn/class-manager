// Đẩy tin "có thay đổi" tới các trình duyệt đang mở cùng lớp qua Supabase Realtime (Broadcast).
// Tin chỉ là tín hiệu (loại dữ liệu), KHÔNG chứa tên/trạng thái học viên: trình duyệt nhận tin rồi tự tải lại
// qua API có đăng nhập. Nhờ vậy kênh công khai không lộ dữ liệu.
const crypto = require('node:crypto');

const supabaseUrl = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const publicKey = () => process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

function enabled() { return !!(supabaseUrl() && publicKey()); }

// Tên kênh khó đoán, suy ra từ bí mật của server (DATABASE_URL) + mã lớp; chỉ người có quyền vào lớp mới lấy được.
function channelFor(classId) {
  const secret = process.env.REALTIME_SECRET || process.env.DATABASE_URL || 'dev-secret';
  return `cls-${classId}-${crypto.createHmac('sha256', secret).update(`class:${classId}`).digest('hex').slice(0, 20)}`;
}

// Cấu hình công khai cho trình duyệt (URL + khóa publishable vốn được thiết kế để công khai).
function clientConfig(classId) {
  if (!enabled()) return null;
  return { url: supabaseUrl(), key: publicKey(), channel: channelFor(classId) };
}

// Gửi tin; không bao giờ ném lỗi (realtime hỏng thì app vẫn chạy, trình duyệt tự đồng bộ bằng dự phòng).
async function publish(classId, payload) {
  if (!enabled()) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1200);
  try {
    const res = await fetch(`${supabaseUrl()}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: publicKey(), Authorization: `Bearer ${publicKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: channelFor(classId), event: 'changed', payload, private: false }] }),
      signal: ctl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { publish, clientConfig, channelFor, enabled };
