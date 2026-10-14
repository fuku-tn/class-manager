// Lịch dạng tháng (đủ mọi ngày của tháng, tuần bắt đầu Thứ 2): khai giảng + lịch học của các lớp mình có quyền (dữ liệu từ /api/classes).
// - Khai giảng = ngày đầu tiên của lớp (start_date). Bế giảng: chủ dự án sẽ gửi sau.
// - Lịch học = các ngày trong [start_date, end_date] trùng thứ học (cột DAYS OF WEEK, vd "24" = T2, T4; "78" = T7, CN) — classEventOn().
// - Giảng viên từng buổi: chờ Sheet phân công (chủ dự án gửi sau).
// Bấm một ngày → danh sách chi tiết các lớp của ngày đó ở dưới lịch.
import { h, icon, setChildren } from '../ui.js';
import { classDisplayName, SHIFT_LABEL, PROGRAM_NAMES, formatDays, weekdaysOf, classEventOn } from '../class-filter.mjs';

const DOW_LONG = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const SHIFT_ORDER = { morning: 0, full_day: 1, afternoon: 2, evening: 3 };
const SHIFT_SHORT = { morning: 'Sáng', afternoon: 'Chiều', evening: 'Tối', full_day: 'Cả ngày' };
const MAX_PILLS = 3;

// Ngày làm việc bằng chuỗi yyyy-mm-dd theo UTC để không lệch múi giờ.
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const todayVN = () => parse(new Date(Date.now() + 7 * 3600 * 1000).toISOString());
const mondayOf = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const fmt = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const segLabel = (c) => [c.is_b2c && 'B2C', c.is_b2b && 'B2B'].filter(Boolean).join(' + ') || '—';

export async function renderSchedule({ state }) {
  const classes = state.classes.filter((c) => c.start_date);
  const today = todayVN();
  let month = monthStart(today);
  let selected = today;
  let program = '';
  let pickerYear = today.getUTCFullYear();

  const programs = [...new Set(classes.map((c) => c.program).filter(Boolean))].sort();
  const monthLabel = h('b', { class: 'cal-range' });
  const grid = h('div', { class: 'cal-month' });
  const detail = h('div', { class: 'cal-detail' });
  const unknownBox = h('div', { class: 'cal-unknown' });
  const progSel = h('select', { 'aria-label': 'Lọc chương trình', class: 'cal-prog' },
    h('option', { value: '' }, 'Mọi chương trình'), programs.map((p) => h('option', { value: p }, p)));
  progSel.addEventListener('change', () => { program = progSel.value; paint(); });

  // ---- Sự kiện của một ngày
  function eventsOn(d) {
    const day = iso(d);
    const out = [];
    for (const c of classes) {
      if (program && c.program !== program) continue;
      const kind = classEventOn(c, day);
      if (kind) out.push({ kind, c });
    }
    return out.sort((a, b) => (a.kind === 'open' ? -1 : 0) - (b.kind === 'open' ? -1 : 0)
      || (SHIFT_ORDER[a.c.shift] ?? 9) - (SHIFT_ORDER[b.c.shift] ?? 9) || classDisplayName(a.c).localeCompare(classDisplayName(b.c)));
  }

  // ---- Ô chọn tháng (12 tháng của một năm)
  const pop = h('div', { class: 'cal-pop', hidden: true, role: 'dialog', 'aria-label': 'Chọn tháng' });
  const pickBtn = h('button', { type: 'button', class: 'cal-pick', 'aria-haspopup': 'dialog' }, icon('calendar'), h('span', {}, 'Chọn tháng'), icon('chevron'));
  function paintPicker() {
    const y = pickerYear;
    pop.replaceChildren(
      h('div', { class: 'cal-pop-head' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Năm trước', onclick: () => { pickerYear--; paintPicker(); } }, '‹'),
        h('b', {}, `Năm ${y}`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Năm sau', onclick: () => { pickerYear++; paintPicker(); } }, '›')),
      h('div', { class: 'cal-pop-months' }, Array.from({ length: 12 }, (_, m) => {
        const cur = month.getUTCFullYear() === y && month.getUTCMonth() === m;
        const isNow = today.getUTCFullYear() === y && today.getUTCMonth() === m;
        const opens = classes.filter((c) => (!program || c.program === program) && c.start_date?.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).length;
        return h('button', { type: 'button', class: `cal-mo${cur ? ' cur' : ''}${isNow ? ' now' : ''}`,
          onclick: () => { month = new Date(Date.UTC(y, m, 1)); selected = isNow ? today : month; pop.hidden = true; paint(); } },
          h('span', {}, `Tháng ${m + 1}`), opens ? h('small', {}, `${opens} khai giảng`) : null);
      })));
  }
  pickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) { pickerYear = month.getUTCFullYear(); paintPicker(); }
  });
  const closePop = (e) => {
    if (!root.isConnected) { document.removeEventListener('click', closePop); document.removeEventListener('keydown', closePop); return; }
    if (e.type === 'keydown' ? e.key === 'Escape' : !pop.contains(e.target)) pop.hidden = true;
  };
  document.addEventListener('click', closePop);
  document.addEventListener('keydown', closePop);

  // ---- Thẻ chi tiết một lớp (danh sách dưới lịch)
  const eventCard = ({ kind, c }) => h('a', { class: `cal-ev ${kind}`, href: `#/c/${c.id}/dashboard`, title: c.code },
    h('div', { class: 'cal-ev-top' }, h('span', { class: 'cal-time' }, SHIFT_LABEL[c.shift] ?? 'Chưa rõ ca'),
      kind === 'open' ? h('span', { class: 'cal-tag' }, 'Khai giảng') : null),
    h('div', { class: 'cal-ev-title' }, classDisplayName(c)),
    h('div', { class: 'cal-ev-sub' }, PROGRAM_NAMES[c.program] ?? c.program ?? ''),
    h('div', { class: 'cal-ev-meta' }, icon('students'), `${c.delivery_mode ?? '—'} · ${segLabel(c)}`),
    c.days_of_week ? h('div', { class: 'cal-ev-meta' }, icon('calendar'), `Thứ học: ${formatDays(c.days_of_week)}`) : null,
    h('div', { class: 'cal-ev-meta muted' }, 'GV: chờ phân công'));

  function paintDetail() {
    const evs = eventsOn(selected);
    setChildren(detail,
      h('div', { class: 'cal-detail-head' },
        h('b', {}, `${DOW_LONG[selected.getUTCDay()]}, ${fmt(selected)}`),
        h('span', { class: 'muted small' }, evs.length ? `${evs.length} lớp` : 'Không có lớp')),
      evs.length ? h('div', { class: 'cal-detail-list' }, evs.map(eventCard)) : null);
  }

  function paint() {
    const y = month.getUTCFullYear(); const mo = month.getUTCMonth();
    monthLabel.textContent = `Tháng ${mo + 1}/${y}`;
    const start = mondayOf(month);
    const next = new Date(Date.UTC(y, mo + 1, 1));
    const weeks = Math.ceil((next - start) / (7 * 864e5));
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const inMonth = d.getUTCMonth() === mo;
      const isToday = iso(d) === iso(today);
      const isSel = iso(d) === iso(selected);
      const evs = inMonth ? eventsOn(d) : [];
      const pick = () => { selected = d; paint(); };
      cells.push(h('div', { class: `cal-cell${inMonth ? '' : ' out'}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}`,
        role: 'button', tabindex: inMonth ? 0 : -1, 'aria-label': `${DOW_LONG[d.getUTCDay()]} ${fmt(d)}${evs.length ? `, ${evs.length} lớp` : ''}`,
        onclick: inMonth ? pick : null, onkeydown: inMonth ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } : null },
        h('span', { class: 'cal-date' }, String(d.getUTCDate())),
        evs.slice(0, MAX_PILLS).map(({ kind, c }) => h('span', { class: `cal-pill ${kind}`, title: `${kind === 'open' ? 'Khai giảng · ' : ''}${classDisplayName(c)} · ${SHIFT_LABEL[c.shift] ?? ''}` },
          h('i', {}), h('em', {}, SHIFT_SHORT[c.shift] ?? ''), h('span', {}, classDisplayName(c)))),
        evs.length > MAX_PILLS ? h('span', { class: 'cal-more' }, `+${evs.length - MAX_PILLS} lớp`) : null));
    }
    grid.replaceChildren(...['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => h('div', { class: 'cal-dowh' }, x)), ...cells);
    paintDetail();
    // Lớp đang học trong tháng nhưng chưa có thứ học → không xếp được buổi học vào ngày
    const mStart = iso(month); const mEnd = iso(addDays(next, -1));
    const unknown = classes.filter((c) => (!program || c.program === program) && !weekdaysOf(c.days_of_week).size
      && c.start_date <= mEnd && (!c.end_date || c.end_date >= mStart));
    unknownBox.replaceChildren(...(unknown.length ? [
      h('span', { class: 'muted small' }, `${unknown.length} lớp học trong tháng chưa có thứ học (cột DAYS OF WEEK trong Google Sheet) nên chỉ hiện ngày khai giảng: `),
      ...unknown.map((c) => h('a', { class: 'chip', href: `#/c/${c.id}/dashboard`, title: `${c.code} · ${SHIFT_LABEL[c.shift] ?? ''}` }, classDisplayName(c)))] : []));
  }

  const nav = (n) => () => {
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + n, 1));
    selected = month.getUTCFullYear() === today.getUTCFullYear() && month.getUTCMonth() === today.getUTCMonth() ? today : month;
    paint();
  };
  const root = h('div', {},
    h('section', { class: 'cal' },
      h('div', { class: 'cal-top' },
        h('div', { class: 'cal-nav' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng trước', onclick: nav(-1) }, '‹'),
          monthLabel,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng sau', onclick: nav(1) }, '›'),
          h('button', { type: 'button', class: 'cal-today', onclick: () => { month = monthStart(today); selected = today; paint(); } }, 'Hôm nay')),
        h('h1', { class: 'cal-title' }, 'Lịch khai giảng & giảng dạy'),
        h('div', { class: 'cal-tools' }, progSel, h('div', { class: 'cal-pick-wrap' }, pickBtn, pop))),
      h('div', { class: 'cal-legend muted small' },
        h('span', {}, h('i', { class: 'lg open' }), 'Khai giảng (ngày đầu tiên của lớp)'),
        h('span', {}, h('i', { class: 'lg teach' }), 'Buổi học theo thứ học'),
        h('span', {}, 'Bấm một ngày để xem chi tiết · Bế giảng: chờ cập nhật · Giảng viên: chờ lịch phân công')),
      grid,
      unknownBox),
    h('section', { class: 'cal cal-day-panel' }, detail));
  paint();
  return root;
}
