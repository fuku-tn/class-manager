import { get, post, put, del } from '../api.js';
import { h, toast, pct, formModal, confirmModal, downloadCsv, COURSE_STATUS_LABEL, COURSE_STATUS_BADGE } from '../ui.js';

const MODE_OPTIONS = [['', '(chưa rõ)'], ['Online', 'Online'], ['Offline', 'Offline'], ['Hybrid', 'Hybrid']];
const STATUS_OPTIONS = Object.entries(COURSE_STATUS_LABEL);

export async function renderStudents({ cls, state }) {
  const base = `/api/classes/${cls.id}`;
  let rows = await get(`${base}/students`);
  const search = h('input', { type: 'search', placeholder: 'Tìm theo tên, mã, email…', 'aria-label': 'Tìm học viên' });
  const status = h('select', { 'aria-label': 'Lọc trạng thái' }, h('option', { value: '' }, 'Mọi trạng thái'), STATUS_OPTIONS.map(([v, l]) => h('option', { value: v }, l)));
  const mode = h('select', { 'aria-label': 'Lọc hình thức' }, h('option', { value: '' }, 'Mọi hình thức'), MODE_OPTIONS.slice(1).map(([v, l]) => h('option', { value: v }, l)));
  const body = h('tbody');
  const count = h('span', { class: 'muted' });

  const filtered = () => {
    const q = search.value.trim().toLowerCase();
    return rows.filter((r) =>
      (!q || [r.full_name, r.student_code, r.email, r.phone].some((x) => String(x ?? '').toLowerCase().includes(q))) &&
      (!status.value || r.course_status === status.value) && (!mode.value || r.mode === mode.value));
  };

  async function reload() { rows = await get(`${base}/students`); paint(); }

  async function edit(r) {
    const v = await formModal({ title: r.full_name, fields: [
      { name: 'full_name', label: 'Họ tên', value: r.full_name, required: true, full: true },
      { name: 'email', label: 'Email', type: 'email', value: r.email },
      { name: 'phone', label: 'Số điện thoại', value: r.phone },
      { name: 'mode', label: 'Hình thức', type: 'select', options: MODE_OPTIONS, value: r.mode ?? '' },
      { name: 'course_status', label: 'Trạng thái khóa học', type: 'select', options: STATUS_OPTIONS, value: r.course_status },
      { name: 'certificate_status', label: 'Chứng chỉ', value: r.certificate_status },
      { name: 'voucher_amount', label: 'Voucher (VND)', type: 'number', value: r.voucher_amount },
      { name: 'voucher_sent_date', label: 'Ngày gửi voucher', type: 'date', value: r.voucher_sent_date },
      { name: 'voucher_expiration_date', label: 'Hạn voucher', type: 'date', value: r.voucher_expiration_date },
      { name: 'voucher_status', label: 'Trạng thái voucher', value: r.voucher_status },
      { name: 'note', label: 'Ghi chú', type: 'textarea', value: r.note, full: true }],
    extra: state.user.role === 'admin' && h('button', { type: 'button', class: 'danger', onclick: async () => {
      if (!await confirmModal(`Xóa ${r.full_name} khỏi lớp ${cls.code}? Toàn bộ điểm danh và bài tập của bạn này trong lớp sẽ mất.`)) return;
      try { await del(`${base}/students/${r.id}`); document.querySelector('.modal-back')?.remove(); await reload(); toast('Đã xóa'); }
      catch (e) { toast(e.message, true); }
    } }, 'Xóa khỏi lớp') });
    if (!v) return;
    try {
      await put(`${base}/students/${r.id}`, {
        full_name: v.full_name, email: v.email, phone: v.phone, mode: v.mode, course_status: v.course_status,
        certificate_status: v.certificate_status, note: v.note,
        voucher: { amount: v.voucher_amount, sent_date: v.voucher_sent_date, expiration_date: v.voucher_expiration_date, status: v.voucher_status },
      });
      await reload(); toast('Đã lưu');
    } catch (e) { toast(e.message, true); }
  }

  async function add() {
    const v = await formModal({ title: 'Thêm học viên', fields: [
      { name: 'student_code', label: 'Mã học viên (vd P.13027)', required: true },
      { name: 'full_name', label: 'Họ tên', required: true },
      { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Số điện thoại' },
      { name: 'mode', label: 'Hình thức', type: 'select', options: MODE_OPTIONS, value: '' }] });
    if (!v) return;
    try { await post(`${base}/students`, v); await reload(); toast('Đã thêm'); } catch (e) { toast(e.message, true); }
  }

  function paint() {
    const list = filtered();
    count.textContent = `${list.length}/${rows.length} học viên`;
    body.replaceChildren(...list.map((r) => h('tr', { class: `clickable${r.course_status === 'active' ? '' : ' inactive'}`, tabindex: 0,
      onclick: () => edit(r), onkeydown: (e) => { if (e.key === 'Enter') edit(r); } },
      h('td', {}, r.student_code), h('td', {}, r.full_name), h('td', {}, r.email || '—'), h('td', {}, r.phone || '—'),
      h('td', {}, r.mode || '—'),
      h('td', {}, h('span', { class: `badge ${COURSE_STATUS_BADGE[r.course_status] || ''}` }, COURSE_STATUS_LABEL[r.course_status])),
      h('td', { class: 'num' }, pct(r.attendance_rate)), h('td', { class: 'num' }, pct(r.hw_rate)),
      h('td', {}, r.voucher_amount ? `${r.voucher_amount.toLocaleString('vi-VN')}đ${r.voucher_expiration_date ? ` · hạn ${r.voucher_expiration_date}` : ''}` : '—'))));
    if (!list.length) body.append(h('tr', {}, h('td', { colspan: 9, class: 'empty-state' }, rows.length ? 'Không có học viên khớp bộ lọc.' : 'Chưa có học viên. Bấm "Thêm học viên".')));
  }

  [search, status, mode].forEach((el) => el.addEventListener('input', paint));
  paint();
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Học viên'), h('span', { class: 'muted' }, cls.code), h('span', { class: 'spacer' }),
      h('button', { onclick: () => downloadCsv(`${cls.code}-hoc-vien.csv`, [
        ['Mã', 'Họ tên', 'Email', 'SĐT', 'Hình thức', 'Trạng thái', 'Điểm danh', 'HW'],
        ...filtered().map((r) => [r.student_code, r.full_name, r.email, r.phone, r.mode, COURSE_STATUS_LABEL[r.course_status], pct(r.attendance_rate), pct(r.hw_rate)])]) }, 'Xuất CSV'),
      h('button', { class: 'primary', onclick: add }, '+ Thêm học viên')),
    h('div', { class: 'toolbar' }, search, status, mode, count),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Mã', 'Họ tên', 'Email', 'SĐT', 'Hình thức', 'Trạng thái', 'Điểm danh', 'HW', 'Voucher'].map((x) => h('th', {}, x)))),
      body)));
}
