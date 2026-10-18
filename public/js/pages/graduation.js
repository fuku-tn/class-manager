// Danh sách tốt nghiệp của lớp: gợi ý tự động theo quy tắc giáo trình, quyết định do người đặt, công bố (admin).
// Công thức tỉ lệ nằm ở máy chủ (stats.js); trang chỉ hiển thị và so sánh kết quả máy chủ trả về.
import { get, put, post, del } from '../api.js';
import { h, toast, pct, formModal, confirmModal, downloadCsv, setChildren } from '../ui.js';
import { classDisplayName, fmtDate, TIMING_LABEL, norm } from '../class-filter.mjs';

const DECISION = { pending: 'Chưa xét', passed: 'Tốt nghiệp', failed: 'Chưa đạt' };
const DECISION_BADGE = { pending: '', passed: 'ok', failed: 'bad' };
const CAPSTONE = { submitted: 'Đã nộp', resubmit: 'Nộp lại', missing: 'Thiếu' };
// Xét tự động (BIE-8, BIE-12, BIH-20, BIH-11): kết quả tính từ số buổi + bài đã làm, không đặt tay
const AUTO_RESULT = { passed: 'Tốt nghiệp', failed: 'Chưa đạt', in_progress: 'Đang học', no_data: 'Chưa đủ dữ liệu', pending: 'Chưa xét' };
const AUTO_BADGE = { passed: 'ok', failed: 'bad', in_progress: 'warn', no_data: '', pending: '' };

const fmtWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
};
const ruleText = (r) => [
  r.min_sessions != null ? `Có mặt ≥ ${r.min_sessions} buổi (vắng có phép không bị trừ)` : `Chuyên cần ≥ ${Math.round(r.attendance_min * 100)}%`,
  r.hw_min != null ? `Hoàn thành ≥ ${r.hw_min}/${r.hw_pool ?? 'tất cả'} bài HW` : null,
  r.capstone ? 'Nộp Capstone' : null,
].filter(Boolean).join(' · ');

export async function renderGraduation({ cls, state }) {
  const base = `/api/classes/${cls.id}`;
  const role = state.user.role;
  const admin = role === 'admin';
  const readOnly = role === 'guest';
  let d = await get(`${base}/graduation`);
  const locked = () => !!d.class.published_at && !admin;     // sau khi công bố chỉ admin được sửa
  const canEdit = () => !readOnly && !locked();

  const search = h('input', { type: 'search', placeholder: 'Tìm học viên…', 'aria-label': 'Tìm học viên' });
  const body = h('tbody');
  const summaryEl = h('div', { class: 'chips' });
  const bannerEl = h('div');
  const rulesEl = h('p', { class: 'muted' });
  const headEl = h('thead');
  const isAuto = () => !!d.rules.auto;
  // Ô tìm kiếm nằm cố định (không dựng lại khi gõ) để không mất con trỏ sau mỗi ký tự; chỉ các nút được vẽ lại.
  const buttonsEl = h('span', { class: 'contents' });
  const actionsEl = h('div', { class: 'toolbar' }, search, buttonsEl);

  async function reload() { d = await get(`${base}/graduation`); paint(); }

  async function decide(r, status) {
    try {
      await put(`${base}/graduation/${r.enrollment_id}`, { status });
      await reload();
    } catch (e) { toast(e.message, true); await reload(); }
  }

  async function editDetails(r) {
    const v = await formModal({ title: `${r.full_name} — thông tin tốt nghiệp`, fields: [
      { name: 'note', label: 'Ghi chú', type: 'textarea', value: r.decision.note, full: true },
      { name: 'certificate_status', label: 'Trạng thái chứng chỉ (vd Printed, Sent)', value: r.certificate.status },
      { name: 'certificate_number', label: 'Số chứng chỉ', value: r.certificate.number },
      { name: 'certificate_sent_date', label: 'Ngày gửi chứng chỉ', type: 'date', value: r.certificate.sent_date }] });
    if (!v) return;
    try {
      await put(`${base}/graduation/${r.enrollment_id}`, { note: v.note, certificate_status: v.certificate_status,
        certificate_number: v.certificate_number, certificate_sent_date: v.certificate_sent_date || null });
      await reload(); toast('Đã lưu');
    } catch (e) { toast(e.message, true); }
  }

  async function editRules() {
    const r = d.rules;
    const v = await formModal({ title: `Quy tắc tốt nghiệp — ${r.curriculum_code ?? 'giáo trình của lớp'}`, submitLabel: 'Lưu quy tắc', fields: [
      { name: 'attendance_min', label: r.min_sessions != null ? `Chuyên cần tối thiểu (%) — không dùng, đã có quy định ${r.min_sessions} buổi` : 'Chuyên cần tối thiểu (%)', type: 'number', value: Math.round(r.attendance_min * 100), required: true },
      { name: 'hw_pool', label: 'Xét N bài HW đầu tiên (để trống = tất cả)', type: 'number', value: r.hw_pool ?? '' },
      { name: 'hw_min', label: 'Số bài HW tối thiểu phải hoàn thành (để trống = không yêu cầu)', type: 'number', value: r.hw_min ?? '' },
      { name: 'capstone', label: 'Bắt buộc nộp Capstone', type: 'checkbox', value: r.capstone }],
    extra: h('p', { class: 'muted small' }, 'Quy tắc áp dụng cho mọi lớp dùng cùng giáo trình này. Đây chỉ là gợi ý; kết quả cuối do người đặt.') });
    if (!v) return;
    try {
      await put(`${base}/graduation-rules`, { attendance_min: Number(v.attendance_min) / 100, hw_pool: v.hw_pool === '' ? null : Number(v.hw_pool),
        hw_min: v.hw_min === '' ? null : Number(v.hw_min), capstone: v.capstone });
      await reload(); toast('Đã lưu quy tắc');
    } catch (e) { toast(e.message, true); }
  }

  async function applySuggestions() {
    const n = d.rows.filter((r) => r.decision.status === 'pending' && r.suggestion.eligible !== null).length;
    if (!n) { toast('Không có học viên nào chưa xét và đủ dữ liệu để gợi ý'); return; }
    if (!await confirmModal(`Áp dụng gợi ý cho ${n} học viên chưa xét? Quyết định đã đặt sẽ được giữ nguyên.`, 'Áp dụng')) return;
    try { const r = await post(`${base}/graduation-apply`); await reload(); toast(`Đã áp dụng cho ${r.applied} học viên`); }
    catch (e) { toast(e.message, true); }
  }

  async function publish(on) {
    const pending = d.summary.pending;
    const msg = on
      ? isAuto()
        ? `Công bố danh sách tốt nghiệp của lớp ${classDisplayName(cls)}? Kết quả tự động hiện tại (${d.summary.passed} tốt nghiệp, ${d.summary.failed} chưa đạt${d.summary.in_progress ? `, ${d.summary.in_progress} đang học` : ''}) sẽ được chốt; sau đó tick bài/điểm danh không làm đổi kết quả nữa.`
        : `Công bố danh sách tốt nghiệp của lớp ${classDisplayName(cls)}?${pending ? ` Còn ${pending} học viên chưa xét.` : ''} Sau khi công bố, giảng viên không sửa được nữa.`
      : 'Hủy công bố để chỉnh sửa lại danh sách?';
    if (!await confirmModal(msg, on ? 'Công bố' : 'Hủy công bố')) return;
    try { await (on ? post(`${base}/graduation-publish`) : del(`${base}/graduation-publish`)); await reload(); toast(on ? 'Đã công bố danh sách' : 'Đã hủy công bố'); }
    catch (e) { toast(e.message, true); }
  }

  function exportCsv() {
    if (isAuto()) {
      downloadCsv(`${cls.code}-tot-nghiep.csv`, [
        ['Mã', 'Họ tên', 'Số buổi có mặt', 'Tối thiểu', 'Bài đã làm', 'Còn thiếu', 'Dưới điểm đạt', 'Kết quả', 'Ghi chú', 'Chứng chỉ', 'Số chứng chỉ', 'Ngày gửi'],
        ...d.rows.map((r) => [r.student_code, r.full_name, r.sessions_present, r.sessions_min, `${r.hw_done}/${r.hw_pool}`, r.missing.join(', '), r.low.join(', '),
          AUTO_RESULT[r.result], r.decision.note ?? '', r.certificate.status ?? '', r.certificate.number ?? '', r.certificate.sent_date ?? '']),
      ]);
      return;
    }
    downloadCsv(`${cls.code}-tot-nghiep.csv`, [
      ['Mã', 'Họ tên', 'Chuyên cần', 'HW hoàn thành', 'Capstone', 'Gợi ý', 'Kết quả', 'Ghi chú', 'Chứng chỉ', 'Số chứng chỉ', 'Ngày gửi'],
      ...d.rows.map((r) => [r.student_code, r.full_name, pct(r.attendance_rate), `${r.hw_done}/${r.hw_pool}`, CAPSTONE[r.capstone_status] ?? '',
        r.suggestion.eligible === null ? 'Chưa đủ dữ liệu' : r.suggestion.eligible ? 'Đạt' : `Chưa đạt: ${r.suggestion.reasons.join('; ')}`,
        DECISION[r.decision.status], r.decision.note ?? '', r.certificate.status ?? '', r.certificate.number ?? '', r.certificate.sent_date ?? '']),
    ]);
  }

  function paint() {
    const c = d.class;
    const s = d.summary;
    const st = d.rules.status;
    rulesEl.textContent = isAuto()
      ? `Xét tự động: có mặt ≥ ${d.rules.min_sessions} buổi (vắng có phép không bị trừ; theo ${d.rules.min_sessions_source}) + làm đủ TẤT CẢ bài đã giao (HW1–HW5, Mini Project, Capstone Project): có điểm thì phải ≥ ${d.rules.pass_score} điểm, chưa có điểm thì cần tick "Đã nộp". Kết quả tự cập nhật khi tick bài/điểm danh thay đổi${c.published_at ? '; danh sách đã công bố nên kết quả đang được chốt.' : '; khi admin công bố, kết quả được chốt.'}`
      : st === 'none'
      ? `Chưa có quy định tốt nghiệp cho ${d.rules.source === 'default' ? 'lớp này (chưa gắn giáo trình)' : 'giáo trình này'} — chưa có gợi ý, bạn đặt kết quả thủ công.`
      : `Điều kiện gợi ý: ${ruleText(d.rules)}${d.rules.min_sessions != null ? ` — số buổi theo ${d.rules.min_sessions_source}` : ''}${
        st === 'partial' ? '; bài tập/điểm chưa có quy định nên chưa xét' : st === 'provisional' ? '; phần bài tập tạm theo công thức Excel cũ, chờ xác nhận chính thức' : ''}`;
    setChildren(headEl, h('tr', {}, (isAuto()
      ? ['Học viên', 'Số buổi có mặt', 'Bài đã làm', 'Kết quả', 'Chứng chỉ / ghi chú', '']
      : ['Học viên', 'Chuyên cần', 'HW', 'Capstone', 'Gợi ý', 'Kết quả', 'Chứng chỉ / ghi chú', '']).map((x) => h('th', {}, x))));
    if (isAuto()) setChildren(summaryEl,
      h('span', { class: 'badge ok' }, `Tốt nghiệp ${s.passed}`),
      h('span', { class: 'badge bad' }, `Chưa đạt ${s.failed}`),
      s.in_progress ? h('span', { class: 'badge warn' }, `Đang học ${s.in_progress}`) : null,
      s.no_data ? h('span', { class: 'badge' }, `Chưa đủ dữ liệu ${s.no_data}`) : null,
      s.pending ? h('span', { class: 'badge' }, `Chưa xét ${s.pending}`) : null);
    else setChildren(summaryEl,
      h('span', { class: 'badge ok' }, `Tốt nghiệp ${s.passed}`),
      h('span', { class: 'badge bad' }, `Chưa đạt ${s.failed}`),
      h('span', { class: 'badge' }, `Chưa xét ${s.pending}`),
      d.rules.status === 'none' ? null
        : h('span', { class: 'muted small' }, `Gợi ý: ${s.suggested_pass} đạt · ${s.suggested_fail} chưa đạt${s.no_data ? ` · ${s.no_data} chưa đủ dữ liệu` : ''}`));
    setChildren(bannerEl,
      c.published_at ? h('div', { class: 'card', role: 'status' },
        h('b', {}, `Danh sách đã công bố lúc ${fmtWhen(c.published_at)}`), c.published_by ? ` bởi ${c.published_by}` : '',
        locked() || readOnly ? '' : ' — admin có thể sửa hoặc hủy công bố.') : null);
    setChildren(buttonsEl,
      !readOnly && !isAuto() && d.rules.status !== 'none' && h('button', { type: 'button', disabled: !canEdit(), onclick: applySuggestions, title: 'Chỉ đặt cho học viên chưa xét' }, 'Áp dụng gợi ý'),
      h('button', { type: 'button', onclick: exportCsv }, 'Xuất CSV'),
      admin && d.class.has_curriculum && !isAuto() && h('button', { type: 'button', onclick: editRules }, d.rules.status === 'none' ? 'Thiết lập quy tắc' : 'Sửa quy tắc'),
      admin && (c.published_at
        ? h('button', { type: 'button', class: 'danger', onclick: () => publish(false) }, 'Hủy công bố')
        : h('button', { type: 'button', class: 'primary', onclick: () => publish(true) }, 'Công bố danh sách')));
    paintRows();
  }

  // Chỉ vẽ lại bảng (dùng khi gõ tìm kiếm).
  function paintRows() {
    const q = norm(search.value).trim(); // không phân biệt hoa/thường và dấu tiếng Việt
    const list = d.rows.filter((r) => !q || norm(r.full_name).includes(q) || norm(r.student_code).includes(q));
    body.replaceChildren(...list.map((r) => {
      if (isAuto()) return autoRow(r);
      const sg = r.suggestion;
      const sel = h('select', { class: 'grad-sel', 'aria-label': `Kết quả của ${r.full_name}`, disabled: !canEdit() },
        Object.entries(DECISION).map(([k, label]) => h('option', { value: k }, label)));
      sel.value = r.decision.status;
      sel.addEventListener('change', () => decide(r, sel.value));
      return h('tr', {},
        h('td', {}, r.full_name, h('div', { class: 'muted small' }, [r.student_code, r.segment === 'b2b' ? ['B2B', r.company_name].filter(Boolean).join(' ') : null].filter(Boolean).join(' · '))),
        h('td', { class: 'num' }, pct(r.attendance_rate)),
        h('td', { class: 'num' }, r.hw_pool ? `${r.hw_done}/${r.hw_pool}` : '—'),
        h('td', {}, d.rules.capstone || r.capstone_status ? (CAPSTONE[r.capstone_status] ?? '—') : '—'),
        h('td', {}, sg.eligible === null
          ? h('span', { class: 'muted small' }, d.rules.status === 'none' ? '—' : 'Chưa đủ dữ liệu')
          : h('span', { class: `badge ${sg.eligible ? 'ok' : 'bad'}`, title: sg.reasons.join(' · ') }, sg.eligible ? 'Đạt' : 'Chưa đạt'),
        sg.eligible === false && sg.reasons.length ? h('div', { class: 'muted small' }, sg.reasons.join(' · ')) : null),
        h('td', {}, sel, r.decision.by ? h('div', { class: 'muted small' }, `${r.decision.by}${r.decision.at ? ` · ${fmtWhen(r.decision.at)}` : ''}`) : null),
        h('td', {}, r.certificate.status || r.certificate.number
          ? h('span', { class: 'small' }, [r.certificate.status, r.certificate.number].filter(Boolean).join(' · ')) : h('span', { class: 'muted small' }, '—'),
        r.decision.note ? h('div', { class: 'muted small', title: r.decision.note }, `“${r.decision.note.slice(0, 40)}${r.decision.note.length > 40 ? '…' : ''}”`) : null),
        h('td', {}, canEdit() ? h('button', { class: 'small', type: 'button', title: 'Ghi chú và thông tin chứng chỉ', onclick: () => editDetails(r) }, '✎') : null));
    }));
    if (!list.length) body.append(h('tr', {}, h('td', { colspan: 7, class: 'empty-state' }, d.rows.length ? 'Không có học viên khớp tìm kiếm.' : 'Lớp chưa có học viên đang học.')));
  }

  // Một dòng ở chế độ xét tự động: số buổi, bài đã làm (kèm bài còn thiếu), kết quả + lý do
  function autoRow(r) {
    const okSess = r.sessions_present >= r.sessions_min;
    return h('tr', {},
      h('td', {}, r.full_name, h('div', { class: 'muted small' }, [r.student_code, r.segment === 'b2b' ? ['B2B', r.company_name].filter(Boolean).join(' ') : null].filter(Boolean).join(' · '))),
      h('td', { class: 'num' }, h('b', { class: okSess ? '' : 'text-bad' }, `${r.sessions_present}/${r.sessions_min}`), h('div', { class: 'muted small' }, `chuyên cần ${pct(r.attendance_rate)}`)),
      h('td', { class: 'num' }, h('b', { class: r.missing.length || r.low.length ? 'text-bad' : '' }, r.hw_pool ? `${r.hw_done}/${r.hw_pool}` : '—'),
        r.missing.length ? h('div', { class: 'muted small' }, `Thiếu ${r.missing.join(', ')}`) : null,
        r.low.length ? h('div', { class: 'muted small' }, `Dưới ${d.rules.pass_score} điểm: ${r.low.join(', ')}`) : null),
      h('td', {}, h('span', { class: `badge ${AUTO_BADGE[r.result] ?? ''}`, title: r.auto.reasons.join(' · ') }, AUTO_RESULT[r.result] ?? r.result),
        r.result !== 'passed' && r.auto.reasons.length ? h('div', { class: 'muted small' }, r.auto.reasons.join(' · ')) : null),
      h('td', {}, r.certificate.status || r.certificate.number
        ? h('span', { class: 'small' }, [r.certificate.status, r.certificate.number].filter(Boolean).join(' · ')) : h('span', { class: 'muted small' }, '—'),
      r.decision.note ? h('div', { class: 'muted small', title: r.decision.note }, `“${r.decision.note.slice(0, 40)}${r.decision.note.length > 40 ? '…' : ''}”`) : null),
      h('td', {}, canEdit() ? h('button', { class: 'small', type: 'button', title: 'Ghi chú và thông tin chứng chỉ', onclick: () => editDetails(r) }, '✎') : null));
  }

  search.addEventListener('input', paintRows);
  paint();

  const c0 = d.class;
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Tốt nghiệp'), h('span', { class: 'muted', title: cls.code }, classDisplayName(cls)),
      h('span', { class: `badge ${{ running: 'ok', grading: 'warn', graduation: 'warn' }[c0.timing] ?? ''}` }, TIMING_LABEL[c0.timing] ?? '')),
    c0.last_session_date ? h('p', { class: 'muted small' },
      c0.grading_until === c0.last_session_date
        ? `Buổi cuối ${fmtDate(c0.last_session_date)} · Lớp B2B kết thúc trong ngày buổi cuối`
        : `Buổi cuối ${fmtDate(c0.last_session_date)} · Nộp & chấm bài đến ${fmtDate(c0.grading_until)} · Công bố tốt nghiệp ${fmtDate(c0.graduation_on)}`) : null,
    bannerEl, rulesEl, summaryEl, actionsEl,
    h('div', { class: 'table-wrap' }, h('table', {}, headEl, body)));
}
