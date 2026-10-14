// Nhập dữ liệu từ Excel (chỉ admin): chọn file → Chạy thử (không ghi) → Nhập thật.
// Server chỉ đọc các cột trong danh sách cho phép (không có tiền/voucher); file không được lưu lại.
import { upload, get } from '../api.js';
import { h, toast } from '../ui.js';

const MAX_BYTES = 4 * 1024 * 1024;
const fmt = (n) => Number(n ?? 0).toLocaleString('vi-VN');

function kv(label, value) {
  return h('div', { class: 'kv' }, h('span', { class: 'muted' }, label), h('b', {}, value));
}

function warningsBlock(list) {
  if (!list?.length) return null;
  const shown = list.slice(0, 40);
  return h('details', {}, h('summary', {}, `${fmt(list.length)} cảnh báo`),
    h('ul', { class: 'small' }, shown.map((w) => h('li', {}, w)),
      list.length > shown.length ? h('li', { class: 'muted' }, `… và ${fmt(list.length - shown.length)} cảnh báo nữa`) : null));
}

function attendanceResult(r) {
  const tot = r.classes.reduce((a, c) => {
    for (const k of ['students', 'new_students', 'present', 'late', 'excused', 'absent', 'submissions']) a[k] += c[k] ?? 0;
    return a;
  }, { students: 0, new_students: 0, present: 0, late: 0, excused: 0, absent: 0, submissions: 0 });
  return h('div', {},
    h('div', { class: 'kv-grid' },
      kv('Lớp', fmt(r.classes.length)), kv('Học viên', fmt(tot.students)), kv('Học viên mới', fmt(tot.new_students)),
      kv('Có mặt/trễ', fmt(tot.present + tot.late)), kv('Có phép', fmt(tot.excused)), kv('Vắng', fmt(tot.absent)), kv('Ô bài tập', fmt(tot.submissions))),
    r.skipped_sheets?.length ? h('p', { class: 'muted small' }, `Bỏ qua sheet: ${r.skipped_sheets.join(', ')}`) : null,
    warningsBlock(r.warnings),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Sheet', 'Lớp', 'Học viên', 'Mới', 'Buổi đã học', 'Có mặt/trễ', 'Có phép', 'Vắng', 'Giữ bản sửa trên app'].map((x) => h('th', {}, x)))),
      h('tbody', {}, r.classes.slice(0, 60).map((c) => h('tr', {},
        h('td', {}, c.sheet), h('td', {}, c.class_code), h('td', { class: 'num' }, fmt(c.students)), h('td', { class: 'num' }, fmt(c.new_students)),
        h('td', { class: 'num' }, fmt(c.sessions_held)), h('td', { class: 'num' }, fmt(c.present + c.late)), h('td', { class: 'num' }, fmt(c.excused)),
        h('td', { class: 'num' }, fmt(c.absent)), h('td', { class: 'num' }, fmt(c.kept_from_app))))))),
    r.classes.length > 60 ? h('p', { class: 'muted small' }, `Hiển thị 60/${fmt(r.classes.length)} lớp.`) : null);
}

function transactionsResult(r) {
  const added = r.added ?? {};
  const unknown = Object.entries(r.skipped_unknown_course ?? {});
  const an = r.anomalies;
  return h('div', {},
    h('div', { class: 'kv-grid' },
      kv('Lớp trong file', fmt(r.classes)), kv('Học viên', fmt(r.students)), kv('Ghi danh', fmt(r.enrollments)),
      kv('Lớp mới', fmt(added.classes)), kv('Học viên mới', fmt(added.students)), kv('Ghi danh mới', fmt(added.enrollments)), kv('Buổi mới', fmt(added.sessions))),
    r.classes_without_template ? h('p', { class: 'muted small' }, `${fmt(r.classes_without_template)} lớp chưa có giáo trình (chạy "npm run import-tx" kèm file session-management.xlsx để nạp giáo trình mới).`) : null,
    r.skipped_no_course ? h('p', { class: 'muted small' }, `${fmt(r.skipped_no_course)} dòng bỏ qua vì thiếu khóa học.`) : null,
    r.skipped_no_student_id ? h('p', { class: 'muted small' }, `${fmt(r.skipped_no_student_id)} dòng bỏ qua vì chưa có mã học viên.`) : null,
    r.skipped_invalid_student_id ? h('p', { class: 'muted small' }, `${fmt(r.skipped_invalid_student_id)} dòng bỏ qua vì mã học viên không đúng dạng (ví dụ ${(r.invalid_student_id_samples ?? []).join(', ')}).`) : null,
    unknown.length ? h('p', { class: 'muted small' }, `Khóa học không có trong sheet Course (bỏ qua): ${unknown.slice(0, 8).map(([k, v]) => `${k} (${v})`).join(', ')}${unknown.length > 8 ? '…' : ''}`) : null,
    an && (an.emails_with_many_ids || an.ids_with_many_emails || an.phones_with_many_ids)
      ? h('p', { class: 'muted small' }, `Dữ liệu trùng lặp cần rà: ${fmt(an.emails_with_many_ids)} email nhiều mã · ${fmt(an.ids_with_many_emails)} mã nhiều email · ${fmt(an.phones_with_many_ids)} SĐT nhiều mã`) : null);
}

function importCard({ title, intro, endpoint, render, onDone }) {
  const input = h('input', { type: 'file', accept: '.xlsx', 'aria-label': `Chọn file Excel: ${title}` });
  const out = h('div', { class: 'import-out' });
  const dryBtn = h('button', { type: 'button' }, 'Chạy thử');
  const goBtn = h('button', { type: 'button', class: 'primary', disabled: true }, 'Nhập thật');
  let checked = null; // chữ ký file đã chạy thử thành công
  const sig = (f) => `${f.name}|${f.size}|${f.lastModified}`;

  async function run(dry) {
    const f = input.files?.[0];
    if (!f) { toast('Hãy chọn file .xlsx trước', true); return; }
    if (f.size > MAX_BYTES) { toast('File lớn hơn 4MB: hãy dùng lệnh "npm run import" trên máy', true); return; }
    dryBtn.disabled = true; goBtn.disabled = true;
    out.replaceChildren(h('p', { class: 'muted' }, dry ? 'Đang chạy thử…' : 'Đang nhập…'));
    try {
      const r = await upload(`${endpoint}${dry ? '?dry_run=1' : ''}`, f);
      out.replaceChildren(
        h('p', {}, dry ? h('b', {}, 'Kết quả chạy thử — chưa ghi gì vào database.')
          : h('b', { class: 'accent' }, `Đã nhập xong${r.published ? ` · ${fmt(r.published)} lớp được báo cập nhật` : ''}.`)),
        render(r));
      if (dry) { checked = sig(f); } else { checked = null; toast('Đã nhập xong'); await onDone?.(); }
    } catch (e) {
      out.replaceChildren(h('p', { class: 'error', role: 'alert' }, e.message));
      toast(e.message, true);
      checked = null;
    } finally {
      dryBtn.disabled = false;
      goBtn.disabled = checked == null || !input.files?.[0] || sig(input.files[0]) !== checked;
    }
  }
  input.addEventListener('change', () => { checked = null; goBtn.disabled = true; out.replaceChildren(); });
  dryBtn.addEventListener('click', () => run(true));
  goBtn.addEventListener('click', () => run(false));

  return h('section', { class: 'card' },
    h('h2', {}, title), h('p', { class: 'muted' }, intro),
    h('div', { class: 'toolbar' }, input, dryBtn, goBtn), out);
}

// Thẻ trạng thái đồng bộ tự động từ Google Sheet (Apps Script đẩy sang; xem Documents/3-ky-thuat/google-sheet-sync.md).
const STALE_MS = 2 * 60 * 60 * 1000; // script gửi ít nhất mỗi giờ một lần: quá 2 giờ im lặng là có vấn đề
function syncCard(s) {
  const last = s.runs[0];
  const fmtT = (iso) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  let line;
  let cls = 'muted';
  if (!s.enabled) line = 'Chưa bật: máy chủ chưa có biến SYNC_TOKEN. Xem hướng dẫn trong Documents/3-ky-thuat/google-sheet-sync.md.';
  else if (!last) line = 'Chưa nhận dữ liệu nào từ Google Sheet. Hãy chạy hàm setup trong Apps Script (xem Documents/3-ky-thuat/google-sheet-sync.md).';
  else if (!last.ok) { line = `Lần gần nhất (${fmtT(last.created_at)}) bị lỗi: ${last.error ?? 'không rõ'}`; cls = 'error'; }
  else if (Date.now() - new Date(last.created_at).getTime() > STALE_MS) {
    line = `Lần nhận gần nhất: ${fmtT(last.created_at)} — đã lâu không có dữ liệu, hãy kiểm tra trigger trong Apps Script.`; cls = 'error';
  } else {
    const a = last.summary?.added ?? {};
    line = `Lần nhận gần nhất: ${fmtT(last.created_at)} · thêm ${fmt(a.students)} học viên, ${fmt(a.enrollments)} ghi danh, ${fmt(a.classes)} lớp.`;
  }
  const missingNote = s.missing > 0
    ? h('p', { class: 'muted', role: 'status' }, `⚠ ${fmt(s.missing)} học viên đang học nhưng không còn thấy trong Google Sheet — mở trang Học viên của lớp (có nhãn "Không còn trong Sheet") để kiểm tra.`)
    : null;
  const fp = s.form_pending;
  const formNote = fp && fp.count > 0
    ? h('p', { class: 'muted', role: 'status' }, `📝 ${fmt(fp.count)} phiếu đăng ký (FORM) chưa khớp học viên nào (chưa có trong PERSONAL/COMPANY hoặc email trùng nhiều người): ${fp.by_class.slice(0, 8).map((x) => `${x.short_code ?? '?'} (${x.n})`).join(', ')}${fp.by_class.length > 8 ? '…' : ''}.`)
    : null;
  return h('section', { class: 'card' },
    h('h2', {}, 'Đồng bộ tự động từ Google Sheet'),
    h('p', { class: cls, role: cls === 'error' ? 'alert' : undefined }, line),
    missingNote,
    formNote,
    h('p', { class: 'muted small' }, 'Mỗi phút Apps Script kiểm tra Sheet và chỉ gửi khi có thay đổi. Chỉ thêm học viên/ghi danh mới và điền chỗ trống; không xóa và không ghi đè phần đã sửa trên web.'));
}

export async function renderImport(ctx) {
  const done = () => ctx.refreshClasses();
  const sync = await get('/api/import/sync-status').catch(() => null);
  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Nhập dữ liệu từ Excel')),
    sync ? syncCard(sync) : null,
    h('p', { class: 'muted' }, 'Chọn file → "Chạy thử" để xem trước (không ghi gì) → "Nhập thật". Nhập lại cùng file là an toàn: ô đã sửa trên web được giữ nguyên. Chỉ các cột trong danh sách cho phép được đọc — không đọc cột tiền/voucher; file không được lưu lại.'),
    importCard({
      title: 'Điểm danh & bài tập',
      intro: 'Workbook nhiều sheet (vd danh-sach-hoc-vien-mau.xlsx). Chỉ sheet đang HIỆN; X = đi học, O = vắng có phép, trống = vắng. Màn hình điểm danh/bài tập đang mở sẽ tự cập nhật sau khi nhập.',
      endpoint: '/api/import/attendance', render: attendanceResult, onDone: done,
    }),
    importCard({
      title: 'Lớp, học viên, ghi danh (Transactions)',
      intro: 'File Transactions.xlsx có sheet "Course" và "Transactions". Giáo trình lấy từ giáo trình đã có sẵn trong hệ thống.',
      endpoint: '/api/import/transactions', render: transactionsResult, onDone: done,
    }));
}
