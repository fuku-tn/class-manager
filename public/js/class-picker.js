// Bộ chọn lớp: thay cho dropdown 124 lớp. Nút hiện lớp hiện tại; bấm mở bảng có ô tìm, lọc theo thời gian
// và chương trình, danh sách giới hạn, điều khiển bằng bàn phím (↑ ↓ Enter Esc).
import { h, icon } from './ui.js';
import {
  filterClasses, pickerFilter, sortClasses, programsOf, countByTiming, countBySegment, defaultTiming, timingChipKeys, classLabel, fmtDate,
  TIMING_LABEL, SHIFT_LABEL, PROGRAM_NAMES, SEGMENT_LABEL,
} from './class-filter.mjs';

const MAX_ROWS = 60;

export function createClassPicker({ getClasses, getCurrentId, onSelect, storage }) {
  const saved = (() => { try { return JSON.parse(storage?.get('classPickerFilter') || 'null'); } catch { return null; } })();
  const state = { open: false, q: '', timing: saved?.timing ?? null, program: saved?.program ?? '', segment: saved?.segment ?? '', active: 0, shown: [] };

  const label = h('span', { class: 'picker-label' });
  const sub = h('span', { class: 'picker-sub' });
  const btn = h('button', { class: 'picker-btn', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: 'Chọn lớp' },
    icon('classes'), h('span', { class: 'picker-text' }, label, sub), icon('chevron'));
  const search = h('input', { class: 'picker-search', type: 'search', placeholder: 'Tìm lớp: mã, chương trình, ngày…', 'aria-label': 'Tìm lớp', autocomplete: 'off' });
  const timingChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Lọc theo thời gian' });
  const segmentChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Lọc B2B / B2C' });
  const programChips = h('div', { class: 'chips scroll', role: 'group', 'aria-label': 'Lọc theo chương trình' });
  const list = h('ul', { class: 'picker-list', role: 'listbox', 'aria-label': 'Danh sách lớp' });
  const foot = h('div', { class: 'picker-foot muted small' });
  const panel = h('div', { class: 'picker-panel', hidden: true }, search, timingChips, segmentChips, programChips, list, foot);
  const root = h('div', { class: 'picker' }, btn, panel);

  const persist = () => { try { storage?.set('classPickerFilter', JSON.stringify({ timing: state.timing, program: state.program, segment: state.segment })); } catch { /* bỏ qua */ } };
  const effectiveTiming = () => state.timing ?? defaultTiming(getClasses());

  function chip(text, active, onClick, count) {
    return h('button', { type: 'button', class: `chip${active ? ' active' : ''}`, 'aria-pressed': String(active), onclick: onClick },
      text, count != null && h('span', { class: 'chip-n' }, count));
  }

  function renderBtn() {
    const cur = getClasses().find((c) => String(c.id) === String(getCurrentId()));
    label.textContent = cur ? classLabel(cur) : 'Chọn lớp';
    sub.textContent = cur ? [fmtDate(cur.start_date), cur.delivery_mode].filter(Boolean).join(' · ') : '';
  }

  function render() {
    const all = getClasses();
    const searching = state.q.trim() !== '';
    const timing = effectiveTiming();       // chip đang chọn (chỉ dùng khi không gõ tìm)
    const counts = countByTiming(all);
    timingChips.replaceChildren(
      ...timingChipKeys(counts).map((t) =>
        chip(t === 'all' ? 'Tất cả' : TIMING_LABEL[t], timing === t, () => { state.timing = t; state.active = 0; persist(); render(); }, counts[t])));

    const seg = countBySegment(filterClasses(all, { timing }));
    segmentChips.replaceChildren(
      chip('B2C + B2B', !state.segment, () => { state.segment = ''; state.active = 0; persist(); render(); }),
      ...['b2c', 'b2b'].filter((s) => seg[s] > 0).map((s) => chip(SEGMENT_LABEL[s], state.segment === s,
        () => { state.segment = state.segment === s ? '' : s; state.active = 0; persist(); render(); }, seg[s])));

    const inTiming = filterClasses(all, { timing, segment: state.segment });
    programChips.replaceChildren(
      chip('Mọi chương trình', !state.program, () => { state.program = ''; state.active = 0; persist(); render(); }),
      ...programsOf(inTiming).map((p) => chip(p.program, state.program === p.program,
        () => { state.program = state.program === p.program ? '' : p.program; state.active = 0; persist(); render(); }, p.count)));

    // Đang gõ tìm thì tìm trong TẤT CẢ lớp (lớp cũ/đã kết thúc cũng ra), không bị chip thời gian che.
    const matched = sortClasses(pickerFilter(all, { q: state.q, program: state.program, timing, segment: state.segment }));
    state.shown = matched.slice(0, MAX_ROWS);
    if (state.active >= state.shown.length) state.active = Math.max(0, state.shown.length - 1);
    list.replaceChildren(...state.shown.map((c, i) => {
      const meta = [c.delivery_mode, SHIFT_LABEL[c.shift]].filter(Boolean).join(' · ');
      return h('li', {
        role: 'option', id: `picker-opt-${c.id}`, 'aria-selected': String(String(c.id) === String(getCurrentId())),
        class: `picker-item${i === state.active ? ' active' : ''}${String(c.id) === String(getCurrentId()) ? ' current' : ''}`,
        onmouseenter: () => { state.active = i; markActive(); },
        onclick: () => choose(c),
      },
      h('span', { class: `dot ${c.timing ?? 'unknown'}`, title: TIMING_LABEL[c.timing ?? 'unknown'] }),
      h('span', { class: 'picker-item-main' },
        h('b', {}, classLabel(c)),
        h('span', { class: 'muted small' }, PROGRAM_NAMES[c.program] ?? c.program ?? '')),
      h('span', { class: 'picker-item-meta muted small' },
        h('span', {}, `${fmtDate(c.start_date) || '—'}${c.end_date ? ` → ${fmtDate(c.end_date)}` : ''}`),
        h('span', {}, `${meta ? `${meta} · ` : ''}${c.student_count ?? 0} HV`)));
    }));
    if (!state.shown.length) list.append(h('li', { class: 'picker-empty' }, 'Không có lớp khớp. Thử bỏ bớt bộ lọc.'));
    foot.textContent = matched.length > MAX_ROWS
      ? `Hiện ${MAX_ROWS}/${matched.length} lớp — gõ để thu hẹp`
      : `${matched.length}/${all.length} lớp${searching ? ' · đang tìm trong tất cả lớp' : ''}`;
  }

  function markActive() {
    [...list.children].forEach((li, i) => li.classList.toggle('active', i === state.active));
    list.children[state.active]?.scrollIntoView?.({ block: 'nearest' });
  }

  function choose(c) { close(); onSelect(c); }

  function open() {
    if (state.open) return;
    state.open = true; state.q = ''; search.value = '';
    state.active = Math.max(0, sortClasses(filterClasses(getClasses(), { timing: effectiveTiming(), program: state.program }))
      .findIndex((c) => String(c.id) === String(getCurrentId())));
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    render();
    markActive();
    search.focus();
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    document.addEventListener('keydown', onKey);
  }
  function close() {
    if (!state.open) return;
    state.open = false; panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey);
    btn.focus({ preventScroll: true });
  }
  const outside = (e) => { if (!root.contains(e.target)) close(); };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); state.active = Math.min(state.shown.length - 1, state.active + 1); markActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.active = Math.max(0, state.active - 1); markActive(); }
    else if (e.key === 'Enter' && document.activeElement === search) { e.preventDefault(); if (state.shown[state.active]) choose(state.shown[state.active]); }
  }

  btn.addEventListener('click', () => (state.open ? close() : open()));
  search.addEventListener('input', () => { state.q = search.value; state.active = 0; render(); });

  renderBtn();
  return { el: root, update: () => { renderBtn(); if (state.open) render(); } };
}
