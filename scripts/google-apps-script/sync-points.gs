/**
 * Đồng bộ BẢNG ĐIỂM (Google Sheet riêng) → Class Manager (webapp lớp học).
 * Dùng cho Google Sheet CHỈ chứa điểm, độc lập với Sheet PERSONAL/COMPANY (script đó giữ nguyên).
 *
 * Cách dùng (xem Documents/google-sheet-sync.md):
 *  1. Mở Google Sheet chứa bảng điểm → Tiện ích mở rộng (Extensions) → Apps Script → dán toàn bộ file này.
 *  2. Project Settings → Script properties: thêm
 *       SYNC_URL   = https://<tên-miền-web>/api/sync/points
 *       SYNC_TOKEN = (cùng mã đồng bộ đang dùng cho Sheet đăng ký — do chủ dự án cấp)
 *  3. Chạy hàm setup() một lần, cấp quyền khi được hỏi.
 *
 * Bảng cần có các cột: StudentID, Course, HW, Point, Module (cột "Họ và tên" nếu có thì KHÔNG được đọc/gửi).
 * Tab có thể đặt tên bất kỳ: script tìm tab nào có ô tiêu đề "StudentID".
 * AN TOÀN: chỉ đọc đúng các cột trong ALLOWED_POINT (đọc từng cột theo tên tiêu đề); danh sách này phải khớp
 * POINT_COLUMNS trong src/services/importPoints.js (máy chủ cũng tự lọc lại).
 */
const CONFIG = {
  SHEET_NAMES: ['Point', 'Points', 'Điểm', 'Diem'], // ưu tiên các tên này; không có thì tự tìm tab chứa ô "StudentID"
  KEY_HEADER: 'StudentID',
  MAX_HEADER_ROW: 10,                 // chỉ tìm tiêu đề trong 10 dòng đầu
  FALLBACK_HEADER_ROW: 1,
  EVERY_MINUTES: 5,                   // chu kỳ kiểm tra (1, 5, 10, 15, 30)
  RESEND_AFTER_MINUTES: 60,           // không đổi gì vẫn gửi lại mỗi giờ một lần
};

const ALLOWED_POINT = ['STUDENTID', 'COURSE', 'HW', 'POINT', 'MODULE'];

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

/** Được gọi theo hẹn giờ. Chỉ gửi khi dữ liệu đổi (hoặc đã quá RESEND_AFTER_MINUTES); tham số sự kiện của trigger không phải "ép gửi". */
function syncNow(forceArg) {
  const force = forceArg === true;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SYNC_URL');
    const token = props.getProperty('SYNC_TOKEN');
    if (!url || !token) throw new Error('Thiếu SYNC_URL hoặc SYNC_TOKEN trong Script properties');

    const sheet = findPointSheet_(SpreadsheetApp.getActiveSpreadsheet());
    const points = sheet && readTable_(sheet, ALLOWED_POINT, CONFIG.KEY_HEADER);
    if (!points) throw new Error('Không thấy tab điểm (cần ô tiêu đề "' + CONFIG.KEY_HEADER + '") hoặc tab trống');

    const body = JSON.stringify({ points: points });
    const hash = toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8));
    const lastSent = Number(props.getProperty('LAST_SENT') || 0);
    const stale = Date.now() - lastSent > CONFIG.RESEND_AFTER_MINUTES * 60 * 1000;
    if (!force && hash === props.getProperty('LAST_HASH') && !stale) return; // không có gì mới

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
    console.log('Đã đồng bộ điểm: ' + res.getContentText().slice(0, 400));
  } finally {
    lock.releaseLock();
  }
}

/** Tìm tab điểm: theo tên ưu tiên, nếu không có thì tab đầu tiên chứa ô tiêu đề KEY_HEADER (TextFinder, không đọc giá trị ô khác). */
function findPointSheet_(ss) {
  const sheets = ss.getSheets();
  for (let i = 0; i < CONFIG.SHEET_NAMES.length; i++) {
    const want = CONFIG.SHEET_NAMES[i].toLowerCase();
    for (let j = 0; j < sheets.length; j++) {
      if (sheets[j].getName().toLowerCase() === want && findHeaderRow_(sheets[j], CONFIG.KEY_HEADER)) return sheets[j];
    }
  }
  for (let j = 0; j < sheets.length; j++) {
    if (findHeaderRow_(sheets[j], CONFIG.KEY_HEADER)) return sheets[j];
  }
  return null;
}

function findHeaderRow_(sheet, keyHeader) {
  const hits = sheet.createTextFinder(keyHeader).matchEntireCell(true).matchCase(false).findAll();
  let row = 0;
  hits.forEach(function (r) {
    const n = r.getRow();
    if (n <= CONFIG.MAX_HEADER_ROW && (!row || n < row)) row = n;
  });
  return row;
}

/** Đọc tab nhưng CHỈ các cột trong `allowed` (từng cột một). Trả về { headers, rows } hoặc null nếu trống. */
function readTable_(sheet, allowed, keyHeader) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headerRow = findHeaderRow_(sheet, keyHeader) || CONFIG.FALLBACK_HEADER_ROW;
  if (lastRow <= headerRow || lastCol < 1) return null;

  const titles = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const cols = [];
  const seen = {};
  titles.forEach(function (v, i) {
    const name = String(v == null ? '' : v).trim().normalize('NFC').toUpperCase().replace(/\s+/g, ' ');
    if (allowed.indexOf(name) >= 0 && !seen[name]) { seen[name] = true; cols.push({ name: name, index: i + 1 }); }
  });
  if (!cols.length) return null;

  const n = lastRow - headerRow;
  const data = cols.map(function (c) {
    return sheet.getRange(headerRow + 1, c.index, n, 1).getValues().map(function (r) { return r[0] === '' ? null : r[0]; });
  });
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = cols.map(function (_, c) { return data[c][r]; });
    if (row.some(function (v) { return v !== null; })) rows.push(row); // bỏ dòng trống
  }
  return { headers: cols.map(function (c) { return c.name; }), rows: rows };
}

function toHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
