import { get, put } from '../api.js';
import { h, toast, pct, formModal } from '../ui.js';
import { startLive, LIVE_LABEL } from '../live.js';
import { classDisplayName, norm } from '../class-filter.mjs';

const SHORT = { submitted: '✓', resubmit: '↻', missing: '✗' };
const LABEL = { submitted: 'Đã nộp', resubmit: 'Nộp lại', missing: 'Thiếu' };

const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};
const sameCell = (a, b) => (a?.status ?? null) === (b?.status ?? null) && (a?.note ?? null) === (b?.note ?? null)
  && !!a?.challenge === !!b?.challenge && (a?.by ?? null) === (b?.by ?? null);

const fmtScore = (n) => (n == null ? '—' : String(Math.round(n * 100) / 100));
// Cách hiển thị ô khi lớp có điểm: cả hai / chỉ điểm / chỉ trạng thái (màu ô luôn theo trạng thái). Nhớ theo trình duyệt.
const MODES = [['both', 'Trạng thái + điểm'], ['score', 'Chỉ điểm'], ['status', 'Chỉ trạng thái']];
const MODE_KEY = 'hwViewMode';
const readMode = () => { try { const m = localStorage.getItem(MODE_KEY); return MODES.some(([k]) => k === m) ? m : 'both'; } catch { return 'both'; } };
const saveMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* bỏ qua */ } };

export async function renderHomework({ cls, state }) {
  const readOnly = state.user.role === 'guest'; // khách chỉ xem
  const base = `/api/classes/${cls.id}`;
  // Điểm (đồng bộ từ Google Sheet bảng điểm) hiện ngay trong ô bài tập; khách không xem được điểm (máy chủ trả 403)
  const [data, sc] = await Promise.all([
    get(`${base}/submissions`),
    readOnly ? null : get(`${base}/scores`).catch(() => null),
  ]);
  const hasScores = !!sc?.has_scores;
  const scoreOf = new Map((sc?.rows ?? []).map((r) => [r.enrollment_id, r]));   // enrollment_id -> { scores: {assignment_id: {score, module}}, avg }
  const moduleOf = new Map();
  for (const r of sc?.rows ?? []) for (const [aid, v] of Object.entries(r.scores)) if (v.module && !moduleOf.has(aid)) moduleOf.set(aid, v.module);
  let mode = hasScores ? readMode() : 'status';
  let sortBy = 'name';
  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const body = h('tbody');
  const head = h('thead');
  const liveBadge = h('span', { class: 'live connecting', title: 'Bài tập tự cập nhật khi có người khác thay đổi' }, LIVE_LABEL.connecting);

  const key = (e, a) => `${e}:${a}`;
  const buttons = new Map();
  const rateCells = new Map();
  const pending = new Set();

  const scoreAt = (enr, aid) => scoreOf.get(enr)?.scores?.[aid]?.score ?? null;
  const paint = (btn, cell, enr, aid) => {
    const st = cell?.status ?? null;
    const score = hasScores ? scoreAt(enr, aid) : null;
    btn.className = `cell ${st ?? 'empty'}${cell?.note ? ' has-note' : ''}${mode !== 'status' && score != null ? ' scored' : ''}`;
    const mark = st ? SHORT[st] + (cell.challenge ? '★' : '') : '·';
    if (mode === 'status' || (mode === 'both' && score == null)) btn.replaceChildren(mark);
    else if (mode === 'score') btn.replaceChildren(h('b', { class: 'cell-score' }, fmtScore(score)));
    else btn.replaceChildren(h('span', { class: 'cell-mark' }, mark), h('b', { class: 'cell-score' }, fmtScore(score)));
    const who = cell?.by ? ` · ${cell.by}${cell.at ? `, ${fmtTime(cell.at)}` : ''}` : '';
    btn.title = (st ? LABEL[st] : 'Chưa ghi nhận') + (score != null ? ` · Điểm ${fmtScore(score)}/10` : '')
      + (cell?.challenge ? ' · có làm Challenge' : '') + who + (cell?.note ? ` — ${cell.note}` : '');
  };
  const flash = (el) => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); };

  // Bấm "Điểm TB": cao → thấp, thấp → cao, rồi về thứ tự tên
  const avgHead = h('th', { class: 'num sortable', title: 'Bấm để sắp xếp theo điểm trung bình' }, 'Điểm TB');
  avgHead.addEventListener('click', () => { sortBy = sortBy === 'avg-desc' ? 'avg-asc' : sortBy === 'avg-asc' ? 'name' : 'avg-desc'; renderBody(); });
  head.append(h('tr', {},
    h('th', { class: 'sticky' }, 'Học viên'),
    data.assignments.map((a) => h('th', { class: 'num', title: [a.title, moduleOf.get(String(a.id))].filter(Boolean).join(' · ') },
      a.kind === 'capstone' ? 'Capstone' : a.kind === 'mini' ? `MP${a.seq}` : `HW${a.seq}`)),
    h('th', { class: 'num' }, 'Hoàn thành HW'),
    hasScores ? avgHead : null));

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
      paint(btn, r.cell, row.enrollment_id, a.id);
    } catch (e) {
      if (e.status === 409 && e.data?.current !== undefined) {
        row.cells[a.id] = e.data.current;
        paint(btn, e.data.current, row.enrollment_id, a.id);
        flash(btn);
      }
      toast(e.message, true);
    } finally {
      pending.delete(k);
    }
  }

  function renderBody() {
    const q = norm(search.value).trim(); // không phân biệt hoa/thường và dấu tiếng Việt
    buttons.clear(); rateCells.clear();
    const avg = (r) => scoreOf.get(r.enrollment_id)?.avg ?? null;
    const rows = data.rows.filter((r) => !q || norm(r.full_name).includes(q) || norm(r.student_code).includes(q));
    if (sortBy !== 'name') {   // học viên chưa có điểm luôn xếp cuối
      const dir = sortBy === 'avg-desc' ? -1 : 1;
      rows.sort((x, y) => (avg(x) == null) - (avg(y) == null) || dir * ((avg(x) ?? 0) - (avg(y) ?? 0)));
    }
    avgHead.textContent = `Điểm TB${sortBy === 'avg-desc' ? ' ↓' : sortBy === 'avg-asc' ? ' ↑' : ''}`;
    body.replaceChildren(...rows
      .map((row) => {
        const rate = h('td', { class: 'num' }, pct(row.hw_rate));
        rateCells.set(row.enrollment_id, rate);
        return h('tr', { class: row.course_status === 'active' ? '' : 'inactive' },
          h('td', { class: 'sticky' }, row.full_name, h('div', { class: 'muted small' }, row.student_code)),
          data.assignments.map((a) => {
            const btn = h('button', { 'aria-label': `${row.full_name} ${a.title}` });
            buttons.set(key(row.enrollment_id, a.id), btn);
            paint(btn, row.cells[a.id], row.enrollment_id, a.id);
            if (readOnly) { btn.classList.add('readonly'); btn.setAttribute('aria-readonly', 'true'); } else btn.addEventListener('click', () => edit(row, a, btn));
            return h('td', { class: 'num' }, btn);
          }), rate,
          hasScores ? h('td', { class: 'num' }, h('b', { class: 'avg-score' }, fmtScore(avg(row)))) : null);
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
        if (btn) { paint(btn, next, row.enrollment_id, a.id); flash(btn); }
      }
      row.hw_rate = fr.hw_rate;
      const rc = rateCells.get(row.enrollment_id);
      if (rc && rc.textContent !== pct(fr.hw_rate)) { rc.textContent = pct(fr.hw_rate); flash(rc); }
    });
  }

  search.addEventListener('input', renderBody);
  renderBody();

  // Chọn cách hiển thị ô (chỉ khi lớp có điểm)
  const modeChips = hasScores ? h('div', { class: 'chips seg-chips', role: 'group', 'aria-label': 'Cách hiển thị ô' },
    MODES.map(([k, label]) => h('button', { type: 'button', class: `chip${k === mode ? ' active' : ''}`, 'data-mode': k,
      onclick: (e) => {
        mode = k; saveMode(k);
        for (const b of e.currentTarget.parentElement.children) b.classList.toggle('active', b.dataset.mode === k);
        renderBody();
      } }, label))) : null;
  const scoredCount = (sc?.rows ?? []).filter((r) => r.avg != null).length;
  const scoreSummary = hasScores ? h('div', { class: 'score-summary' },
    h('span', { class: 'score-kpi' }, h('small', {}, 'Điểm TB cả lớp'), h('b', {}, fmtScore(sc.class_avg)), h('small', {}, '/10')),
    h('span', { class: 'muted small' }, `${scoredCount}/${sc.rows.length} học viên có điểm · ${sc.assignments.length} bài đã có điểm · đồng bộ từ Google Sheet bảng điểm`)) : null;

  const view = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Bài tập'), h('span', { class: 'muted', title: cls.code }, classDisplayName(cls)), liveBadge),
    h('div', { class: 'legend' },
      h('span', {}, readOnly ? 'Chú thích: ' : 'Bấm ô để cập nhật: '), ...Object.entries(LABEL).map(([k, v]) => h('span', {}, h('span', { class: `cell ${k}` }, SHORT[k]), ` ${v}`)),
      h('span', { class: 'muted' }, (readOnly ? '· Tài khoản khách chỉ xem ' : '') + '· ★ = có làm Challenge · "Nộp lại" chưa tính là hoàn thành'
        + (hasScores ? ' · Số trong ô = điểm (thang 10) · Bấm "Điểm TB" để sắp xếp' : '') + ' · Rê chuột để xem ai đã cập nhật')),
    scoreSummary,
    h('div', { class: 'toolbar' }, search, modeChips),
    h('div', { class: 'table-wrap' }, h('table', {}, head, body)));

  startLive({
    base,
    alive: () => view.isConnected,
    onChange: applyRemote,
    onStatus: (s) => { liveBadge.className = `live ${s}`; liveBadge.textContent = LIVE_LABEL[s]; },
  });
  return view;
}
