const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let S;
before(async () => { S = await import('../public/js/lake-sim.mjs'); });

const W = 120, H = 80;

test('giọt nước tạo sóng rồi tắt dần (không nổ số, không NaN)', () => {
  const f = S.createWaveField(W, H, { top: 20 });
  assert.equal(f.energy(), 0);
  f.addDrop(60, 50, 5, 300);
  const e0 = f.energy();
  assert.ok(e0 > 0);
  let peak = 0;
  for (let i = 0; i < 400; i++) {
    f.step();
    const m = f.maxAbs();
    assert.ok(Number.isFinite(m), 'giá trị không hữu hạn');
    assert.ok(m < 4 * 300, `sóng mất ổn định (maxAbs=${m})`); // vừa thả giọt, biên độ có thể gấp ~3 lần (do chưa có vận tốc ban đầu) rồi giảm
    peak = Math.max(peak, f.energy());
  }
  assert.ok(f.energy() < peak * 0.02, `năng lượng phải tắt dần (cuối=${f.energy().toExponential(1)}, đỉnh=${peak.toExponential(1)})`);
  assert.ok(peak > 0);
});

test('vòng sóng dẹt: lan xa theo chiều ngang hơn chiều dọc (phối cảnh mặt hồ)', () => {
  const f = S.createWaveField(W, H, { top: 1 });
  const cx = 60, cy = 40;
  f.addDrop(cx, cy, 2, 400);
  for (let i = 0; i < 24; i++) f.step();
  const h = f.heights;
  const reach = (dx, dy) => { let r = 0; for (let k = 1; k < 38; k++) if (Math.abs(h[(cy + dy * k) * W + cx + dx * k]) > 1) r = k; return r; };
  const rx = reach(1, 0), ry = reach(0, 1);
  assert.ok(rx > ry * 1.2, `ngang=${rx} phải xa hơn dọc=${ry}`);
});

test('sóng không lan lên phần trời (trên đường chân trời)', () => {
  const top = 30;
  const f = S.createWaveField(W, H, { top });
  f.addDrop(60, top + 3, 4, 300);
  for (let i = 0; i < 60; i++) f.step();
  const h = f.heights;
  for (let y = 0; y < top; y++) for (let x = 0; x < W; x++) assert.equal(h[y * W + x], 0);
});

test('giọt rơi theo lịch ngẫu nhiên "lâu lâu": ít, thưa, nằm trong mặt nước', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tick = S.createDropScheduler({ minMs: 2600, maxMs: 6500, random });
  let drops = 0, ms = 0;
  for (let i = 0; i < 60 * 60; i++) {           // 60 giây giả lập ở 60 khung/giây
    const d = tick(1000 / 60);
    ms += 1000 / 60;
    for (const x of d) { drops += 1; assert.ok(x.u >= 0 && x.u <= 1 && x.v >= 0 && x.v <= 1 && x.amp > 0); }
  }
  assert.ok(drops >= 8 && drops <= 40, `số giọt/phút = ${drops} (mong đợi thưa)`);
});

test('mã hero không dùng API không an toàn và đã gỡ cảnh SVG cũ', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'pages', 'home-scene.js')), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pages', 'home-lake.js'), 'utf8');
  assert.doesNotMatch(src, /innerHTML|eval\(|new Function|document\.write/);
});
