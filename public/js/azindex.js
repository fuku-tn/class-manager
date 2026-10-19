// Thanh chữ cái A–Z bên trái bảng (trang Điểm danh): bấm một chữ → cuộn bảng tới học viên đầu tiên có HỌ bắt đầu bằng chữ đó,
// dòng đó nháy sáng và ánh sáng tắt dần từ trái sang phải. Chỉ chọn được MỘT chữ tại một thời điểm (như nút radio).
// Chỉ hiện các chữ có học viên (theo danh sách đang hiển thị, tính cả ô tìm kiếm/sắp xếp). Dòng cần có data-initial="<chữ>".
import { h } from './ui.js';

const FLASH_MS = 2200;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// wrap = khung cuộn (.table-wrap), body = <tbody>
export function createAzIndex({ wrap, body }) {
  const strip = h('div', { class: 'az-strip', role: 'radiogroup', 'aria-label': 'Nhảy tới học viên theo chữ cái đầu của họ', hidden: true });
  const thumb = h('span', { class: 'az-thumb', 'aria-hidden': 'true' });   // "viên" vàng trượt tới chữ đang chọn
  let selected = null;

  // Đặt viên vàng đúng vị trí nút đang chọn (dọc trên máy tính, ngang trên điện thoại)
  function placeThumb() {
    const btn = strip.querySelector('.az-btn.on');
    thumb.classList.toggle('on', !!btn);
    if (!btn) return;
    const vertical = getComputedStyle(strip).flexDirection === 'column';
    if (vertical) Object.assign(thumb.style, { top: `${btn.offsetTop}px`, height: `${btn.offsetHeight}px`, left: '', width: '' });
    else Object.assign(thumb.style, { left: `${btn.offsetLeft}px`, width: `${btn.offsetWidth}px`, top: '', height: '' });
  }

  function flash(row) {
    wrap.querySelector('.az-flash')?.remove();
    const w = wrap.getBoundingClientRect(); const r = row.getBoundingClientRect();
    const el = h('div', { class: 'az-flash', 'aria-hidden': 'true' });
    // tọa độ trong nội dung cuộn; ánh sáng quét trên phần đang nhìn thấy của hàng (không phụ thuộc cuộn ngang)
    el.style.cssText = `top:${Math.round(r.top - w.top + wrap.scrollTop)}px;left:${Math.round(wrap.scrollLeft)}px;width:${wrap.clientWidth}px;height:${Math.round(r.height)}px`;
    wrap.append(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), FLASH_MS + 300);
  }

  function jump(letter) {
    const row = [...body.querySelectorAll('tr[data-initial]')].find((tr) => tr.dataset.initial === letter);
    if (!row) return;
    const w = wrap.getBoundingClientRect(); const r = row.getBoundingClientRect();
    const headH = wrap.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    wrap.scrollTo({ top: Math.max(0, wrap.scrollTop + (r.top - w.top) - headH), behavior: reduced() ? 'auto' : 'smooth' });
    flash(row);
  }

  function select(letter) {
    selected = letter;
    for (const b of strip.querySelectorAll('.az-btn')) { const on = b.dataset.letter === letter; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    placeThumb();
    jump(letter);
  }

  // Gọi lại sau mỗi lần dựng lại bảng
  function update() {
    const letters = [...new Set([...body.querySelectorAll('tr[data-initial]')].map((tr) => tr.dataset.initial))]
      .sort((a, b) => (a === '#') - (b === '#') || a.localeCompare(b, 'vi'));
    if (!letters.includes(selected)) selected = null;
    strip.hidden = letters.length < 2;   // chỉ có một chữ thì không cần thanh
    strip.replaceChildren(thumb, ...letters.map((l, i) => h('button', {
      type: 'button', class: `az-btn${l === selected ? ' on' : ''}`, role: 'radio', 'aria-checked': String(l === selected),
      'data-letter': l, tabindex: l === selected || (!selected && i === 0) ? 0 : -1, title: `Họ bắt đầu bằng ${l}`,
      onclick: () => select(l),
    }, l)));
    requestAnimationFrame(placeThumb);
  }

  // Mũi tên lên/xuống chuyển chữ (chuẩn nhóm radio)
  strip.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const btns = [...strip.querySelectorAll('.az-btn')]; const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
    next.focus(); select(next.dataset.letter);
  });

  window.addEventListener('resize', () => { if (strip.isConnected) placeThumb(); });
  return { el: strip, update };
}
