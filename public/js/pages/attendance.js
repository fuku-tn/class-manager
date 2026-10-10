import { get, put, post } from '../api.js';
import { h, toast, pct, formModal } from '../ui.js';
import { startLive, LIVE_LABEL } from '../live.js';

const CYCLE = [null, 'present', 'late', 'absent', 'excused'];
const SHORT = { present: '✓', late: 'T', absent: 'V', excused: 'P' };
const LABEL = { present: 'Có mặt', late: 'Đi trễ', absent: 'Vắng', excused: 'Có phép' };

const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};
const sameCell = (a, b) => (a?.status ?? null) === (b?.status ?? null) && (a?.note ?? null) === (b?.note ?? null) && (a?.by ?? null) === (b?.by ?? null);

export async function renderAttendance({ cls, state }) {
  const readOnly = state.user.role === 'guest'; // khách chỉ xem
  const base = `/api/classes/${cls.id}`;
  const data = await get(`${base}/attendance`);
  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const body = h('tbody');
  const head = h('thead');
  const liveBadge = h('span', { class: 'live connecting', title: 'Điểm danh tự cập nhật khi có người khác thay đổi' }, LIVE_LABEL.connecting);

  const key = (enrollmentId, sessionId) => `${enrollmentId}:${sessionId}`;
  const buttons = new Map();   // key -> <button>
  const rateCells = new Map(); // enrollment_id -> <td>
  const pending = new Set();   // ô đang được chính mình lưu (không bị làm mới đè lên)

  const paintCell = (btn, cell) => {
    const st = cell?.status ?? null;
    btn.className = `cell ${st ?? 'empty'}${cell?.note ? ' has-note' : ''}`;
    btn.textContent = st ? SHORT[st] : '·';
    const who = cell?.by ? ` · ${cell.by}${cell.at ? `, ${fmtTime(cell.at)}` : ''}` : '';
    btn.title = (st ? LABEL[st] : 'Chưa điểm danh') + who + (cell?.note ? ` — ${cell.note}` : '');
  };
  const flash = (el) => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); };

  async function save(row, session, btn, status, note) {
    const k = key(row.enrollment_id, session.id);
    const prev = row.cells[session.id];
    row.cells[session.id] = status ? { status, note: note ?? prev?.note ?? null, by: null, at: null } : null;
    paintCell(btn, row.cells[session.id]);
    pending.add(k);
    try {
      const r = await put(`${base}/attendance`, {
        enrollment_id: row.enrollment_id, session_id: session.id, status,
        note: row.cells[session.id]?.note ?? null,
        expected: prev?.status ?? null, // "tôi đang thấy ô là gì": nếu đã đổi, server từ chối thay vì ghi đè
      });
      row.cells[session.id] = r.cell;
      paintCell(btn, r.cell);
      if (status) session.held = true;
    } catch (e) {
      if (e.status === 409 && e.data?.current !== undefined) { // người khác vừa đổi ô này
        row.cells[session.id] = e.data.current;
        paintCell(btn, e.data.current);
        flash(btn);
        toast(e.message, true);
      } else {
        row.cells[session.id] = prev; paintCell(btn, prev); toast(e.message, true);
      }
    } finally {
      pending.delete(k);
    }
  }

  function renderHead() {
    head.replaceChildren(h('tr', {},
      h('th', { class: 'sticky' }, 'Học viên'),
      data.sessions.map((s) => h('th', { class: 'num', title: s.title || '' }, h('div', { class: 'sess-head' },
        h('div', { class: 'sess-title' }, `B${s.session_no}`,
          !readOnly && h('button', { class: 'small', title: 'Sửa tên/ngày buổi học', onclick: async () => {
            const v = await formModal({ title: `Buổi ${s.session_no}`, fields: [
              { name: 'title', label: 'Tên buổi', value: s.title, full: true },
              { name: 'session_date', label: 'Ngày học', type: 'date', value: s.session_date }] });
            if (!v) return;
            try { await put(`${base}/sessions/${s.id}`, v); await reload(); } catch (e) { toast(e.message, true); }
          } }, '✎')),
        h('div', { class: 'muted small' }, s.session_date || ''),
        !readOnly && h('button', { class: 'small', title: 'Đánh dấu tất cả chưa điểm danh là Có mặt', onclick: async () => {
          try { await post(`${base}/sessions/${s.id}/attendance/bulk`, { status: 'present' }); toast(`Đã điểm danh cả lớp buổi ${s.session_no}`); await reload(); }
          catch (e) { toast(e.message, true); }
        } }, 'Cả lớp ✓')))),
      h('th', { class: 'num' }, 'Tỉ lệ')));
  }

  function renderBody() {
    const q = search.value.trim().toLowerCase();
    buttons.clear(); rateCells.clear();
    body.replaceChildren(...data.rows
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.student_code.toLowerCase().includes(q))
      .map((row) => {
        const rate = h('td', { class: 'num' }, pct(row.attendance_rate));
        rateCells.set(row.enrollment_id, rate);
        return h('tr', { class: row.course_status === 'active' ? '' : 'inactive' },
          h('td', { class: 'sticky' }, row.full_name, h('div', { class: 'muted small' }, row.student_code + (row.course_status !== 'active' ? ` · ${row.course_status}` : ''))),
          data.sessions.map((s) => {
            const btn = h('button', { 'aria-label': `${row.full_name} buổi ${s.session_no}` });
            buttons.set(key(row.enrollment_id, s.id), btn);
            paintCell(btn, row.cells[s.id]);
            if (readOnly) { btn.classList.add('readonly'); btn.setAttribute('aria-readonly', 'true'); return h('td', { class: 'num' }, btn); }
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

  // Làm mới khi người khác đổi: chỉ vẽ lại các ô thực sự thay đổi (nháy vàng), không dựng lại cả bảng.
  async function applyRemote() {
    const fresh = await get(`${base}/attendance`);
    const sameShape = fresh.sessions.length === data.sessions.length && fresh.rows.length === data.rows.length
      && fresh.rows.every((r, i) => r.enrollment_id === data.rows[i].enrollment_id);
    if (!sameShape) { Object.assign(data, fresh); renderHead(); renderBody(); return; }
    data.sessions = fresh.sessions;
    fresh.rows.forEach((fr, i) => {
      const row = data.rows[i];
      for (const s of data.sessions) {
        const k = key(row.enrollment_id, s.id);
        if (pending.has(k)) continue;
        const next = fr.cells[s.id] ?? null;
        if (sameCell(row.cells[s.id], next)) continue;
        row.cells[s.id] = next;
        const btn = buttons.get(k);
        if (btn) { paintCell(btn, next); flash(btn); }
      }
      row.attendance_rate = fr.attendance_rate;
      row.course_status = fr.course_status;
      const rc = rateCells.get(row.enrollment_id);
      if (rc && rc.textContent !== pct(fr.attendance_rate)) { rc.textContent = pct(fr.attendance_rate); flash(rc); }
    });
  }

  search.addEventListener('input', renderBody);
  renderHead(); renderBody();

  const view = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Điểm danh'), h('span', { class: 'muted' }, cls.code), liveBadge),
    h('div', { class: 'legend' },
      h('span', {}, readOnly ? 'Chú thích: ' : 'Bấm ô để đổi: '), ...Object.entries(LABEL).map(([k, v]) => h('span', {}, h('span', { class: `cell ${k}` }, SHORT[k]), ` ${v}`)),
      h('span', { class: 'muted' }, (readOnly ? '· Tài khoản khách chỉ xem · ' : '· Shift+bấm để ghi chú · ') + 'Rê chuột vào ô để xem ai đã điểm danh · Tỉ lệ = (có mặt + trễ) / (buổi đã diễn ra − có phép)')),
    h('div', { class: 'toolbar' }, search),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table-att' }, head, body)));

  startLive({
    base,
    alive: () => view.isConnected,
    onChange: applyRemote,
    onStatus: (s) => { liveBadge.className = `live ${s}`; liveBadge.textContent = LIVE_LABEL[s]; },
  });
  return view;
}
