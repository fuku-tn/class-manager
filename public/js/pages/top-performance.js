// Top Performance (popup trong trang Tốt nghiệp): thẻ xếp hạng top 10% — điểm các bài đến hiện tại (GPA đến hiện tại) + tỉ lệ chuyên cần,
// luôn có ít nhất 1 học viên Offline. Mỗi thẻ có biểu đồ Radar điểm từng Module để thấy học viên mạnh Module nào.
// Công thức xếp hạng nằm ở máy chủ (gpa.js); trang chỉ hiển thị.
import { get } from '../api.js';
import { h, toast, pct, closeOnBackdrop } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';

const MODE_LABEL = { Online: 'Online', Offline: 'Offline', Hybrid: 'Hybrid' };
const shortName = (s) => (s.length > 22 ? `${s.slice(0, 20)}…` : s);

function radar(canvas, modules) {
  if (!window.Chart) return null;
  const labels = modules.map((m) => shortName(m.name));
  const data = modules.map((m) => m.score ?? 0);
  const accent = '#e8365d';
  const common = { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { display: false },
    tooltip: { callbacks: { label: (c) => ` ${modules[c.dataIndex].score == null ? 'Chưa có điểm' : `${modules[c.dataIndex].score}/10`}` } } } };
  if (modules.length < 3) {   // radar cần ≥ 3 trục; ít hơn thì vẽ cột
    return new window.Chart(canvas, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: accent, borderRadius: 6, maxBarThickness: 28 }] },
      options: { ...common, scales: { y: { min: 0, max: 10, ticks: { stepSize: 5, color: '#8a8a96' }, grid: { color: 'rgba(0,0,0,.06)' } }, x: { ticks: { color: '#8a8a96' }, grid: { display: false } } } } });
  }
  return new window.Chart(canvas, { type: 'radar', data: { labels, datasets: [{ data, backgroundColor: 'rgba(232, 54, 93, .18)', borderColor: accent, borderWidth: 2,
    pointBackgroundColor: accent, pointRadius: 3 }] },
  options: { ...common, scales: { r: { min: 0, max: 10, ticks: { stepSize: 5, display: false }, grid: { color: 'rgba(0,0,0,.09)' }, angleLines: { color: 'rgba(0,0,0,.09)' },
    pointLabels: { color: '#6b6b78', font: { size: 9 } } } } } });
}

export async function openTopPerformance({ cls }) {
  let d;
  try { d = await get(`/api/classes/${cls.id}/top-performance`); } catch (e) { toast(e.message, true); return; }
  const charts = [];
  const close = () => { charts.forEach((c) => c.destroy()); back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const now = new Date();
  const day = h('div', { class: 'tp-date' },
    h('b', {}, String(now.getDate())), h('span', {}, now.toLocaleDateString('vi-VN', { month: 'long' }), h('br'), now.toLocaleDateString('vi-VN', { weekday: 'long' })));

  const card = (r) => {
    const canvas = h('canvas', { role: 'img', 'aria-label': `Biểu đồ radar điểm các Module của ${r.full_name}` });
    const done = r.modules.filter((m) => m.score != null && m.score >= 8).map((m) => m.name);
    return h('article', { class: 'tp-card' },
      h('div', { class: 'tp-no' }, String(r.rank).padStart(2, '0')),
      h('i', { class: 'tp-dash' }),
      h('h3', { title: r.full_name }, r.full_name),
      h('p', { class: 'tp-sub' }, [r.student_code, MODE_LABEL[r.mode]].filter(Boolean).join(' · ')),
      h('div', { class: 'tp-chart' }, canvas),
      h('div', { class: 'tp-stats' },
        h('span', {}, h('small', {}, 'GPA'), h('b', {}, r.gpa.toFixed(2))),
        h('span', {}, h('small', {}, 'Chuyên cần'), h('b', {}, pct(r.attendance_rate))),
        h('span', {}, h('small', {}, 'Xếp loại'), h('b', {}, r.classification ?? '—'))),
      h('p', { class: 'tp-strong', title: done.join(', ') }, done.length ? `Mạnh: ${done.slice(0, 2).map(shortName).join(', ')}${done.length > 2 ? '…' : ''}` : 'Chưa có Module đạt ≥ 8'),
      r.offline_pick ? h('span', { class: 'tp-tag' }, 'Đại diện Offline') : null);
  };

  const cards = d.rows.map(card);
  const list = h('div', { class: 'tp-row' }, ...cards);
  const bar = h('div', { class: 'tp-progress' }, h('i', {}));
  list.addEventListener('scroll', () => {
    const max = list.scrollWidth - list.clientWidth;
    bar.firstChild.style.width = `${max > 0 ? 18 + (list.scrollLeft / max) * 82 : 100}%`;
  });
  const back = h('div', { class: 'modal-back tp-back' },
    h('div', { class: 'tp-window', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Top Performance' },
      h('div', { class: 'tp-dots' }, h('i'), h('i'), h('i'), h('button', { type: 'button', class: 'tp-close', 'aria-label': 'Đóng', onclick: close }, '✕')),
      h('div', { class: 'tp-head' },
        h('div', {}, h('h2', {}, 'Top Performance'),
          h('p', {}, `${classDisplayName(cls)} · top ${Math.round(d.percent * 100)}% (${d.take}/${d.total} học viên) theo điểm các bài đến hiện tại ${Math.round(d.weights.gpa * 100)}% + chuyên cần ${Math.round(d.weights.attendance * 100)}%`)),
        day),
      d.rows.length ? list : h('p', { class: 'tp-empty' }, 'Chưa có học viên nào có điểm để xếp hạng.'),
      d.rows.length ? bar : null,
      d.rows.some((r) => r.offline_pick) ? h('p', { class: 'tp-note' }, 'Top 10% chưa có học viên học Offline nên thêm học viên Offline cao nhất (thẻ có nhãn “Đại diện Offline”).')
        : !d.has_offline && d.rows.length ? h('p', { class: 'tp-note' }, 'Lớp này chưa có học viên đăng ký học Offline.') : null));
  closeOnBackdrop(back, close);
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  // Chart cần canvas đã nằm trong DOM
  d.rows.forEach((r, i) => { const c = radar(cards[i].querySelector('canvas'), r.modules.filter((m) => !m.pending)); if (c) charts.push(c); });
  list.dispatchEvent(new Event('scroll'));
}
