import { get, post } from './api.js';
import { h, toast, logo, icon, BRAND, formModal, tooltips } from './ui.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderStudents } from './pages/students.js';
import { renderAttendance } from './pages/attendance.js';
import { renderHomework } from './pages/homework.js';
import { renderGraduation } from './pages/graduation.js';
import { renderRemind } from './pages/remind.js';
import { renderPotential } from './pages/potential.js';
import { renderSchedule } from './pages/schedule.js';
import { renderClasses } from './pages/classes.js';
import { renderUsers } from './pages/users.js';
import { renderImport } from './pages/import.js';
import { renderFeedback } from './pages/feedback.js';
import { renderHome } from './pages/home.js';
import { createClassPicker } from './class-picker.js';

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
  ['graduation', 'Tốt nghiệp', renderGraduation],
  ['remind', 'Nhắc bài', renderRemind],
  ['potential', 'Potential', renderPotential],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';

// ---------- Khung cố định (dựng một lần, chỉ cập nhật phần thay đổi) ----------
let shell = null; // { root, view, select, navLinks, adminLinks, progress }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  store.set('theme', theme);
}

function buildShell() {
  const admin = state.user.role === 'admin';
  // Bộ chọn lớp có tìm kiếm + lọc (thay cho dropdown liệt kê toàn bộ lớp)
  const picker = createClassPicker({
    getClasses: () => state.classes,
    getCurrentId: () => store.get('classId'),
    storage: store,
    onSelect: (c) => { location.hash = `#/c/${c.id}/${shell.active && TABS.some((t) => t[0] === shell.active) ? shell.active : 'dashboard'}`; },
  });
  const homeLink = h('a', { class: 'nav-link', 'data-key': 'home', href: '#/' }, icon('home'), h('span', {}, 'Trang chủ'));
  const scheduleLink = h('a', { class: 'nav-link', 'data-key': 'schedule', href: '#/schedule', title: 'Lịch khai giảng, bế giảng, giảng dạy' }, icon('calendar'), h('span', {}, 'Lịch'));
  // Khách không dùng phần nhắc bài (máy chủ cũng chặn)
  const navLinks = TABS.filter(([key]) => !((key === 'remind' && state.user.role === 'guest') || (key === 'potential' && !(state.user.role === 'admin' || state.user.can_view_potential === true)))).map(([key, label]) => h('a', { class: 'nav-link', 'data-key': key }, icon(key), h('span', {}, label)));
  const adminLinks = admin ? [
    h('a', { class: 'nav-link', 'data-key': 'classes', href: '#/classes', title: 'Quản lý lớp học' }, icon('classes'), h('span', {}, 'Lớp học')),
    h('a', { class: 'nav-link', 'data-key': 'users', href: '#/users', title: 'Quản lý người dùng' }, icon('users'), h('span', {}, 'Người dùng')),
    h('a', { class: 'nav-link', 'data-key': 'import', href: '#/import', title: 'Nhập dữ liệu từ Excel' }, icon('import'), h('span', {}, 'Nhập Excel')),
    h('a', { class: 'nav-link', 'data-key': 'feedback', href: '#/feedback', title: 'Khảo sát sau khóa' }, icon('feedback'), h('span', {}, 'Khảo sát')),
  ] : [];
  const themeBtn = h('button', { class: 'icon-btn', title: 'Đổi giao diện sáng/tối', 'aria-label': 'Đổi giao diện sáng/tối' });
  const paintTheme = () => themeBtn.replaceChildren(icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun'));
  themeBtn.addEventListener('click', () => { applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); paintTheme(); route(); }); // vẽ lại để biểu đồ lấy màu mới
  paintTheme();

  const view = h('div', { class: 'view' });
  const progress = h('div', { class: 'progress' });
  const root = h('div', {},
    progress,
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, logo(44), h('div', { class: 'brand-text' },
        h('span', { class: 'brand-name' }, BRAND.name), h('span', { class: 'brand-tag' }, BRAND.tagline))),
      h('nav', { class: 'top-nav', 'aria-label': 'Điều hướng' }, homeLink, scheduleLink, navLinks),
      h('div', { class: 'top-right' },
        picker.el,
        h('nav', { class: 'admin-links', 'aria-label': 'Quản trị' }, adminLinks),
        themeBtn,
        h('div', { class: 'chip-user', title: admin ? 'Quản trị viên' : 'Giảng viên' },
          h('div', { class: 'avatar' }, initials(state.user.name)),
          h('span', { class: 'chip-user-name' }, state.user.name),
          state.user.role === 'guest' ? null : h('button', { class: 'icon-btn', title: 'Đổi mật khẩu', 'aria-label': 'Đổi mật khẩu', onclick: changePassword }, icon('key')),
          h('button', { class: 'icon-btn', title: 'Đăng xuất', 'aria-label': 'Đăng xuất',
            onclick: async () => { await post('/api/auth/logout'); state.user = null; shell = null; route(); } }, icon('logout'))))),
    h('main', { class: 'content' }, view));
  tooltips(root.querySelector('.topbar'));
  shell = { root, view, picker, homeLink, scheduleLink, navLinks, adminLinks, progress, active: null };
}

// Tự đổi mật khẩu (các phiên khác của tài khoản này bị đăng xuất).
async function changePassword() {
  const v = await formModal({ title: 'Đổi mật khẩu', submitLabel: 'Đổi mật khẩu', fields: [
    { name: 'current', label: 'Mật khẩu hiện tại', type: 'password', required: true },
    { name: 'next', label: 'Mật khẩu mới (≥ 10 ký tự, không chứa email)', type: 'password', required: true },
    { name: 'again', label: 'Nhập lại mật khẩu mới', type: 'password', required: true },
  ] });
  if (!v) return;
  if (v.next !== v.again) { toast('Hai lần nhập mật khẩu mới không giống nhau', true); return; }
  try { await post('/api/auth/password', { current: v.current, next: v.next }); toast('Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.'); }
  catch (e) { toast(e.message, true); }
}

// Cập nhật thanh điều hướng/chọn lớp mà không dựng lại.
function updateShell(active, classId) {
  shell.active = active;
  shell.homeLink.classList.toggle('active', active === 'home');
  shell.scheduleLink.classList.toggle('active', active === 'schedule');
  for (const a of shell.navLinks) {
    a.href = classId ? `#/c/${classId}/${a.dataset.key}` : '#/';
    a.classList.toggle('active', a.dataset.key === active);
  }
  for (const a of shell.adminLinks) a.classList.toggle('active', a.dataset.key === active);
  shell.picker.update();
}

// ---------- Chuyển trang mượt: mờ dần nội dung cũ → tải → hiện nội dung mới ----------
let navToken = 0;
async function transitionTo(renderFn) {
  const token = ++navToken;
  const { view, progress } = shell;
  const motion = !reducedMotion();
  const first = !view.hasChildNodes();
  if (motion && !first) view.classList.add('leaving');

  // Thanh tiến trình chỉ hiện nếu tải lâu hơn 180ms (tránh nhấp nháy khi mạng nhanh).
  const timer = setTimeout(() => { progress.classList.remove('done'); void progress.offsetWidth; progress.classList.add('on'); }, 180);
  let node;
  try {
    [node] = await Promise.all([renderFn(), motion && !first ? sleep(140) : null]);
  } catch (e) {
    if (e.status === 401) { clearTimeout(timer); return 'unauth'; }
    toast(e.message, true);
    node = h('div', { class: 'empty-state' }, `Không tải được trang: ${e.message}`);
  }
  clearTimeout(timer);
  if (token !== navToken) return; // đã có lần điều hướng mới hơn
  if (progress.classList.contains('on')) { progress.classList.remove('on'); progress.classList.add('done'); }

  view.replaceChildren(node);
  view.classList.remove('leaving', 'entering');
  void view.offsetWidth; // khởi động lại animation
  if (motion) view.classList.add('entering');
  window.scrollTo({ top: 0 });
}

async function route() {
  if (!state.user) {
    try { state.user = await get('/api/auth/me'); } catch { /* chưa đăng nhập */ }
  }
  if (!state.user) {
    shell = null;
    app.replaceChildren();
    return renderLogin(app, async (user) => { state.user = user; location.hash = '#/'; route(); });
  }
  if (!shell || !app.contains(shell.root)) { app.replaceChildren(); buildShell(); app.append(shell.root); }

  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const admin = state.user.role === 'admin';
  const ctx = {
    state, navigate: (hash) => { location.hash = hash; },
    refreshClasses: async () => { state.classes = await get('/api/classes'); updateShell(shell.active, store.get('classId')); },
  };
  try {
    // Danh sách lớp chỉ tải lại khi cần (lần đầu, trang quản trị) để chuyển tab nhanh.
    if (!state.classes.length || parts[0] === 'classes' || parts[0] === 'users') state.classes = await get('/api/classes');
  } catch (e) {
    if (e.status === 401) { state.user = null; return route(); }
    toast(e.message, true);
  }

  let result;
  let fitNow = false;
  if (parts.length === 0 || parts[0] === 'home') {
    updateShell('home', store.get('classId'));
    result = await transitionTo(() => renderHome(ctx));
  } else if (parts[0] === 'schedule') {
    updateShell('schedule', store.get('classId'));
    result = await transitionTo(() => renderSchedule(ctx));
  } else if (parts[0] === 'classes' && admin) {
    updateShell('classes', store.get('classId'));
    result = await transitionTo(() => renderClasses(ctx));
  } else if (parts[0] === 'feedback' && admin) {
    updateShell('feedback', store.get('classId'));
    result = await transitionTo(() => renderFeedback(ctx));
  } else if (parts[0] === 'import' && admin) {
    updateShell('import', store.get('classId'));
    result = await transitionTo(() => renderImport(ctx));
  } else if (parts[0] === 'users' && admin) {
    updateShell('users', store.get('classId'));
    result = await transitionTo(() => renderUsers(ctx));
  } else {
    let classId = parts[0] === 'c' ? parts[1] : store.get('classId');
    if (!state.classes.some((c) => String(c.id) === String(classId))) classId = state.classes[0]?.id;
    if (!classId) {
      updateShell(null, null);
      result = await transitionTo(async () => h('div', { class: 'empty-state' },
        admin
          ? h('p', {}, 'Chưa có lớp nào. ', h('a', { href: '#/classes' }, 'Tạo lớp mới'), ' hoặc chạy "npm run import" để nhập từ Excel.')
          : h('p', {}, 'Bạn chưa được phân công lớp nào. Hãy liên hệ admin.')));
    } else {
      store.set('classId', String(classId));
      const tabKey = parts[0] === 'c' && TABS.some((t) => t[0] === parts[2]) ? parts[2] : 'dashboard';
      const cls = state.classes.find((c) => String(c.id) === String(classId));
      const render = TABS.find((t) => t[0] === tabKey)[2];
      updateShell(tabKey, classId);
      fitNow = FIT_TABS.has(tabKey);
      // Lớp chưa diễn ra được xem nhờ quyền "xem lớp chưa diễn ra": giao diện chỉ xem (ẩn nút ghi) như tài khoản khách
      const viewCtx = cls?.view_only ? { ...ctx, state: { ...ctx.state, user: { ...ctx.state.user, role: 'guest' } } } : ctx;
      result = await transitionTo(() => render({ ...viewCtx, cls }));
    }
  }
  if (result === 'unauth') { state.user = null; shell = null; route(); }
  shell?.view.classList.toggle('fit', fitNow);
  requestAnimationFrame(fitView);
}

// Trang danh sách: khung trang cao đúng phần màn hình còn lại (không cuộn trang), bảng cuộn bên trong và
// chỉ cao tối đa bằng tiêu đề + 10 hàng. Trang khác: bảng ngoài thẻ cao vừa khít màn hình như trước.
const FIT_TABS = new Set(['attendance', 'students', 'homework', 'graduation']);
const ROWS_VISIBLE = 10;
function fitView() {
  const v = shell?.view;
  if (!v) return;
  // Thanh trên tràn ngang (màn 16:10, cỡ chữ lớn…) → chỉ hiện biểu tượng, không để trang cuộn ngang
  const bar = shell.root?.querySelector('.topbar');
  if (bar) {
    bar.classList.remove('compact');
    if (window.innerWidth > 900 && (bar.scrollWidth > bar.clientWidth + 1 || document.documentElement.scrollWidth > window.innerWidth + 1)) bar.classList.add('compact');
  }
  const fit = v.classList.contains('fit');
  v.style.height = '';
  if (fit) v.style.height = `${Math.max(320, Math.floor(window.innerHeight - (v.getBoundingClientRect().top + window.scrollY)))}px`;
  for (const el of v.querySelectorAll('.table-wrap')) {
    if (el.closest('.card')) continue;
    if (fit) {
      const head = el.querySelector('thead')?.getBoundingClientRect().height ?? 0;
      const row = el.querySelector('tbody tr')?.getBoundingClientRect().height ?? 0;
      el.style.maxHeight = row ? `${Math.ceil(head + row * ROWS_VISIBLE + 2)}px` : '';
    } else {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.maxHeight = `${Math.max(240, Math.floor(window.innerHeight - top - 12))}px`;
      if (el.parentElement?.lastElementChild === el) {
        const extra = document.documentElement.scrollHeight - window.innerHeight;
        if (extra > 0) el.style.maxHeight = `${Math.max(240, el.getBoundingClientRect().height - extra)}px`;
      }
    }
  }
}
window.addEventListener('resize', () => requestAnimationFrame(fitView));

window.addEventListener('hashchange', route);
route();
