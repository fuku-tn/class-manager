import { get, put, post, del } from '../api.js';
import { h, toast, pct, formModal, confirmModal, icon, fmtWhen } from '../ui.js';
import { startLive, LIVE_LABEL } from '../live.js';
import { SORTS, isSortKey, sortRows } from '../student-sort.mjs';
import { classDisplayName, norm, surnameInitial } from '../class-filter.mjs';
import { createAzIndex } from '../azindex.js';
import { openVouchers } from './vouchers.js';

const STATUSES = ['present', 'absent', 'excused'];
const SHORT = { present: '✓', absent: 'V', excused: 'P' };
const LABEL = { present: 'Có mặt', absent: 'Vắng', excused: 'Có phép' };
const NOTE = '__note';

const sameCell = (a, b) => (a?.status ?? null) === (b?.status ?? null) && (a?.note ?? null) === (b?.note ?? null) && (a?.by ?? null) === (b?.by ?? null);

// Cách sắp xếp lưu theo từng tài khoản trên trình duyệt này — mỗi người một lựa chọn, không ảnh hưởng người khác.
const sortStorageKey = (userId) => `att-sort:${userId}`;
function loadSort(userId) {
  try { const v = localStorage.getItem(sortStorageKey(userId)); return isSortKey(v) ? v : 'default'; } catch { return 'default'; }
}
function saveSort(userId, key) {
  try { localStorage.setItem(sortStorageKey(userId), key); } catch { /* chế độ riêng tư: bỏ qua */ }
}

export async function renderAttendance({ cls, state }) {
  const readOnly = state.user.role === 'guest'; // khách chỉ xem
  const base = `/api/classes/${cls.id}`;
  const data = await get(`${base}/attendance`);
  let sortKey = loadSort(state.user.id);
  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const sortSelect = h('select', { 'aria-label': 'Sắp xếp học viên', title: 'Chỉ áp dụng cho tài khoản của bạn' },
    SORTS.map((s) => h('option', { value: s.key }, s.label)));
  sortSelect.value = sortKey;
  const body = h('tbody');
  const head = h('thead');
  const tableWrap = h('div', { class: 'table-wrap' }, h('table', { class: 'table-att' }, head, body));
  const az = createAzIndex({ wrap: tableWrap, body });
  // Voucher Google Maps: chỉ admin + tài khoản được bật can_voucher (máy chủ cũng kiểm lại)
  const voucherBtn = (state.user.role === 'admin' || state.user.can_voucher === true) && !cls.view_only
    ? h('button', { type: 'button', class: 'vc-open', title: 'Voucher Google Maps của học viên', onclick: () => openVouchers({ cls }) }, icon('ticket'), 'Voucher') : null;   // thanh chữ cái: nhảy tới học viên theo họ
  const liveBadge = h('span', { class: 'live connecting', title: 'Điểm danh tự cập nhật khi có người khác thay đổi' }, LIVE_LABEL.connecting);

  const key = (enrollmentId, sessionId) => `${enrollmentId}:${sessionId}`;
  const cells = new Map();     // key -> <span.cell> (có <select> bên trong)
  const rateCells = new Map(); // enrollment_id -> <td>
  const countCells = new Map(); // session_id -> <div> hiện diện/sĩ số
  const pending = new Set();   // ô đang được chính mình lưu (không bị làm mới đè lên)

  const paintCell = (el, cell) => {
    const st = cell?.status ?? null;
    el.className = `cell ${st ?? 'empty'}${cell?.note ? ' has-note' : ''}${readOnly ? ' readonly' : ''}`;
    el.querySelector('.cell-sym').textContent = st ? SHORT[st] : '·';
    const sel = el.querySelector('select');
    if (sel) sel.value = st ?? '';
    const who = cell?.by ? ` · ${cell.by}${cell.at ? `, ${fmtWhen(cell.at)}` : ''}` : '';
    el.title = (st ? LABEL[st] : 'Chưa điểm danh') + who + (cell?.note ? ` — ${cell.note}` : '');
  };
  const flash = (el) => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); };

  // Hiện diện / sĩ số của buổi (số liệu do máy chủ tính, trang chỉ hiển thị).
  const paintCount = (sessionId, sum) => {
    const el = countCells.get(sessionId);
    if (!el) return;
    if (!sum?.held) { el.textContent = '—'; el.title = 'Buổi chưa diễn ra'; el.classList.add('muted'); return; }
    el.classList.remove('muted');
    el.textContent = `${sum.attended}/${sum.roster}`;
    el.title = `Hiện diện ${sum.attended} trên sĩ số ${sum.roster} · có phép ${sum.excused} · vắng ${sum.absent}`;
  };
  const sessionById = (id) => data.sessions.find((s) => s.id === id);
  const applySummary = (sessionId, sum) => {
    const s = sessionById(sessionId);
    if (s && sum) { s.summary = sum; s.held = !!sum.held; paintCount(sessionId, sum); }
  };
  const applyEnrollment = (row, info) => {
    if (!info) return;
    Object.assign(row, { attendance_rate: info.attendance_rate, attended: info.attended, excused: info.excused, absent: info.absent });
    const rc = rateCells.get(row.enrollment_id);
    if (rc && rc.textContent !== pct(info.attendance_rate)) { rc.textContent = pct(info.attendance_rate); flash(rc); }
  };

  async function save(row, session, el, status, note) {
    const k = key(row.enrollment_id, session.id);
    const prev = row.cells[session.id];
    row.cells[session.id] = status ? { status, note: note ?? prev?.note ?? null, by: null, at: null } : null;
    paintCell(el, row.cells[session.id]);
    pending.add(k);
    try {
      const r = await put(`${base}/attendance`, {
        enrollment_id: row.enrollment_id, session_id: session.id, status,
        note: row.cells[session.id]?.note ?? null,
        expected: prev?.status ?? null, // "tôi đang thấy ô là gì": nếu đã đổi, server từ chối thay vì ghi đè
      });
      row.cells[session.id] = r.cell;
      paintCell(el, r.cell);
      applyEnrollment(row, r.enrollment); // % chuyên cần của học viên + hiện diện/sĩ số của buổi: cập nhật ngay
      applySummary(session.id, r.session);
    } catch (e) {
      if (e.status === 409 && e.data?.current !== undefined) { // người khác vừa đổi ô này
        row.cells[session.id] = e.data.current;
        paintCell(el, e.data.current);
        flash(el);
        toast(e.message, true);
      } else {
        row.cells[session.id] = prev; paintCell(el, prev); toast(e.message, true);
      }
    } finally {
      pending.delete(k);
    }
  }

  async function editNote(row, s, el) {
    const cur = row.cells[s.id];
    const v = await formModal({ title: `${row.full_name} — Buổi ${s.session_no}`, fields: [
      { name: 'status', label: 'Trạng thái', type: 'select', value: cur?.status ?? '', options: [['', '(chưa điểm danh)'], ...Object.entries(LABEL)] },
      { name: 'note', label: 'Ghi chú', type: 'textarea', value: cur?.note, full: true }] });
    if (v) await save(row, s, el, v.status || null, v.note);
  }

  async function bulk(s, mode) {
    try {
      if (mode === 'clear') {
        const filled = data.rows.filter((r) => r.cells[s.id]).length;
        if (!filled) { toast('Buổi này chưa có ô nào được điểm danh'); return; }
        if (!await confirmModal(`Bỏ điểm danh của ${filled} học viên trong buổi ${s.session_no}? Buổi sẽ quay về "chưa diễn ra".`, 'Bỏ tất cả')) return;
        await del(`${base}/sessions/${s.id}/attendance`);
        toast(`Đã bỏ điểm danh buổi ${s.session_no}`);
      } else {
        await post(`${base}/sessions/${s.id}/attendance/bulk`, { status: 'present' });
        toast(`Đã điểm danh cả lớp buổi ${s.session_no}`);
      }
      await reload();
    } catch (e) { toast(e.message, true); }
  }

  function renderHead() {
    countCells.clear();
    head.replaceChildren(h('tr', {},
      h('th', { class: 'sticky' }, 'Học viên'),
      data.sessions.map((s) => {
        const count = h('div', { class: 'sess-count' });
        countCells.set(s.id, count);
        paintCount(s.id, s.summary);
        return h('th', { class: 'num', title: s.title || '' }, h('div', { class: 'sess-head' },
          h('div', { class: 'sess-title' }, `B${s.session_no}`,
            !readOnly && h('button', { class: 'small', title: 'Sửa tên/ngày buổi học', onclick: async () => {
              const v = await formModal({ title: `Buổi ${s.session_no}`, fields: [
                { name: 'title', label: 'Tên buổi', value: s.title, full: true },
                { name: 'session_date', label: 'Ngày học', type: 'date', value: s.session_date }] });
              if (!v) return;
              try { await put(`${base}/sessions/${s.id}`, v); await reload(); } catch (e) { toast(e.message, true); }
            } }, '✎')),
          h('div', { class: 'muted small' }, s.session_date || ''),
          count,
          !readOnly && h('div', { class: 'sess-actions' },
            h('button', { class: 'small', title: 'Đánh dấu tất cả chưa điểm danh là Có mặt', onclick: () => bulk(s, 'present') }, 'Cả lớp ✓'),
            h('button', { class: 'small danger', title: 'Bỏ điểm danh của tất cả học viên trong buổi này', onclick: () => bulk(s, 'clear') }, 'Bỏ tất cả'))));
      }),
      h('th', { class: 'num' }, 'Tỉ lệ')));
  }

  // Ô điểm danh: danh sách thả xuống (select thật, dùng được bàn phím/điện thoại) nhưng khi đóng chỉ hiện ký hiệu.
  // Để bảng 60 học viên × 22 buổi không lag: <select> (kèm 7 <option>) chỉ được tạo khi người dùng chạm/Enter vào ô.
  const cellCtx = new WeakMap(); // <span.cell> -> { row, s }
  function ensureSelect(el) {
    let sel = el.querySelector('select');
    if (sel) return sel;
    const { row, s } = cellCtx.get(el);
    sel = h('select', { class: 'cell-sel', 'aria-label': `${row.full_name} buổi ${s.session_no}` },
      h('option', { value: '' }, '·  Chưa điểm danh'),
      STATUSES.map((st) => h('option', { value: st }, `${SHORT[st]}  ${LABEL[st]}`)),
      h('option', { value: NOTE }, '✎  Ghi chú…'));
    sel.value = row.cells[s.id]?.status ?? '';
    sel.addEventListener('change', async () => {
      const v = sel.value;
      if (v === NOTE) { sel.value = row.cells[s.id]?.status ?? ''; await editNote(row, s, el); return; }
      await save(row, s, el, v || null);
    });
    el.append(sel);
    return sel;
  }
  const openCell = (el) => {
    const sel = ensureSelect(el);
    sel.focus();
    try { sel.showPicker?.(); } catch { /* trình duyệt cũ: bấm lần nữa để mở */ }
  };
  body.addEventListener('click', (e) => {
    const el = e.target.closest?.('span.cell');
    if (el && cellCtx.has(el) && e.target.tagName !== 'SELECT') openCell(el);
  });
  body.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && cellCtx.has(e.target)) { e.preventDefault(); openCell(e.target); }
  });

  function makeCell(row, s) {
    const el = h('span', readOnly ? { class: 'cell empty' } : { class: 'cell empty', tabindex: '0', role: 'button' },
      h('span', { class: 'cell-sym', 'aria-hidden': 'true' }, '·'));
    if (!readOnly) {
      cellCtx.set(el, { row, s });
      el.setAttribute('aria-label', `${row.full_name} buổi ${s.session_no}`);
    } else {
      el.setAttribute('aria-label', `${row.full_name} buổi ${s.session_no}`);
    }
    cells.set(key(row.enrollment_id, s.id), el);
    paintCell(el, row.cells[s.id]);
    return h('td', { class: 'num' }, el);
  }

  function renderBody() {
    const q = norm(search.value).trim(); // không phân biệt hoa/thường và dấu tiếng Việt
    cells.clear(); rateCells.clear();
    const list = sortRows(data.rows, sortKey)
      .filter((r) => !q || norm(r.full_name).includes(q) || norm(r.student_code).includes(q));
    body.replaceChildren(...list.map((row) => {
      const rate = h('td', { class: 'num' }, pct(row.attendance_rate));
      rateCells.set(row.enrollment_id, rate);
      return h('tr', { class: row.course_status === 'active' ? '' : 'inactive', 'data-initial': surnameInitial(row.full_name) },
        h('td', { class: 'sticky' }, row.full_name, h('div', { class: 'muted small' }, row.student_code + (row.course_status !== 'active' ? ` · ${row.course_status}` : ''))),
        data.sessions.map((s) => makeCell(row, s)), rate);
    }));
    az.update();
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
    for (const s of data.sessions) paintCount(s.id, s.summary);
    fresh.rows.forEach((fr, i) => {
      const row = data.rows[i];
      for (const s of data.sessions) {
        const k = key(row.enrollment_id, s.id);
        if (pending.has(k)) continue;
        const next = fr.cells[s.id] ?? null;
        if (sameCell(row.cells[s.id], next)) continue;
        row.cells[s.id] = next;
        const el = cells.get(k);
        if (el) { paintCell(el, next); flash(el); }
      }
      Object.assign(row, { attended: fr.attended, excused: fr.excused, absent: fr.absent, course_status: fr.course_status });
      row.attendance_rate = fr.attendance_rate;
      const rc = rateCells.get(row.enrollment_id);
      if (rc && rc.textContent !== pct(fr.attendance_rate)) { rc.textContent = pct(fr.attendance_rate); flash(rc); }
    });
  }

  search.addEventListener('input', renderBody);
  sortSelect.addEventListener('change', () => {
    sortKey = isSortKey(sortSelect.value) ? sortSelect.value : 'default';
    saveSort(state.user.id, sortKey);
    renderBody();
  });
  renderHead(); renderBody();

  const view = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Điểm danh'), h('span', { class: 'muted', title: cls.code }, classDisplayName(cls)), liveBadge),
    h('div', { class: 'legend' },
      h('span', {}, readOnly ? 'Chú thích: ' : 'Chọn trong ô để đổi: '),
      ...Object.entries(LABEL).map(([k, v]) => h('span', {}, h('span', { class: `cell ${k}` }, h('span', { class: 'cell-sym' }, SHORT[k])), ` ${v}`)),
      h('span', { class: 'muted' }, `${readOnly ? '· Tài khoản khách chỉ xem ' : '· Chọn "Ghi chú…" để ghi chú '}· Số dưới tên buổi = hiện diện/sĩ số · Rê chuột vào ô để xem ai đã điểm danh · Tỉ lệ = (có mặt + ½ có phép) / buổi đã diễn ra`)),
    h('div', { class: 'toolbar' }, search, h('label', { class: 'sort-label' }, 'Sắp xếp ', sortSelect),
      voucherBtn),
    h('div', { class: 'az-layout' }, az.el, tableWrap));

  startLive({
    base,
    alive: () => view.isConnected,
    onChange: applyRemote,
    onStatus: (s) => { liveBadge.className = `live ${s}`; liveBadge.textContent = LIVE_LABEL[s]; },
  });
  return view;
}
