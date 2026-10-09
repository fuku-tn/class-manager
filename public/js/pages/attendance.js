import { get, put, post } from '../api.js';
import { h, toast, pct, formModal } from '../ui.js';

const CYCLE = [null, 'present', 'late', 'absent', 'excused'];
const SHORT = { present: '✓', late: 'T', absent: 'V', excused: 'P' };
const LABEL = { present: 'Có mặt', late: 'Đi trễ', absent: 'Vắng', excused: 'Có phép' };

export async function renderAttendance({ cls }) {
  const base = `/api/classes/${cls.id}`;
  const data = await get(`${base}/attendance`);
  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const body = h('tbody');
  const head = h('thead');

  const paintCell = (btn, cell) => {
    const st = cell?.status ?? null;
    btn.className = `cell ${st ?? 'empty'}${cell?.note ? ' has-note' : ''}`;
    btn.textContent = st ? SHORT[st] : '·';
    btn.title = (st ? LABEL[st] : 'Chưa điểm danh') + (cell?.note ? ` — ${cell.note}` : '');
  };

  async function save(row, session, btn, status, note) {
    const prev = row.cells[session.id];
    row.cells[session.id] = status ? { status, note: note ?? prev?.note ?? null } : null;
    paintCell(btn, row.cells[session.id]);
    try {
      await put(`${base}/attendance`, { enrollment_id: row.enrollment_id, session_id: session.id, status, note: row.cells[session.id]?.note ?? null });
      if (status && !session.held) { session.held = 1; }
    } catch (e) {
      row.cells[session.id] = prev; paintCell(btn, prev); toast(e.message, true);
    }
  }

  function renderHead() {
    head.replaceChildren(h('tr', {},
      h('th', { class: 'sticky' }, 'Học viên'),
      data.sessions.map((s) => h('th', { class: 'num', title: s.title || '' }, h('div', { class: 'sess-head' },
        h('div', { class: 'sess-title' }, `B${s.session_no}`,
        h('button', { class: 'small', title: 'Sửa tên/ngày buổi học', onclick: async () => {
          const v = await formModal({ title: `Buổi ${s.session_no}`, fields: [
            { name: 'title', label: 'Tên buổi', value: s.title, full: true },
            { name: 'session_date', label: 'Ngày học', type: 'date', value: s.session_date }] });
          if (!v) return;
          try { await put(`${base}/sessions/${s.id}`, v); await reload(); } catch (e) { toast(e.message, true); }
        } }, '✎')),
        h('div', { class: 'muted small' }, s.session_date || ''),
        h('button', { class: 'small', title: 'Đánh dấu tất cả chưa điểm danh là Có mặt', onclick: async () => {
          try { await post(`${base}/sessions/${s.id}/attendance/bulk`, { status: 'present' }); toast(`Đã điểm danh cả lớp buổi ${s.session_no}`); await reload(); }
          catch (e) { toast(e.message, true); }
        } }, 'Cả lớp ✓')))),
      h('th', { class: 'num' }, 'Tỉ lệ')));
  }

  function renderBody() {
    const q = search.value.trim().toLowerCase();
    body.replaceChildren(...data.rows
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.student_code.toLowerCase().includes(q))
      .map((row) => {
        const rate = h('td', { class: 'num' }, pct(row.attendance_rate));
        return h('tr', { class: row.course_status === 'active' ? '' : 'inactive' },
          h('td', { class: 'sticky' }, row.full_name, h('div', { class: 'muted small' }, row.student_code + (row.course_status !== 'active' ? ` · ${row.course_status}` : ''))),
          data.sessions.map((s) => {
            const btn = h('button', { 'aria-label': `${row.full_name} buổi ${s.session_no}` });
            paintCell(btn, row.cells[s.id]);
            btn.addEventListener('click', async (ev) => {
              if (ev.shiftKey) { // Shift+click: sửa ghi chú
                const cur = row.cells[s.id];
                const v = await formModal({ title: `${row.full_name} — Buổi ${s.session_no}`, fields: [
                  { name: 'status', label: 'Trạng thái', type: 'select', value: cur?.status ?? '', options: [['', '(chưa điểm danh)'], ...Object.entries(LABEL)] },
                  { name: 'note', label: 'Ghi chú', type: 'textarea', value: cur?.note, full: true }] });
                if (v) await save(row, s, btn, v.status || null, v.note);
                return;
              }
              const cur = row.cells[s.id]?.status ?? null;
              await save(row, s, btn, CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]);
            });
            return h('td', { class: 'num' }, btn);
          }), rate);
      }));
  }

  async function reload() {
    Object.assign(data, await get(`${base}/attendance`));
    renderHead(); renderBody();
  }

  search.addEventListener('input', renderBody);
  renderHead(); renderBody();
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Điểm danh'), h('span', { class: 'muted' }, cls.code)),
    h('div', { class: 'legend' },
      h('span', {}, 'Bấm ô để đổi: '), ...Object.entries(LABEL).map(([k, v]) => h('span', {}, h('span', { class: `cell ${k}` }, SHORT[k]), ` ${v}`)),
      h('span', { class: 'muted' }, '· Shift+bấm để ghi chú · Tỉ lệ = (có mặt + trễ) / (buổi đã diễn ra − có phép)')),
    h('div', { class: 'toolbar' }, search),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table-att' }, head, body)));
}
