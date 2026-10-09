import { post } from '../api.js';
import { h, logo, BRAND } from '../ui.js';

export function renderLogin(root, onSuccess) {
  const err = h('div', { class: 'error', role: 'alert' });
  const email = h('input', { id: 'email', type: 'email', required: true, autocomplete: 'username', placeholder: 'ban@starttrain.vn' });
  const password = h('input', { id: 'password', type: 'password', required: true, autocomplete: 'current-password' });
  const btn = h('button', { type: 'submit', class: 'primary btn-block' }, 'Đăng nhập');

  root.append(h('div', { class: 'auth' },
    h('section', { class: 'auth-hero' },
      h('div', { class: 'brand' }, logo(44), h('div', { class: 'brand-text' },
        h('span', { class: 'brand-name' }, BRAND.name), h('span', { class: 'brand-tag' }, BRAND.tagline))),
      h('div', {},
        h('div', { class: 'eyebrow' }, 'Quản lý lớp học'),
        h('h2', {}, 'Lớp học gọn gàng, ', h('span', { class: 'accent' }, 'số liệu rõ ràng.')),
        h('p', {}, 'Theo dõi học viên, điểm danh và bài tập từng lớp trên một Dashboard duy nhất.'),
        h('ul', { class: 'auth-points' },
          h('li', {}, 'Điểm danh nhanh chỉ với một cú bấm'),
          h('li', {}, 'Tỉ lệ chuyên cần và hoàn thành bài tập tự tính'),
          h('li', {}, 'Cảnh báo học viên cần chú ý'))),
      h('div', { class: 'auth-foot' }, `${BRAND.name} | ${BRAND.tagline}`)),
    h('section', { class: 'auth-panel' },
      h('div', { class: 'auth-card card' },
        h('h1', {}, 'Đăng nhập'),
        h('p', { class: 'muted', style: 'margin:0 0 1.1rem' }, 'Dùng tài khoản giảng viên hoặc quản trị được cấp.'),
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault();
            btn.disabled = true; err.textContent = '';
            try { onSuccess(await post('/api/auth/login', { email: email.value, password: password.value })); }
            catch (ex) { err.textContent = ex.message; btn.disabled = false; }
          },
        },
          h('div', { class: 'form-row' }, h('label', { for: 'email' }, 'Email'), email),
          h('div', { class: 'form-row' }, h('label', { for: 'password' }, 'Mật khẩu'), password),
          err, btn)))));
  email.focus();
}
