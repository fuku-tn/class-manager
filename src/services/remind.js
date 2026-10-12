// Nhắc homework: tin nhắn riêng cho từng học viên + chuẩn hoá bảng dán. Chuyển từ bộ kit "remind-homework-kit"
// (src/message.js, src/parse.js) sang CommonJS. Tin nhắn CHỈ được sinh ở máy chủ và chỉ trả cho tài khoản có quyền
// (xem requireRemind) — nên tài khoản không có quyền không thể lấy được nội dung tin nhắn.
// Công thức tỉ lệ (%, trung bình, nhóm ẩn danh) nằm ở stats.js, không tính lại ở đây.

const THEME_KEYS = ['class-manager', 'excel-green', 'bih-forest-sand', 'sca-olive-lemon', 'bie-ocean-blue', 'pbm-plum-gold'];
// Theme mặc định: bảng màu của trang (lớp có thể chọn theme theo chương trình; BIE/PBM là đề xuất mới).
const DEFAULT_THEME = {
  EBA: 'excel-green', BIH: 'bih-forest-sand', SCA: 'sca-olive-lemon', SIA: 'sca-olive-lemon',
  BIE: 'bie-ocean-blue', PBM: 'pbm-plum-gold',
};
const FALLBACK_THEME = 'class-manager'; // chương trình lạ: màu của trang

function joinVi(a) { return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} và ${a[a.length - 1]}`; }

// Tên gọi: 2 từ cuối ("Đức Quang"); bỏ qua tên đệm Thị/Văn ("Nguyễn Thị Thi" -> "Thi"); tên ngoại -> ghi đè bằng call_name.
function callName(fullName, override = null) {
  if (override && String(override).trim()) return String(override).trim();
  const p = String(fullName).trim().split(/\s+/);
  const last = p[p.length - 1];
  const prev = p[p.length - 2];
  return (p.length > 2 && !/^(Thị|Văn)$/i.test(prev)) ? `${prev} ${last}` : last;
}

const shortHw = (h) => h.replace(/HOMEWORK /i, 'HW');

// student: { name, d:[0|1,...], honorific: 'Anh'|'Chị', call_name? }
// opts: { hdr, cls, scope }. 3 trường hợp: đủ bài / còn thiếu một phần / chưa làm bài nào.
function buildMessage(student, { hdr, cls, scope = 'các tuần đã học' }) {
  const P = student.honorific === 'Anh' ? 'Anh' : 'Chị';
  const p = P.toLowerCase();
  const nm = `${P} ${callName(student.name, student.call_name)}`;
  const all = hdr.map(shortHw);
  const miss = hdr.map((h, i) => (student.d[i] ? null : (/CAPSTONE/i.test(h) ? '2 file của Capstone Project' : shortHw(h)))).filter(Boolean);
  if (!miss.length) {
    return `${nm} ơi, em check HW lớp ${cls} thấy ${p} đã hoàn thành đầy đủ homework ${scope} (${joinVi(all)}) rồi. Cảm ơn ${p} đã nộp bài nhé!`;
  }
  const range = student.d.some(Boolean) ? ` (${joinVi(all)})` : '';
  return `${nm} ơi, em check HW lớp ${cls} thấy mình chỉ còn ${joinVi(miss)} nữa là hoàn thành đầy đủ homework ${scope}${range}. Nếu bài nào đang có vướng mắc, ${p} cứ nhắn em, em hỗ trợ liền ạ!`;
}

// Cấu hình mặc định của lớp (khi chưa lưu): lớp trong tin nhắn = mã chương trình; tiêu đề tổng quan = mã lớp.
function configFor(cls, row) {
  return {
    cls_label: row?.cls_label || cls.program || cls.short_code || cls.code,
    scope: row?.scope || 'các tuần đã học',
    overview_title: row?.overview_title || `Tiến độ homework lớp ${cls.short_code || cls.code}`,
    min_group: row?.min_group || 1,
    theme: THEME_KEYS.includes(row?.theme) ? row.theme : (DEFAULT_THEME[cls.program] || FALLBACK_THEME),
  };
}

// ---- Dán bảng từ Excel/Google Sheets (tab-separated): dòng đầu = FULL NAME, HOMEWORK 1.., CAPSTONE PROJECT
const DONE = new Set(['X', '✓', '✔', '1', 'TRUE', 'DONE']);
function parseTable(text) {
  const rows = String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.split('\t').map((c) => c.trim()));
  const warnings = [];
  const head = rows.find((r) => r.some(Boolean));
  if (!head) return { columns: [], students: [], warnings: ['Bảng rỗng'] };
  const columns = [];
  head.slice(1).forEach((label, i) => {
    if (!label) return;
    const hw = /^(?:HOMEWORK|HW)\s*(\d+)$/i.exec(label);
    if (hw) columns.push({ index: i + 1, kind: 'hw', seq: Number(hw[1]), label });
    else if (/CAPSTONE/i.test(label)) columns.push({ index: i + 1, kind: 'capstone', seq: 1, label });
    else warnings.push(`Bỏ qua cột "${label}" (không phải HOMEWORK n hoặc CAPSTONE)`);
  });
  const students = [];
  const seen = new Set();
  for (const r of rows.slice(rows.indexOf(head) + 1)) {
    const name = (r[0] || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    if (seen.has(name)) warnings.push(`Trùng tên: "${name}" — dòng sau được dùng`);
    seen.add(name);
    const done = columns.map((c) => (DONE.has((r[c.index] || '').toUpperCase()) ? 1 : 0));
    const odd = columns.map((c) => r[c.index] || '').filter((v) => v && !DONE.has(v.toUpperCase()));
    if (odd.length) warnings.push(`"${name}": ô có giá trị lạ (${odd.join(', ')}) — tính là chưa hoàn thành`);
    students.push({ name, done });
  }
  return { columns, students, warnings };
}

module.exports = { THEME_KEYS, DEFAULT_THEME, joinVi, callName, buildMessage, configFor, parseTable };
