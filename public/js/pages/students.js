import { get, post, put, del } from '../api.js';
import { h, toast, pct, formModal, downloadCsv, COURSE_STATUS_LABEL, COURSE_STATUS_BADGE } from '../ui.js';
import { classDisplayName } from '../class-filter.mjs';

const MODE_OPTIONS = [['', '(chưa rõ)'], ['Online', 'Online'], ['Offline', 'Offline'], ['Hybrid', 'Hybrid']];
const STATUS_OPTIONS = Object.entries(COURSE_STATUS_LABEL);

const EVENT_LABEL = {
  enrolled: 'Được thêm vào lớp', status_changed: 'Đổi trạng thái', removed: 'Gỡ khỏi lớp',
  missing_from_sheet: 'Không còn thấy trong Google Sheet', reappeared: 'Xuất hiện lại trong Google Sheet', graduation: 'Kết quả tốt nghiệp',
};
const GRAD_LABEL = { pending: 'Chưa xét', passed: 'Tốt nghiệp', failed: 'Chưa đạt' };
const statusLabel = (v) => COURSE_STATUS_LABEL[v] ?? GRAD_LABEL[v] ?? '—';
const SOURCE_LABEL = { web: 'Web', sync: 'Google Sheet', import: 'Nhập Excel' };
const fmtWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
};

export async function renderStudents({ cls, state }) {
  const readOnly = state.user.role === 'guest'; // khách chỉ xem
  const base = `/api/classes/${cls.id}`;
  let rows = await get(`${base}/students`);
  // Hồ sơ đăng ký (FORM): chỉ admin; lỗi/không có thì bỏ qua.
  const profiles = state.user.role === 'admin' ? await get(`${base}/profiles`).catch(() => null) : null;
  const search = h('input', { type: 'search', placeholder: 'Tìm theo tên, mã, email…', 'aria-label': 'Tìm học viên' });
  const status = h('select', { 'aria-label': 'Lọc trạng thái' }, h('option', { value: '' }, 'Mọi trạng thái'), STATUS_OPTIONS.map(([v, l]) => h('option', { value: v }, l)));
  const mode = h('select', { 'aria-label': 'Lọc hình thức' }, h('option', { value: '' }, 'Mọi hình thức'), MODE_OPTIONS.slice(1).map(([v, l]) => h('option', { value: v }, l)));
  const body = h('tbody');
  const count = h('span', { class: 'muted' });

  const filtered = () => {
    const q = search.value.trim().toLowerCase();
    return rows.filter((r) =>
      (!q || [r.full_name, r.student_code, r.email, r.phone].some((x) => String(x ?? '').toLowerCase().includes(q))) &&
      (!status.value || r.course_status === status.value) && (!mode.value || r.mode === mode.value));
  };

  const PROFILE_FIELDS = [['department', 'Phòng ban'], ['job_title', 'Vị trí'], ['hr_function', 'HR Function'], ['experience', 'Kinh nghiệm'],
    ['industry', 'Lĩnh vực'], ['province', 'Tỉnh/TP'], ['delivery', 'Hình thức học'], ['material_delivery', 'Nhận giáo trình'],
    ['sources', 'Nguồn biết đến'], ['goals', 'Mục tiêu tham gia']];
  function profileBlock(r) {
    const p = profiles?.items?.[r.id];
    if (!profiles) return null;
    if (!p) return h('p', { class: 'muted small' }, 'Chưa có phiếu đăng ký (FORM) khớp với học viên này.');
    const show = (v) => (Array.isArray(v) ? v.join(' · ') : v);
    return h('div', { class: 'profile' },
      h('div', { class: 'eyebrow' }, `Hồ sơ đăng ký (FORM)${p.submitted_at ? ` · ${fmtWhen(p.submitted_at)}` : ''}`),
      h('dl', {}, PROFILE_FIELDS.filter(([k]) => (Array.isArray(p[k]) ? p[k].length : p[k])).flatMap(([k, label]) =>
        [h('dt', {}, label), h('dd', {}, show(p[k]))])));
  }

  async function reload() { rows = await get(`${base}/students`); paint(); if (historyBox.open) await refreshHistory(); }

  // Lịch sử thay đổi ghi danh của lớp (nạp khi mở, làm mới sau mỗi thay đổi).
  const historyBody = h('div', { class: 'muted' }, 'Đang tải…');
  const historyBox = h('details', { class: 'card history' }, h('summary', {}, 'Lịch sử thay đổi của lớp'), historyBody);
  async function refreshHistory() {
    try {
      const ev = await get(`${base}/events`);
      historyBody.replaceChildren(ev.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Thời điểm', 'Học viên', 'Sự kiện', 'Từ → Sang', 'Nguồn', 'Người thực hiện', 'Ghi chú'].map((x) => h('th', {}, x)))),
          h('tbody', {}, ev.map((x) => h('tr', {},
            h('td', {}, fmtWhen(x.created_at)),
            h('td', {}, `${x.full_name ?? ''} `, h('span', { class: 'muted small' }, x.student_code ?? '')),
            h('td', {}, EVENT_LABEL[x.event] ?? x.event),
            h('td', {}, x.from_status || x.to_status ? `${statusLabel(x.from_status)} → ${statusLabel(x.to_status)}` : '—'),
            h('td', {}, SOURCE_LABEL[x.source] ?? x.source),
            h('td', {}, x.actor_name || '—'),
            h('td', {}, x.note || ''))))))
        : h('p', { class: 'muted' }, 'Chưa có thay đổi nào được ghi lại.'));
    } catch (e) { historyBody.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }
  historyBox.addEventListener('toggle', () => { if (historyBox.open) refreshHistory(); });

  async function edit(r) {
    const v = await formModal({ title: r.full_name, fields: [
      { name: 'full_name', label: 'Họ tên', value: r.full_name, required: true, full: true },
      { name: 'email', label: 'Email', type: 'email', value: r.email },
      { name: 'phone', label: 'Số điện thoại', value: r.phone },
      { name: 'mode', label: 'Hình thức', type: 'select', options: MODE_OPTIONS, value: r.mode ?? '' },
      { name: 'course_status', label: 'Trạng thái khóa học', type: 'select', options: STATUS_OPTIONS, value: r.course_status },
      { name: 'certificate_status', label: 'Chứng chỉ', value: r.certificate_status },
      { name: 'note', label: 'Ghi chú', type: 'textarea', value: r.note, full: true }],
    // Chỉ admin thấy nút này (máy chủ cũng chặn tài khoản khác). Bắt buộc có lý do; việc gỡ được ghi vào Lịch sử thay đổi.
    extra: state.user.role === 'admin' && h('div', {}, profileBlock(r), h('button', { type: 'button', class: 'danger', onclick: async () => {
      const why = await formModal({
        title: `Gỡ ${r.full_name} khỏi lớp ${classDisplayName(cls)}`, submitLabel: 'Gỡ khỏi lớp',
        fields: [{ name: 'reason', label: 'Lý do gỡ khỏi lớp (bắt buộc)', type: 'textarea', required: true, full: true }],
        extra: h('p', { class: 'muted small' }, 'Toàn bộ điểm danh và bài tập của học viên này trong lớp sẽ bị xóa. Nếu học viên chỉ nghỉ học, hãy đổi "Trạng thái khóa học" sang Nghỉ học thay vì gỡ để giữ dữ liệu.'),
      });
      if (!why) return;
      try {
        await del(`${base}/students/${r.id}`, { reason: why.reason.trim() });
        document.querySelectorAll('.modal-back').forEach((m) => m.remove());
        await reload(); await refreshHistory();
        toast('Đã gỡ khỏi lớp');
      } catch (e) { toast(e.message, true); }
    } }, 'Gỡ khỏi lớp')) });
    if (!v) return;
    try {
      await put(`${base}/students/${r.id}`, {
        full_name: v.full_name, email: v.email, phone: v.phone, mode: v.mode, course_status: v.course_status,
        certificate_status: v.certificate_status, note: v.note,
      });
      await reload(); toast('Đã lưu');
    } catch (e) { toast(e.message, true); }
  }

  async function add() {
    const v = await formModal({ title: 'Thêm học viên', fields: [
      { name: 'student_code', label: 'Mã học viên (vd P.13027)', required: true },
      { name: 'full_name', label: 'Họ tên', required: true },
      { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Số điện thoại' },
      { name: 'mode', label: 'Hình thức', type: 'select', options: MODE_OPTIONS, value: '' }] });
    if (!v) return;
    try { await post(`${base}/students`, v); await reload(); toast('Đã thêm'); } catch (e) { toast(e.message, true); }
  }

  function paint() {
    const list = filtered();
    count.textContent = `${list.length}/${rows.length} học viên`;
    body.replaceChildren(...list.map((r) => h('tr', readOnly ? { class: r.course_status === 'active' ? '' : 'inactive' } : { class: `clickable${r.course_status === 'active' ? '' : ' inactive'}`, tabindex: 0,
      onclick: () => edit(r), onkeydown: (e) => { if (e.key === 'Enter') edit(r); } },
      h('td', {}, r.student_code),
      h('td', {}, r.full_name, r.segment === 'b2b' ? h('div', { class: 'muted small' }, ['B2B', r.company_name || r.customer_id].filter(Boolean).join(' · ')) : null),
      h('td', {}, r.email || '—'), h('td', {}, r.phone || '—'),
      h('td', {}, r.mode || '—'),
      h('td', {}, h('span', { class: `badge ${COURSE_STATUS_BADGE[r.course_status] || ''}` }, COURSE_STATUS_LABEL[r.course_status]),
        r.missing_from_sheet ? h('span', { class: 'badge warn', title: 'Không còn thấy trong Google Sheet — hãy kiểm tra: học viên đã nghỉ, hay Sheet bị xóa nhầm?' }, 'Không còn trong Sheet') : null),
      h('td', { class: 'num' }, pct(r.attendance_rate)), h('td', { class: 'num' }, pct(r.hw_rate)))));
    if (!list.length) body.append(h('tr', {}, h('td', { colspan: 8, class: 'empty-state' }, rows.length ? 'Không có học viên khớp bộ lọc.' : (readOnly ? 'Chưa có học viên.' : 'Chưa có học viên. Bấm "Thêm học viên".'))));
  }

  [search, status, mode].forEach((el) => el.addEventListener('input', paint));
  paint();
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Học viên'), h('span', { class: 'muted', title: cls.code }, classDisplayName(cls)), h('span', { class: 'spacer' }),
      h('button', { onclick: () => downloadCsv(`${cls.code}-hoc-vien.csv`, [
        ['Mã', 'Họ tên', 'Email', 'SĐT', 'Hình thức', 'Trạng thái', 'Điểm danh', 'HW'],
        ...filtered().map((r) => [r.student_code, r.full_name, r.email, r.phone, r.mode, COURSE_STATUS_LABEL[r.course_status], pct(r.attendance_rate), pct(r.hw_rate)])]) }, 'Xuất CSV'),
      !readOnly && h('button', { class: 'primary', onclick: add }, '+ Thêm học viên')),
    h('div', { class: 'toolbar' }, search, status, mode, count),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Mã', 'Họ tên', 'Email', 'SĐT', 'Hình thức', 'Trạng thái', 'Điểm danh', 'HW'].map((x) => h('th', {}, x)))),
      body)),
    historyBox);
}
