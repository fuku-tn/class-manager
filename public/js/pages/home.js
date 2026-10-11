// Trang chủ: hero có minh họa động, số liệu đếm lên, băng chuyền lớp đang diễn ra.
import { get } from '../api.js';
import { h, icon, pct, BRAND } from '../ui.js';
import { fmtDate, SHIFT_LABEL, PROGRAM_NAMES, classDisplayName } from '../class-filter.mjs';
import { createLake } from './home-lake.js';

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

function classCard(c) {
  const pctDone = c.sessions_total ? Math.round((c.sessions_held / c.sessions_total) * 100) : 0;
  const meta = [c.delivery_mode, SHIFT_LABEL[c.shift]].filter(Boolean).join(' · ');
  return h('a', { class: 'class-card', href: `#/c/${c.id}/dashboard`, 'aria-label': `Mở lớp ${classDisplayName(c)}`, title: c.code },
    h('div', { class: 'cc-top' }, h('span', { class: 'eyebrow' }, c.program || 'Lớp'), h('span', { class: 'badge ok' }, 'Đang học')),
    h('div', { class: 'cc-code' }, classDisplayName(c)),
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
  const hero = h('section', { class: 'home-hero cosmic' },
    h('div', { class: 'scene-vignette' }),
    h('div', { class: 'home-copy' },
      h('div', { class: 'eyebrow' }, `${BRAND.name} · ${BRAND.tagline}`),
      h('h1', { class: 'home-title' }, 'Mọi lớp học.', h('br'), rotator, h('br'), h('span', { class: 'muted-title' }, 'Một nơi theo dõi.')),
      h('div', { class: 'title-rule' }),
      h('p', { class: 'home-lead' }, `Xin chào ${state.user.name.split(' ').slice(-1)[0]}. Theo dõi chuyên cần, bài tập và tiến độ từng buổi — cập nhật trực tiếp khi cả nhóm cùng điểm danh.`),
      h('div', { class: 'home-cta' },
        first
          ? [h('a', { class: 'cta-circle', href: `#/c/${first.id}/dashboard` }, h('span', { class: 'cta-ring' }, icon('arrow')), h('span', { class: 'cta-text' }, 'Mở lớp đang học')),
            h('a', { class: 'cta-link', href: `#/c/${first.id}/attendance` }, icon('attendance'), 'Điểm danh nhanh')]
          : [h('a', { class: 'cta-circle', href: state.user.role === 'admin' ? '#/classes' : '#/' }, h('span', { class: 'cta-ring' }, icon('arrow')),
            h('span', { class: 'cta-text' }, state.user.role === 'admin' ? 'Quản lý lớp học' : 'Chưa có lớp đang học'))])),
    h('div', { class: 'scroll-cue', 'aria-hidden': 'true' }, h('span', {}, 'Cuộn'), h('i', {})));

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
          h('b', {}, classDisplayName(c)), h('span', { class: 'muted small' }, `${fmtDate(c.start_date)} · ${c.students} học viên`))))));
  }

  // Hiệu ứng động sau khi gắn vào DOM
  setTimeout(() => {
    if (hero.isConnected) createLake(hero);
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
