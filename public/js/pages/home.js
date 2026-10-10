// Trang chủ: hero có minh họa động, số liệu đếm lên, băng chuyền lớp đang diễn ra.
import { get } from '../api.js';
import { h, icon, svg, pct, BRAND } from '../ui.js';
import { fmtDate, SHIFT_LABEL, PROGRAM_NAMES } from '../class-filter.mjs';

const WORDS = ['Điểm danh.', 'Bài tập.', 'Chuyên cần.', 'Giáo trình.'];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Đếm từ 0 lên giá trị đích (tắt khi người dùng chọn giảm chuyển động).
function countUp(el, to, { format = (n) => String(Math.round(n)), ms = 1100 } = {}) {
  if (to == null) { el.textContent = '—'; return; }
  if (reduced()) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = (now) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = format(to * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Minh họa: mặt trời vàng, núi nhiều lớp, mặt hồ và cột số liệu mọc lên (đường xu hướng vẽ dần).
function art() {
  const bars = [46, 70, 58, 96, 120, 148, 182];
  return svg('svg', { class: 'art', viewBox: '0 0 560 430', role: 'img', 'aria-label': 'Minh họa số liệu tăng trưởng' },
    svg('defs', {},
      svg('radialGradient', { id: 'sunGlow', cx: '50%', cy: '50%', r: '50%' },
        svg('stop', { offset: '0', 'stop-color': '#f4d9a0', 'stop-opacity': '.85' }), svg('stop', { offset: '1', 'stop-color': '#c9a46a', 'stop-opacity': '0' })),
      svg('linearGradient', { id: 'sunBody', x1: 0, y1: 0, x2: 1, y2: 1 },
        svg('stop', { offset: '0', 'stop-color': '#f6e2b3' }), svg('stop', { offset: '1', 'stop-color': '#c9a46a' })),
      svg('linearGradient', { id: 'mtnA', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: '0', 'stop-color': '#2a3f73' }), svg('stop', { offset: '1', 'stop-color': '#10193a' })),
      svg('linearGradient', { id: 'mtnB', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: '0', 'stop-color': '#16224a' }), svg('stop', { offset: '1', 'stop-color': '#0a1128' })),
      svg('linearGradient', { id: 'lake', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: '0', 'stop-color': '#c9a46a', 'stop-opacity': '.28' }), svg('stop', { offset: '1', 'stop-color': '#0a1128', 'stop-opacity': '.1' })),
      svg('linearGradient', { id: 'barG', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: '0', 'stop-color': '#f1d79b' }), svg('stop', { offset: '1', 'stop-color': '#a97d38' })),
      svg('filter', { id: 'soft' }, svg('feGaussianBlur', { stdDeviation: '6' }))),
    svg('circle', { class: 'sun-glow', cx: 360, cy: 128, r: 150, fill: 'url(#sunGlow)' }),
    svg('circle', { cx: 360, cy: 128, r: 52, fill: 'url(#sunBody)' }),
    ...[[60, 40], [140, 70], [220, 30], [470, 50], [520, 110], [90, 130]].map(([x, y], i) =>
      svg('circle', { class: 'star', cx: x, cy: y, r: 1.8, fill: '#f1d79b', style: `animation-delay:${i * 0.45}s` })),
    svg('path', { d: 'M0 290 L70 215 L120 252 L205 150 L285 258 L350 205 L430 270 L500 222 L560 262 L560 330 L0 330Z', fill: 'url(#mtnA)' }),
    svg('path', { d: 'M205 150 L224 176 L205 168 L190 178Z M350 205 L364 222 L350 216 L338 224Z', fill: '#e9d4a2', opacity: '.55' }),
    svg('path', { d: 'M0 318 L90 270 L170 305 L260 262 L350 312 L450 280 L560 316 L560 340 L0 340Z', fill: 'url(#mtnB)' }),
    svg('rect', { x: 0, y: 330, width: 560, height: 100, fill: 'url(#lake)' }),
    ...[345, 362, 380, 400].map((y, i) => svg('line', { class: 'ripple', x1: 70 + i * 22, x2: 490 - i * 30, y1: y, y2: y, style: `animation-delay:${i * 0.6}s` })),
    ...bars.map((hh, i) => svg('rect', {
      class: 'bar', x: 72 + i * 62, y: 380 - hh, width: 34, height: hh, rx: 7, fill: 'url(#barG)', style: `animation-delay:${0.25 + i * 0.12}s`,
    })),
    svg('polyline', {
      class: 'trend', fill: 'none', stroke: '#fff3d1', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      points: bars.map((hh, i) => `${89 + i * 62},${370 - hh}`).join(' '), pathLength: 1,
    }),
    ...bars.map((hh, i) => svg('circle', { class: 'node', cx: 89 + i * 62, cy: 370 - hh, r: 5, fill: '#fff3d1', style: `animation-delay:${0.9 + i * 0.12}s` })));
}

function classCard(c) {
  const pctDone = c.sessions_total ? Math.round((c.sessions_held / c.sessions_total) * 100) : 0;
  const meta = [c.delivery_mode, SHIFT_LABEL[c.shift]].filter(Boolean).join(' · ');
  return h('a', { class: 'class-card', href: `#/c/${c.id}/dashboard`, 'aria-label': `Mở lớp ${c.short_code || c.code}` },
    h('div', { class: 'cc-top' }, h('span', { class: 'eyebrow' }, c.program || 'Lớp'), h('span', { class: 'badge ok' }, 'Đang học')),
    h('div', { class: 'cc-code' }, c.short_code || c.code),
    h('div', { class: 'muted small' }, PROGRAM_NAMES[c.program] ?? c.program_name ?? ''),
    h('div', { class: 'cc-meta small' }, meta || '—', ' · ', `${fmtDate(c.start_date)}${c.end_date ? ` → ${fmtDate(c.end_date)}` : ''}`),
    h('div', { class: 'cc-progress' }, h('div', { class: 'cc-bar' }, h('i', { style: `width:${pctDone}%` })),
      h('span', { class: 'small muted' }, `Buổi ${c.sessions_held}/${c.sessions_total || '—'}`)),
    h('div', { class: 'cc-foot' },
      h('span', {}, h('b', {}, c.students), ' học viên'),
      h('span', {}, 'Chuyên cần ', h('b', { class: 'accent' }, pct(c.attendance_rate)))));
}

// Băng chuyền: hiện 1–3 thẻ theo độ rộng, tự chạy mỗi 5 giây, dừng khi rê chuột/focus hoặc tab ẩn.
function carousel(classes) {
  const track = h('div', { class: 'cr-track' }, classes.map(classCard));
  const view = h('div', { class: 'cr-view' }, track);
  const dots = h('div', { class: 'cr-dots', role: 'tablist', 'aria-label': 'Trang lớp' });
  const prev = h('button', { class: 'icon-btn cr-nav', type: 'button', 'aria-label': 'Trang trước', onclick: () => go(index - 1) }, icon('chevron'));
  const next = h('button', { class: 'icon-btn cr-nav next', type: 'button', 'aria-label': 'Trang sau', onclick: () => go(index + 1) }, icon('chevron'));
  const root = h('div', { class: 'carousel' }, prev, view, next, dots);
  let index = 0; let per = 3; let paused = false;
  const pages = () => Math.max(1, Math.ceil(classes.length / per));
  function layout() {
    const w = root.clientWidth || window.innerWidth;
    const nextPer = w >= 1000 ? 3 : w >= 640 ? 2 : 1;
    if (nextPer !== per || !dots.childNodes.length) {
      per = nextPer;
      root.style.setProperty('--per', per);
      dots.replaceChildren(...Array.from({ length: pages() }, (_, i) =>
        h('button', { type: 'button', class: 'cr-dot', role: 'tab', 'aria-label': `Trang ${i + 1}`, onclick: () => go(i) })));
    }
    go(Math.min(index, pages() - 1));
  }
  function go(i) {
    index = (i + pages()) % pages();
    track.style.transform = `translateX(calc(${-index} * (100% + 16px)))`;
    [...dots.children].forEach((d, k) => { d.classList.toggle('active', k === index); d.setAttribute('aria-selected', String(k === index)); });
  }
  root.addEventListener('pointerenter', () => { paused = true; });
  root.addEventListener('pointerleave', () => { paused = false; });
  root.addEventListener('focusin', () => { paused = true; });
  root.addEventListener('focusout', () => { paused = false; });
  const timer = setInterval(() => {
    if (!root.isConnected) { clearInterval(timer); window.removeEventListener('resize', layout); return; }
    if (!paused && document.visibilityState === 'visible' && !reduced() && pages() > 1) go(index + 1);
  }, 5000);
  window.addEventListener('resize', layout);
  setTimeout(layout, 0);
  if (classes.length <= 1) { prev.hidden = true; next.hidden = true; }
  return root;
}

export async function renderHome({ state }) {
  const d = await get('/api/overview');
  const t = d.totals;
  const first = d.featured[0];
  const rotator = h('span', { class: 'rotator' }, WORDS[0]);
  const stat = (iconName, label, valueEl, hint) =>
    h('div', { class: 'glass-stat' }, icon(iconName), h('div', {}, h('div', { class: 'gs-value' }, valueEl), h('div', { class: 'gs-label' }, label, hint && h('span', { class: 'muted' }, ` · ${hint}`))));

  const vClasses = h('span', {}), vStudents = h('span', {}), vRate = h('span', {});
  const hero = h('section', { class: 'home-hero' },
    h('div', { class: 'home-glow g1' }), h('div', { class: 'home-glow g2' }),
    ...Array.from({ length: 14 }, (_, i) => h('i', { class: 'mote', style: `left:${(i * 53) % 96}%;top:${(i * 37) % 80}%;animation-delay:${(i % 7) * 0.8}s;animation-duration:${9 + (i % 5) * 2}s` })),
    h('div', { class: 'home-copy' },
      h('div', { class: 'eyebrow' }, `${BRAND.name} · ${BRAND.tagline}`),
      h('h1', { class: 'home-title' }, 'Mọi lớp học.', h('br'), rotator, h('br'), h('span', { class: 'muted-title' }, 'Một nơi theo dõi.')),
      h('p', { class: 'home-lead' }, `Xin chào ${state.user.name.split(' ').slice(-1)[0]}. Theo dõi chuyên cần, bài tập và tiến độ từng buổi — cập nhật trực tiếp khi cả nhóm cùng điểm danh.`),
      h('div', { class: 'home-cta' },
        first
          ? [h('a', { class: 'btn primary', href: `#/c/${first.id}/dashboard` }, 'Mở lớp đang học ', icon('arrow')),
            h('a', { class: 'btn ghost', href: `#/c/${first.id}/attendance` }, icon('attendance'), 'Điểm danh nhanh')]
          : [h('a', { class: 'btn primary', href: state.user.role === 'admin' ? '#/classes' : '#/' }, state.user.role === 'admin' ? 'Quản lý lớp học ' : 'Chưa có lớp đang học ', icon('arrow'))])),
    h('div', { class: 'home-art' },
      art(),
      h('div', { class: 'float-card f1' }, h('span', { class: 'live live' }, 'Trực tiếp'), h('b', {}, `${t.running} lớp đang diễn ra`)),
      h('div', { class: 'float-card f2' }, icon('students'), h('b', {}, `${t.students_active.toLocaleString('vi-VN')} học viên`))));

  // Thị sai theo con trỏ chuột
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    hero.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });

  const stats = h('section', { class: 'home-stats' },
    stat('classes', 'Lớp đang diễn ra', vClasses, `${t.upcoming} sắp mở`),
    stat('students', 'Học viên đang học', vStudents),
    stat('attendance', 'Chuyên cần trung bình', vRate, t.rate_note));

  const root = h('div', { class: 'home' }, hero, stats);

  if (d.featured.length) {
    root.append(h('section', { class: 'home-section' },
      h('div', { class: 'section-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Đang diễn ra'), h('h2', {}, 'Lớp đang học')),
        h('a', { class: 'link-arrow', href: '#/classes' }, state.user.role === 'admin' ? 'Tất cả lớp' : '', state.user.role === 'admin' ? icon('arrow') : '')),
      carousel(d.featured)));
  } else {
    root.append(h('div', { class: 'empty-state' }, t.classes ? 'Hiện chưa có lớp nào đang diễn ra. Dùng ô chọn lớp ở góc trên để mở lớp cũ hoặc sắp mở.' : 'Bạn chưa được phân công lớp nào. Hãy liên hệ admin.'));
  }

  if (d.upcoming.length) {
    root.append(h('section', { class: 'home-section' },
      h('div', { class: 'section-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Sắp tới'), h('h2', {}, 'Lớp sắp khai giảng'))),
      h('div', { class: 'upcoming' }, d.upcoming.map((c) =>
        h('a', { class: 'up-card', href: `#/c/${c.id}/students` },
          h('b', {}, c.short_code || c.code), h('span', { class: 'muted small' }, `${fmtDate(c.start_date)} · ${c.students} học viên`))))));
  }

  // Hiệu ứng động sau khi gắn vào DOM
  setTimeout(() => {
    countUp(vClasses, t.running);
    countUp(vStudents, t.students_active, { format: (n) => Math.round(n).toLocaleString('vi-VN') });
    countUp(vRate, t.attendance_rate == null ? null : t.attendance_rate * 100, { format: (n) => `${Math.round(n)}%` });
    if (reduced()) return;
    let i = 0;
    const spin = setInterval(() => {
      if (!rotator.isConnected) { clearInterval(spin); return; }
      rotator.classList.add('out');
      setTimeout(() => { i = (i + 1) % WORDS.length; rotator.textContent = WORDS[i]; rotator.classList.remove('out'); }, 320);
    }, 2600);
  }, 60);

  return root;
}
