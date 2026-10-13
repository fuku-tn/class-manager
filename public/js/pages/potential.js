import { get } from '../api.js';
import { h } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';

const REASON = { unpaid: 'Chưa thanh toán', removed_from_sheet: 'Đã bị xóa khỏi sheet PERSONAL' };
const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export async function renderPotential({ cls }) {
  const rows = await get(`/api/classes/${cls.id}/potential`);
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Potential'), h('span', { class: 'muted', title: cls.code }, classDisplayName(cls)),
      h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${rows.length} người`)),
    h('p', { class: 'muted small' },
      'Những người có trong sheet PERSONAL nhưng chưa có tên trong danh sách học viên và điểm danh: đang "Chưa thanh toán", hoặc đã bị xóa khỏi sheet. ',
      'Khi họ đủ điều kiện (đổi trạng thái) hoặc xuất hiện lại trong sheet thì tự quay về danh sách lớp.'),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Mã', 'Họ tên', 'Email', 'SĐT', 'Trạng thái Sheet', 'Lý do', 'Từ ngày'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows.map((r) => h('tr', {},
        h('td', {}, r.student_code), h('td', {}, r.full_name), h('td', {}, r.email || '—'), h('td', {}, r.phone || '—'),
        h('td', {}, r.last_status || '—'), h('td', {}, REASON[r.reason] ?? r.reason),
        h('td', {}, fmtDay(r.updated_at))))
        : [h('tr', {}, h('td', { colspan: 7, class: 'empty-state' }, 'Chưa có ai trong danh sách Potential.'))]))));
}
