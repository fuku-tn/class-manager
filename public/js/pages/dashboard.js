import { get } from '../api.js';
import { h, pct, icon } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function chartBox(title, hint, emptyText) {
  const canvas = h('canvas', { role: 'img', 'aria-label': title });
  const box = h('div', { class: 'chart-box' }, emptyText ? h('div', { class: 'chart-empty' }, emptyText) : canvas);
  return { canvas, empty: !!emptyText, el: h('div', { class: 'card' }, h('h2', {}, title), hint && h('p', { class: 'muted small' }, hint), box) };
}

const shortcut = (href, iconName, title, text) =>
  h('a', { class: 'shortcut', href }, icon(iconName), h('b', {}, title), h('span', {}, text), h('div', { class: 'go' }, icon('arrow')));

const PROFILE_SECTIONS = [['department', 'Phòng ban'], ['goals', 'Mục tiêu tham gia'], ['experience', 'Kinh nghiệm'], ['sources', 'Nguồn biết đến'], ['job_title', 'Vị trí'], ['delivery', 'Hình thức học']];
function profileCard(p) {
  const section = ([key, title]) => {
    const list = (p.summary[key] ?? []).slice(0, 6);
    if (!list.length) return null;
    const max = Math.max(...list.map((x) => x.count));
    return h('div', { class: 'prof-sec' }, h('h3', {}, title),
      list.map((x) => h('div', { class: 'bar-row' },
        h('span', { class: 'bar-label', title: x.label }, x.label),
        h('span', { class: 'bar-track' }, h('i', { style: `width:${Math.round((x.count / max) * 100)}%` })),
        h('span', { class: 'bar-n' }, x.count))));
  };
  return h('section', { class: 'card' },
    h('div', { class: 'eyebrow' }, 'Chỉ admin'),
    h('h2', {}, 'Hồ sơ lớp từ phiếu đăng ký'),
    h('p', { class: 'muted small' }, `${p.with_form}/${p.total} học viên có phiếu đăng ký (FORM). Đã loại thông tin cá nhân (họ tên, SĐT, email, địa chỉ, ngày sinh, tên công ty).`),
    h('div', { class: 'prof-grid' }, PROFILE_SECTIONS.map(section)));
}

export async function renderDashboard({ cls, state }) {
  const d = await get(`/api/classes/${cls.id}/dashboard`);
  const t = d.totals;
  const kpi = (label, value, bad) => h('div', { class: `kpi${bad ? ' bad' : ''}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));
  const riskAnchor = h('div', { id: 'at-risk' });

  const root = h('div', {},
    h('section', { class: 'hero' },
      h('div', {},
        h('div', { class: 'eyebrow' }, [cls.phase, 'Tổng quan lớp học'].filter(Boolean).join(' · ')),
        h('h1', {}, 'Theo dõi lớp ', h('span', { class: 'accent', title: cls.code }, classDisplayName(cls))),
        h('p', {}, `${t.active} học viên đang học · ${t.held_sessions}/${t.total_sessions} buổi đã diễn ra. Điểm danh, bài tập và cảnh báo được tổng hợp tự động.`)),
      h('div', { class: 'hero-card' },
        h('div', { class: 'label' }, 'Chuyên cần trung bình'),
        h('div', { class: 'big' }, pct(t.avg_attendance_rate)),
        h('div', { class: 'hero-stats' },
          h('div', {}, h('b', {}, `${t.active}/${t.enrolled}`), h('span', {}, 'Đang học')),
          h('div', {}, h('b', {}, pct(t.avg_hw_rate)), h('span', {}, 'Hoàn thành HW')),
          h('div', {}, h('b', {}, t.at_risk), h('span', {}, 'Cần chú ý'))),
        h('button', { class: 'primary', onclick: () => document.getElementById('at-risk')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
          'Xem học viên cần chú ý'))),
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

  const a = chartBox('Điểm danh theo buổi', 'Số học viên đang học theo từng trạng thái', d.by_session.some((x) => x.held) ? null : 'Chưa có buổi nào được điểm danh.');
  const b = chartBox('Nộp bài tập', 'Số học viên đang học theo trạng thái nộp', d.by_assignment.some((x) => x.collected) ? null : 'Chưa thu bài tập nào.');
  const c = chartBox('Hình thức học', 'Phân bố học viên đang học');
  root.append(h('div', { class: 'grid2' }, a.el, b.el, c.el));

  // Hồ sơ lớp từ phiếu đăng ký (FORM): chỉ admin. Đã loại thông tin cá nhân, chỉ có số liệu tổng hợp.
  if (state?.user?.role === 'admin') {
    const prof = await get(`/api/classes/${cls.id}/profiles`).catch(() => null);
    if (prof && prof.with_form > 0) root.append(profileCard(prof));
  }

  // Chart cần canvas đã nằm trong DOM → vẽ ở tick sau.
  setTimeout(() => {
    if (!window.Chart) return;
    Chart.defaults.color = css('--muted'); Chart.defaults.borderColor = css('--border');
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.font.size = 12;
    const opts = (stacked) => ({
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked, grid: { display: false } }, y: { stacked, beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
    });
    const ds = (label, data, color) => ({ label, data, backgroundColor: css(color), borderRadius: 5, borderSkipped: false, maxBarThickness: 38 });
    const held = d.by_session.filter((s) => s.held);
    if (!a.empty) new Chart(a.canvas, { type: 'bar', options: opts(true), data: {
      labels: held.map((s) => `B${s.session_no}`),
      datasets: [ds('Có mặt', held.map((s) => s.present), '--ok'), ds('Đi trễ', held.map((s) => s.late), '--warn'),
        ds('Có phép', held.map((s) => s.excused), '--info'), ds('Vắng', held.map((s) => s.absent), '--bad')],
    } });
    const coll = d.by_assignment.filter((x) => x.collected);
    if (!b.empty) new Chart(b.canvas, { type: 'bar', options: opts(true), data: {
      labels: coll.map((x) => (x.kind === 'capstone' ? 'CP' : `HW${x.seq}`)),
      datasets: [ds('Đã nộp', coll.map((x) => x.submitted), '--ok'), ds('Nộp lại', coll.map((x) => x.resubmit), '--warn'),
        ds('Thiếu', coll.map((x) => x.missing), '--bad')],
    } });
    const palette = ['--cat-1', '--cat-2', '--cat-3', '--cat-4'].map(css);
    new Chart(c.canvas, { type: 'doughnut', options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } },
      data: { labels: d.by_mode.map((m) => m.mode), datasets: [{ data: d.by_mode.map((m) => m.count), backgroundColor: palette, borderColor: css('--solid'), borderWidth: 3 }] } });
  }, 0);

  const riskCard = h('div', { class: 'card' }, riskAnchor,
    h('div', { class: 'eyebrow' }, 'Cần chú ý'),
    h('h2', { style: 'margin-top:.3rem' }, `Học viên cần chú ý (${d.at_risk.length})`),
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

  root.append(h('div', { class: 'shortcuts' },
    shortcut(`#/c/${cls.id}/attendance`, 'attendance', 'Điểm danh', 'Ghi nhận chuyên cần từng buổi chỉ với một cú bấm.'),
    shortcut(`#/c/${cls.id}/students`, 'students', 'Học viên', 'Danh sách, bảo lưu và xuất CSV.'),
    shortcut(`#/c/${cls.id}/homework`, 'homework', 'Bài tập', 'Theo dõi HW, Challenge và Capstone.')));
  return root;
}
