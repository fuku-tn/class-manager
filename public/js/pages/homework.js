import { get, put } from '../api.js';
import { h, toast, pct, formModal } from '../ui.js';
import { startLive, LIVE_LABEL } from '../live.js';
import { classDisplayName } from '../class-filter.mjs';

const SHORT = { submitted: '✓', resubmit: '↻', missing: '✗' };
const LABEL = { submitted: 'Đã nộp', resubmit: 'Nộp lại', missing: 'Thiếu' };

const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};
const sameCell = (a, b) => (a?.status ?? null) === (b?.status ?? null) && (a?.note ?? null) === (b?.note ?? null)
  && !!a?.challenge === !!b?.challenge && (a?.by ?? null) === (b?.by ?? null);

export async function renderHomework({ cls, state }) {
  const readOnly = state.user.role === 'guest'; // khách chỉ xem
  const base = `/api/classes/${cls.id}`;
  const data = await get(`${base}/submissions`);
  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const body = h('tbody');
  const head = h('thead');
  const liveBadge = h('span', { class: 'live connecting', title: 'Bài tập tự cập nhật khi có người khác thay đổi' }, LIVE_LABEL.connecting);

  const key = (e, a) => `${e}:${a}`;
  const buttons = new Map();
  const rateCells = new Map();
  const pending = new Set();

  const paint = (btn, cell) => {
    const st = cell?.status ?? null;
    btn.className = `cell ${st ?? 'empty'}${cell?.note ? ' has-note' : ''}`;
    btn.textContent = st ? SHORT[st] + (cell.challenge ? '★' : '') : '·';
    const who = cell?.by ? ` · ${cell.by}${cell.at ? `, ${fmtTime(cell.at)}` : ''}` : '';
    btn.title = (st ? LABEL[st] : 'Chưa ghi nhận') + (cell?.challenge ? ' · có làm Challenge' : '') + who + (cell?.note ? ` — ${cell.note}` : '');
  };
  const flash = (el) => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); };

  head.append(h('tr', {},
    h('th', { class: 'sticky' }, 'Học viên'),
    data.assignments.map((a) => h('th', { class: 'num', title: a.title }, a.kind === 'capstone' ? 'Capstone' : `HW${a.seq}`)),
    h('th', { class: 'num' }, 'Hoàn thành HW')));

  async function edit(row, a, btn) {
    const cur = row.cells[a.id];
    const seen = cur?.status ?? null; // trạng thái người dùng đang thấy lúc mở hộp thoại
    const v = await formModal({ title: `${row.full_name} — ${a.title}`, fields: [
      { name: 'status', label: 'Trạng thái', type: 'select', value: cur?.status ?? '', options: [['', '(chưa ghi nhận)'], ...Object.entries(LABEL)], full: true },
      { name: 'challenge', label: 'Có làm bài Challenge', type: 'checkbox', value: cur?.challenge },
      { name: 'note', label: 'Ghi chú', type: 'textarea', value: cur?.note, full: true }] });
    if (!v) return;
    const k = key(row.enrollment_id, a.id);
    const status = v.status || null;
    pending.add(k);
    try {
      const r = await put(`${base}/submissions`, {
        enrollment_id: row.enrollment_id, assignment_id: a.id, status, challenge: v.challenge, note: v.note,
        expected: seen, // nếu người khác đã đổi ô này trong lúc mở hộp thoại, server từ chối thay vì ghi đè
      });
      row.cells[a.id] = r.cell;
      paint(btn, r.cell);
    } catch (e) {
      if (e.status === 409 && e.data?.current !== undefined) {
        row.cells[a.id] = e.data.current;
        paint(btn, e.data.current);
        flash(btn);
      }
      toast(e.message, true);
    } finally {
      pending.delete(k);
    }
  }

  function renderBody() {
    const q = search.value.trim().toLowerCase();
    buttons.clear(); rateCells.clear();
    body.replaceChildren(...data.rows
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.student_code.toLowerCase().includes(q))
      .map((row) => {
        const rate = h('td', { class: 'num' }, pct(row.hw_rate));
        rateCells.set(row.enrollment_id, rate);
        return h('tr', { class: row.course_status === 'active' ? '' : 'inactive' },
          h('td', { class: 'sticky' }, row.full_name, h('div', { class: 'muted small' }, row.student_code)),
          data.assignments.map((a) => {
            const btn = h('button', { 'aria-label': `${row.full_name} ${a.title}` });
            buttons.set(key(row.enrollment_id, a.id), btn);
            paint(btn, row.cells[a.id]);
            if (readOnly) { btn.classList.add('readonly'); btn.setAttribute('aria-readonly', 'true'); } else btn.addEventListener('click', () => edit(row, a, btn));
            return h('td', { class: 'num' }, btn);
          }), rate);
      }));
  }

  async function applyRemote() {
    const fresh = await get(`${base}/submissions`);
    const sameShape = fresh.assignments.length === data.assignments.length && fresh.rows.length === data.rows.length
      && fresh.rows.every((r, i) => r.enrollment_id === data.rows[i].enrollment_id);
    if (!sameShape) { Object.assign(data, fresh); renderBody(); return; }
    fresh.rows.forEach((fr, i) => {
      const row = data.rows[i];
      for (const a of data.assignments) {
        const k = key(row.enrollment_id, a.id);
        if (pending.has(k)) continue;
        const next = fr.cells[a.id] ?? null;
        if (sameCell(row.cells[a.id], next)) continue;
        row.cells[a.id] = next;
        const btn = buttons.get(k);
        if (btn) { paint(btn, next); flash(btn); }
      }
      row.hw_rate = fr.hw_rate;
      const rc = rateCells.get(row.enrollment_id);
      if (rc && rc.textContent !== pct(fr.hw_rate)) { rc.textContent = pct(fr.hw_rate); flash(rc); }
    });
  }

  search.addEventListener('input', renderBody);
  renderBody();

  const view = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Bài tập'), h('span', { class: 'muted', title: cls.code }, classDisplayName(cls)), liveBadge),
    h('div', { class: 'legend' },
      h('span', {}, readOnly ? 'Chú thích: ' : 'Bấm ô để cập nhật: '), ...Object.entries(LABEL).map(([k, v]) => h('span', {}, h('span', { class: `cell ${k}` }, SHORT[k]), ` ${v}`)),
      h('span', { class: 'muted' }, (readOnly ? '· Tài khoản khách chỉ xem ' : '') + '· ★ = có làm Challenge · "Nộp lại" chưa tính là hoàn thành · Rê chuột để xem ai đã cập nhật')),
    h('div', { class: 'toolbar' }, search),
    h('div', { class: 'table-wrap' }, h('table', {}, head, body)));

  startLive({
    base,
    alive: () => view.isConnected,
    onChange: applyRemote,
    onStatus: (s) => { liveBadge.className = `live ${s}`; liveBadge.textContent = LIVE_LABEL[s]; },
  });
  return view;
}
