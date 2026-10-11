import { get, post, put } from '../api.js';
import { h, toast, formModal } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';

export async function renderUsers({ state, navigate }) {
  const users = await get('/api/users');
  const classOf = (id) => { const c = state.classes.find((x) => x.id === id); return c ? classDisplayName(c) : id; };

  async function assign(u) {
    const chosen = new Set(u.class_ids);
    const boxes = state.classes.map((c) => {
      const cb = h('input', { type: 'checkbox', id: `c-${c.id}` });
      cb.checked = chosen.has(c.id);
      cb.addEventListener('change', () => (cb.checked ? chosen.add(c.id) : chosen.delete(c.id)));
      return h('div', {}, cb, ' ', h('label', { for: `c-${c.id}`, title: c.code }, classDisplayName(c)));
    });
    const v = await formModal({ title: `Phân lớp cho ${u.name}`, fields: [], submitLabel: 'Lưu', extra: h('div', {}, boxes.length ? boxes : 'Chưa có lớp.') });
    if (!v) return;
    try { await put(`/api/users/${u.id}/classes`, { class_ids: [...chosen] }); toast('Đã lưu'); navigate('#/users'); location.reload(); }
    catch (e) { toast(e.message, true); }
  }

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Người dùng'), h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: async () => {
        const v = await formModal({ title: 'Thêm giảng viên / admin', fields: [
          { name: 'name', label: 'Họ tên', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'password', label: 'Mật khẩu (≥ 8 ký tự)', type: 'password', required: true },
          { name: 'role', label: 'Vai trò', type: 'select', value: 'instructor', options: [['instructor', 'Giảng viên'], ['guest', 'Khách (chỉ xem)'], ['admin', 'Admin']] }] });
        if (!v) return;
        try { await post('/api/users', v); toast('Đã tạo'); location.reload(); } catch (e) { toast(e.message, true); }
      } }, '+ Thêm người dùng')),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Họ tên', 'Email', 'Vai trò', 'Lớp được phân', 'Trạng thái', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, users.map((u) => h('tr', { class: u.active ? '' : 'inactive' },
        h('td', {}, u.name), h('td', {}, u.email), h('td', {}, ({ admin: 'Admin', guest: 'Khách (chỉ xem)' })[u.role] ?? 'Giảng viên'),
        h('td', {}, u.role === 'admin' ? 'Tất cả' : (u.class_ids.map(classOf).join(', ') || '—')),
        h('td', {}, u.active ? 'Hoạt động' : 'Đã khóa'),
        h('td', {},
          u.role !== 'admin' && h('button', { onclick: () => assign(u) }, 'Phân lớp'), ' ',
          u.id !== state.user.id && h('button', { onclick: async () => {
            try { await put(`/api/users/${u.id}/active`, { active: !u.active }); location.reload(); } catch (e) { toast(e.message, true); }
          } }, u.active ? 'Khóa' : 'Mở khóa'))))))));
}
