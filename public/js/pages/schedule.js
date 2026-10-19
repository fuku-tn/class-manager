// Trang Lịch có 2 tab:
//  • Lịch khai giảng (mọi tài khoản xem; mỗi người chỉ thấy lớp mình có quyền): lịch tháng, ngày khai giảng = START DATE của lớp
//    (classes.start_date), ca sáng/chiều/tối theo openingShift() (chữ S/T trong DAYS OF WEEK, ngày thường = tối, còn lại theo Sub 4 của mã lớp).
//  • Lịch giảng dạy: chưa có dữ liệu (chủ dự án sẽ gửi Sheet phân công giảng viên từng buổi) — hiện tab giữ chỗ.
// Bấm một ngày → danh sách chi tiết các lớp khai giảng ngày đó ở dưới lịch. Bế giảng: chủ dự án sẽ gửi sau.
import { h, icon, setChildren } from '../ui.js';
import { classDisplayName, SHIFT_LABEL, PROGRAM_NAMES, formatDays, openingShift } from '../class-filter.mjs';

const DOW_LONG = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const SHIFT_ORDER = { morning: 0, full_day: 1, afternoon: 2, evening: 3 };
const SHIFT_SHORT = { morning: 'Sáng', afternoon: 'Chiều', evening: 'Tối', full_day: 'Cả ngày' };
const SHIFT_NOTE = { days_letter: 'theo chữ S/T trong thứ học', weekdays: 'lớp học ngày thường', sub4: 'theo mã lớp (Sub 4)' };
const SHIFT_KEYS = ['morning', 'afternoon', 'evening', 'full_day'];
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

function openingCalendar(state) {
  const classes = state.classes.filter((c) => c.start_date).map((c) => ({ c, ...openingShift(c) }));
  const today = todayVN();
  let month = monthStart(today);
  let selected = today;
  let program = '';
  let pickerYear = today.getUTCFullYear();

  const programs = [...new Set(classes.map((x) => x.c.program).filter(Boolean))].sort();
  const monthLabel = h('b', { class: 'cal-range' });
  const grid = h('div', { class: 'cal-month' });
  const detail = h('div', { class: 'cal-detail' });
  const progSel = h('select', { 'aria-label': 'Lọc chương trình', class: 'cal-prog' },
    h('option', { value: '' }, 'Mọi chương trình'), programs.map((p) => h('option', { value: p }, p)));
  progSel.addEventListener('change', () => { program = progSel.value; paint(); });

  // Khai giảng của một ngày: lớp có START DATE = ngày đó
  const eventsOn = (d) => classes.filter((x) => (!program || x.c.program === program) && x.c.start_date === iso(d))
    .sort((a, b) => (SHIFT_ORDER[a.shift] ?? 9) - (SHIFT_ORDER[b.shift] ?? 9) || classDisplayName(a.c).localeCompare(classDisplayName(b.c)));

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
        const opens = classes.filter((x) => (!program || x.c.program === program) && x.c.start_date?.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).length;
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

  // ---- Thẻ chi tiết một lớp khai giảng
  const eventCard = ({ c, shift, source }) => h('a', { class: `cal-ev open sh-${shift ?? 'none'}`, href: `#/c/${c.id}/dashboard`, title: c.code },
    h('div', { class: 'cal-ev-top' }, h('span', { class: 'cal-time', title: source ? `Ca ${SHIFT_NOTE[source]}` : '' }, SHIFT_LABEL[shift] ?? 'Chưa rõ ca'),
      h('span', { class: 'cal-tag' }, 'Khai giảng')),
    h('div', { class: 'cal-ev-title' }, classDisplayName(c)),
    h('div', { class: 'cal-ev-sub' }, PROGRAM_NAMES[c.program] ?? c.program ?? ''),
    h('div', { class: 'cal-ev-meta' }, icon('students'), `${c.delivery_mode ?? '—'} · ${segLabel(c)}`),
    c.days_of_week ? h('div', { class: 'cal-ev-meta' }, icon('calendar'), `Thứ học: ${formatDays(c.days_of_week)}`) : null);

  function paintDetail() {
    const evs = eventsOn(selected);
    setChildren(detail,
      h('div', { class: 'cal-detail-head' },
        h('b', {}, `${DOW_LONG[selected.getUTCDay()]}, ${fmt(selected)}`),
        h('span', { class: 'muted small' }, evs.length ? `${evs.length} lớp khai giảng` : 'Không có lớp khai giảng')),
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
        role: 'button', tabindex: inMonth ? 0 : -1, 'aria-label': `${DOW_LONG[d.getUTCDay()]} ${fmt(d)}${evs.length ? `, ${evs.length} lớp khai giảng` : ''}`,
        onclick: inMonth ? pick : null, onkeydown: inMonth ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } : null },
        h('span', { class: 'cal-date' }, String(d.getUTCDate())),
        evs.slice(0, MAX_PILLS).map(({ c, shift }) => h('span', { class: `cal-pill sh-${shift ?? 'none'}`, title: `Khai giảng · ${classDisplayName(c)} · ${SHIFT_LABEL[shift] ?? 'chưa rõ ca'}` },
          h('i', {}), h('em', {}, SHIFT_SHORT[shift] ?? '?'), h('span', {}, classDisplayName(c)))),
        evs.length > MAX_PILLS ? h('span', { class: 'cal-more' }, `+${evs.length - MAX_PILLS} lớp`) : null));
    }
    grid.replaceChildren(...['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => h('div', { class: 'cal-dowh' }, x)), ...cells);
    paintDetail();
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
        h('h1', { class: 'cal-title' }, 'Lịch khai giảng'),
        h('div', { class: 'cal-tools' }, progSel, h('div', { class: 'cal-pick-wrap' }, pickBtn, pop))),
      h('div', { class: 'cal-legend muted small' },
        SHIFT_KEYS.map((k) => h('span', {}, h('i', { class: `lg sh-${k}` }), SHIFT_LABEL[k])),
        h('span', {}, 'Bấm một ngày để xem chi tiết')),
      grid),
    h('section', { class: 'cal cal-day-panel' }, detail));
  paint();
  return root;
}

// Tab giữ chỗ: dữ liệu giảng dạy (ai dạy từng buổi) chủ dự án sẽ gửi sau
function teachingPlaceholder() {
  return h('section', { class: 'cal cal-empty-tab' },
    h('div', { class: 'cal-empty-icon' }, icon('calendar')),
    h('h2', {}, 'Lịch giảng dạy'),
    h('p', { class: 'muted' }, 'Chưa có dữ liệu giảng dạy. Phần này sẽ hiện ai dạy từng buổi, chương trình, ca học và hình thức khi có Sheet phân công giảng viên.'));
}

const TABS = [['open', 'Lịch khai giảng'], ['teach', 'Lịch giảng dạy']];

export async function renderSchedule({ state }) {
  const body = h('div', {});
  const tabsEl = h('div', { class: 'chips cal-tabs', role: 'tablist', 'aria-label': 'Loại lịch' });
  const cache = {};
  function show(key) {
    for (const b of tabsEl.children) { const on = b.dataset.tab === key; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); }
    cache[key] ??= key === 'open' ? openingCalendar(state) : teachingPlaceholder();
    body.replaceChildren(cache[key]);
  }
  for (const [key, label] of TABS) {
    tabsEl.append(h('button', { type: 'button', class: 'chip', role: 'tab', 'data-tab': key, onclick: () => show(key) }, label));
  }
  show('open');
  return h('div', {}, tabsEl, body);
}
