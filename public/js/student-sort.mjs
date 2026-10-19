// Cách sắp xếp danh sách học viên (chỉ phía trình duyệt, thuần số học — test được).
// Mỗi tài khoản tự chọn và tự lưu lựa chọn của mình; không gửi lên máy chủ nên không ảnh hưởng người khác.
const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

export const SORTS = [
  { key: 'default', label: 'Mặc định (theo họ tên)' },
  { key: 'given_asc', label: 'Tên A → Z' },
  { key: 'given_desc', label: 'Tên Z → A' },
  { key: 'name_asc', label: 'Họ tên A → Z' },
  { key: 'name_desc', label: 'Họ tên Z → A' },
  { key: 'code_asc', label: 'Mã học viên tăng dần' },
  { key: 'code_desc', label: 'Mã học viên giảm dần' },
  { key: 'rate_asc', label: 'Chuyên cần thấp → cao' },
  { key: 'rate_desc', label: 'Chuyên cần cao → thấp' },
  { key: 'absent_desc', label: 'Vắng nhiều nhất' },
  { key: 'status', label: 'Đang học trước' },
];
export const SORT_KEYS = SORTS.map((s) => s.key);
export const isSortKey = (k) => SORT_KEYS.includes(k);

// "Nguyễn Văn An" -> "An": người Việt gọi và xếp theo tên (từ cuối).
export const givenName = (full) => {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};

const STATUS_ORDER = { active: 0, completed: 1, deferred: 2, dropped: 3 };
const byName = (a, b) => collator.compare(a.full_name ?? '', b.full_name ?? '') || collator.compare(a.student_code ?? '', b.student_code ?? '');
const byGiven = (a, b) => collator.compare(givenName(a.full_name), givenName(b.full_name)) || byName(a, b);
// Giá trị trống (chưa có tỉ lệ) luôn xếp cuối, bất kể chiều sắp.
const numCmp = (get, dir) => (a, b) => {
  const x = get(a), y = get(b);
  if (x == null && y == null) return byName(a, b);
  if (x == null) return 1;
  if (y == null) return -1;
  return (x - y) * dir || byName(a, b);
};

const COMPARATORS = {
  given_asc: byGiven,
  given_desc: (a, b) => byGiven(b, a),
  name_asc: byName,
  name_desc: (a, b) => byName(b, a),
  code_asc: (a, b) => collator.compare(a.student_code ?? '', b.student_code ?? '') || byName(a, b),
  code_desc: (a, b) => collator.compare(b.student_code ?? '', a.student_code ?? '') || byName(a, b),
  rate_asc: numCmp((r) => r.attendance_rate, 1),
  rate_desc: numCmp((r) => r.attendance_rate, -1),
  absent_desc: numCmp((r) => r.absent, -1),
  status: (a, b) => (STATUS_ORDER[a.course_status] ?? 9) - (STATUS_ORDER[b.course_status] ?? 9) || byName(a, b),
};

// Trả về mảng mới; không đổi mảng gốc. "Mặc định" và khóa lạ → theo họ tên theo bảng chữ cái tiếng Việt (Đ ngay sau D).
export function sortRows(rows, key) {
  const cmp = COMPARATORS[key] ?? byName;
  return cmp ? [...rows].sort(cmp) : [...rows];
}
