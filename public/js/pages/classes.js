import { post } from '../api.js';
import { h, toast, formModal } from '../ui.js';
import { filterClasses, sortClasses, programsOf, countByTiming, TIMING_LABEL, TIMING_ORDER, SHIFT_LABEL, fmtDate, classLabel } from '../class-filter.mjs';

export async function renderClasses({ state, refreshClasses, navigate }) {
  const f = { q: '', timing: 'all', program: '' };
  const rows = h('tbody');
  const chipsTiming = h('div', { class: 'chips' });
  const chipsProgram = h('div', { class: 'chips scroll' });
  const count = h('span', { class: 'muted small' });
  const search = h('input', { type: 'search', placeholder: 'Tìm lớp: mã, chương trình, ngày…', 'aria-label': 'Tìm lớp' });

  const chip = (text, active, onClick, n) => h('button', { type: 'button', class: `chip${active ? ' active' : ''}`, 'aria-pressed': String(active), onclick: onClick },
    text, n != null && h('span', { class: 'chip-n' }, n));

  function paint() {
    const all = state.classes;
    const counts = countByTiming(all);
    chipsTiming.replaceChildren(...['all', ...TIMING_ORDER.filter((t) => counts[t] > 0)].map((t) =>
      chip(t === 'all' ? 'Tất cả' : TIMING_LABEL[t], f.timing === t, () => { f.timing = t; paint(); }, counts[t])));
    chipsProgram.replaceChildren(
      chip('Mọi chương trình', !f.program, () => { f.program = ''; paint(); }),
      ...programsOf(filterClasses(all, { timing: f.timing })).map((p) => chip(p.program, f.program === p.program,
        () => { f.program = f.program === p.program ? '' : p.program; paint(); }, p.count)));
    const list = sortClasses(filterClasses(all, f));
    count.textContent = `${list.length}/${all.length} lớp`;
    rows.replaceChildren(...list.map((c) => h('tr', { class: 'clickable', tabindex: 0,
      onclick: () => navigate(`#/c/${c.id}/dashboard`), onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/c/${c.id}/dashboard`); } },
    h('td', {}, h('b', {}, classLabel(c)), h('div', { class: 'muted small' }, c.code)),
    h('td', {}, c.program || '—'),
    h('td', {}, [c.delivery_mode, SHIFT_LABEL[c.shift]].filter(Boolean).join(' · ') || '—'),
    h('td', {}, `${fmtDate(c.start_date) || '—'}${c.end_date ? ` → ${fmtDate(c.end_date)}` : ''}`),
    h('td', { class: 'num' }, c.student_count),
    h('td', {}, h('span', { class: `badge ${c.timing === 'running' ? 'ok' : c.timing === 'upcoming' ? 'warn' : ''}` }, TIMING_LABEL[c.timing ?? 'unknown'])))));
    if (!list.length) rows.append(h('tr', {}, h('td', { colspan: 6, class: 'empty-state' }, 'Không có lớp khớp bộ lọc.')));
  }
  search.addEventListener('input', () => { f.q = search.value; paint(); });
  paint();

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Lớp học'), count, h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: async () => {
        const v = await formModal({ title: 'Tạo lớp mới', fields: [
          { name: 'code', label: 'Mã lớp', required: true, full: true },
          { name: 'name', label: 'Tên lớp (tuỳ chọn)', full: true },
          { name: 'phase', label: 'Phase (vd Phase 1)' }, { name: 'start_date', label: 'Ngày bắt đầu', type: 'date' },
          { name: 'session_count', label: 'Số buổi', type: 'number', value: 8 }, { name: 'hw_count', label: 'Số bài HW', type: 'number', value: 6 }] });
        if (!v) return;
        try {
          const c = await post('/api/classes', v);
          await refreshClasses(); toast('Đã tạo lớp'); navigate(`#/c/${c.id}/students`);
        } catch (e) { toast(e.message, true); }
      } }, '+ Tạo lớp')),
    h('div', { class: 'toolbar' }, search, chipsTiming),
    h('div', { class: 'toolbar' }, chipsProgram),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Lớp', 'Chương trình', 'Hình thức · ca', 'Thời gian', 'Học viên', 'Trạng thái'].map((x) => h('th', {}, x)))), rows)),
    h('p', { class: 'muted small' }, 'Nhập điểm danh từ Excel: chạy "npm run import -- <file.xlsx>" trên máy chủ.'));
}
