// Popup "Voucher Google Maps" trong trang Điểm danh — chỉ admin và tài khoản được bật can_voucher (hiện: Đoàn Minh Lý).
// Mỗi học viên một dòng: VOUCHER GG MAPS (500.000 / 1.000.000 / 1.500.000 / 2.000.000 hoặc tự nhập), VOUCHER SENT DATE,
// EXPIRATION DATE (dd/mm/yyyy), VOUCHER STATUS (trống = chưa dùng, "Used" = đã dùng). Tự lưu ngay khi đổi; nhập tay, không lấy từ Excel/Sheet.
import { get, put } from '../api.js';
import { h, toast, icon } from '../ui.js';
import { classDisplayName, norm } from '../class-filter.mjs';

const PRESETS = [500000, 1000000, 1500000, 2000000];
const OTHER = '__other';
const fmtVnd = (n) => Number(n).toLocaleString('vi-VN');
// yyyy-mm-dd <-> dd/mm/yyyy
const toDisplay = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
function toIso(display) {
  const s = String(display ?? '').trim();
  if (!s) return { value: null };
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return { error: 'Ngày phải có dạng dd/mm/yyyy' };
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { error: 'Ngày không có thật' };
  return { value: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}
// Gõ số thì tự chèn dấu "/" (dd/mm/yyyy)
function maskDate(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export async function openVouchers({ cls }) {
  const base = `/api/classes/${cls.id}`;
  let rows;
  try { rows = await get(`${base}/vouchers`); } catch (e) { toast(e.message, true); return; }

  const stat = h('span', { class: 'vc-stat muted small' });
  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const body = h('tbody');
  const refreshStat = () => {
    const sent = rows.filter((r) => r.sent_date).length; const used = rows.filter((r) => r.status === 'Used').length;
    stat.textContent = `${rows.length} học viên · đã gửi voucher ${sent} · đã dùng ${used}`;
  };

  function rowEl(r) {
    const tr = h('tr', { class: r.course_status === 'active' ? '' : 'inactive' });
    const saved = h('span', { class: 'vc-saved', 'aria-live': 'polite' });
    const isPreset = (a) => a == null || PRESETS.includes(a);
    const amountSel = h('select', { class: 'vc-sel', 'aria-label': `Voucher GG Maps của ${r.full_name}` },
      h('option', { value: '' }, '—'), PRESETS.map((p) => h('option', { value: String(p) }, fmtVnd(p))), h('option', { value: OTHER }, 'Khác…'));
    const custom = h('input', { class: 'vc-custom', type: 'text', inputmode: 'numeric', placeholder: 'Nhập số', 'aria-label': `Số tiền khác của ${r.full_name}` });
    const sent = h('input', { class: 'vc-date', type: 'text', inputmode: 'numeric', placeholder: 'dd/mm/yyyy', maxlength: '10', 'aria-label': `Ngày gửi voucher của ${r.full_name}` });
    const exp = h('input', { class: 'vc-date', type: 'text', inputmode: 'numeric', placeholder: 'dd/mm/yyyy', maxlength: '10', 'aria-label': `Ngày hết hạn của ${r.full_name}` });
    const status = h('select', { class: 'vc-sel vc-status', 'aria-label': `Trạng thái voucher của ${r.full_name}` },
      h('option', { value: '' }, 'Chưa dùng'), h('option', { value: 'Used' }, 'Used'));

    function paint() {
      const preset = isPreset(r.amount);
      amountSel.value = r.amount == null ? '' : preset ? String(r.amount) : OTHER;
      custom.hidden = preset && amountSel.value !== OTHER;
      custom.value = r.amount != null && !preset ? fmtVnd(r.amount) : custom.value;
      sent.value = toDisplay(r.sent_date); exp.value = toDisplay(r.expiration_date);
      status.value = r.status ?? '';
      tr.classList.toggle('vc-used', r.status === 'Used');
      tr.classList.toggle('vc-has', r.amount != null || !!r.sent_date);
    }
    let busy = false;
    async function save(patch) {
      if (busy) return;
      const next = { amount: r.amount, sent_date: r.sent_date, expiration_date: r.expiration_date, status: r.status, ...patch };
      busy = true; saved.textContent = '…'; saved.className = 'vc-saved';
      try {
        const out = await put(`${base}/vouchers/${r.enrollment_id}`, next);
        Object.assign(r, out); saved.textContent = '✓'; saved.className = 'vc-saved ok';
        setTimeout(() => { if (saved.textContent === '✓') saved.textContent = ''; }, 1800);
      } catch (e) { toast(e.message, true); saved.textContent = '!'; saved.className = 'vc-saved bad'; }
      finally { busy = false; paint(); refreshStat(); }
    }
    amountSel.addEventListener('change', () => {
      if (amountSel.value === OTHER) { custom.hidden = false; custom.focus(); return; }
      custom.hidden = true; custom.value = '';
      save({ amount: amountSel.value === '' ? null : Number(amountSel.value) });
    });
    custom.addEventListener('input', () => { const d = custom.value.replace(/\D/g, ''); custom.value = d ? fmtVnd(Number(d)) : ''; });
    custom.addEventListener('change', () => {
      const d = custom.value.replace(/\D/g, '');
      if (!d) { amountSel.value = ''; custom.hidden = true; save({ amount: null }); return; }
      save({ amount: Number(d) });
    });
    for (const [el, key] of [[sent, 'sent_date'], [exp, 'expiration_date']]) {
      el.addEventListener('input', () => { maskDate(el); el.classList.remove('bad'); });
      el.addEventListener('change', () => {
        const p = toIso(el.value);
        if (p.error) { el.classList.add('bad'); toast(p.error, true); return; }
        save({ [key]: p.value });
      });
    }
    status.addEventListener('change', () => save({ status: status.value || null }));
    tr.append(
      h('td', { class: 'sticky' }, r.full_name, h('div', { class: 'muted small' }, r.student_code + (r.course_status !== 'active' ? ` · ${r.course_status}` : ''))),
      h('td', {}, h('div', { class: 'vc-amount' }, amountSel, custom)), h('td', {}, sent), h('td', {}, exp), h('td', {}, status), h('td', { class: 'vc-end' }, saved));
    paint();
    return tr;
  }

  function renderBody() {
    const q = norm(search.value).trim();
    body.replaceChildren(...rows.filter((r) => !q || norm(r.full_name).includes(q) || norm(r.student_code).includes(q)).map(rowEl));
    if (!body.children.length) body.append(h('tr', {}, h('td', { colspan: 6, class: 'empty-state' }, rows.length ? 'Không có học viên khớp tìm kiếm.' : 'Lớp chưa có học viên.')));
  }

  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal modal-wide vc-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Voucher Google Maps' },
      h('div', { class: 'vc-head' },
        h('div', {}, h('h2', {}, icon('ticket'), ` Voucher Google Maps — ${classDisplayName(cls)}`),
          h('p', { class: 'muted small' }, 'Chỉ admin và tài khoản được cấp quyền thấy bảng này. Mọi thay đổi tự lưu ngay.')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Đóng', onclick: close }, '✕')),
      h('div', { class: 'toolbar vc-tools' }, search, stat),
      h('div', { class: 'table-wrap vc-wrap' }, h('table', { class: 'vc-table' },
        h('thead', {}, h('tr', {}, ['Học viên', 'Voucher GG Maps (VND)', 'Voucher sent date', 'Expiration date', 'Voucher status', ''].map((x, i) => h('th', { class: i === 0 ? 'sticky' : '' }, x)))),
        body))));
  search.addEventListener('input', renderBody);
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  renderBody(); refreshStat();
  search.focus();
}
