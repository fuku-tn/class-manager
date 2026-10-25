// Nhắc homework theo lớp (chuyển từ bộ kit "remind-homework-kit").
//  - Mọi tài khoản có quyền vào lớp (trừ khách): xem tiến độ TỪNG học viên (danh sách chữ, không có ảnh thẻ/tin nhắn).
//  - Admin + tài khoản được bật quyền: thẻ ảnh tiến độ, sao chép ảnh, tin nhắn nhắc bài, đổi Anh/Chị, chế độ chụp,
//    tổng quan lớp ẩn danh (gửi group), nạp bảng homework. Máy chủ chỉ trả tin nhắn cho tài khoản có quyền.
// Công thức (%, trung bình, gộp nhóm ẩn danh) do máy chủ tính; trang chỉ hiển thị.
import { get, put, post } from '../api.js';
import { h, toast, setChildren } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';
import { THEMES, themeOf, shortHw } from '../remind-themes.mjs';
import { drawCard, copyCanvasImage } from '../remind-card.js';

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export async function renderRemind({ cls, state }) {
  const base = `/api/classes/${cls.id}/remind`;
  let d = await get(base);
  const priv = d.privileged;
  let cur = 0;
  let view = 'student';           // 'student' | 'overview'
  let canvas = null;
  let ovData = null;
  const dead = () => !root.isConnected;

  // ---------------- dùng chung: chọn học viên
  const sel = h('select', { 'aria-label': 'Chọn học viên', class: 'remind-sel' });
  const prevBtn = h('button', { type: 'button', title: 'Học viên trước (←)' }, '←');
  const nextBtn = h('button', { type: 'button', title: 'Học viên sau (→)' }, '→');
  const warnEl = h('p', { class: 'muted small', role: 'status' });
  const studentList = () => d.students;
  const student = () => studentList()[cur];

  function fillSelect() {
    setChildren(sel, ...studentList().map((s, i) => h('option', { value: String(i) }, s.name)));
    if (cur >= studentList().length) cur = Math.max(0, studentList().length - 1);
    sel.value = String(cur);
  }
  function go(i) {
    const n = studentList().length;
    if (!n) return;
    cur = (i + n) % n;
    sel.value = String(cur);
    paintStudent();
  }
  sel.addEventListener('change', () => go(Number(sel.value)));
  prevBtn.addEventListener('click', () => go(cur - 1));
  nextBtn.addEventListener('click', () => go(cur + 1));

  // ---------------- tài khoản không có quyền: xem thẻ tiến độ từng học viên (không tin nhắn, không nút sao chép/chụp)
  const plainBox = h('div', { class: 'remind-plain' });
  function paintPlain() {
    const s = student();
    if (!s || d.no_homework) { cardImg.removeAttribute('src'); setChildren(plainBox, h('p', { class: 'empty-state' }, d.no_homework ? 'Lớp chưa có bài tập nào được thu.' : 'Lớp chưa có học viên đang học.')); return; }
    cardImg.src = drawCard({ name: s.name, d: s.d, done: s.done, total: s.total, pct: s.pct }, { hdr: d.hdr, theme: theme(), snapDate: d.snap_date, snapTime: d.snap_time }).toDataURL('image/png');
    setChildren(plainBox, cardImg);
  }

  // ---------------- tài khoản có quyền
  const cfg = () => d.config;
  const theme = () => themeOf(cfg()?.theme ?? d.theme);
  const snap = h('input', { class: 'remind-in', 'aria-label': 'Ngày cập nhật', placeholder: 'dd/mm/yyyy' });
  const snapTime = h('input', { class: 'remind-in', 'aria-label': 'Giờ cập nhật', placeholder: 'hh:mm', style: 'width:5.5rem' });
  const inCls = h('input', { class: 'remind-in', 'aria-label': 'Tên lớp trong tin nhắn' });
  const inScope = h('input', { class: 'remind-in', 'aria-label': 'Phạm vi bài đã học' });
  const inCall = h('input', { class: 'remind-in', 'aria-label': 'Tên gọi của học viên' });
  const inTitle = h('input', { class: 'remind-in wide', 'aria-label': 'Tiêu đề tổng quan' });
  const inMin = h('input', { class: 'remind-in', type: 'number', min: '1', max: '50', 'aria-label': 'Ngưỡng ẩn danh', style: 'width:5rem' });
  const themeSel = h('select', { 'aria-label': 'Theme màu' }, Object.entries(THEMES).map(([k, t]) => h('option', { value: k }, t.label)));
  const cardImg = h('img', { alt: 'Thẻ tiến độ homework', class: 'remind-card-img' });
  if (!priv) cardImg.addEventListener('contextmenu', (e) => e.preventDefault());
  else cardImg.title = 'Chuột phải → Copy image';
  const msgBox = h('div', { class: 'remind-msg', id: 'remind-note' });
  const prBtn = h('button', { type: 'button', title: 'Đổi Anh/Chị (lưu theo học viên)' }, 'Anh/Chị');
  const copyImgBtn = h('button', { type: 'button', class: 'primary' }, 'Sao chép ảnh');
  const copyMsgBtn = h('button', { type: 'button', class: 'primary' }, 'Sao chép tin nhắn');
  const capBtn = h('button', { type: 'button' }, 'Chế độ chụp');
  const savedEl = h('span', { class: 'muted small' });
  const ovBox = h('div', { class: 'remind-ov' });
  const ovNote = h('p', { class: 'muted small', role: 'status' });
  const studentPane = h('div', { class: 'remind-pane' });
  const ovPane = h('div', { class: 'remind-pane' });
  const t1 = h('button', { type: 'button', class: 'on' }, 'Từng học viên');
  const t2 = h('button', { type: 'button' }, 'Tổng quan lớp');

  function flash(btn, text, ok = true) {
    const old = btn.dataset.label ?? btn.textContent;
    btn.dataset.label = old;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, ok ? 1800 : 3500);
  }

  function paintStudent() {
    if (!priv) { paintPlain(); return; }
    const s = student();
    if (!s || d.no_homework) {
      cardImg.removeAttribute('src');
      msgBox.textContent = d.no_homework ? 'Lớp chưa có bài tập nào được thu — thêm bài ở tab Bài tập hoặc nạp bảng homework bên dưới.' : 'Lớp chưa có học viên đang học.';
      return;
    }
    canvas = drawCard({ name: s.name, d: s.d, done: s.done, total: s.total, pct: s.pct }, { hdr: d.hdr, theme: theme(), snapDate: snap.value.trim() || d.snap_date, snapTime: snapTime.value.trim() });
    cardImg.src = canvas.toDataURL('image/png');
    msgBox.textContent = s.message;
    prBtn.textContent = `Đang xưng: ${s.honorific} — đổi`;
    inCall.value = s.call_name ?? '';
    inCall.placeholder = s.call_name_default;
    if (cap.el) cap.paint();
  }

  async function reload() {
    d = await get(base);
    if (priv) { inCls.value = cfg().cls_label; inScope.value = cfg().scope; inTitle.value = cfg().overview_title; inMin.value = cfg().min_group; themeSel.value = cfg().theme; }
    fillSelect();
    warnEl.textContent = d.warnings.join(' · ');
  }

  const saveConfig = debounce(async () => {
    try {
      await put(`${base}/config`, { cls_label: inCls.value, scope: inScope.value, overview_title: inTitle.value, min_group: Number(inMin.value) || 1, theme: themeSel.value });
      await reload();
      paintStudent();
      if (view === 'overview') await loadOverview();
      savedEl.textContent = 'Đã lưu cấu hình lớp';
      setTimeout(() => { savedEl.textContent = ''; }, 1500);
    } catch (e) { toast(e.message, true); }
  }, 450);

  // ---------------- tổng quan lớp (không có tên)
  const KPI = (big, small) => h('div', { class: 'kpi' }, h('b', {}, big), h('span', {}, small));
  const ovBar = (label, n, N) => {
    const p = N ? Math.round((n / N) * 100) : 0;
    return h('div', { class: 'hr' }, h('div', { class: 'hl' }, label), h('div', { class: 'hb' }, h('u', { style: `width:${p}%` })),
      h('div', { class: 'hv' }, h('b', {}, `${n}/${N}`), ' ', h('span', {}, `${p}%`)));
  };
  function paintOverview() {
    const o = ovData;
    if (!o) return;
    const t = theme();
    const kp = o.T === 1
      ? [KPI(o.N, 'Học viên'), KPI(`${o.full}/${o.N}`, 'Đã hoàn thành'), KPI(o.N - o.full, 'Đang thực hiện')]
      : [KPI(o.N, 'Học viên'), KPI(`${o.full}/${o.N}`, `Hoàn thành đủ ${o.T}/${o.T} bài`), KPI(`${o.avg}%`, 'Tiến độ trung bình')];
    const card = h('section', { class: 'remind-ovcard' },
      h('div', { class: 'head' }, h('h1', {}, o.title)),
      h('div', { class: 'kpis' }, kp),
      h('div', { class: 'tbl' },
        h('h3', {}, 'Số học viên đã hoàn thành theo từng bài'), o.byCol.map((c) => ovBar(shortHw(c.label), c.n, o.N)),
        o.T > 1 ? h('h3', {}, 'Số học viên theo số bài đã hoàn thành') : null, o.T > 1 ? o.dist.map((b) => ovBar(b.label, b.n, o.N)) : null));
    const css = { '--hfrom': t.headerFrom, '--hto': t.headerTo, '--accent': t.accent, '--htext': t.headerText, '--ok': t.ok, '--dfill': t.donutFill, '--dtrack': t.donutTrack, '--ink': t.ink, '--mute': t.mute, '--line': t.line, '--bg': t.bg, '--surface': t.surface || '#fff' };
    for (const [k, v] of Object.entries(css)) card.style.setProperty(k, v);
    setChildren(ovBox, card);
    ovNote.textContent = o.mergedNote
      ? `Ngưỡng ẩn danh ${o.min_group}: các nhóm chưa đủ bài đã được gộp thành "Chưa đủ ${o.T}/${o.T} bài".`
      : '';
    if (o.smallRemainder) ovNote.textContent += ` Lưu ý: chỉ còn ${o.remaining} người chưa hoàn thành (ít hơn ngưỡng ${o.min_group}) — số "${o.full}/${o.N}" ngầm cho biết có người chưa xong; cân nhắc trước khi gửi group.`;
    if (cap.el && view === 'overview') cap.paint();
  }
  async function loadOverview() {
    try {
      const qs = new URLSearchParams({ min_group: String(Number(inMin.value) || 1), title: inTitle.value });
      ovData = await get(`${base}/overview?${qs}`);
      paintOverview();
    } catch (e) { toast(e.message, true); }
  }
  const refreshOverview = debounce(loadOverview, 350);

  function setView(next) {
    view = next;
    t1.classList.toggle('on', view === 'student');
    t2.classList.toggle('on', view === 'overview');
    studentPane.hidden = view !== 'student';
    ovPane.hidden = view !== 'overview';
    if (view === 'overview') loadOverview(); else paintStudent();
  }

  // ---------------- chế độ chụp: một thẻ/trang tổng quan toàn màn hình, không thanh công cụ, không tin nhắn
  const cap = {
    el: null,
    open() {
      const prevB = h('button', { type: 'button', title: '←', class: view === 'student' ? '' : 'hide' }, '←');
      const nextB = h('button', { type: 'button', title: '→', class: view === 'student' ? '' : 'hide' }, '→');
      const exit = h('button', { type: 'button' }, 'Thoát chế độ chụp (Esc)');
      prevB.addEventListener('click', () => go(cur - 1));
      nextB.addEventListener('click', () => go(cur + 1));
      exit.addEventListener('click', () => cap.close());
      cap.stage = h('div', { class: 'remind-cap-stage' });
      cap.el = h('div', { class: 'remind-cap', role: 'dialog', 'aria-label': 'Chế độ chụp' }, cap.stage, h('div', { class: 'remind-capbar' }, prevB, exit, nextB));
      cap.el.style.setProperty('--capbg', theme().bg);
      document.body.append(cap.el);
      cap.paint();
    },
    paint() {
      if (!cap.el) return;
      if (view === 'student') {
        if (!canvas) return;
        const im = h('img', { alt: 'Thẻ tiến độ homework', class: 'remind-card-img' });
        im.src = canvas.toDataURL('image/png');
        setChildren(cap.stage, im);
      } else {
        const card = ovBox.firstElementChild;
        if (card) setChildren(cap.stage, card.cloneNode(true));
      }
    },
    close() { cap.el?.remove(); cap.el = null; },
  };

  // ---------------- nạp bảng homework dán từ Excel
  const importArea = h('textarea', { rows: 6, placeholder: 'Dán bảng từ Excel/Google Sheets: dòng đầu = FULL NAME, HOMEWORK 1, HOMEWORK 2, … (X = đã hoàn thành)', class: 'remind-import' });
  const importOut = h('div', { class: 'remind-import-out' });
  async function runImport(dry) {
    if (!importArea.value.trim()) { toast('Hãy dán bảng trước', true); return; }
    try {
      const r = await post(`${base}/import${dry ? '?dry_run=1' : ''}`, { table: importArea.value });
      setChildren(importOut,
        h('p', {}, h('b', {}, dry ? 'Kết quả kiểm tra (chưa ghi gì)' : 'Đã nạp bảng homework'),
          ` — ghép được ${r.matched} học viên · cột: ${r.columns.join(', ')} · ${dry ? 'sẽ ghi' : 'đã ghi'} ${r.cells_set} ô`,
          r.created_assignments ? ` · tạo ${r.created_assignments} bài mới` : '', r.already_done ? ` · ${r.already_done} ô đã hoàn thành sẵn` : '',
          r.kept_manual ? ` · giữ nguyên ${r.kept_manual} ô đã sửa tay` : ''),
        r.unmatched.length ? h('p', { class: 'muted small' }, `Không khớp học viên nào: ${r.unmatched.join('; ')}`) : null,
        r.ambiguous.length ? h('p', { class: 'muted small' }, `Trùng tên, chưa ghép: ${r.ambiguous.join('; ')}`) : null,
        r.warnings.length ? h('p', { class: 'muted small' }, r.warnings.join(' · ')) : null);
      if (!dry) { await reload(); paintStudent(); if (view === 'overview') await loadOverview(); toast('Đã nạp bảng homework'); }
    } catch (e) { toast(e.message, true); }
  }

  // ---------------- nối sự kiện (chỉ tài khoản có quyền)
  if (priv) {
    snap.value = d.snap_date;
    snapTime.value = d.snap_time ?? '';
    snap.addEventListener('input', paintStudent);
    snapTime.addEventListener('input', paintStudent);
    inCls.addEventListener('input', saveConfig);
    inScope.addEventListener('input', saveConfig);
    inTitle.addEventListener('input', () => { saveConfig(); refreshOverview(); });
    inMin.addEventListener('input', () => { saveConfig(); refreshOverview(); });
    themeSel.addEventListener('change', saveConfig);
    inCall.addEventListener('change', async () => {
      const s = student();
      if (!s) return;
      try { await put(`${base}/students/${s.enrollment_id}`, { call_name: inCall.value }); await reload(); paintStudent(); } catch (e) { toast(e.message, true); }
    });
    prBtn.addEventListener('click', async () => {
      const s = student();
      if (!s) return;
      try { await put(`${base}/students/${s.enrollment_id}`, { honorific: s.honorific === 'Anh' ? 'Chị' : 'Anh' }); await reload(); paintStudent(); } catch (e) { toast(e.message, true); }
    });
    copyImgBtn.addEventListener('click', async () => {
      if (!canvas) return;
      const ok = await copyCanvasImage(canvas);
      flash(copyImgBtn, ok ? 'Đã sao chép ảnh ✓' : 'Chưa copy được: chuột phải vào ảnh → Copy image', ok);
    });
    copyMsgBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(msgBox.textContent); flash(copyMsgBtn, 'Đã sao chép ✓'); } catch { flash(copyMsgBtn, 'Không sao chép được — bôi đen rồi Ctrl+C', false); }
    });
    capBtn.addEventListener('click', () => cap.open());
    t1.addEventListener('click', () => setView('student'));
    t2.addEventListener('click', () => setView('overview'));
  }
  const onKey = (e) => {
    if (dead()) { window.removeEventListener('keydown', onKey); cap.close(); return; }
    if (e.key === 'Escape') { cap.close(); return; }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || (priv && view === 'overview')) return;
    if (e.key === 'ArrowLeft') go(cur - 1);
    else if (e.key === 'ArrowRight') go(cur + 1);
  };
  window.addEventListener('keydown', onKey);

  // ---------------- dựng trang
  fillSelect();
  warnEl.textContent = d.warnings.join(' · ');

  const root = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Nhắc bài'), h('span', { class: 'muted', title: cls.code }, classDisplayName(cls))));

  if (!priv) {
    root.append(
      h('div', { class: 'toolbar' }, sel, prevBtn, nextBtn), warnEl, plainBox);
    paintPlain();
    return root;
  }

  inCls.value = cfg().cls_label; inScope.value = cfg().scope; inTitle.value = cfg().overview_title; inMin.value = cfg().min_group; themeSel.value = cfg().theme;
  const field = (label, el, cls2 = '') => h('label', { class: `remind-fld ${cls2}` }, label, el);

  studentPane.append(
    h('div', { class: 'toolbar' }, sel, prevBtn, nextBtn, copyImgBtn, copyMsgBtn, prBtn, capBtn),
    h('div', { class: 'toolbar' }, field('Lớp', inCls), field('Phạm vi', inScope), field('Ngày cập nhật', snap), field('Lúc', snapTime), field('Tên gọi', inCall), field('Màu', themeSel), savedEl),
    warnEl,
    h('div', { class: 'remind-grid' },
      h('div', { class: 'remind-cardwrap' }, cardImg),
      h('div', { class: 'remind-msgbox' }, h('div', { class: 'ml' }, 'Tin nhắn gửi riêng (không nằm trong ảnh)'), msgBox,
        h('p', { class: 'muted small' }, 'Kiểm tra trước khi gửi: đúng tên người nhận, đúng Anh/Chị, ngày cập nhật. Giới tính là suy đoán nên rà lại xưng hô và tên gọi của lớp mới.'))));

  ovPane.append(
    h('div', { class: 'toolbar' }, field('Tiêu đề', inTitle, 'grow'), field('Ngưỡng ẩn danh', inMin), h('button', { type: 'button', onclick: () => cap.open() }, 'Chế độ chụp')),
    ovNote, ovBox);
  ovPane.hidden = true;

  root.append(
    h('div', { class: 'tabs remind-tabs' }, t1, t2),
    studentPane, ovPane,
    h('details', { class: 'card' }, h('summary', {}, 'Nạp bảng homework từ Excel (dán)'),
      h('p', { class: 'muted small' }, 'Dùng khi lớp chưa có bài tập trong hệ thống (vd PBM, SCA). Ghép theo họ tên (không phân biệt dấu). Chỉ ghi "đã hoàn thành"; không đè ô đã sửa tay.'),
      importArea,
      h('div', { class: 'toolbar' }, h('button', { type: 'button', onclick: () => runImport(true) }, 'Kiểm tra (chưa ghi)'), h('button', { type: 'button', class: 'primary', onclick: () => runImport(false) }, 'Áp dụng')),
      importOut));
  paintStudent();
  return root;
}
