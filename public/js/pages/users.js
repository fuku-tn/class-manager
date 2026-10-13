import { get, post, put } from '../api.js';
import { h, toast, formModal } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';

export async function renderUsers({ state, navigate }) {
  const users = await get('/api/users');
  const events = await get('/api/auth/events').catch(() => []);
  const EVENT = { login_ok: 'Đăng nhập', login_fail: 'Đăng nhập sai', locked: 'Bị khóa tạm', password_changed: 'Đổi mật khẩu', password_fail: 'Nhập sai mật khẩu hiện tại' };
  const when = (iso) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
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

  const eventsCard = h('details', { class: 'card' },
    h('summary', {}, `Nhật ký đăng nhập (${events.length} sự kiện gần nhất)`),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Thời gian', 'Sự kiện', 'Email', 'IP', 'Thiết bị'].map((x) => h('th', {}, x)))),
      h('tbody', {}, events.map((e) => h('tr', { class: e.event === 'login_ok' || e.event === 'password_changed' ? '' : 'inactive' },
        h('td', {}, when(e.at)), h('td', {}, EVENT[e.event] ?? e.event), h('td', {}, e.email ?? '—'), h('td', {}, e.ip ?? '—'),
        h('td', { class: 'muted small', title: e.user_agent ?? '' }, (e.user_agent ?? '').slice(0, 50)))))),
    h('p', { class: 'muted small' }, 'Giữ 90 ngày. Sai 8 lần trong 15 phút (cùng IP + email) thì bị khóa tạm 15 phút.')));

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Người dùng'), h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: async () => {
        const v = await formModal({ title: 'Thêm giảng viên / admin', fields: [
          { name: 'name', label: 'Họ tên', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'password', label: 'Mật khẩu (≥ 10 ký tự)', type: 'password', required: true },
          { name: 'role', label: 'Vai trò', type: 'select', value: 'instructor', options: [['instructor', 'Giảng viên'], ['guest', 'Khách (chỉ xem)'], ['admin', 'Admin']] }] });
        if (!v) return;
        try { await post('/api/users', v); toast('Đã tạo'); location.reload(); } catch (e) { toast(e.message, true); }
      } }, '+ Thêm người dùng')),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Họ tên', 'Email', 'Vai trò', 'Nhắc bài (tin nhắn + chụp ảnh)', 'Xem lớp chưa diễn ra', 'Lớp được phân', 'Trạng thái', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, users.map((u) => h('tr', { class: u.active ? '' : 'inactive' },
        h('td', {}, u.name), h('td', {}, u.email), h('td', {}, ({ admin: 'Admin', guest: 'Khách (chỉ xem)' })[u.role] ?? 'Giảng viên'),
        h('td', {}, u.role === 'admin' ? 'Có (admin)' : u.role === 'guest' ? '—'
          : h('button', { class: u.can_remind ? 'primary' : '', title: 'Bật/tắt quyền dùng tin nhắn nhắc bài, sao chép ảnh và chế độ chụp', onclick: async () => {
            try { await put(`/api/users/${u.id}/remind`, { can_remind: !u.can_remind }); location.reload(); } catch (e) { toast(e.message, true); }
          } }, u.can_remind ? 'Được dùng — tắt' : 'Chỉ xem — bật')),
        h('td', {}, u.role === 'admin' ? 'Tất cả' : u.role === 'guest' ? '—'
          : h('button', { class: u.can_view_upcoming ? 'primary' : '', title: 'Cho phép xem (không sửa) mọi lớp chưa tới ngày khai giảng, kể cả lớp chưa được phân công', onclick: async () => {
            try { await put(`/api/users/${u.id}/view-upcoming`, { can_view_upcoming: !u.can_view_upcoming }); location.reload(); } catch (e) { toast(e.message, true); }
          } }, u.can_view_upcoming ? 'Được xem — tắt' : 'Không — bật')),
        h('td', {}, u.role === 'admin' ? 'Tất cả' : (u.class_ids.map(classOf).join(', ') || '—')),
        h('td', {}, u.active ? 'Hoạt động' : 'Đã khóa'),
        h('td', {},
          u.role !== 'admin' && h('button', { onclick: () => assign(u) }, 'Phân lớp'), ' ',
          u.id !== state.user.id && h('button', { onclick: async () => {
            try { await put(`/api/users/${u.id}/active`, { active: !u.active }); location.reload(); } catch (e) { toast(e.message, true); }
          } }, u.active ? 'Khóa' : 'Mở khóa'))))))), eventsCard);
}
