// Lịch khai giảng / bế giảng và lịch giảng dạy (mọi tài khoản; mỗi người thấy các lớp mình có quyền — dữ liệu từ /api/classes).
// Khai giảng = ngày bắt đầu của lớp (start_date, theo tab COURSE). Bế giảng và giảng viên từng buổi: chủ dự án sẽ cung cấp sau.
import { h } from '../ui.js';
import { classDisplayName, SHIFT_LABEL, TIMING_LABEL, PROGRAM_NAMES, formatDays } from '../class-filter.mjs';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const dateOf = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '')); return m ? { y: +m[1], mo: +m[2], d: +m[3], iso: m[0] } : null; };
const fmt = (iso) => { const x = dateOf(iso); return x ? `${String(x.d).padStart(2, '0')}/${String(x.mo).padStart(2, '0')}/${x.y}` : '—'; };
const wd = (iso) => { const x = dateOf(iso); return x ? WEEKDAY[new Date(Date.UTC(x.y, x.mo - 1, x.d)).getUTCDay()] : ''; };
const segLabel = (c) => [c.is_b2c && 'B2C', c.is_b2b && 'B2B'].filter(Boolean).join(' + ') || '—';

export async function renderSchedule({ state }) {
  const classes = state.classes.filter((c) => c.start_date);
  const today = todayVN();
  let range = 'upcoming';          // upcoming | month | all
  let program = '';

  const chip = (text, on, onClick) => h('button', { type: 'button', class: `chip${on ? ' active' : ''}`, 'aria-pressed': String(on), onclick: onClick }, text);
  const programs = [...new Set(classes.map((c) => c.program).filter(Boolean))].sort();
  const chipsRange = h('div', { class: 'chips' });
  const chipsProgram = h('div', { class: 'chips' });
  const openingBox = h('div');
  const teachBox = h('div');

  const inRange = (c) => {
    if (range === 'upcoming') return c.start_date >= today;
    if (range === 'month') return c.start_date.slice(0, 7) === today.slice(0, 7);
    return true;
  };

  function paint() {
    chipsRange.replaceChildren(
      chip('Sắp khai giảng', range === 'upcoming', () => { range = 'upcoming'; paint(); }),
      chip('Tháng này', range === 'month', () => { range = 'month'; paint(); }),
      chip('Tất cả', range === 'all', () => { range = 'all'; paint(); }));
    chipsProgram.replaceChildren(chip('Mọi chương trình', !program, () => { program = ''; paint(); }),
      ...programs.map((p) => chip(p, program === p, () => { program = program === p ? '' : p; paint(); })));
    const pick = (c) => !program || c.program === program;

    // 1) Lịch khai giảng / bế giảng, nhóm theo tháng
    const list = classes.filter((c) => inRange(c) && pick(c))
      .sort((a, b) => (range === 'all' ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)));
    const byMonth = new Map();
    for (const c of list) { const k = c.start_date.slice(0, 7); (byMonth.get(k) ?? byMonth.set(k, []).get(k)).push(c); }
    const openRow = (c) => h('tr', {},
      h('td', {}, h('b', {}, fmt(c.start_date)), h('div', { class: 'muted small' }, wd(c.start_date))),
      h('td', {}, h('a', { href: `#/c/${c.id}/dashboard`, title: c.code }, classDisplayName(c))),
      h('td', { title: PROGRAM_NAMES[c.program] ?? '' }, c.program || '—'),
      h('td', {}, SHIFT_LABEL[c.shift] ?? '—'),
      h('td', { title: c.days_of_week ?? '' }, formatDays(c.days_of_week) || '—'),
      h('td', {}, segLabel(c)),
      h('td', {}, c.delivery_mode ?? '—'),
      h('td', { class: 'num' }, c.student_count ?? 0),
      h('td', { class: 'muted', title: 'Chủ dự án sẽ cập nhật ngày bế giảng' }, 'Chờ cập nhật'),
      h('td', {}, h('span', { class: `badge ${c.timing === 'running' ? 'ok' : c.timing === 'upcoming' ? 'warn' : ''}` }, TIMING_LABEL[c.timing] ?? '—')));
    const monthBlock = ([k, items]) => h('div', { class: 'sched-month' },
      h('h3', {}, `Tháng ${+k.slice(5)}/${k.slice(0, 4)}`, h('span', { class: 'muted small' }, ` · ${items.length} lớp`)),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Khai giảng', 'Lớp', 'Chương trình', 'Ca', 'Thứ học', 'Loại', 'Hình thức', 'Học viên', 'Bế giảng', 'Giai đoạn'].map((x) => h('th', {}, x)))),
        h('tbody', {}, items.map(openRow)))));
    if (list.length) openingBox.replaceChildren(...[...byMonth].map(monthBlock));
    else openingBox.replaceChildren(h('p', { class: 'empty-state' }, range === 'upcoming' ? 'Chưa có lớp nào sắp khai giảng.' : 'Không có lớp nào khớp bộ lọc.'));

    // 2) Lịch giảng dạy: lớp đang học + sắp mở
    const teach = classes.filter((c) => ['running', 'upcoming'].includes(c.timing) && pick(c)).sort((a, b) => a.start_date.localeCompare(b.start_date));
    teachBox.replaceChildren(teach.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Lớp', 'Chương trình', 'Giảng viên', 'Ca', 'Thứ học', 'Loại', 'Hình thức', 'Thời gian', 'Giai đoạn'].map((x) => h('th', {}, x)))),
      h('tbody', {}, teach.map((c) => h('tr', {},
        h('td', {}, h('a', { href: `#/c/${c.id}/dashboard`, title: c.code }, classDisplayName(c))),
        h('td', {}, c.program || '—', h('div', { class: 'muted small' }, PROGRAM_NAMES[c.program] ?? '')),
        h('td', { class: 'muted', title: 'Lịch phân công giảng viên từng buổi sẽ được cập nhật từ Sheet riêng' }, 'Chờ lịch phân công'),
        h('td', {}, SHIFT_LABEL[c.shift] ?? '—'),
        h('td', { title: c.days_of_week ?? '' }, formatDays(c.days_of_week) || '—'),
        h('td', {}, segLabel(c)),
        h('td', {}, c.delivery_mode ?? '—'),
        h('td', {}, `${fmt(c.start_date)} → ${fmt(c.end_date)}`),
        h('td', {}, h('span', { class: `badge ${c.timing === 'running' ? 'ok' : 'warn'}` }, TIMING_LABEL[c.timing] ?? '—')))))))
      : h('p', { class: 'empty-state' }, 'Không có lớp đang học hoặc sắp mở khớp bộ lọc.'));
  }
  paint();

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Lịch'), h('span', { class: 'muted' }, 'Khai giảng · Bế giảng · Giảng dạy')),
    h('div', { class: 'toolbar sched-filters' }, chipsRange, chipsProgram),
    h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Khai giảng & bế giảng'),
      h('h2', {}, 'Lịch khai giảng'), h('p', { class: 'muted small' }, 'Ngày khai giảng = ngày đầu tiên của lớp. Ngày bế giảng sẽ được cập nhật sau.'), openingBox),
    h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Giảng dạy'),
      h('h2', {}, 'Lịch giảng dạy'), h('p', { class: 'muted small' }, 'Các lớp đang học và sắp mở: chương trình, ca, thứ học, B2C/B2B, hình thức. Giảng viên từng buổi sẽ lấy từ Sheet phân công (cập nhật sau).'), teachBox));
}
