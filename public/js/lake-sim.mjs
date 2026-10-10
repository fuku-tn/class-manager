// Mô phỏng sóng nước 2D (phương trình sóng rời rạc), thuần số học — không đụng DOM nên test được.
// Hai bộ đệm (hiện tại / trước đó); mỗi bước:
//   next = (2·c − prev + kx·(L+R−2c) + ky·(U+D−2c)) · damping
// kx > ky làm sóng lan nhanh theo chiều ngang hơn → vòng sóng dẹt (elip) như nhìn mặt hồ theo phối cảnh.
// Điều kiện ổn định: kx + ky ≤ 1.

export function createWaveField(w, h, { kx = 0.62, ky = 0.26, damping = 0.982, top = 1 } = {}) {
  let cur = new Float32Array(w * h);
  let prev = new Float32Array(w * h);
  const yStart = Math.max(1, top);

  function step() {
    for (let y = yStart; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const c = cur[i];
        const n = (2 * c - prev[i] + kx * (cur[i - 1] + cur[i + 1] - 2 * c) + ky * (cur[i - w] + cur[i + w] - 2 * c)) * damping;
        prev[i] = n > -0.02 && n < 0.02 ? 0 : n; // cắt rác nhỏ để mặt nước thật sự lặng lại
      }
    }
    const t = cur; cur = prev; prev = t;
  }

  // Giọt nước: gò cos nâng lên tại (x, y), bán kính r (theo hàng), rộng hơn 1.5 lần theo chiều ngang.
  function addDrop(x, y, r = 4, amp = 240) {
    const rx = Math.ceil(r * 1.5);
    for (let dy = -r; dy <= r; dy++) {
      const yy = Math.round(y) + dy;
      if (yy < yStart || yy >= h - 1) continue;
      for (let dx = -rx; dx <= rx; dx++) {
        const xx = Math.round(x) + dx;
        if (xx < 1 || xx >= w - 1) continue;
        const d = Math.hypot(dx / 1.5, dy) / r;
        if (d < 1) cur[yy * w + xx] += amp * 0.5 * (1 + Math.cos(Math.PI * d));
      }
    }
  }

  const energy = () => { let e = 0; for (let i = 0; i < cur.length; i++) e += cur[i] * cur[i]; return e; };
  const maxAbs = () => { let m = 0; for (let i = 0; i < cur.length; i++) { const a = Math.abs(cur[i]); if (a > m) m = a; } return m; };
  const clear = () => { cur.fill(0); prev.fill(0); };

  return { step, addDrop, energy, maxAbs, clear, get heights() { return cur; }, width: w, height: h };
}

// Lịch giọt rơi ngẫu nhiên "lâu lâu": trả về hàm tick(dtMs) → danh sách giọt cần thả.
export function createDropScheduler({ minMs = 2600, maxMs = 6500, random = Math.random } = {}) {
  let wait = minMs + random() * (maxMs - minMs) * 0.5;
  return function tick(dtMs) {
    wait -= dtMs;
    if (wait > 0) return [];
    wait = minMs + random() * (maxMs - minMs);
    const drops = [{ u: 0.12 + random() * 0.76, v: 0.1 + random() * 0.8, amp: 100 + random() * 120 }];
    if (random() < 0.3) drops.push({ u: Math.min(0.95, drops[0].u + (random() - 0.5) * 0.18), v: Math.min(0.95, drops[0].v + (random() - 0.5) * 0.25), amp: 60 + random() * 70 });
    return drops;
  };
}
