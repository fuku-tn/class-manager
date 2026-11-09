// Gọi API JSON; ném Error(message tiếng Việt từ server) khi lỗi.
export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* không có body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Lỗi ${res.status}`);
    err.status = res.status;
    err.data = data; // phần thân lỗi (vd 409 kèm giá trị hiện tại của ô)
    throw err;
  }
  return data;
}
// Tải file thô lên (octet-stream) — dùng cho nhập Excel. Trả JSON hoặc ném Error(message tiếng Việt).
export async function upload(url, file) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, credentials: 'same-origin' });
  let data = null;
  try { data = await res.json(); } catch { /* không có body */ }
  if (!res.ok) {
    const msg = res.status === 413 ? 'File quá lớn (tối đa 4MB)' : (data?.error || `Lỗi ${res.status}`);
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data;
}
// Tải trước (prefetch): rê chuột/chạm vào tab thì gọi API của tab đó NGAY, tới lúc bấm thường đã có dữ liệu (đỡ ~1 vòng mạng khi đổi tab).
// Mỗi bản tải trước chỉ dùng MỘT lần và sống tối đa 4 giây, nên không phục vụ dữ liệu cũ. Lỗi thì trả đúng lỗi như gọi bình thường.
const WARM_MS = 4000;
const warm = new Map();
export function prefetch(url) {
  const w = warm.get(url);
  if (w && Date.now() - w.t < WARM_MS) return;
  const p = api('GET', url);
  p.catch(() => {});   // không báo lỗi chưa xử lý nếu không ai dùng
  warm.set(url, { p, t: Date.now() });
  setTimeout(() => { if (warm.get(url)?.p === p) warm.delete(url); }, WARM_MS);
}
export const get = (u) => {
  const w = warm.get(u);
  if (w && Date.now() - w.t < WARM_MS) { warm.delete(u); return w.p; }
  return api('GET', u);
};
export const post = (u, b) => api('POST', u, b ?? {});
export const put = (u, b) => api('PUT', u, b ?? {});
export const del = (u, b) => api('DELETE', u, b);
