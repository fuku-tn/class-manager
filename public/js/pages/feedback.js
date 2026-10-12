// Khảo sát sau khóa (chỉ admin): tổng quan toàn trung tâm + theo từng lớp. Số liệu do máy chủ tính (stats.js).
// Không có thông tin cá nhân và không có câu trả lời chữ tự do trong dữ liệu này.
import { get } from '../api.js';
import { h } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';

const fmt = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d).replace('.', ','));

// Thanh điểm 1–7 / 1–10
function scoreRow(q) {
  const pct = q.avg == null ? 0 : Math.round((q.avg / q.scale) * 100);
  return h('div', { class: 'bar-row' },
    h('span', { class: 'bar-label', title: q.label }, q.label),
    h('span', { class: 'bar-track' }, h('i', { style: `width:${pct}%` })),
    h('span', { class: 'bar-n', title: `${q.n} phiếu` }, q.avg == null ? '—' : fmt(q.avg)));
}

export function feedbackSummaryBlock(summary, groupLabels, { limitNote = '' } = {}) {
  const kpi = (label, value, hint) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, label), h('b', {}, value), hint ? h('span', { class: 'muted small' }, hint) : null);
  const groups = Object.keys(groupLabels);
  const more = summary.more_courses;
  return h('div', {},
    h('div', { class: 'kv-grid' },
      kpi('Số phiếu', summary.n),
      kpi('Trải nghiệm tổng thể', `${fmt(summary.overall_avg)}/10`),
      kpi('NPS (giới thiệu)', summary.nps == null ? '—' : `${summary.nps > 0 ? '+' : ''}${summary.nps}`, 'từ −100 đến +100'),
      kpi('Muốn học thêm', summary.n ? `${Math.round(((more.yes + more.maybe) / summary.n) * 100)}%` : '—', `${more.yes} chắc chắn · ${more.maybe} có thể`)),
    limitNote ? h('p', { class: 'muted small' }, limitNote) : null,
    h('div', { class: 'prof-grid' }, groups.filter((g) => g !== 'overall').map((g) => h('div', { class: 'prof-sec' },
      h('h3', {}, groupLabels[g]),
      summary.questions.filter((q) => q.group === g && q.n > 0).map(scoreRow)))),
    summary.next_courses.length
      ? h('div', { class: 'prof-sec' }, h('h3', {}, 'Khóa học muốn tham gia tiếp'),
        summary.next_courses.map((c) => h('span', { class: 'badge', style: 'margin:.15rem .3rem .15rem 0' }, `${c.label} · ${c.count}`)))
      : null);
}

export async function renderFeedback({ state, navigate }) {
  const d = await get('/api/feedback');
  const s = d.summary;
  const root = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Khảo sát sau khóa'), h('span', { class: 'muted' }, 'Chỉ admin')),
    h('p', { class: 'muted small' }, 'Nguồn: sheet FEEDBACK FORM. Đã loại họ tên, email, SĐT, câu trả lời chữ tự do và câu hỏi về học phí. Điểm các tiêu chí theo thang 1–7; trải nghiệm tổng thể và mức giới thiệu theo thang 1–10.'));
  if (!s.n) {
    root.append(h('div', { class: 'empty-state' }, 'Chưa có khảo sát nào. Nhập bằng lệnh "npm run import-feedback -- <file.xlsx>".'));
    return root;
  }
  root.append(h('section', { class: 'card' }, h('h2', {}, 'Toàn trung tâm'),
    feedbackSummaryBlock(s, d.group_labels, { limitNote: d.unmatched ? `${d.unmatched} phiếu chưa gán được lớp (mã khóa học ghi không rõ).` : '' })));
  const byClass = d.classes;
  if (byClass.length) {
    const cls = (id) => state.classes.find((c) => c.id === id);
    root.append(h('section', { class: 'card' }, h('h2', {}, 'Theo lớp'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Lớp', 'Số phiếu', 'Trải nghiệm TB (/10)', 'NPS'].map((x) => h('th', {}, x)))),
        h('tbody', {}, byClass.map((c) => h('tr', { class: 'clickable', tabindex: 0, onclick: () => navigate(`#/c/${c.class_id}/dashboard`),
          onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/c/${c.class_id}/dashboard`); } },
        h('td', {}, cls(c.class_id) ? classDisplayName(cls(c.class_id)) : c.short_code),
        h('td', { class: 'num' }, c.n), h('td', { class: 'num' }, fmt(c.overall_avg)),
        h('td', { class: 'num' }, c.nps == null ? '—' : `${c.nps > 0 ? '+' : ''}${c.nps}`))))))));
  }
  return root;
}
