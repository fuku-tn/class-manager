// Lịch dạng tuần (Thứ 2 → Chủ nhật): khai giảng + lịch học của các lớp mình có quyền (dữ liệu từ /api/classes).
// - Khai giảng = ngày đầu tiên của lớp (start_date). Bế giảng: chủ dự án sẽ gửi sau.
// - Lịch học = các ngày trong [start_date, end_date] trùng thứ học (cột DAYS OF WEEK, vd "24" = T2, T4; "78" = T7, CN).
// - Giảng viên từng buổi: chờ Sheet phân công (chủ dự án gửi sau).
import { h, icon } from '../ui.js';
import { classDisplayName, SHIFT_LABEL, PROGRAM_NAMES, formatDays, weekdaysOf, classEventOn } from '../class-filter.mjs';

const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DOW_LONG = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const SHIFT_ORDER = { morning: 0, full_day: 1, afternoon: 2, evening: 3 };

// Ngày làm việc bằng chuỗi yyyy-mm-dd theo UTC để không lệch múi giờ.
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const todayVN = () => parse(new Date(Date.now() + 7 * 3600 * 1000).toISOString());
const mondayOf = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));
const dd = (d) => String(d.getUTCDate()).padStart(2, '0');
const mm = (d) => String(d.getUTCMonth() + 1).padStart(2, '0');

const segLabel = (c) => [c.is_b2c && 'B2C', c.is_b2b && 'B2B'].filter(Boolean).join(' + ') || '—';

export async function renderSchedule({ state }) {
  const classes = state.classes.filter((c) => c.start_date);
  const today = todayVN();
  let weekStart = mondayOf(today);
  let program = '';
  let pickerMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const programs = [...new Set(classes.map((c) => c.program).filter(Boolean))].sort();
  const rangeLabel = h('b', { class: 'cal-range' });
  const grid = h('div', { class: 'cal-grid' });
  const unknownBox = h('div', { class: 'cal-unknown' });
  const progSel = h('select', { 'aria-label': 'Lọc chương trình', class: 'cal-prog' },
    h('option', { value: '' }, 'Mọi chương trình'), programs.map((p) => h('option', { value: p }, p)));
  progSel.addEventListener('change', () => { program = progSel.value; paint(); });

  // ---- Ô chọn ngày (lịch tháng nhỏ)
  const pop = h('div', { class: 'cal-pop', hidden: true, role: 'dialog', 'aria-label': 'Chọn ngày' });
  const pickBtn = h('button', { type: 'button', class: 'cal-pick', 'aria-haspopup': 'dialog' }, icon('attendance'), h('span', {}, 'Chọn ngày'), icon('chevron'));
  function paintPicker() {
    const y = pickerMonth.getUTCFullYear(); const mo = pickerMonth.getUTCMonth();
    const first = new Date(Date.UTC(y, mo, 1));
    const start = mondayOf(first);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const inMonth = d.getUTCMonth() === mo;
      const isToday = iso(d) === iso(today);
      const inWeek = d >= weekStart && d < addDays(weekStart, 7);
      const hasOpening = classes.some((c) => c.start_date === iso(d) && (!program || c.program === program));
      cells.push(h('button', { type: 'button', class: `cal-day${inMonth ? '' : ' out'}${isToday ? ' today' : ''}${inWeek ? ' inweek' : ''}${hasOpening ? ' has' : ''}`,
        title: hasOpening ? 'Có lớp khai giảng' : '', onclick: () => { weekStart = mondayOf(d); pop.hidden = true; paint(); } }, String(d.getUTCDate())));
    }
    pop.replaceChildren(
      h('div', { class: 'cal-pop-head' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng trước', onclick: () => { pickerMonth = new Date(Date.UTC(y, mo - 1, 1)); paintPicker(); } }, '‹'),
        h('b', {}, `Tháng ${mo + 1}/${y}`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng sau', onclick: () => { pickerMonth = new Date(Date.UTC(y, mo + 1, 1)); paintPicker(); } }, '›')),
      h('div', { class: 'cal-pop-grid' }, ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => h('span', { class: 'cal-dow' }, x)), cells),
      h('div', { class: 'cal-pop-foot' }, h('span', { class: 'cal-dot' }), ' Ngày có lớp khai giảng'));
  }
  pickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) { pickerMonth = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), 1)); paintPicker(); }
  });
  const closePop = (e) => {
    if (!root.isConnected) { document.removeEventListener('click', closePop); document.removeEventListener('keydown', closePop); return; }
    if (e.type === 'keydown' ? e.key === 'Escape' : !pop.contains(e.target)) pop.hidden = true;
  };
  document.addEventListener('click', closePop);
  document.addEventListener('keydown', closePop);

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
  const eventCard = ({ kind, c }) => h('a', { class: `cal-ev ${kind}`, href: `#/c/${c.id}/dashboard`, title: `${c.code}${c.days_of_week ? ` · thứ học ${formatDays(c.days_of_week)}` : ''}` },
    h('div', { class: 'cal-ev-top' }, h('span', { class: 'cal-time' }, SHIFT_LABEL[c.shift] ?? 'Chưa rõ ca'),
      kind === 'open' ? h('span', { class: 'cal-tag' }, 'Khai giảng') : null),
    h('div', { class: 'cal-ev-title' }, classDisplayName(c)),
    h('div', { class: 'cal-ev-sub' }, PROGRAM_NAMES[c.program] ?? c.program ?? ''),
    h('div', { class: 'cal-ev-meta' }, icon('students'), `${c.delivery_mode ?? '—'} · ${segLabel(c)}`),
    h('div', { class: 'cal-ev-meta muted' }, 'GV: chờ phân công'));

  function paint() {
    const end = addDays(weekStart, 6);
    rangeLabel.textContent = weekStart.getUTCMonth() === end.getUTCMonth()
      ? `${dd(weekStart)} – ${dd(end)}/${mm(end)}/${end.getUTCFullYear()}`
      : `${dd(weekStart)}/${mm(weekStart)} – ${dd(end)}/${mm(end)}/${end.getUTCFullYear()}`;
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const isToday = iso(d) === iso(today);
      const evs = eventsOn(d);
      cols.push(h('div', { class: `cal-col${isToday ? ' today' : ''}` },
        h('div', { class: 'cal-head' }, h('span', { class: 'cal-wd', title: DOW_LONG[d.getUTCDay()] }, DOW[d.getUTCDay()]), h('span', { class: 'cal-num' }, dd(d)),
          h('span', { class: 'cal-mon muted small' }, `Tháng ${d.getUTCMonth() + 1}`)),
        h('div', { class: 'cal-body' }, evs.length ? evs.map(eventCard) : h('div', { class: 'cal-empty' }, '—'))));
    }
    grid.replaceChildren(...cols);
    // Màn hẹp (cuộn ngang theo cột): đưa cột hôm nay vào tầm nhìn
    requestAnimationFrame(() => {
      const t = grid.querySelector('.cal-col.today'); const sc = grid.parentElement;
      if (sc) sc.scrollLeft = t ? Math.max(0, t.offsetLeft - 8) : 0;
    });
    // Lớp đang học trong tuần nhưng chưa có thứ học → không xếp được vào ngày
    const wkStart = iso(weekStart); const wkEnd = iso(end);
    const unknown = classes.filter((c) => (!program || c.program === program) && !weekdaysOf(c.days_of_week).size
      && c.start_date <= wkEnd && (!c.end_date || c.end_date >= wkStart) && !(c.start_date >= wkStart && c.start_date <= wkEnd));
    unknownBox.replaceChildren(...(unknown.length ? [
      h('span', { class: 'muted small' }, `${unknown.length} lớp đang học tuần này chưa có thứ học (cột DAYS OF WEEK trong Google Sheet): `),
      ...unknown.map((c) => h('a', { class: 'chip', href: `#/c/${c.id}/dashboard`, title: `${c.code} · ${SHIFT_LABEL[c.shift] ?? ''}` }, classDisplayName(c)))] : []));
  }

  const nav = (n) => () => { weekStart = addDays(weekStart, 7 * n); paint(); };
  const root = h('div', {},
    h('section', { class: 'cal' },
      h('div', { class: 'cal-top' },
        h('div', { class: 'cal-nav' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tuần trước', onclick: nav(-1) }, '‹'),
          rangeLabel,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tuần sau', onclick: nav(1) }, '›'),
          h('button', { type: 'button', class: 'cal-today', onclick: () => { weekStart = mondayOf(today); paint(); } }, 'Hôm nay')),
        h('h1', { class: 'cal-title' }, 'Lịch khai giảng & giảng dạy'),
        h('div', { class: 'cal-tools' }, progSel, h('div', { class: 'cal-pick-wrap' }, pickBtn, pop))),
      h('div', { class: 'cal-legend muted small' },
        h('span', {}, h('i', { class: 'lg open' }), 'Khai giảng (ngày đầu tiên của lớp)'),
        h('span', {}, h('i', { class: 'lg teach' }), 'Buổi học theo thứ học'),
        h('span', {}, 'Bế giảng: chờ cập nhật · Giảng viên: chờ lịch phân công')),
      h('div', { class: 'cal-scroll' }, grid),
      unknownBox));
  paint();
  return root;
}
