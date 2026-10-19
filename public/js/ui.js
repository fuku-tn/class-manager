// Helper dựng DOM an toàn (không dùng innerHTML với dữ liệu người dùng).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Thay toàn bộ con của `el`, bỏ qua null/undefined/false (replaceChildren thô sẽ in ra chữ "null"/"false").
export function setChildren(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((c) => c != null && c !== false));
}

export function toast(message, bad = false) {
  const t = h('div', { class: `toast${bad ? ' bad' : ''}` }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), bad ? 5000 : 2500);
}

export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export const MODE_LABEL = { Online: 'Online', Offline: 'Offline', Hybrid: 'Hybrid' };
export const COURSE_STATUS_LABEL = { active: 'Đang học', deferred: 'Bảo lưu', dropped: 'Nghỉ học', completed: 'Hoàn thành' };
export const COURSE_STATUS_BADGE = { active: 'ok', deferred: 'warn', dropped: 'bad', completed: 'ok' };

// Modal với form; fields: [{name,label,type,options,value,required}]. Trả về Promise<values|null>.
export function formModal({ title, fields, submitLabel = 'Lưu', extra }) {
  return new Promise((resolve) => {
    const err = h('div', { class: 'error', role: 'alert' });
    const inputs = {};
    const rows = fields.map((f) => {
      let input;
      if (f.type === 'select') {
        input = h('select', { id: `f-${f.name}` }, f.options.map(([val, label]) => h('option', { value: val }, label)));
        input.value = f.value ?? '';
      } else if (f.type === 'textarea') {
        input = h('textarea', { id: `f-${f.name}`, rows: 3 });
        input.value = f.value ?? '';
      } else if (f.type === 'checkbox') {
        input = h('input', { id: `f-${f.name}`, type: 'checkbox' });
        input.checked = !!f.value;
      } else {
        input = h('input', { id: `f-${f.name}`, type: f.type || 'text', required: f.required, autocomplete: 'off' });
        input.value = f.value ?? '';
      }
      inputs[f.name] = input;
      return h('div', { class: 'form-row', style: f.full ? 'grid-column:1/-1' : null }, h('label', { for: `f-${f.name}` }, f.label), input);
    });
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const out = {};
        for (const f of fields) out[f.name] = f.type === 'checkbox' ? inputs[f.name].checked : inputs[f.name].value;
        for (const f of fields) if (f.required && !String(out[f.name]).trim()) { err.textContent = `Cần nhập: ${f.label}`; return; }
        close(out);
      },
    },
      h('h2', {}, title),
      h('div', { class: 'form-2' }, rows),
      extra,
      err,
      h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: () => close(null) }, 'Hủy'),
        h('button', { type: 'submit', class: 'primary' }, submitLabel)));
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, form));
    document.addEventListener('keydown', onKey);
    document.body.append(back);
    (Object.values(inputs)[0] || form).focus();
  });
}

export function confirmModal(message, okLabel = 'Xóa') {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'modal-back' },
      h('div', { class: 'modal', role: 'alertdialog' },
        h('p', {}, message),
        h('div', { class: 'actions' },
          h('button', { onclick: () => close(false) }, 'Hủy'),
          h('button', { class: 'danger', onclick: () => close(true) }, okLabel))));
    document.body.append(back);
  });
}

export function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: filename });
  document.body.append(a); a.click(); a.remove();
}

// ---------- Thương hiệu & biểu tượng (SVG dựng bằng DOM, không innerHTML) ----------
export const BRAND = { name: 'Starttrain', tagline: 'The Next Analyst' };

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

// Logo: khối vuông bo góc + 3 cột tăng dần (người phân tích đi lên).
// Logo Starttrain Education (ảnh). Nền kem để chữ xanh đậm của logo đọc được cả ở giao diện tối.
export function logo(size = 36) {
  const src = size > 64 ? '/assets/logo-512.png' : '/assets/logo-128.png';
  return h('img', { class: 'logo-img', src, width: size, height: size, alt: 'Starttrain Education', style: `width:${size}px;height:${size}px` });
}

const ICONS = {
  dashboard: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }]],
  students: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
  attendance: [['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ['path', { d: 'M16 2v4M8 2v4M3 10h18' }], ['path', { d: 'm9 16 2 2 4-4' }]],
  calendar: [['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ['path', { d: 'M16 2v4M8 2v4M3 10h18' }], ['path', { d: 'M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 18h.01M12 18h.01', 'stroke-width': 2.8 }]],
  makeup: [['path', { d: 'M17 2l4 4-4 4' }], ['path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }], ['path', { d: 'M7 22l-4-4 4-4' }], ['path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }]],
  homework: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 2v6h6M16 13H8M16 17H8' }]],
  feedback: [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }], ['path', { d: 'M8 9h8M8 13h5' }]],
  key: [['circle', { cx: 7.5, cy: 15.5, r: 4.5 }], ['path', { d: 'm10.7 12.3 9.8-9.8M16 7l3 3M13.5 9.5l2 2' }]],
  potential: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M19 8v6M22 11h-6' }]],
  remind: [['path', { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9' }], ['path', { d: 'M13.7 21a2 2 0 0 1-3.4 0' }]],
  graduation: [['path', { d: 'm2 9 10-5 10 5-10 5z' }], ['path', { d: 'M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5' }], ['path', { d: 'M22 9v6' }]],
  classes: [['path', { d: 'm12 2 10 5-10 5L2 7z' }], ['path', { d: 'm2 17 10 5 10-5M2 12l10 5 10-5' }]],
  users: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]],
  arrow: [['path', { d: 'M5 12h14M12 5l7 7-7 7' }]],
  import: [['path', { d: 'M12 3v12M7 10l5 5 5-5' }], ['path', { d: 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2' }]],
  home: [['path', { d: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }]],
  chevron: [['path', { d: 'm6 9 6 6 6-6' }]],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm21 21-4.3-4.3' }]],
  play: [['path', { d: 'M8 5v14l11-7z' }]],
  alert: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }], ['path', { d: 'M12 9v4M12 17h.01' }]],
  sun: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' }]],
  moon: [['path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }]],
  logout: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['path', { d: 'm16 17 5-5-5-5M21 12H9' }]],
};

// Chú thích nổi khi rê chuột/focus (thay cho title mặc định nền trắng của trình duyệt).
// Áp cho .nav-link / .icon-btn / [data-tip] trong `container`: tên mục (chữ trong <span>, hoặc title) + mô tả (title) nếu khác.
// Nếu tên mục đang hiện sẵn trên màn hình và không có mô tả thì không hiện chú thích.
let tipEl = null;
export function tooltips(container) {
  if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip', hidden: true }); document.body.append(tipEl); }
  for (const el of container.querySelectorAll('.nav-link, .icon-btn, [data-tip]')) {
    const label = el.querySelector(':scope > span')?.textContent || el.dataset.tip || el.getAttribute('title') || '';
    const desc = el.getAttribute('title');
    el.dataset.tipLabel = label;
    if (desc && desc !== label) el.dataset.tipDesc = desc;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', desc || label);
    el.removeAttribute('title');
  }
  const show = (el) => {
    const span = el.querySelector(':scope > span');
    const labelShown = span && span.offsetWidth > 0;
    const { tipLabel: label, tipDesc: desc } = el.dataset;
    if (!label || (labelShown && !desc)) return hide();
    tipEl.replaceChildren(...[labelShown ? null : h('b', {}, label), desc ? h('span', {}, desc) : null].filter(Boolean));
    tipEl.hidden = false; tipEl.classList.remove('on');
    const r = el.getBoundingClientRect(); const w = tipEl.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    tipEl.style.left = `${left}px`; tipEl.style.top = `${r.bottom + 10}px`;
    tipEl.style.setProperty('--arrow', `${r.left + r.width / 2 - left}px`);
    requestAnimationFrame(() => tipEl.classList.add('on'));
  };
  const hide = () => { tipEl.hidden = true; tipEl.classList.remove('on'); };
  const target = (e) => e.target.closest?.('[data-tip-label]');
  container.addEventListener('mouseover', (e) => { const el = target(e); if (el && !el.contains(e.relatedTarget)) show(el); });
  container.addEventListener('mouseout', (e) => { const el = target(e); if (el && !el.contains(e.relatedTarget)) hide(); });
  container.addEventListener('focusin', (e) => { const el = target(e); if (el) show(el); });
  container.addEventListener('focusout', hide);
  container.addEventListener('click', hide);
  addEventListener('scroll', hide, { passive: true });
}

export function icon(name) {
  return svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    ...(ICONS[name] || []).map(([tag, attrs]) => svg(tag, attrs)));
}
