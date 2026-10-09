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
