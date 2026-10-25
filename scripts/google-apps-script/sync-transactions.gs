/**
 * Đồng bộ Google Sheet → Class Manager (webapp lớp học).
 *
 * Cách dùng: xem Documents/3-ky-thuat/google-sheet-sync.md. Tóm tắt:
 *  1. Mở Google Sheet → Tiện ích mở rộng (Extensions) → Apps Script → dán toàn bộ file này.
 *  2. Project Settings → Script properties: thêm SYNC_URL và SYNC_TOKEN (giá trị do chủ dự án cấp).
 *  3. Chạy hàm setup() một lần, cấp quyền khi được hỏi.
 *
 * AN TOÀN: script chỉ đọc đúng các cột trong ALLOWED_* bên dưới (đọc từng cột theo tên tiêu đề).
 * Mọi cột khác — đặc biệt các cột liên quan đến tiền — KHÔNG bao giờ được đọc hay gửi đi.
 * Danh sách này phải khớp với ALLOWED_TX / ALLOWED_COURSE trong src/services/importTransactions.js
 * (máy chủ cũng tự lọc lại một lần nữa).
 */
const CONFIG = {
  SHEET_TRANSACTIONS: ['PERSONAL', 'Transactions'], // tên tab chứa đăng ký học (lấy tab đầu tiên tìm thấy)
  SHEET_COURSE: ['COURSE', 'Course'],               // tên tab danh sách lớp (không có thì máy chủ dùng danh sách lớp sẵn có)
  SHEET_COMPANY: ['COMPANY'],                       // tên tab học viên B2B (không có thì chỉ đồng bộ B2C)
  SHEET_FORM: ['FORM'],                             // tên tab phiếu đăng ký (không có thì bỏ qua)
  HEADER_ROW: 0,                      // 0 = tự tìm dòng tiêu đề (dòng 1 thường là dòng tổng); hoặc ghi cố định số dòng, vd 2
  MAX_HEADER_ROW: 10,                 // chỉ tìm tiêu đề trong 10 dòng đầu
  FALLBACK_HEADER_ROW: 2,             // dùng khi không tự tìm được
  EVERY_MINUTES: 1,                   // chu kỳ kiểm tra (1, 5, 10, 15, 30)
  RESEND_AFTER_MINUTES: 60,           // không đổi gì vẫn gửi lại mỗi giờ một lần để trang quản trị biết script còn sống
};

const ALLOWED_TX = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE'];
const ALLOWED_COURSE = ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE', 'DAYS OF WEEK', 'START DATE', 'EXPECTED END DATE'];
// Tab COMPANY: cùng cột với PERSONAL + tên công ty (không lấy ngày sinh, không lấy cột tiền).
const ALLOWED_COMPANY = ALLOWED_TX.concat(['COMPANY NAME']);

// Tab FORM: CHỈ các cột dưới đây được gửi (tên cột Tiếng Việt viết HOA -> tên chuẩn). Các cột KHÔNG có trong danh sách
// (Họ và tên, Giới tính, Ngày sinh, Địa chỉ liên hệ, Tên công ty, Địa chỉ nhận tại nhà, Kỳ vọng sau khóa học...) không bao giờ được đọc.
const FORM_MAP = {
  'THỜI GIAN ĐĂNG KÝ': 'SUBMITTED AT',
  'MÃ LỚP': 'COURSE',
  'HÌNH THỨC HỌC': 'DELIVERY',
  'VỊ TRÍ LÀM VIỆC': 'JOB TITLE',
  'KINH NGHIỆM (NĂM)': 'EXPERIENCE',
  'PHÒNG BAN': 'DEPARTMENT',
  'HR FUNCTION (NẾU CÓ)': 'HR FUNCTION',
  'LĨNH VỰC KINH DOANH': 'INDUSTRY',
  'TỈNH/THÀNH PHỐ': 'PROVINCE',
  'NGUỒN BIẾT ĐẾN': 'SOURCE',
  'HÌNH THỨC NHẬN GIÁO TRÌNH': 'MATERIAL DELIVERY',
  'MỤC TIÊU THAM GIA': 'GOALS',
};
// Chỉ để BĂM rồi mới gửi (giá trị gốc không bao giờ rời Google): ghép phiếu với học viên đã đăng ký.
const FORM_HASHED = { 'EMAIL': 'EMAIL HASH', 'SỐ ĐIỆN THOẠI': 'PHONE HASH' };

/** Chạy MỘT lần: tạo bộ hẹn giờ rồi đồng bộ ngay. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SYNC_URL') || !props.getProperty('SYNC_TOKEN')) {
    throw new Error('Thiếu SYNC_URL hoặc SYNC_TOKEN: vào Project Settings → Script properties để thêm.');
  }
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncNow')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(CONFIG.EVERY_MINUTES).create();
  syncNow(true);
}

/** Gỡ bộ hẹn giờ (tạm dừng đồng bộ). */
function stop() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncNow')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

/**
 * Được gọi mỗi phút bởi trigger. Chỉ gửi khi dữ liệu đổi (hoặc đã quá RESEND_AFTER_MINUTES).
 * Lưu ý: khi trigger gọi, Apps Script truyền một đối tượng sự kiện vào tham số đầu → chỉ coi là "ép gửi"
 * khi tham số đúng bằng `true` (setup() gọi syncNow(true)).
 */
function syncNow(forceArg) {
  const force = forceArg === true;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // lượt trước còn đang chạy
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SYNC_URL');
    const token = props.getProperty('SYNC_TOKEN');
    if (!url || !token) throw new Error('Thiếu SYNC_URL hoặc SYNC_TOKEN trong Script properties');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transactions = readTable_(findSheet_(ss, CONFIG.SHEET_TRANSACTIONS), ALLOWED_TX, [], 'STUDENT ID');
    if (!transactions) throw new Error('Không tìm thấy tab ' + CONFIG.SHEET_TRANSACTIONS.join(' / ') + ' hoặc tab trống');
    const course = readTable_(findCourseSheet_(ss), ALLOWED_COURSE, ['STARTDATE', 'ENDDATE'], 'COURSE ID');

    const company = readTable_(findSheet_(ss, CONFIG.SHEET_COMPANY), ALLOWED_COMPANY, [], 'STUDENT ID');

    const form = readForm_(findSheet_(ss, CONFIG.SHEET_FORM));

    const payload = { transactions: transactions };
    if (course) payload.course = course;
    if (company) payload.company = company;
    if (form) payload.form = form;
    const body = JSON.stringify(payload);
    const hash = toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8));
    const lastHash = props.getProperty('LAST_HASH');
    const lastSent = Number(props.getProperty('LAST_SENT') || 0);
    const stale = Date.now() - lastSent > CONFIG.RESEND_AFTER_MINUTES * 60 * 1000;
    if (!force && hash === lastHash && !stale) return; // không có gì mới

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      headers: { 'X-Sync-Token': token },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code !== 200) throw new Error('Máy chủ trả về ' + code + ': ' + res.getContentText().slice(0, 300));
    props.setProperty('LAST_HASH', hash);
    props.setProperty('LAST_SENT', String(Date.now()));
    console.log('Đã đồng bộ: ' + res.getContentText().slice(0, 400));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Đọc một tab nhưng CHỈ các cột trong `allowed` (đọc từng cột một; cột khác không bao giờ bị đọc).
 * Trả về { headers: [...], rows: [[...], ...] } hoặc null nếu không có tab / trống.
 */
function readTable_(sheet, allowed, dateCols, keyHeader, dateFormat) {
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headerRow = CONFIG.HEADER_ROW || findHeaderRow_(sheet, keyHeader) || CONFIG.FALLBACK_HEADER_ROW;
  if (lastRow <= headerRow || lastCol < 1) return null;
  const tz = sheet.getParent().getSpreadsheetTimeZone();

  const titles = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const cols = []; // { name, index (1-based) }
  const seen = {};
  titles.forEach(function (v, i) {
    const name = String(v == null ? '' : v).trim().normalize('NFC').toUpperCase().replace(/\s+/g, ' ');
    if (allowed.indexOf(name) >= 0 && !seen[name]) { seen[name] = true; cols.push({ name: name, index: i + 1 }); }
  });
  if (!cols.length) return null;

  const n = lastRow - headerRow;
  const data = cols.map(function (c) {
    return sheet.getRange(headerRow + 1, c.index, n, 1).getValues().map(function (r) {
      let v = r[0];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, dateFormat || 'yyyy-MM-dd'); // ngày không bị lệch múi giờ
      return v === '' ? null : v;
    });
  });
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = cols.map(function (_, c) { return data[c][r]; });
    if (row.some(function (v) { return v !== null; })) rows.push(row); // bỏ dòng trống
  }
  return { headers: cols.map(function (c) { return c.name; }), rows: rows };
}

/**
 * Đọc tab FORM: chỉ các cột trong FORM_MAP; email và số điện thoại được BĂM (SHA-256) ngay tại đây,
 * giá trị gốc không được đưa vào dữ liệu gửi đi. Chuẩn hóa phải khớp src/services/formProfile.js.
 */
function readForm_(sheet) {
  const allowed = Object.keys(FORM_MAP).concat(Object.keys(FORM_HASHED));
  const t = readTable_(sheet, allowed, [], 'Mã lớp', "yyyy-MM-dd'T'HH:mm:ssXXX");
  if (!t) return null;
  const headers = t.headers.map(function (h) { return FORM_MAP[h] || FORM_HASHED[h]; });
  const rows = t.rows.map(function (r) {
    return r.map(function (v, i) {
      const h = t.headers[i];
      if (h === 'EMAIL') return hashEmail_(v);
      if (h === 'SỐ ĐIỆN THOẠI') return hashPhone_(v);
      return v;
    });
  });
  return { headers: headers, rows: rows };
}

function sha256_(s) {
  return toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}
function hashEmail_(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return e.indexOf('@') >= 0 ? sha256_(e) : null;
}
function hashPhone_(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  return d.length >= 8 ? sha256_(d.slice(-9)) : null;
}

/**
 * Tìm dòng tiêu đề bằng TextFinder (tìm vị trí ô có đúng chữ `keyHeader`) — KHÔNG đọc giá trị các ô khác,
 * nên dòng tổng ở trên (có số tiền) không bị đọc. Trả về 0 nếu không thấy.
 */
function findHeaderRow_(sheet, keyHeader) {
  const hits = sheet.createTextFinder(keyHeader).matchEntireCell(true).matchCase(false).findAll();
  let row = 0;
  hits.forEach(function (r) {
    const n = r.getRow();
    if (n <= CONFIG.MAX_HEADER_ROW && (!row || n < row)) row = n;
  });
  return row;
}

/** Tìm tab theo danh sách tên (không phân biệt hoa thường). */
function findSheet_(ss, names) {
  const wanted = names.map(function (n) { return String(n).toLowerCase(); });
  const sheets = ss.getSheets();
  for (let i = 0; i < wanted.length; i++) {
    for (let j = 0; j < sheets.length; j++) {
      if (sheets[j].getName().toLowerCase() === wanted[i]) return sheets[j];
    }
  }
  return null;
}

/**
 * Tab danh sách lớp: ưu tiên theo tên (SHEET_COURSE); không thấy (vd đã đổi tên tab) thì tìm tab có các ô tiêu đề "COURSE ID" và
 * ("START DATE" hoặc "STARTDATE") trong 10 dòng đầu — để ngày khai giảng/kết thúc không ngừng cập nhật khi tab bị đổi tên.
 */
function findCourseSheet_(ss) {
  const byName = findSheet_(ss, CONFIG.SHEET_COURSE);
  if (byName) return byName;
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    if (!s.getLastRow() || !s.getLastColumn()) continue;
    if (findHeaderRow_(s, 'COURSE ID') && (findHeaderRow_(s, 'START DATE') || findHeaderRow_(s, 'STARTDATE'))) return s;
  }
  return null;
}

function toHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Ép gửi ngay (bỏ qua kiểm tra "không có gì mới"): chọn hàm này rồi bấm Run. */
function syncForce() { syncNow(true); }

/**
 * Chẩn đoán: in ra file/tab mà script ĐANG ĐỌC làm danh sách lớp và dòng của một lớp (mặc định PBM022) — để biết sửa đúng chỗ chưa.
 * Chạy debugCourse() rồi mở Execution log. Đổi mã lớp bằng cách sửa tham số, vd debugCourse('EBA121').
 */
function debugCourse(code) {
  const want = String(code || 'PBM022').toUpperCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  console.log('Các tab trong file: ' + ss.getSheets().map(function (s) { return '[' + s.getName() + ']'; }).join(' '));
  const sheet = findCourseSheet_(ss);
  console.log('File: ' + ss.getName() + ' | tab danh sách lớp: ' + (sheet ? sheet.getName() : '(không tìm thấy tab nào có cột COURSE ID và START DATE)'));
  const t = sheet && readTable_(sheet, ALLOWED_COURSE, ['STARTDATE', 'ENDDATE'], 'COURSE ID');
  if (!t) return;
  console.log('Cột đọc được: ' + t.headers.join(' | '));
  const iCourse = t.headers.indexOf('COURSE');
  const hits = t.rows.filter(function (r) { return String(r[iCourse]).toUpperCase() === want; });
  console.log(hits.length ? hits.map(function (r) { return JSON.stringify(r); }).join('\n') : 'Không có dòng nào của ' + want);
}
