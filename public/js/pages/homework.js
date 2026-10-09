import { get, put } from '../api.js';
import { h, toast, pct, formModal } from '../ui.js';

const SHORT = { submitted: '✓', resubmit: '↻', missing: '✗' };
const LABEL = { submitted: 'Đã nộp', resubmit: 'Nộp lại', missing: 'Thiếu' };

export async function renderHomework({ cls }) {
  const base = `/api/classes/${cls.id}`;
  const data = await get(`${base}/submissions`);
  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const body = h('tbody');
  const head = h('thead');

  const paint = (btn, cell) => {
    const st = cell?.status ?? null;
    btn.className = `cell ${st ?? 'empty'}${cell?.note ? ' has-note' : ''}`;
    btn.textContent = st ? SHORT[st] + (cell.challenge ? '★' : '') : '·';
    btn.title = (st ? LABEL[st] : 'Chưa ghi nhận') + (cell?.challenge ? ' · có làm Challenge' : '') + (cell?.note ? ` — ${cell.note}` : '');
  };

  head.append(h('tr', {},
    h('th', { class: 'sticky' }, 'Học viên'),
    data.assignments.map((a) => h('th', { class: 'num', title: a.title }, a.kind === 'capstone' ? 'Capstone' : `HW${a.seq}`)),
    h('th', { class: 'num' }, 'Hoàn thành HW')));

  function renderBody() {
    const q = search.value.trim().toLowerCase();
    body.replaceChildren(...data.rows
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.student_code.toLowerCase().includes(q))
      .map((row) => h('tr', { class: row.course_status === 'active' ? '' : 'inactive' },
        h('td', { class: 'sticky' }, row.full_name, h('div', { class: 'muted small' }, row.student_code)),
        data.assignments.map((a) => {
          const btn = h('button', { 'aria-label': `${row.full_name} ${a.title}` });
          paint(btn, row.cells[a.id]);
          btn.addEventListener('click', async () => {
            const cur = row.cells[a.id];
            const v = await formModal({ title: `${row.full_name} — ${a.title}`, fields: [
              { name: 'status', label: 'Trạng thái', type: 'select', value: cur?.status ?? '', options: [['', '(chưa ghi nhận)'], ...Object.entries(LABEL)], full: true },
              { name: 'challenge', label: 'Có làm bài Challenge', type: 'checkbox', value: cur?.challenge },
              { name: 'note', label: 'Ghi chú', type: 'textarea', value: cur?.note, full: true }] });
            if (!v) return;
            try {
              const status = v.status || null;
              await put(`${base}/submissions`, { enrollment_id: row.enrollment_id, assignment_id: a.id, status, challenge: v.challenge, note: v.note });
              row.cells[a.id] = status ? { status, challenge: v.challenge, note: v.note || null } : null;
              paint(btn, row.cells[a.id]);
            } catch (e) { toast(e.message, true); }
          });
          return h('td', { class: 'num' }, btn);
        }),
        h('td', { class: 'num' }, pct(row.hw_rate)))));
  }

  search.addEventListener('input', renderBody);
  renderBody();
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Bài tập'), h('span', { class: 'muted' }, cls.code)),
    h('div', { class: 'legend' },
      h('span', {}, 'Bấm ô để cập nhật: '), ...Object.entries(LABEL).map(([k, v]) => h('span', {}, h('span', { class: `cell ${k}` }, SHORT[k]), ` ${v}`)),
      h('span', { class: 'muted' }, '· ★ = có làm Challenge · "Nộp lại" chưa tính là hoàn thành')),
    h('div', { class: 'toolbar' }, search),
    h('div', { class: 'table-wrap' }, h('table', {}, head, body)));
}
