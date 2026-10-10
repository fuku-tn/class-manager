// Đồng bộ thời gian thực: nghe tin "có thay đổi" của lớp qua Supabase Realtime (Broadcast), rồi gọi onChange()
// để trang tải lại dữ liệu qua API (có đăng nhập). Tin chỉ là tín hiệu, không mang dữ liệu học viên.
// Dự phòng: mất kết nối thì tự hỏi lại mỗi vài giây, nên không bao giờ "đứng" ở dữ liệu cũ quá lâu.
import { get } from './api.js';

let libPromise = null;
function loadLib() {
  if (window.supabase?.createClient) return Promise.resolve();
  libPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/supabase.js';
    s.onload = resolve;
    s.onerror = () => { libPromise = null; reject(new Error('Không tải được thư viện realtime')); };
    document.head.append(s);
  });
  return libPromise;
}

let client = null;
let clientKey = '';
function getClient(cfg) {
  if (!client || clientKey !== cfg.url + cfg.key) {
    client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 10 } } });
    clientKey = cfg.url + cfg.key;
  }
  return client;
}

// opts: { base, onChange(): Promise, alive(): boolean, onStatus(status: 'live'|'connecting'|'polling') }
// Trả về stop().
export function startLive({ base, onChange, alive, onStatus = () => {} }) {
  let stopped = false;
  let channel = null;
  let status = 'connecting';
  let running = false;
  let again = false;
  let debounce = null;
  let timer = null;

  const setStatus = (s) => { if (s !== status) { status = s; onStatus(s); } };

  async function refresh() {
    if (stopped) return;
    if (!alive()) return stop();
    if (running) { again = true; return; } // đang tải: tải lại một lần nữa sau khi xong
    running = true;
    try { await onChange(); } catch { /* lần sau thử lại */ }
    running = false;
    if (again) { again = false; schedule(0); }
  }
  const schedule = (ms = 100) => { clearTimeout(debounce); debounce = setTimeout(refresh, ms); };

  function stop() {
    stopped = true;
    clearTimeout(debounce); clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    if (channel && client) client.removeChannel(channel);
    channel = null;
  }
  function onVisible() { if (document.visibilityState === 'visible') schedule(0); }
  document.addEventListener('visibilitychange', onVisible);

  // Dự phòng: realtime ổn thì hỏi lại thưa (20s, chỉ để vá tin bị lỡ); chưa kết nối/mất kết nối thì 3s.
  let tick = 0;
  timer = setInterval(() => {
    if (stopped) return;
    if (!alive()) return stop();
    if (document.visibilityState !== 'visible') return;
    tick += 1;
    if (status !== 'live' || tick % 7 === 0) schedule(0); // 3s × 7 ≈ 21s
  }, 3000);

  (async () => {
    try {
      const cfg = await get(`${base}/realtime`);
      if (stopped) return;
      if (!cfg) { setStatus('polling'); return; } // server chưa cấu hình Supabase → chỉ dùng hỏi định kỳ
      await loadLib();
      if (stopped) return;
      const sb = getClient(cfg);
      channel = sb.channel(cfg.channel, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'changed' }, () => schedule(60))
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') { setStatus('live'); schedule(0); } // vừa (tái) kết nối: đồng bộ ngay để không lỡ tin
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('connecting');
        });
    } catch {
      setStatus('polling');
    }
  })();

  return stop;
}

// Nhãn trạng thái kết nối cho tiêu đề trang.
export const LIVE_LABEL = { live: 'Trực tiếp', connecting: 'Đang kết nối…', polling: 'Tự làm mới' };
