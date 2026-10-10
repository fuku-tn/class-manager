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
export function logo(size = 36) {
  return svg('svg', { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true' },
    svg('defs', {}, svg('linearGradient', { id: 'logo-g', x1: 0, y1: 0, x2: 1, y2: 1 },
      svg('stop', { offset: '0', 'stop-color': '#e3c48e' }), svg('stop', { offset: '1', 'stop-color': '#b48d52' }))),
    svg('rect', { width: 32, height: 32, rx: 9, fill: 'url(#logo-g)' }),
    svg('rect', { x: 7, y: 17, width: 4, height: 8, rx: 1.2, fill: '#1b1408' }),
    svg('rect', { x: 14, y: 12, width: 4, height: 13, rx: 1.2, fill: '#1b1408' }),
    svg('rect', { x: 21, y: 7, width: 4, height: 18, rx: 1.2, fill: '#1b1408' }));
}

const ICONS = {
  dashboard: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }]],
  students: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
  attendance: [['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ['path', { d: 'M16 2v4M8 2v4M3 10h18' }], ['path', { d: 'm9 16 2 2 4-4' }]],
  homework: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 2v6h6M16 13H8M16 17H8' }]],
  classes: [['path', { d: 'm12 2 10 5-10 5L2 7z' }], ['path', { d: 'm2 17 10 5 10-5M2 12l10 5 10-5' }]],
  users: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]],
  arrow: [['path', { d: 'M5 12h14M12 5l7 7-7 7' }]],
  home: [['path', { d: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }]],
  chevron: [['path', { d: 'm6 9 6 6 6-6' }]],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm21 21-4.3-4.3' }]],
  play: [['path', { d: 'M8 5v14l11-7z' }]],
  alert: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }], ['path', { d: 'M12 9v4M12 17h.01' }]],
  sun: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' }]],
  moon: [['path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }]],
  logout: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['path', { d: 'm16 17 5-5-5-5M21 12H9' }]],
};

export function icon(name) {
  return svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    ...(ICONS[name] || []).map(([tag, attrs]) => svg(tag, attrs)));
}
