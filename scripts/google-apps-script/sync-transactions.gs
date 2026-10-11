/**
 * Đồng bộ Google Sheet → Class Manager (webapp lớp học).
 *
 * Cách dùng: xem Documents/google-sheet-sync.md. Tóm tắt:
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
  HEADER_ROW: 1,                      // dòng chứa tiêu đề cột
  EVERY_MINUTES: 1,                   // chu kỳ kiểm tra (1, 5, 10, 15, 30)
  RESEND_AFTER_MINUTES: 60,           // không đổi gì vẫn gửi lại mỗi giờ một lần để trang quản trị biết script còn sống
};

const ALLOWED_TX = ['STUDENT ID', 'CUSTOMER ID', 'FULL NAME', 'EMAIL', 'PHONE', 'COURSE', 'MODE', 'GENDER', 'STATUS', 'REGISTRATION SOURCE'];
const ALLOWED_COURSE = ['COURSE', 'COURSE ID', 'STARTDATE', 'ENDDATE', 'NEXT COURSE', 'START DATE', 'EXPECTED END DATE'];

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

/** Được gọi mỗi phút bởi trigger. force = true: gửi dù dữ liệu không đổi. */
function syncNow(force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // lượt trước còn đang chạy
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SYNC_URL');
    const token = props.getProperty('SYNC_TOKEN');
    if (!url || !token) throw new Error('Thiếu SYNC_URL hoặc SYNC_TOKEN trong Script properties');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transactions = readTable_(findSheet_(ss, CONFIG.SHEET_TRANSACTIONS), ALLOWED_TX, []);
    if (!transactions) throw new Error('Không tìm thấy tab ' + CONFIG.SHEET_TRANSACTIONS.join(' / ') + ' hoặc tab trống');
    const course = readTable_(findSheet_(ss, CONFIG.SHEET_COURSE), ALLOWED_COURSE, ['STARTDATE', 'ENDDATE']);

    const body = JSON.stringify(course ? { transactions: transactions, course: course } : { transactions: transactions });
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
function readTable_(sheet, allowed, dateCols) {
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headerRow = CONFIG.HEADER_ROW;
  if (lastRow <= headerRow || lastCol < 1) return null;
  const tz = sheet.getParent().getSpreadsheetTimeZone();

  const titles = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const cols = []; // { name, index (1-based) }
  const seen = {};
  titles.forEach(function (v, i) {
    const name = String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, ' ');
    if (allowed.indexOf(name) >= 0 && !seen[name]) { seen[name] = true; cols.push({ name: name, index: i + 1 }); }
  });
  if (!cols.length) return null;

  const n = lastRow - headerRow;
  const data = cols.map(function (c) {
    return sheet.getRange(headerRow + 1, c.index, n, 1).getValues().map(function (r) {
      let v = r[0];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd'); // ngày không bị lệch múi giờ
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

function toHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
