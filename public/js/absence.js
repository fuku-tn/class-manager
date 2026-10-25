// Chuông "Xin nghỉ" cạnh "Học bù": học viên gửi email xin nghỉ (Apps Script đọc hộp thư academicaffairs → /api/sync/absences).
// Chỉ báo NGÀY xin nghỉ của học viên đang học lớp này — không tự xác định buổi (người dùng tự biết và tự điểm danh); bấm "Đã biết" thì hết nhắc.
// "Đã xem" lưu theo trình duyệt chỉ để tắt nhấp nháy.
import { get, post } from './api.js';
import { h, icon, setChildren, toast, fmtWhen } from './ui.js';
import { classDisplayName } from './class-filter.mjs';

let list = [];   // đơn chờ của lớp đang xem

const POLL_MS = 60000;
const seenKey = (classId) => `absenceSeen:${classId}`;
const readSeen = (classId) => { try { return new Set(JSON.parse(localStorage.getItem(seenKey(classId)) || '[]')); } catch { return new Set(); } };
const saveSeen = (classId, ids) => { try { localStorage.setItem(seenKey(classId), JSON.stringify([...ids].slice(-500))); } catch { /* bỏ qua */ } };
const fmtDay = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

export function createAbsenceNotice({ canAct }) {
  const count = h('b', { class: 'makeup-count' });
  const btn = h('button', { type: 'button', class: 'makeup-btn absence-btn', 'aria-haspopup': 'dialog', title: 'Học viên xin nghỉ qua email' },
    h('span', { class: 'makeup-bell' }, icon('bell')), h('span', { class: 'makeup-label' }, 'Xin nghỉ'), count);
  const pop = h('div', { class: 'makeup-pop', role: 'dialog', 'aria-label': 'Đơn xin nghỉ học', hidden: true });
  const el = h('div', { class: 'makeup', hidden: true }, btn, pop);
  let cls = null; let timer = null; let seq = 0;
  const pendingList = () => list.filter((r) => r.status === 'pending');

  function paint() {
    const list = pendingList();
    const seen = readSeen(cls.id);
    const fresh = list.filter((r) => !seen.has(r.id));
    el.hidden = !list.length;
    count.textContent = String(list.length);
    btn.classList.toggle('blink', fresh.length > 0);
    btn.title = fresh.length ? `${fresh.length} đơn xin nghỉ mới chưa xem` : 'Học viên xin nghỉ qua email';
    if (!pop.hidden) paintPop(seen);
  }
  async function dismiss(r) {
    try {
      await post(`/api/classes/${cls.id}/absences/${r.id}/dismiss`, {});
      toast('Đã ghi nhận, không nhắc đơn này nữa');
      await load();
    } catch (e) { toast(e.message, true); }
  }
  function paintPop(seen) {
    const list = pendingList();
    setChildren(pop,
      h('div', { class: 'makeup-head' }, h('b', {}, `Xin nghỉ — ${classDisplayName(cls)}`), h('span', { class: 'muted small' }, `${list.length} đơn`)),
      h('div', { class: 'makeup-list' }, list.map((r) => h('div', { class: `makeup-item${seen.has(r.id) ? '' : ' new'}` },
        h('div', { class: 'makeup-top' }, h('b', {}, r.full_name), seen.has(r.id) ? null : h('span', { class: 'makeup-new' }, 'Mới')),
        h('div', { class: 'muted small' }, r.student_code, ' · nhận ', fmtWhen(r.received_at)),
        h('div', { class: 'small' }, h('b', {}, `Xin nghỉ ngày ${fmtDay(r.absence_date)}`)),
        canAct(cls) ? h('div', { class: 'absence-actions' },
          h('button', { type: 'button', class: 'small', title: 'Xong, không cần nhắc nữa', onclick: () => dismiss(r) }, 'Đã biết')) : null))),
      h('p', { class: 'muted small makeup-foot' }, 'Lấy từ email xin nghỉ học: chỉ báo ngày học viên xin nghỉ, bạn tự biết đó là buổi nào và tự ghi điểm danh.'));
  }
  async function load() {
    if (!cls) return;
    const my = ++seq; const id = cls.id;
    try {
      const data = await get(`/api/classes/${id}/absences`);
      if (my !== seq || !cls || cls.id !== id) return;   // đã chuyển lớp trong lúc tải
      list = data;
      paint();
    } catch { /* lỗi mạng: giữ trạng thái cũ */ }
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      const seen = readSeen(cls.id);
      paintPop(seen);                                     // vẽ với trạng thái cũ để thấy mục "Mới"…
      for (const r of pendingList()) seen.add(r.id);
      saveSeen(cls.id, seen);                             // …rồi đánh dấu đã xem, tắt nhấp nháy
      btn.classList.remove('blink');
    }
  });
  document.addEventListener('click', (e) => { if (!el.contains(e.target)) pop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });

  return {
    el,
    // Gọi mỗi lần vào trang của một lớp; cls = null khi rời trang lớp.
    show(next) {
      const changed = cls?.id !== next?.id;
      cls = next;
      clearInterval(timer); timer = null;
      if (!cls) { el.hidden = true; pop.hidden = true; list = []; return; }
      if (changed) { el.hidden = true; pop.hidden = true; list = []; }
      load();
      timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);   // tab ẩn không thăm dò: bớt tải/kết nối tới database
    },
    refresh: load,
  };
}
