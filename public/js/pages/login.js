import { post } from '../api.js';
import { h } from '../ui.js';

export function renderLogin(root, onSuccess) {
  const err = h('div', { class: 'error', role: 'alert' });
  const email = h('input', { id: 'email', type: 'email', required: true, autocomplete: 'username' });
  const password = h('input', { id: 'password', type: 'password', required: true, autocomplete: 'current-password' });
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Đăng nhập');
  root.append(h('div', { class: 'login card' },
    h('h1', {}, 'Quản lý lớp học'),
    h('p', { class: 'muted' }, 'Đăng nhập để tiếp tục'),
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
      err, h('div', { class: 'actions' }, btn))));
  email.focus();
}
