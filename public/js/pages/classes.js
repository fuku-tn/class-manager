import { post } from '../api.js';
import { h, toast, formModal } from '../ui.js';

const STATUS = { active: 'Đang diễn ra', finished: 'Kết thúc', archived: 'Lưu trữ' };

export async function renderClasses({ state, refreshClasses, navigate }) {
  const rows = h('tbody');
  const paint = () => rows.replaceChildren(...state.classes.map((c) => h('tr', {},
    h('td', {}, c.code), h('td', {}, c.name), h('td', {}, c.phase || '—'), h('td', {}, c.start_date || '—'),
    h('td', { class: 'num' }, c.student_count), h('td', {}, h('span', { class: 'badge' }, STATUS[c.status] || c.status)),
    h('td', {}, h('a', { href: `#/c/${c.id}/dashboard` }, 'Mở')))));
  paint();
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Lớp học'), h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: async () => {
        const v = await formModal({ title: 'Tạo lớp mới', fields: [
          { name: 'code', label: 'Mã lớp', required: true, full: true },
          { name: 'name', label: 'Tên lớp (tuỳ chọn)', full: true },
          { name: 'phase', label: 'Phase (vd Phase 1)' }, { name: 'start_date', label: 'Ngày bắt đầu', type: 'date' },
          { name: 'session_count', label: 'Số buổi', type: 'number', value: 8 }, { name: 'hw_count', label: 'Số bài HW', type: 'number', value: 6 }] });
        if (!v) return;
        try {
          const c = await post('/api/classes', v);
          await refreshClasses(); toast('Đã tạo lớp'); navigate(`#/c/${c.id}/students`);
        } catch (e) { toast(e.message, true); }
      } }, '+ Tạo lớp')),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Mã lớp', 'Tên', 'Phase', 'Bắt đầu', 'Học viên', 'Trạng thái', ''].map((x) => h('th', {}, x)))), rows)),
    h('p', { class: 'muted small' }, 'Nhập danh sách từ Excel: chạy "npm run import -- <file.xlsx>" trên máy chủ.'));
}
