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
export function matchesQuery(c, q) {
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
