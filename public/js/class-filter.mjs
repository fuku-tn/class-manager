// Logic lọc/sắp xếp lớp — thuần (không đụng DOM) để dùng chung cho bộ chọn lớp, trang Lớp học và test.
export const TIMING_LABEL = { running: 'Đang học', upcoming: 'Sắp mở', finished: 'Đã kết thúc', unknown: 'Chưa có ngày' };
export const TIMING_ORDER = ['running', 'upcoming', 'finished', 'unknown'];
export const SHIFT_LABEL = { morning: 'Sáng', afternoon: 'Chiều', evening: 'Tối', full_day: 'Cả ngày' };
export const MODE_LABEL = { Online: 'Online', Offline: 'Offline', Hybrid: 'Hybrid' };
export const PROGRAM_NAMES = {
  BIE: 'Business Intelligence Essentials', BIH: 'BI HR Analytics', EBA: 'Excel for Business Analytics',
  SIA: 'Sales Incentive Analytics', SCA: 'Sales Incentive Analytics', PBM: 'Practical Business Management',
  DDM: 'Data-Driven Marketing', SQL: 'SQL', WKS: 'Workshop', BSM: 'BSM', DBC: 'DBC',
};

// Bỏ dấu + chữ thường để tìm "bie101", "thang 10" không cần gõ dấu.
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

export function classLabel(c) {
  return c.short_code || c.code;
}

function haystack(c) {
  return norm([c.short_code, c.code, c.program, PROGRAM_NAMES[c.program], c.name, fmtDate(c.start_date), c.start_date, c.delivery_mode].join(' '));
}

// Mỗi từ khóa phải xuất hiện (AND), không phân biệt dấu/hoa thường.
export function matchesQuery(c, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(c);
  return words.every((w) => hay.includes(w));
}

// opts: { q, program, timing: 'all' | 'running' | 'upcoming' | 'finished' | 'unknown' }
export function filterClasses(list, { q = '', program = '', timing = 'all' } = {}) {
  return list.filter((c) => (timing === 'all' || (c.timing ?? 'unknown') === timing)
    && (!program || c.program === program)
    && matchesQuery(c, q));
}

// Đang học trước, rồi sắp mở (gần nhất trước), rồi đã kết thúc (mới nhất trước).
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
  const out = { all: list.length, running: 0, upcoming: 0, finished: 0, unknown: 0 };
  for (const c of list) out[c.timing ?? 'unknown'] += 1;
  return out;
}

// Bộ lọc mặc định: nếu có lớp đang học thì chỉ hiện lớp đang học (danh sách ngắn), không thì hiện tất cả.
export function defaultTiming(list) {
  return list.some((c) => c.timing === 'running') ? 'running' : 'all';
}

// Phạm vi lọc của bộ chọn lớp: đang gõ tìm thì tìm trong TẤT CẢ lớp (bỏ chip thời gian/chương trình),
// để lớp cũ/đã kết thúc vẫn ra kết quả khi gõ tên.
export function pickerFilter(list, { q = '', program = '', timing = 'all' } = {}) {
  const searching = String(q).trim() !== '';
  return filterClasses(list, { q, program: searching ? '' : program, timing: searching ? 'all' : timing });
}
