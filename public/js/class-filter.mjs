// Logic lọc/sắp xếp lớp — thuần (không đụng DOM) để dùng chung cho bộ chọn lớp, trang Lớp học và test.
// running = đang học; grading = 14 ngày sau buổi cuối (nộp & chấm bài); graduation = 14 ngày tiếp (công bố tốt nghiệp).
// "active" là nhóm ảo = đang học + nộp/chấm bài + công bố tốt nghiệp (lớp chưa thực sự kết thúc).
export const TIMING_LABEL = {
  running: 'Đang học', grading: 'Nộp & chấm bài', graduation: 'Công bố tốt nghiệp', upcoming: 'Sắp mở',
  finished: 'Đã kết thúc', unknown: 'Chưa có ngày', active: 'Đang hoạt động',
};
export const TIMING_ORDER = ['running', 'grading', 'graduation', 'upcoming', 'finished', 'unknown'];
export const ACTIVE_TIMINGS = ['running', 'grading', 'graduation'];
export const SHIFT_LABEL = { morning: 'Sáng', afternoon: 'Chiều', evening: 'Tối', full_day: 'Cả ngày' };
export const MODE_LABEL = { Online: 'Online', Offline: 'Offline', Hybrid: 'Hybrid' };
export const PROGRAM_NAMES = {
  BIE: 'Business Intelligence Essentials', BIH: 'BI HR Analytics', EBA: 'Excel for Business Analytics',
  SIA: 'Sales Incentive Analytics', SCA: 'Sales Incentive Analytics', PBM: 'Practical Business Management',
  DDM: 'Data-Driven Marketing', SQL: 'SQL', WKS: 'Workshop', BSM: 'BSM', DBC: 'DBC',
};

// Thứ học từ cột DAYS OF WEEK: "24" → "T2, T4"; "78" → "T7, CN" (8 = Chủ nhật); chữ S/T đứng trước: "S78" → "T7, CN (sáng)", "T78" → "T7, CN (tối)".
export function formatDays(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return '';
  const digits = [...s.replace(/[^2-8]/g, '')];
  const prefix = s.replace(/[0-9\s,;.-]/g, '');
  const days = [...new Set(digits)].sort().map((d) => (d === '8' ? 'CN' : `T${d}`));
  const note = prefix === 'S' ? 'sáng' : prefix === 'T' ? 'tối' : prefix;
  return days.length ? days.join(', ') + (note ? ` (${note})` : '') : s;
}

// Ca khai giảng của lớp (chủ dự án chốt 19/10/2026), theo thứ tự ưu tiên:
//  1. chữ đứng trước thứ học trong cột DAYS OF WEEK: S78 = sáng, T78 = tối;
//  2. lớp chỉ học ngày thường (24, 35, 46, 246…) = tối;
//  3. còn lại (7, 8, 78 không có chữ): theo "Sub 4" của mã lớp (classes.shift): MM sáng · AA chiều · EE tối · MA cả ngày.
// Trả { shift: 'morning'|'afternoon'|'evening'|'full_day'|null, source: 'days_letter'|'weekdays'|'sub4'|null }.
export function openingShift(c) {
  const s = String(c?.days_of_week ?? '').trim().toUpperCase();
  const letter = /^[A-Z]/.exec(s)?.[0];
  if (letter === 'S') return { shift: 'morning', source: 'days_letter' };
  if (letter === 'T') return { shift: 'evening', source: 'days_letter' };
  const digits = s.replace(/[^0-9]/g, '');
  if (digits && /^[2-6]+$/.test(digits)) return { shift: 'evening', source: 'weekdays' };
  return c?.shift ? { shift: c.shift, source: 'sub4' } : { shift: null, source: null };
}

// Bài tương đương theo chương trình: BIH có HW1–HW4, Mini Project 1–3, Capstone; "Mini Project 3" chính là HW5
// (giữ tick nộp HW5, tính % HW và tốt nghiệp như HW5, chỉ đổi tên hiển thị). Phải khớp ASSIGNMENT_ALIASES trong src/services/importPoints.js.
export const ASSIGNMENT_ALIASES = { BIH: { 'hw:5': { kind: 'mini', seq: 3 } } };
const programOf = (cls) => String(cls?.program || /^([A-Za-z]+)/.exec(String(cls?.short_code ?? ''))?.[1] || '').toUpperCase();
// Bài hiển thị: { kind, seq } sau khi đổi theo chương trình (vd BIH hw5 -> mini 3)
function displayAssignment(a, cls) {
  return ASSIGNMENT_ALIASES[programOf(cls)]?.[`${a.kind}:${a.seq}`] ?? { kind: a.kind, seq: a.seq };
}
// Tên ngắn trên tiêu đề cột: HW2 · MP1 · Capstone (short = true: CP cho biểu đồ)
export function assignmentLabel(a, cls, { short = false } = {}) {
  const d = displayAssignment(a, cls);
  if (d.kind === 'capstone') return short ? 'CP' : 'Capstone';
  return `${d.kind === 'mini' ? 'MP' : 'HW'}${d.seq}`;
}
// Sắp cột: HW → Mini Project → Capstone (theo bài hiển thị)
const KIND_RANK = { hw: 0, mini: 1, capstone: 2 };
export function sortAssignments(list, cls) {
  return [...list].sort((x, y) => {
    const a = displayAssignment(x, cls); const b = displayAssignment(y, cls);
    return (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || a.seq - b.seq;
  });
}

// Chữ cái đầu của HỌ (từ đầu tiên của họ tên theo thứ tự Việt Nam): bỏ dấu, riêng Đ là chữ riêng; ký tự lạ → '#'.
export function surnameInitial(fullName) {
  const c = String(fullName ?? '').trim().normalize('NFC').split(/\s+/)[0]?.[0];
  if (!c) return '#';
  if (c === 'đ' || c === 'Đ') return 'Đ';
  const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /^[A-Z]$/.test(base) ? base : '#';
}

// Bỏ dấu + chữ thường để tìm "bie101", "thang 10" không cần gõ dấu.
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

// Nhãn hiển thị của lớp ở mọi nơi: "BIE 104" (mã đầy đủ chỉ hiện ở tooltip / bảng quản trị).
export function classLabel(c) {
  return classDisplayName(c);
}

// Tên gọn để đọc: "P2.BIE.P104.HY.AA.041026" → "BIE 104" (từ mã ngắn BIE104, hoặc suy ra từ mã đầy đủ). Không suy ra được → mã gốc.
export function classDisplayName(c) {
  const short = /^([A-Za-z]+)\s*(\d+)$/.exec(String(c?.short_code ?? '').trim());
  if (short) return `${short[1].toUpperCase()} ${short[2]}`;
  const parts = String(c?.code ?? '').split('.');
  const prog = parts[1] && /^[A-Za-z]+$/.test(parts[1]) ? parts[1] : null;
  const num = parts[2] ? /^[A-Za-z]?(\d+)$/.exec(parts[2]) : null;
  if (prog && num) return `${prog.toUpperCase()} ${num[1]}`;
  return c?.code ?? '';
}

function haystack(c) {
  return norm([c.short_code, c.code, c.program, PROGRAM_NAMES[c.program], c.name, fmtDate(c.start_date), c.start_date, c.delivery_mode].join(' '));
}

// Mỗi từ khóa phải xuất hiện (AND), không phân biệt dấu/hoa thường.
function matchesQuery(c, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(c);
  return words.every((w) => hay.includes(w));
}

// B2B/B2C của lớp: dùng cờ máy chủ trả về (is_b2b/is_b2c); thiếu thì suy từ chữ thứ 3 của mã lớp (B = B2B).
export function segmentFlags(c) {
  const letter = String(c?.code ?? '').split('.')[2]?.charAt(0)?.toUpperCase() ?? '';
  return { b2b: c?.is_b2b ?? letter === 'B', b2c: c?.is_b2c ?? letter !== 'B' };
}
export const SEGMENT_LABEL = { b2c: 'B2C', b2b: 'B2B' };

export function countBySegment(list) {
  const out = { all: list.length, b2c: 0, b2b: 0 };
  for (const c of list) { const s = segmentFlags(c); if (s.b2c) out.b2c++; if (s.b2b) out.b2b++; }
  return out;
}

// opts: { q, program, timing: 'all' | 'active' | 'running' | 'grading' | 'graduation' | 'upcoming' | 'finished' | 'unknown', segment: '' | 'b2c' | 'b2b' }
export function filterClasses(list, { q = '', program = '', timing = 'all', segment = '' } = {}) {
  return list.filter((c) => (timing === 'all' || (timing === 'active' ? ACTIVE_TIMINGS.includes(c.timing) : (c.timing ?? 'unknown') === timing))
    && (!program || c.program === program)
    && (!segment || segmentFlags(c)[segment])
    && matchesQuery(c, q));
}

// Đang học trước, rồi sắp mở (gần nhất trước), rồi đã kết thúc (mới nhất trước).
// Các chip thời gian cần hiện (theo thứ tự): Tất cả, [Đang hoạt động nếu khác "Đang học"], rồi từng giai đoạn có lớp.
export function timingChipKeys(counts) {
  return ['all', ...(counts.active > 0 && counts.active !== counts.running ? ['active'] : []), ...TIMING_ORDER.filter((t) => counts[t] > 0)];
}

export function sortClasses(list) {
  const rank = (c) => TIMING_ORDER.indexOf(c.timing ?? 'unknown');
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    const da = String(a.start_date ?? ''), db = String(b.start_date ?? '');
    return a.timing === 'upcoming' ? da.localeCompare(db) : db.localeCompare(da);
  });
}

export function programsOf(list) {
  const m = new Map();
  for (const c of list) if (c.program) m.set(c.program, (m.get(c.program) ?? 0) + 1);
  return [...m].map(([program, count]) => ({ program, count })).sort((a, b) => b.count - a.count || a.program.localeCompare(b.program));
}

export function countByTiming(list) {
  const out = { all: list.length, active: 0, running: 0, grading: 0, graduation: 0, upcoming: 0, finished: 0, unknown: 0 };
  for (const c of list) {
    out[c.timing ?? 'unknown'] += 1;
    if (ACTIVE_TIMINGS.includes(c.timing)) out.active += 1;
  }
  return out;
}

// Bộ lọc mặc định: nếu có lớp đang học thì chỉ hiện lớp đang học (danh sách ngắn), không thì hiện tất cả.
export function defaultTiming(list) {
  const c = countByTiming(list);
  if (c.active === 0) return 'all';
  return c.active === c.running ? 'running' : 'active'; // có lớp đang chấm bài/công bố thì hiện cả nhóm hoạt động
}

// Phạm vi lọc của bộ chọn lớp: đang gõ tìm thì tìm trong TẤT CẢ lớp (bỏ chip thời gian/chương trình),
// để lớp cũ/đã kết thúc vẫn ra kết quả khi gõ tên.
export function pickerFilter(list, { q = '', program = '', timing = 'all', segment = '' } = {}) {
  const searching = String(q).trim() !== '';
  return filterClasses(list, { q, program: searching ? '' : program, timing: searching ? 'all' : timing, segment: searching ? '' : segment });
}
