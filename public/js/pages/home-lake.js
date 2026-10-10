// Hero "hồ nước": bầu trời hoàng hôn + núi xa + trăng phản chiếu trên mặt hồ, thỉnh thoảng có giọt rơi tạo sóng gợn nhẹ.
// Vẽ bằng canvas 2D (không ảnh, không thư viện). Mặt nước = phản chiếu của cảnh, bị bóp méo theo trường sóng (lake-sim.mjs).
// Tôn trọng prefers-reduced-motion (chỉ vẽ một khung tĩnh); dừng khi ngoài màn hình/tab ẩn/phần tử bị gỡ khỏi DOM.
import { createWaveField, createDropScheduler } from '../lake-sim.mjs';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// PRNG cố định để cảnh giống nhau mỗi lần dựng
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dựng ảnh nguồn (trời + núi + trăng + phản chiếu) vào canvas ngoài màn hình.
function paintScene(W, H, y0) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rnd = mulberry32(20261010);

  // Bầu trời: xanh đen → tím xám → cam đào sát đường chân trời
  const sky = ctx.createLinearGradient(0, 0, 0, y0);
  sky.addColorStop(0, '#0b1124'); sky.addColorStop(0.42, '#1c2748'); sky.addColorStop(0.72, '#4f5a82');
  sky.addColorStop(0.9, '#c99a8c'); sky.addColorStop(1, '#f0c8a0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, y0);

  // Sao
  for (let i = 0; i < Math.round(W / 9); i++) {
    const x = rnd() * W, y = rnd() * y0 * 0.62;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.65})`;
    ctx.fillRect(x, y, rnd() < 0.15 ? 2 : 1, rnd() < 0.15 ? 2 : 1);
  }

  // Trăng + quầng sáng
  const mx = W * 0.7, my = y0 * 0.42, mr = Math.min(W, y0 * 1.6) * 0.075;
  const glow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 7);
  glow.addColorStop(0, 'rgba(255,226,170,.55)'); glow.addColorStop(0.35, 'rgba(240,190,130,.16)'); glow.addColorStop(1, 'rgba(240,190,130,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, y0);
  const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#fff6dc'); disc.addColorStop(1, '#e2bd7e');
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();

  // Hai lớp núi xa (tổng các sóng sin với pha ngẫu nhiên)
  const ridge = (base, amp, color, rim, seedShift) => {
    const ph = Array.from({ length: 5 }, () => rnd() * Math.PI * 2);
    const fr = [1.3, 2.9, 5.7, 11.3, 23.1];
    const hAt = (x) => {
      let v = 0;
      for (let k = 0; k < 5; k++) v += Math.sin((x / W) * Math.PI * fr[k] + ph[k] + seedShift) * (amp / (1 + k * 1.15));
      return base - Math.abs(v) * 0.9 - v * 0.25;
    };
    ctx.beginPath(); ctx.moveTo(0, y0);
    for (let x = 0; x <= W; x += 2) ctx.lineTo(x, hAt(x));
    ctx.lineTo(W, y0); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    if (rim) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 2) (x === 0 ? ctx.moveTo(x, hAt(x)) : ctx.lineTo(x, hAt(x)));
      ctx.strokeStyle = rim; ctx.lineWidth = 1; ctx.stroke();
    }
  };
  ridge(y0 * 0.93, y0 * 0.24, '#2a3560', 'rgba(236,201,149,.28)', 0);
  ridge(y0 * 0.98, y0 * 0.15, '#141b38', null, 2.1);

  // Sương mỏng sát chân trời
  const mist = ctx.createLinearGradient(0, y0 * 0.82, 0, y0);
  mist.addColorStop(0, 'rgba(240,200,170,0)'); mist.addColorStop(1, 'rgba(240,200,170,.22)');
  ctx.fillStyle = mist; ctx.fillRect(0, y0 * 0.82, W, y0 * 0.18);

  // Phản chiếu: lật phần trên xuống mặt nước, hơi nhòe, rồi phủ màu nước tối dần
  ctx.save();
  ctx.setTransform(1, 0, 0, -1, 0, 2 * y0);
  try { ctx.filter = 'blur(1px)'; } catch { /* trình duyệt không hỗ trợ: bỏ qua */ }
  ctx.drawImage(cv, 0, 0, W, y0, 0, 0, W, y0);
  ctx.restore();
  ctx.filter = 'none';
  const water = ctx.createLinearGradient(0, y0, 0, H);
  water.addColorStop(0, 'rgba(18,26,56,.18)'); water.addColorStop(0.55, 'rgba(8,13,32,.62)'); water.addColorStop(1, 'rgba(5,8,20,.92)');
  ctx.fillStyle = water; ctx.fillRect(0, y0, W, H - y0);

  // Ánh lấp lánh dọc cột phản chiếu của trăng
  for (let i = 0; i < 70; i++) {
    const t = rnd();
    const y = y0 + 3 + t * (H - y0) * 0.8;
    const half = (6 + t * 22) * (W / 640);
    const x = mx + (rnd() - 0.5) * half * 2;
    ctx.fillStyle = `rgba(255,226,170,${0.14 + rnd() * 0.4 * (1 - t * 0.6)})`;
    ctx.fillRect(x, y, 2 + rnd() * 9, 1);
  }
  return ctx.getImageData(0, 0, W, H);
}

// container: phần tử chứa (position:relative). Trả về { canvas, destroy }.
export function createLake(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'lake-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Mặt hồ phản chiếu bầu trời hoàng hôn, thỉnh thoảng gợn sóng nhẹ');
  container.prepend(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, y0 = 0, src = null, out = null, field = null, raf = 0, last = 0, timeAcc = 0;
  let scheduler = createDropScheduler();
  let visible = true;
  let lastPointerDrop = 0;

  function build() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    W = clamp(Math.round(r.width / 2), 360, 760);
    H = Math.round(W * (r.height / r.width));
    y0 = Math.round(H * 0.5);
    canvas.width = W; canvas.height = H;
    src = paintScene(W, H, y0);
    out = ctx.createImageData(W, H);
    out.data.set(src.data);
    field = createWaveField(W, H, { top: y0 + 1 });
    draw(0);
    return true;
  }

  // Vẽ khung: phần trời copy nguyên; phần nước lấy mẫu từ ảnh nguồn đã bị bóp méo theo độ dốc mặt sóng.
  function draw(t) {
    const hgt = field.heights, s = src.data, d = out.data;
    const KD = 0.022, KL = 0.34;
    for (let y = y0; y < H; y++) {
      const depth = (y - y0) / (H - y0);
      const shimmer = Math.sin(y * 0.55 + t * 1.15) * (0.25 + depth * 0.7); // gợn li ti để mặt hồ không đứng yên hẳn
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        let gx = 0, gy = 0;
        if (x > 0 && x < W - 1 && y > y0 && y < H - 1) { gx = hgt[i + 1] - hgt[i - 1]; gy = hgt[i + W] - hgt[i - W]; }
        const sx = clamp(x + gx * KD + shimmer, 0, W - 1) | 0;
        const sy = clamp(y + gy * KD * 1.4, y0, H - 1) | 0;
        const si = (sy * W + sx) << 2;
        const light = gx * KL + gy * KL * 0.5;
        const o = i << 2;
        d[o] = clamp(s[si] + light, 0, 255);
        d[o + 1] = clamp(s[si + 1] + light * 0.92, 0, 255);
        d[o + 2] = clamp(s[si + 2] + light * 0.8, 0, 255);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  const toGrid = (u, v) => [u * W, y0 + 2 + v * (H - y0 - 4)];

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!container.isConnected) { destroy(); return; }
    if (!visible || document.hidden) { last = now; return; }
    if (!last) { last = now; return; }      // khung đầu tiên: chỉ ghi mốc thời gian
    const dt = Math.min(64, now - last);
    if (dt < 30) return;                    // ~30 khung/giây là đủ cho sóng nhẹ, nhẹ máy hơn
    last = now; timeAcc += dt / 1000;
    for (const dp of scheduler(dt)) { const [gx, gy] = toGrid(dp.u, dp.v); field.addDrop(gx, gy, Math.round(3 + W / 200), dp.amp); }
    field.step();
    draw(timeAcc);
  }

  function onPointer(e, strong) {
    if (reduced() || !field) return;
    const now = performance.now();
    if (!strong && now - lastPointerDrop < 110) return;
    const r = canvas.getBoundingClientRect();
    const gx = ((e.clientX - r.left) / r.width) * W;
    const gy = ((e.clientY - r.top) / r.height) * H;
    if (gy <= y0 + 2 || gy >= H - 2) return;
    lastPointerDrop = now;
    field.addDrop(gx, gy, strong ? 5 : 3, strong ? 240 : 45);
  }
  const onMove = (e) => onPointer(e, false);
  const onDown = (e) => onPointer(e, true);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerdown', onDown);

  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (container.isConnected) build(); }, 200); };
  window.addEventListener('resize', onResize);
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => { visible = entries[0]?.isIntersecting ?? true; }, { threshold: 0.05 })
    : null;
  io?.observe(container);

  function destroy() {
    cancelAnimationFrame(raf);
    container.removeEventListener('pointermove', onMove);
    container.removeEventListener('pointerdown', onDown);
    window.removeEventListener('resize', onResize);
    io?.disconnect();
    clearTimeout(resizeTimer);
  }

  function start() {
    if (reduced()) return; // giảm chuyển động: chỉ một khung tĩnh
    // Thả một giọt nhỏ ngay đầu để người xem thấy mặt nước "sống"
    const [gx, gy] = toGrid(0.62, 0.45);
    field.addDrop(gx, gy, Math.round(3 + W / 200), 150);
    raf = requestAnimationFrame(frame);
  }
  if (build()) {
    start();
  } else { // phần tử chưa có kích thước (chưa vào DOM xong): thử lại vài khung
    let tries = 0;
    const retry = () => {
      if (!container.isConnected || ++tries > 40) return;
      if (build()) start(); else requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
  }
  return { canvas, destroy, rebuild: build, getField: () => field };
}
