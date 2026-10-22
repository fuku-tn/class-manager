// Thông báo "Học bù" ở góc trên bên phải (cạnh bộ chọn lớp) khi đang xem một lớp:
// học viên lớp khác được ghi chú điểm danh "Bù <mã lớp này>" (vd "Bù EBA122"). Có trường hợp MỚI (chưa mở xem) thì nút nhấp nháy.
// Đã xem lưu theo trình duyệt (localStorage) — chỉ để tắt nhấp nháy, không ảnh hưởng dữ liệu.
import { get } from './api.js';
import { h, icon, setChildren } from './ui.js';
import { classDisplayName } from './class-filter.mjs';

const POLL_MS = 60000;
const seenKey = (classId) => `makeupSeen:${classId}`;
const readSeen = (classId) => { try { return new Set(JSON.parse(localStorage.getItem(seenKey(classId)) || '[]')); } catch { return new Set(); } };
const saveSeen = (classId, keys) => { try { localStorage.setItem(seenKey(classId), JSON.stringify([...keys].slice(-500))); } catch { /* bỏ qua */ } };
const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '')); return m ? `${m[3]}/${m[2]}` : ''; };
const fmtWhen = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); };

export function createMakeupNotice() {
  const count = h('b', { class: 'makeup-count' });
  const btn = h('button', { type: 'button', class: 'makeup-btn', 'aria-haspopup': 'dialog', title: 'Học viên lớp khác đến học bù' },
    h('span', { class: 'makeup-bell' }, icon('bell')), h('span', { class: 'makeup-label' }, 'Học bù'), count);
  const pop = h('div', { class: 'makeup-pop', role: 'dialog', 'aria-label': 'Học viên học bù', hidden: true });
  const el = h('div', { class: 'makeup', hidden: true }, btn, pop);
  let cls = null; let list = []; let timer = null; let seq = 0;

  const keysOf = (l) => l.flatMap((g) => g.sessions.map((s) => s.key));
  function paint() {
    const seen = readSeen(cls.id);
    const fresh = keysOf(list).filter((k) => !seen.has(k));
    el.hidden = !list.length;
    count.textContent = String(list.length);
    btn.classList.toggle('blink', fresh.length > 0);
    btn.title = fresh.length ? `${fresh.length} buổi học bù mới chưa xem` : 'Học viên lớp khác đến học bù';
    if (!pop.hidden) paintPop(seen);
  }
  function paintPop(seen) {
    setChildren(pop,
      h('div', { class: 'makeup-head' }, h('b', {}, `Học bù tại ${classDisplayName(cls)}`), h('span', { class: 'muted small' }, `${list.length} học viên`)),
      h('div', { class: 'makeup-list' }, list.map((g) => {
        const isNew = g.sessions.some((s) => !seen.has(s.key));
        return h('div', { class: `makeup-item${isNew ? ' new' : ''}` },
          h('div', { class: 'makeup-top' }, h('b', {}, g.full_name), isNew ? h('span', { class: 'makeup-new' }, 'Mới') : null),
          h('div', { class: 'muted small' }, g.student_code, ' · từ lớp ',
            h('a', { href: `#/c/${g.from_class_id}/attendance`, title: g.from_code }, classDisplayName({ short_code: g.from_short, code: g.from_code }))),
          h('div', { class: 'makeup-sessions' }, g.sessions.map((s) => h('div', { class: 'small' },
            h('b', {}, `Bù buổi ${s.session_no}`), s.session_date ? ` (${fmtDate(s.session_date)})` : '',
            s.target_session ? ` → học buổi ${s.target_session} lớp này` : '',
            h('span', { class: 'muted' }, ` · “${s.note}”${s.by ? ` · ${s.by}` : ''}${s.at ? `, ${fmtWhen(s.at)}` : ''}`)))));
      })),
      h('p', { class: 'muted small makeup-foot' }, 'Lấy từ ghi chú điểm danh ở lớp gốc có dạng "Bù <mã lớp>", vd "Bù EBA122" hoặc "Bù EBA122 buổi 1".'));
  }
  async function load() {
    if (!cls) return;
    const my = ++seq; const id = cls.id;
    try {
      const data = await get(`/api/classes/${id}/makeups`);
      if (my !== seq || !cls || cls.id !== id) return;   // đã chuyển lớp trong lúc tải
      list = data; paint();
    } catch { /* lỗi mạng: giữ trạng thái cũ */ }
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      const seen = readSeen(cls.id);
      paintPop(seen);                                     // vẽ với trạng thái cũ để thấy mục "Mới"…
      for (const k of keysOf(list)) seen.add(k);
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
      if (changed) { list = []; el.hidden = true; pop.hidden = true; }
      load();
      timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);   // tab ẩn không thăm dò: bớt tải/kết nối tới database
    },
  };
}
