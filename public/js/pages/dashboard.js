import { get } from '../api.js';
import { h, pct } from '../ui.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function chartBox(title, hint) {
  const canvas = h('canvas', { role: 'img', 'aria-label': title });
  return { canvas, el: h('div', { class: 'card' }, h('h2', {}, title), hint && h('p', { class: 'muted small' }, hint), h('div', { class: 'chart-box' }, canvas)) };
}

export async function renderDashboard({ cls }) {
  const d = await get(`/api/classes/${cls.id}/dashboard`);
  const t = d.totals;
  const kpi = (label, value, bad) => h('div', { class: `kpi${bad ? ' bad' : ''}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));

  const root = h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, cls.code), h('div', { class: 'muted small' }, `${cls.phase || ''} · ${cls.name !== cls.code ? cls.name : ''}`))),
    h('div', { class: 'kpis' },
      kpi('Học viên đang học', `${t.active}/${t.enrolled}`),
      kpi('Bảo lưu / nghỉ', `${t.deferred} / ${t.dropped}`),
      kpi('Buổi đã diễn ra', `${t.held_sessions}/${t.total_sessions}`),
      kpi('Điểm danh TB', pct(t.avg_attendance_rate)),
      kpi('Hoàn thành HW TB', pct(t.avg_hw_rate)),
      kpi('Cần chú ý', t.at_risk, t.at_risk > 0)));

  if (!t.enrolled) {
    root.append(h('div', { class: 'empty-state' }, 'Lớp chưa có học viên. Vào tab "Học viên" để thêm, hoặc chạy "npm run import".'));
    return root;
  }

  const a = chartBox('Điểm danh theo buổi', 'Số học viên đang học theo từng trạng thái');
  const b = chartBox('Nộp bài tập', 'Số học viên đang học theo trạng thái nộp');
  const c = chartBox('Hình thức học');
  root.append(h('div', { class: 'grid2' }, a.el, b.el, c.el));

  // Chart cần canvas đã nằm trong DOM → vẽ ở tick sau.
  setTimeout(() => {
    if (!window.Chart) return;
    const text = css('--text'), border = css('--border');
    Chart.defaults.color = text; Chart.defaults.borderColor = border;
    const opts = (stacked) => ({
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked }, y: { stacked, beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { legend: { position: 'bottom' } },
    });
    const ds = (label, data, color) => ({ label, data, backgroundColor: css(color) });
    const held = d.by_session.filter((s) => s.held);
    new Chart(a.canvas, { type: 'bar', options: opts(true), data: {
      labels: held.map((s) => `B${s.session_no}`),
      datasets: [ds('Có mặt', held.map((s) => s.present), '--ok'), ds('Đi trễ', held.map((s) => s.late), '--warn'),
        ds('Có phép', held.map((s) => s.excused), '--info'), ds('Vắng', held.map((s) => s.absent), '--bad')],
    } });
    const coll = d.by_assignment.filter((x) => x.collected);
    new Chart(b.canvas, { type: 'bar', options: opts(true), data: {
      labels: coll.map((x) => (x.kind === 'capstone' ? 'CP' : `HW${x.seq}`)),
      datasets: [ds('Đã nộp', coll.map((x) => x.submitted), '--ok'), ds('Nộp lại', coll.map((x) => x.resubmit), '--warn'),
        ds('Thiếu', coll.map((x) => x.missing), '--bad')],
    } });
    const palette = ['--primary', '--ok', '--warn', '--info'].map(css);
    new Chart(c.canvas, { type: 'doughnut', options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      data: { labels: d.by_mode.map((m) => m.mode), datasets: [{ data: d.by_mode.map((m) => m.count), backgroundColor: palette, borderColor: css('--surface') }] } });
  }, 0);

  const riskCard = h('div', { class: 'card' },
    h('h2', {}, `Học viên cần chú ý (${d.at_risk.length})`),
    h('p', { class: 'muted small' }, `Điểm danh dưới ${Math.round(d.thresholds.attendance * 100)}% hoặc thiếu từ ${d.thresholds.missing_hw} bài HW trở lên.`));
  if (d.at_risk.length) {
    riskCard.append(h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Mã', 'Họ tên', 'Hình thức', 'Điểm danh', 'HW thiếu'].map((x) => h('th', {}, x)))),
      h('tbody', {}, d.at_risk.map((r) => h('tr', {},
        h('td', {}, r.student_code), h('td', {}, r.full_name), h('td', {}, r.mode || '—'),
        h('td', {}, h('span', { class: `badge ${r.attendance_rate != null && r.attendance_rate < d.thresholds.attendance ? 'bad' : ''}` }, pct(r.attendance_rate))),
        h('td', {}, h('span', { class: `badge ${r.hw_missing >= d.thresholds.missing_hw ? 'bad' : ''}` }, r.hw_missing))))))));
  } else riskCard.append(h('p', {}, 'Không có học viên nào cần chú ý.'));
  root.append(riskCard);
  return root;
}
