// Trang Lịch có 2 tab, cùng dạng lịch tháng (đủ mọi ngày, tuần bắt đầu Thứ 2, bấm một ngày xem chi tiết bên dưới):
//  • Lịch khai giảng: ngày khai giảng = START DATE của lớp (classes.start_date); ca theo openingShift()
//    (chữ S/T trong DAYS OF WEEK, lớp ngày thường = tối, còn lại theo Sub 4 của mã lớp).
//  • Lịch giảng dạy: từng buổi học từ bảng "Calendar" trên Google Sheet (sync-schedule.gs → /api/schedule/teaching):
//    ngày, ca S/C/T, khóa, nội dung, số buổi, hình thức, loại, ghi chú (Khai giảng / Bế giảng), giảng viên nếu có.
// Mỗi người chỉ thấy lớp mình có quyền (máy chủ lọc).
import { get } from '../api.js';
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

// Khung lịch tháng dùng chung. opts:
//   title, programs[], eventsOn(date, program) → mảng sự kiện đã sắp xếp, countIn('yyyy-mm', program) → số sự kiện trong tháng,
//   countWord ('khai giảng' | 'buổi'), pillOf(ev), cardOf(ev), detailWord ('lớp khai giảng' | 'buổi học'), legend[], emptyNote
function monthCalendar(opts) {
  const today = todayVN();
  let month = monthStart(today);
  let selected = today;
  let program = '';
  let pickerYear = today.getUTCFullYear();

  const monthLabel = h('b', { class: 'cal-range' });
  const grid = h('div', { class: 'cal-month' });
  const detail = h('div', { class: 'cal-detail' });
  const progSel = h('select', { 'aria-label': 'Lọc chương trình', class: 'cal-prog' },
    h('option', { value: '' }, 'Mọi chương trình'), opts.programs.map((p) => h('option', { value: p }, p)));
  progSel.addEventListener('change', () => { program = progSel.value; paint(); });

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
        const n = opts.countIn(`${y}-${String(m + 1).padStart(2, '0')}`, program);
        return h('button', { type: 'button', class: `cal-mo${cur ? ' cur' : ''}${isNow ? ' now' : ''}`,
          onclick: () => { month = new Date(Date.UTC(y, m, 1)); selected = isNow ? today : month; pop.hidden = true; paint(); } },
          h('span', {}, `Tháng ${m + 1}`), n ? h('small', {}, `${n} ${opts.countWord}`) : null);
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

  function paintDetail() {
    const evs = opts.eventsOn(selected, program);
    setChildren(detail,
      h('div', { class: 'cal-detail-head' },
        h('b', {}, `${DOW_LONG[selected.getUTCDay()]}, ${fmt(selected)}`),
        h('span', { class: 'muted small' }, evs.length ? `${evs.length} ${opts.detailWord}` : `Không có ${opts.detailWord}`)),
      evs.length ? h('div', { class: 'cal-detail-list' }, evs.map(opts.cardOf)) : null);
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
      const evs = inMonth ? opts.eventsOn(d, program) : [];
      const pick = () => { selected = d; paint(); };
      cells.push(h('div', { class: `cal-cell${inMonth ? '' : ' out'}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}`,
        role: 'button', tabindex: inMonth ? 0 : -1, 'aria-label': `${DOW_LONG[d.getUTCDay()]} ${fmt(d)}${evs.length ? `, ${evs.length} ${opts.detailWord}` : ''}`,
        onclick: inMonth ? pick : null, onkeydown: inMonth ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } : null },
        h('span', { class: 'cal-date' }, String(d.getUTCDate())),
        evs.slice(0, MAX_PILLS).map(opts.pillOf),
        evs.length > MAX_PILLS ? h('span', { class: 'cal-more' }, `+${evs.length - MAX_PILLS} ${opts.moreWord ?? 'lớp'}`) : null));
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
        h('h1', { class: 'cal-title' }, opts.title),
        h('div', { class: 'cal-tools' }, progSel, h('div', { class: 'cal-pick-wrap' }, pickBtn, pop))),
      h('div', { class: 'cal-legend muted small' }, opts.legend),
      grid,
      opts.emptyNote ?? null),
    h('section', { class: 'cal cal-day-panel' }, detail));
  paint();
  return root;
}

// ---------- Lịch khai giảng ----------
function openingCalendar(state) {
  const classes = state.classes.filter((c) => c.start_date).map((c) => ({ c, ...openingShift(c) }));
  const sorter = (a, b) => (SHIFT_ORDER[a.shift] ?? 9) - (SHIFT_ORDER[b.shift] ?? 9) || classDisplayName(a.c).localeCompare(classDisplayName(b.c));
  return monthCalendar({
    title: 'Lịch khai giảng',
    programs: [...new Set(classes.map((x) => x.c.program).filter(Boolean))].sort(),
    eventsOn: (d, program) => classes.filter((x) => (!program || x.c.program === program) && x.c.start_date === iso(d)).sort(sorter),
    countIn: (ym, program) => classes.filter((x) => (!program || x.c.program === program) && x.c.start_date?.startsWith(ym)).length,
    countWord: 'khai giảng', detailWord: 'lớp khai giảng',
    legend: [SHIFT_KEYS.map((k) => h('span', {}, h('i', { class: `lg sh-${k}` }), SHIFT_LABEL[k])), h('span', {}, 'Bấm một ngày để xem chi tiết')],
    pillOf: ({ c, shift }) => h('span', { class: `cal-pill sh-${shift ?? 'none'}`, title: `Khai giảng · ${classDisplayName(c)} · ${SHIFT_LABEL[shift] ?? 'chưa rõ ca'}` },
      h('i', {}), h('em', {}, SHIFT_SHORT[shift] ?? '?'), h('span', {}, classDisplayName(c))),
    cardOf: ({ c, shift, source }) => h('a', { class: `cal-ev open sh-${shift ?? 'none'}`, href: `#/c/${c.id}/dashboard`, title: c.code },
      h('div', { class: 'cal-ev-top' }, h('span', { class: 'cal-time', title: source ? `Ca ${SHIFT_NOTE[source]}` : '' }, SHIFT_LABEL[shift] ?? 'Chưa rõ ca'),
        h('span', { class: 'cal-tag' }, 'Khai giảng')),
      h('div', { class: 'cal-ev-title' }, classDisplayName(c)),
      h('div', { class: 'cal-ev-sub' }, PROGRAM_NAMES[c.program] ?? c.program ?? ''),
      h('div', { class: 'cal-ev-meta' }, icon('students'), `${c.delivery_mode ?? '—'} · ${segLabel(c)}`),
      c.days_of_week ? h('div', { class: 'cal-ev-meta' }, icon('calendar'), `Thứ học: ${formatDays(c.days_of_week)}`) : null),
  });
}

// ---------- Lịch giảng dạy ----------
const NOTE_CLASS = (note) => (/khai\s*gi[ảa]ng/i.test(note ?? '') ? 'note-open' : /b[ếe]\s*gi[ảa]ng/i.test(note ?? '') ? 'note-close' : '');
function teachingCalendar(state, rows) {
  const byId = new Map(state.classes.map((c) => [c.id, c]));
  const label = (r) => (byId.has(r.class_id) ? classDisplayName(byId.get(r.class_id)) : r.short_code);
  const sorter = (a, b) => (SHIFT_ORDER[a.shift] ?? 9) - (SHIFT_ORDER[b.shift] ?? 9) || label(a).localeCompare(label(b)) || (a.session_no ?? 0) - (b.session_no ?? 0);
  const programOf = (r) => r.program ?? /^[A-Z]+/.exec(r.short_code)?.[0] ?? '';
  return monthCalendar({
    title: 'Lịch giảng dạy',
    programs: [...new Set(rows.map(programOf).filter(Boolean))].sort(),
    eventsOn: (d, program) => rows.filter((r) => r.session_date === iso(d) && (!program || programOf(r) === program)).sort(sorter),
    countIn: (ym, program) => rows.filter((r) => r.session_date.startsWith(ym) && (!program || programOf(r) === program)).length,
    countWord: 'buổi', detailWord: 'buổi học', moreWord: 'buổi',
    legend: [SHIFT_KEYS.map((k) => h('span', {}, h('i', { class: `lg sh-${k}` }), SHIFT_LABEL[k])),
      h('span', {}, h('i', { class: 'lg-bar note-open' }), 'Khai giảng'), h('span', {}, h('i', { class: 'lg-bar note-close' }), 'Bế giảng'),
      h('span', {}, 'Bấm một ngày để xem chi tiết · Cập nhật từ bảng Calendar trên Google Sheet')],
    pillOf: (r) => h('span', { class: `cal-pill sh-${r.shift ?? 'none'} ${NOTE_CLASS(r.note)}`,
      title: `${label(r)}${r.session_no ? ` · buổi ${r.session_no}` : ''}${r.content ? ` · ${r.content}` : ''}${r.note ? ` · ${r.note}` : ''}` },
      h('i', {}), h('em', {}, SHIFT_SHORT[r.shift] ?? '?'), h('span', {}, label(r))),
    cardOf: (r) => h(byId.has(r.class_id) ? 'a' : 'div', { class: `cal-ev open sh-${r.shift ?? 'none'}`, href: byId.has(r.class_id) ? `#/c/${r.class_id}/dashboard` : null, title: r.class_code ?? r.short_code },
      h('div', { class: 'cal-ev-top' }, h('span', { class: 'cal-time' }, SHIFT_LABEL[r.shift] ?? 'Chưa rõ ca'),
        r.note ? h('span', { class: `cal-tag ${NOTE_CLASS(r.note)}` }, r.note) : null),
      h('div', { class: 'cal-ev-title' }, label(r), r.session_no ? h('span', { class: 'muted small' }, ` · Buổi ${r.session_no}`) : null),
      r.content ? h('div', { class: 'cal-ev-sub' }, r.content) : null,
      h('div', { class: 'cal-ev-meta' }, icon('students'), `${r.mode ?? '—'}${r.segment ? ` · ${r.segment}` : ''}`),
      h('div', { class: 'cal-ev-meta muted' }, r.instructor ? `GV: ${r.instructor}` : 'GV: chờ phân công')),
    emptyNote: rows.length ? null : h('p', { class: 'muted small cal-empty-note' },
      'Chưa có buổi học nào. Lịch giảng dạy được lấy từ bảng Calendar trên Google Sheet (script sync-schedule.gs).'),
  });
}

const TABS = [['open', 'Lịch khai giảng'], ['teach', 'Lịch giảng dạy']];

export async function renderSchedule({ state }) {
  const body = h('div', {});
  const tabsEl = h('div', { class: 'chips cal-tabs', role: 'tablist', 'aria-label': 'Loại lịch' });
  const cache = {};
  let current = 'open';
  async function show(key) {
    current = key;
    for (const b of tabsEl.children) { const on = b.dataset.tab === key; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); }
    if (!cache[key]) {
      if (key === 'open') cache[key] = openingCalendar(state);
      else {
        body.replaceChildren(h('p', { class: 'muted' }, 'Đang tải lịch giảng dạy…'));
        try { cache[key] = teachingCalendar(state, await get('/api/schedule/teaching')); }
        catch (e) { body.replaceChildren(h('p', { class: 'error' }, e.message)); return; }
      }
    }
    if (current === key) body.replaceChildren(cache[key]);
  }
  for (const [key, label] of TABS) {
    tabsEl.append(h('button', { type: 'button', class: 'chip', role: 'tab', 'data-tab': key, onclick: () => show(key) }, label));
  }
  await show('open');
  return h('div', {}, tabsEl, body);
}
