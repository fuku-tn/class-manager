// Hero "mặt hồ": bầu trời + núi + trăng/mặt trời vẽ ở độ phân giải màn hình; mặt nước render bằng WebGL:
// phản chiếu kiểu Fresnel (gần chân trời phản chiếu mạnh, gần người nhìn trong/tối hơn), sóng li ti theo phối cảnh,
// vệt lấp lánh dưới trăng/mặt trời, và vòng sóng gợn từ mô phỏng (lake-sim.mjs) được làm mượt trên GPU.
// Không WebGL → đường dự phòng canvas 2D. Bảng màu theo giao diện sáng/tối (lake-theme.mjs).
// Tôn trọng prefers-reduced-motion (một khung tĩnh); dừng khi ngoài màn hình / tab ẩn / rời trang.
import { createWaveField, createDropScheduler } from '../lake-sim.mjs';
import { lakePalette, lakeTheme } from '../lake-theme.mjs';

const HORIZON = 0.5;                 // đường chân trời (tỉ lệ chiều cao)
const SIM_STEP_MS = 33;              // mô phỏng sóng ~30 bước/giây
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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

// Nhiễu giá trị 1D + "ridged fbm" cho dáng núi tự nhiên (đỉnh nhọn, sườn mềm)
function makeNoise1D(seed) {
  const r = mulberry32(seed);
  const vals = Array.from({ length: 256 }, () => r());
  return (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return vals[i & 255] * (1 - u) + vals[(i + 1) & 255] * u;
  };
}
function ridged(noise, x) {
  let v = 0, amp = 0.55, fr = 1;
  for (let k = 0; k < 6; k++) { v += amp * (1 - Math.abs(noise(x * fr) * 2 - 1)) ** 1.6; amp *= 0.48; fr *= 2.07; }
  return v;
}

// Vẽ phần trời (trời + sao + trăng/mặt trời + núi + sương) vào canvas kích thước W × Hs (px thật).
function paintSky(W, Hs, pal, scale) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Hs;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(20261010);

  const sky = ctx.createLinearGradient(0, 0, 0, Hs);
  for (const [o, c] of pal.sky) sky.addColorStop(o, c);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, Hs);

  if (pal.stars) {
    const n = Math.round(W / (8 * scale));
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * Hs * 0.6, big = rnd() < 0.12;
      const r = (big ? 1.1 : 0.6) * scale;
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.7) * pal.stars})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  const o = pal.orb;
  const mx = W * o.x, my = Hs * o.y, mr = Math.min(W, Hs * 1.7) * o.size;
  const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 8);
  glow.addColorStop(0, o.glow); glow.addColorStop(0.35, o.glow2); glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, Hs);
  const disc = ctx.createRadialGradient(mx - mr * 0.32, my - mr * 0.32, mr * 0.08, mx, my, mr);
  disc.addColorStop(0, o.core); disc.addColorStop(1, o.edge);
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  if (o.craters) {
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
    for (const [dx, dy, rr, a] of [[-0.3, -0.15, 0.22, 0.10], [0.25, 0.2, 0.28, 0.08], [0.05, -0.42, 0.13, 0.09], [-0.12, 0.38, 0.16, 0.07], [0.42, -0.25, 0.1, 0.07]]) {
      ctx.fillStyle = `rgba(150,120,80,${a})`;
      ctx.beginPath(); ctx.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  pal.ridges.forEach((rg, li) => {
    const noise = makeNoise1D(rg.seed);
    const yAt = (x) => Hs * rg.base - ridged(noise, (x / W) * 3.2 + rg.seed) * rg.amp * Hs;
    let minY = Hs;
    const pts = [];
    for (let x = 0; x <= W; x += Math.max(1, Math.round(scale))) { const y = yAt(x); pts.push([x, y]); if (y < minY) minY = y; }
    const g = ctx.createLinearGradient(0, minY, 0, Hs);
    g.addColorStop(0, rg.top); g.addColorStop(1, rg.bottom);
    ctx.beginPath(); ctx.moveTo(0, Hs);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(W, Hs); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    if (rg.rim) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = rg.rim; ctx.lineWidth = Math.max(1, scale * 0.8); ctx.stroke();
    }
    if (li === 0) { // không khí giữa hai lớp núi: lớp xa mờ hơn
      const air = ctx.createLinearGradient(0, Hs * 0.6, 0, Hs);
      air.addColorStop(0, 'rgba(255,255,255,0)'); air.addColorStop(1, pal.haze);
      ctx.fillStyle = air; ctx.fillRect(0, Hs * 0.6, W, Hs * 0.4);
    }
  });

  const mist = ctx.createLinearGradient(0, Hs * 0.86, 0, Hs);
  mist.addColorStop(0, 'rgba(255,255,255,0)'); mist.addColorStop(1, pal.haze);
  ctx.fillStyle = mist; ctx.fillRect(0, Hs * 0.86, W, Hs * 0.14);
  return cv;
}

// ---------------------------------------------------------------- WebGL
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uSky;
uniform sampler2D uRipple;
uniform vec2 uSimTexel;
uniform vec2 uRes;
uniform float uHorizon;
uniform float uTime;
uniform float uLightX;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uGlint;
uniform float uGlintStrength;
uniform float uFresnelNear;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float waves(vec2 p, float t) {
  float v = noise(p + vec2(t * 0.10, t * 0.04)) * 0.55;
  v += noise(p * 2.03 + vec2(-t * 0.07, t * 0.09)) * 0.28;
  v += noise(p * 4.11 + vec2(t * 0.13, -t * 0.06)) * 0.17;
  return v;
}
vec3 sky(vec2 s) { return texture2D(uSky, vec2(clamp(s.x, 0.0, 1.0), clamp(s.y, 0.0, 0.997))).rgb; }

void main() {
  vec2 uv = vUv;
  if (uv.y < uHorizon) { gl_FragColor = vec4(sky(vec2(uv.x, uv.y / uHorizon)), 1.0); return; }
  float d = (uv.y - uHorizon) / (1.0 - uHorizon);            // 0 = chân trời, 1 = mép dưới
  float aspect = uRes.x / uRes.y;
  float z = 1.0 / (d + 0.035);                                // khoảng cách trên mặt phẳng nước
  vec2 wp = vec2((uv.x - 0.5) * aspect * z * 1.6, z * 3.2);   // tọa độ mặt nước theo phối cảnh
  float t = uTime;
  float e = 0.04;
  vec2 nW = vec2(waves(wp + vec2(e, 0.0), t) - waves(wp - vec2(e, 0.0), t),
                 waves(wp + vec2(0.0, e), t) - waves(wp - vec2(0.0, e), t)) / (2.0 * e);

  vec2 ru = vec2(uv.x, d);
  float hl = texture2D(uRipple, ru - vec2(uSimTexel.x, 0.0)).r;
  float hr = texture2D(uRipple, ru + vec2(uSimTexel.x, 0.0)).r;
  float hu = texture2D(uRipple, ru - vec2(0.0, uSimTexel.y)).r;
  float hd = texture2D(uRipple, ru + vec2(0.0, uSimTexel.y)).r;
  vec2 nR = vec2(hr - hl, hd - hu);

  vec2 off = nW * 0.0019 * (0.12 + d) + nR * 0.05 * (0.3 + 0.7 * d);
  float vs = 1.0 - d * (1.0 - uHorizon) / uHorizon;            // điểm đối xứng trong ảnh trời
  vec2 rs = vec2(uv.x + off.x, vs + off.y * 1.4);
  float blur = 0.0012 + 0.005 * d;
  vec3 refl = sky(rs) * 0.5 + sky(rs + vec2(blur, 0.0)) * 0.25 + sky(rs - vec2(blur, 0.0)) * 0.25;

  float fres = uFresnelNear + (1.0 - uFresnelNear) * pow(1.0 - d, 3.0);
  vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 1.0, d));
  vec3 col = mix(base, refl, fres);

  col += (nR.x * 0.6 - nR.y * 0.9) * 0.35 * uGlint * (0.4 + 0.6 * (1.0 - d));   // vòng sóng bắt sáng

  float dx = (uv.x - uLightX) * aspect;
  float w = 0.035 + 0.22 * d;
  float column = exp(-(dx * dx) / (w * w));
  float sparkle = smoothstep(0.70, 0.95, waves(wp * 2.6 + vec2(0.0, t * 0.35), t * 1.7) + nR.y * 2.0);
  col += uGlint * column * (sparkle * uGlintStrength + 0.10) * (0.55 + 0.45 * (1.0 - d));

  vec3 hz = sky(vec2(uv.x, 0.985));
  col = mix(col, hz, exp(-d * 30.0) * 0.55);                   // sương sát chân trời
  col *= 1.0 - 0.16 * d * d;
  gl_FragColor = vec4(col, 1.0);
}`;

function createGlRenderer(canvas, pal) {
  let gl;
  try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true }); } catch { gl = null; }
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('Lake shader:', gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const tex = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const skyTex = tex(0), rippleTex = tex(1);
  gl.uniform1i(U('uSky'), 0); gl.uniform1i(U('uRipple'), 1);
  gl.uniform3fv(U('uDeep'), pal.water.deep); gl.uniform3fv(U('uShallow'), pal.water.shallow);
  gl.uniform3fv(U('uGlint'), pal.water.glint); gl.uniform1f(U('uGlintStrength'), pal.water.glintStrength);
  gl.uniform1f(U('uFresnelNear'), pal.water.fresnelNear); gl.uniform1f(U('uHorizon'), HORIZON);
  gl.uniform1f(U('uLightX'), pal.orb.x);
  const uTime = U('uTime');
  let simW = 0, simH = 0, bytes = null;

  return {
    mode: 'webgl',
    resize(cssW, cssH) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
      const k = Math.min(1, 2560 / W); W = Math.round(W * k); H = Math.round(H * k);
      canvas.width = W; canvas.height = H;
      gl.viewport(0, 0, W, H);
      gl.uniform2f(U('uRes'), W, H);
      const sky = paintSky(W, Math.round(H * HORIZON), pal, dpr * k);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, skyTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sky);
      simW = 320;
      simH = clamp(Math.round(simW * (cssH * (1 - HORIZON)) / cssW), 48, 240);
      bytes = new Uint8Array(simW * simH).fill(128);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rippleTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, simW, simH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
      gl.uniform2f(U('uSimTexel'), 1 / simW, 1 / simH);
      return { simW, simH };
    },
    render(t, field, simChanged) {
      if (simChanged && field) {
        const h = field.heights;
        for (let i = 0; i < bytes.length; i++) { const v = 128 + h[i] * 0.35; bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rippleTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, simW, simH, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
      }
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}

// ---------------------------------------------------------------- Canvas 2D (dự phòng)
function create2dRenderer(canvas, pal) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, y0 = 0, src = null, out = null;
  const rgb = (a) => `rgb(${a.map((x) => Math.round(x * 255)).join(',')})`;
  return {
    mode: '2d',
    resize(cssW, cssH) {
      W = clamp(Math.round(cssW / 1.5), 360, 960);
      H = Math.round(W * (cssH / cssW));
      y0 = Math.round(H * HORIZON);
      canvas.width = W; canvas.height = H;
      const sky = paintSky(W, y0, pal, W / cssW);
      ctx.drawImage(sky, 0, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, -1, 0, 2 * y0);
      ctx.globalAlpha = 0.85; ctx.drawImage(sky, 0, 0, W, y0, 0, 0, W, y0);
      ctx.restore();
      const water = ctx.createLinearGradient(0, y0, 0, H);
      water.addColorStop(0, 'rgba(0,0,0,0)'); water.addColorStop(1, rgb(pal.water.deep));
      ctx.fillStyle = water; ctx.fillRect(0, y0, W, H - y0);
      src = ctx.getImageData(0, 0, W, H);
      out = ctx.createImageData(W, H); out.data.set(src.data);
      return { simW: W, simH: H - y0 };
    },
    render(t, field) {
      const hgt = field.heights, s = src.data, d = out.data, KD = 0.022, KL = 0.34;
      for (let y = y0; y < H; y++) {
        const depth = (y - y0) / (H - y0);
        const shimmer = Math.sin(y * 0.55 + t * 1.15) * (0.2 + depth * 0.6);
        const hy = y - y0;
        for (let x = 0; x < W; x++) {
          const i = hy * W + x;
          let gx = 0, gy = 0;
          if (x > 0 && x < W - 1 && hy > 0 && hy < H - y0 - 1) { gx = hgt[i + 1] - hgt[i - 1]; gy = hgt[i + W] - hgt[i - W]; }
          const sx = clamp(x + gx * KD + shimmer, 0, W - 1) | 0;
          const sy = clamp(y + gy * KD * 1.4, y0, H - 1) | 0;
          const si = (sy * W + sx) << 2, o = (y * W + x) << 2, light = gx * KL + gy * KL * 0.5;
          d[o] = clamp(s[si] + light, 0, 255); d[o + 1] = clamp(s[si + 1] + light * 0.92, 0, 255);
          d[o + 2] = clamp(s[si + 2] + light * 0.8, 0, 255); d[o + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
    },
  };
}

// ---------------------------------------------------------------- Điều phối
// container: phần tử chứa (position: relative). Trả về { canvas, destroy, mode }.
export function createLake(container) {
  const theme = lakeTheme();
  const pal = lakePalette(theme);
  const canvas = document.createElement('canvas');
  canvas.className = 'lake-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', theme === 'light' ? 'Mặt hồ ban ngày phản chiếu bầu trời, thỉnh thoảng gợn sóng nhẹ' : 'Mặt hồ đêm trăng phản chiếu bầu trời hoàng hôn, thỉnh thoảng gợn sóng nhẹ');
  container.prepend(canvas);
  container.dataset.lakeTheme = theme;

  const renderer = createGlRenderer(canvas, pal) || create2dRenderer(canvas, pal);
  canvas.dataset.mode = renderer.mode;
  canvas.__lakeFrames = 0;

  let field = null, dims = null, raf = 0, lastT = 0, simAcc = 0, clock = 0, visible = true, lastPointer = 0, resizeTimer = 0;
  const scheduler = createDropScheduler();

  function build() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    dims = renderer.resize(r.width, r.height);
    field = createWaveField(dims.simW, dims.simH, { top: 1 });
    renderer.render(clock, field, true);
    canvas.__lakeFrames++;
    return true;
  }
  const toGrid = (u, v) => [u * dims.simW, 2 + v * (dims.simH - 4)];
  const dropRadius = () => Math.round(3 + dims.simW / 200);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!container.isConnected) { destroy(); return; }
    if (!visible || document.hidden) { lastT = now; return; }
    if (!lastT) { lastT = now; return; }               // khung đầu: chỉ ghi mốc thời gian
    const dt = Math.min(64, now - lastT);
    lastT = now; clock += dt / 1000; simAcc += dt;
    let stepped = false;
    while (simAcc >= SIM_STEP_MS) {
      simAcc -= SIM_STEP_MS;
      for (const dp of scheduler(SIM_STEP_MS)) { const [gx, gy] = toGrid(dp.u, dp.v); field.addDrop(gx, gy, dropRadius(), dp.amp); }
      field.step(); stepped = true;
    }
    if (renderer.mode === 'webgl' || stepped) { renderer.render(clock, field, stepped); canvas.__lakeFrames++; }
  }

  function onPointer(e, strong) {
    if (reduced() || !field) return;
    const now = performance.now();
    if (!strong && now - lastPointer < 110) return;
    const r = canvas.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = ((e.clientY - r.top) / r.height - HORIZON) / (1 - HORIZON);
    if (v <= 0.02 || v >= 0.98) return;
    lastPointer = now;
    const [gx, gy] = toGrid(u, v);
    field.addDrop(gx, gy, strong ? dropRadius() + 2 : dropRadius(), strong ? 240 : 45);
  }
  const onMove = (e) => onPointer(e, false);
  const onDown = (e) => onPointer(e, true);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerdown', onDown);
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (container.isConnected) build(); else destroy(); }, 200); };
  window.addEventListener('resize', onResize);
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => { visible = entries[0]?.isIntersecting ?? true; }, { threshold: 0.05 })
    : null;
  io?.observe(container);

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    renderer.dispose?.();
    container.removeEventListener('pointermove', onMove);
    container.removeEventListener('pointerdown', onDown);
    window.removeEventListener('resize', onResize);
    io?.disconnect();
    clearTimeout(resizeTimer);
  }
  function start() {
    if (reduced()) return;                             // giảm chuyển động: một khung tĩnh
    const [gx, gy] = toGrid(0.62, 0.45);
    field.addDrop(gx, gy, dropRadius(), 150);
    raf = requestAnimationFrame(frame);
  }
  if (build()) start();
  else {
    let tries = 0;
    const retry = () => { if (!container.isConnected || ++tries > 40) return; if (build()) start(); else requestAnimationFrame(retry); };
    requestAnimationFrame(retry);
  }
  return { canvas, destroy, mode: renderer.mode, rebuild: build, getField: () => field };
}
