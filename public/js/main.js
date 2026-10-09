import { get, post } from './api.js';
import { h, toast } from './ui.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderStudents } from './pages/students.js';
import { renderAttendance } from './pages/attendance.js';
import { renderHomework } from './pages/homework.js';
import { renderClasses } from './pages/classes.js';
import { renderUsers } from './pages/users.js';

const app = document.getElementById('app');
const state = { user: null, classes: [] };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
};

const TABS = [
  ['dashboard', 'Dashboard', renderDashboard],
  ['students', 'Học viên', renderStudents],
  ['attendance', 'Điểm danh', renderAttendance],
  ['homework', 'Bài tập', renderHomework],
];

function shell(content, activeTab, classId) {
  const select = h('select', {
    'aria-label': 'Chọn lớp',
    onchange: (e) => { location.hash = `#/c/${e.target.value}/${activeTab || 'dashboard'}`; },
  }, state.classes.length
    ? state.classes.map((c) => h('option', { value: c.id, selected: String(c.id) === String(classId) }, c.code))
    : h('option', {}, '(chưa có lớp)'));
  const admin = state.user.role === 'admin';
  return h('div', {},
    h('header', { class: 'topbar' },
      h('span', { class: 'brand' }, 'Quản lý lớp'),
      select,
      h('nav', { class: 'tabs' }, TABS.map(([key, label]) =>
        h('a', { href: `#/c/${classId}/${key}`, class: key === activeTab ? 'active' : '' }, label))),
      h('span', { class: 'spacer' }),
      admin && h('a', { class: 'nav-link', href: '#/classes' }, 'Lớp học'),
      admin && h('a', { class: 'nav-link', href: '#/users' }, 'Người dùng'),
      h('span', { class: 'muted small' }, state.user.name),
      h('button', { onclick: async () => { await post('/api/auth/logout'); state.user = null; route(); } }, 'Đăng xuất')),
    h('main', {}, content));
}

async function refreshClasses() {
  state.classes = await get('/api/classes');
}

async function route() {
  app.replaceChildren();
  if (!state.user) {
    try { state.user = await get('/api/auth/me'); } catch { /* chưa đăng nhập */ }
  }
  if (!state.user) {
    return renderLogin(app, async (user) => { state.user = user; location.hash = '#/'; route(); });
  }
  try {
    await refreshClasses();
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const ctx = { state, refreshClasses, navigate: (hash) => { location.hash = hash; } };

    if (parts[0] === 'classes' && state.user.role === 'admin') {
      return app.append(shell(await renderClasses(ctx), null, store.get('classId')));
    }
    if (parts[0] === 'users' && state.user.role === 'admin') {
      return app.append(shell(await renderUsers(ctx), null, store.get('classId')));
    }

    let classId = parts[0] === 'c' ? parts[1] : store.get('classId');
    if (!state.classes.some((c) => String(c.id) === String(classId))) classId = state.classes[0]?.id;
    if (!classId) {
      return app.append(shell(h('div', { class: 'empty-state' },
        state.user.role === 'admin'
          ? h('p', {}, 'Chưa có lớp nào. ', h('a', { href: '#/classes' }, 'Tạo lớp mới'), ' hoặc chạy "npm run import" để nhập từ Excel.')
          : h('p', {}, 'Bạn chưa được phân công lớp nào. Hãy liên hệ admin.')), null, null));
    }
    store.set('classId', String(classId));
    const tabKey = parts[0] === 'c' && TABS.some((t) => t[0] === parts[2]) ? parts[2] : 'dashboard';
    const cls = state.classes.find((c) => String(c.id) === String(classId));
    const render = TABS.find((t) => t[0] === tabKey)[2];
    app.append(shell(await render({ ...ctx, cls }), tabKey, classId));
  } catch (e) {
    if (e.status === 401) { state.user = null; return route(); }
    toast(e.message, true);
    app.append(h('main', {}, h('div', { class: 'empty-state' }, `Không tải được trang: ${e.message}`)));
  }
}

window.addEventListener('hashchange', route);
route();
