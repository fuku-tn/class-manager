/**
 * Đồng bộ LỊCH GIẢNG DẠY (bảng "Calendar" trên Google Sheet) → Class Manager (webapp lớp học).
 * Bảng có các cột: Ngày · Buổi (S = sáng, C = chiều, T = tối) · Khóa (vd BIH98) · Nội dung · Số buổi · Hình thức · Loại · Ghi chú
 * (Khai giảng / Bế giảng…) và, nếu muốn, thêm cột "Giảng viên".
 *
 * Cách dùng (xem Documents/3-ky-thuat/google-sheet-sync.md):
 *  1. Mở Google Sheet chứa bảng Calendar → Tiện ích mở rộng (Extensions) → Apps Script → dán toàn bộ file này (tạo thêm một file .gs mới
 *     nếu đã có script đăng ký trong cùng dự án — hai script dùng tên khác nhau nên dùng chung được).
 *  2. Project Settings → Script properties: thêm
 *       SCHEDULE_URL = https://<tên-miền-web>/api/sync/schedule
 *       SYNC_TOKEN   = (cùng mã đồng bộ đang dùng cho Sheet đăng ký — do chủ dự án cấp; đã có sẵn nếu dán chung dự án với script đăng ký)
 *  3. Chạy hàm setupSchedule() một lần, cấp quyền khi được hỏi. Từ đó mỗi 5 phút script kiểm tra và chỉ gửi khi bảng đổi.
 *
 * Tab: tên "Calendar"/"Lịch"; không có thì tự tìm tab có ô tiêu đề "Khóa" và "Ngày".
 * AN TOÀN: chỉ đọc đúng các cột trong SCHEDULE_ALLOWED (đọc từng cột theo tên tiêu đề); danh sách này phải khớp
 * SCHEDULE_COLUMNS trong src/services/importSchedule.js (máy chủ cũng tự lọc lại). Không có dữ liệu học viên hay tiền.
 * Lịch trên web là BẢN SAO của bảng: sửa/xóa dòng trong Sheet thì web đổi theo.
 */
const SCHEDULE_SETTINGS = {
  SHEET_NAMES: ['Calendar', 'Lịch', 'Lich'],
  KEY_HEADERS: ['Khóa', 'Ngày'],
  MAX_HEADER_ROW: 10,
  FALLBACK_HEADER_ROW: 1,
  EVERY_MINUTES: 5,                  // chu kỳ kiểm tra (1, 5, 10, 15, 30)
  RESEND_AFTER_MINUTES: 60,          // không đổi gì vẫn gửi lại mỗi giờ một lần
};

const SCHEDULE_ALLOWED = ['NGÀY', 'BUỔI', 'KHÓA', 'NỘI DUNG', 'SỐ BUỔI', 'HÌNH THỨC', 'LOẠI', 'GHI CHÚ', 'GIẢNG VIÊN'];

/** Chạy MỘT lần: tạo bộ hẹn giờ rồi đồng bộ ngay. */
function setupSchedule() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SCHEDULE_URL') || !props.getProperty('SYNC_TOKEN')) {
    throw new Error('Thiếu SCHEDULE_URL hoặc SYNC_TOKEN: vào Project Settings → Script properties để thêm.');
  }
  stopSchedule();
  ScriptApp.newTrigger('syncSchedule').timeBased().everyMinutes(SCHEDULE_SETTINGS.EVERY_MINUTES).create();
  syncSchedule(true);
}

/** Gỡ bộ hẹn giờ lịch (tạm dừng đồng bộ lịch). */
function stopSchedule() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncSchedule'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** Được gọi theo hẹn giờ. Chỉ gửi khi bảng đổi (hoặc đã quá RESEND_AFTER_MINUTES); tham số sự kiện của trigger không phải "ép gửi". */
function syncSchedule(forceArg) {
  const force = forceArg === true;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SCHEDULE_URL');
    const token = props.getProperty('SYNC_TOKEN');
    if (!url || !token) throw new Error('Thiếu SCHEDULE_URL hoặc SYNC_TOKEN trong Script properties');

    const sheet = findScheduleSheet_(SpreadsheetApp.getActiveSpreadsheet());
    const table = sheet && readScheduleTable_(sheet);
    if (!table) throw new Error('Không thấy bảng lịch (cần tab Calendar hoặc tab có cột "Khóa" và "Ngày") hoặc bảng trống');

    const body = JSON.stringify({ schedule: table });
    const hash = scheduleHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8));
    const lastSent = Number(props.getProperty('SCHEDULE_LAST_SENT') || 0);
    const stale = Date.now() - lastSent > SCHEDULE_SETTINGS.RESEND_AFTER_MINUTES * 60 * 1000;
    if (!force && hash === props.getProperty('SCHEDULE_LAST_HASH') && !stale) return;

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      headers: { 'X-Sync-Token': token },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code !== 200) throw new Error('Máy chủ trả về ' + code + ': ' + res.getContentText().slice(0, 300));
    props.setProperty('SCHEDULE_LAST_HASH', hash);
    props.setProperty('SCHEDULE_LAST_SENT', String(Date.now()));
    const out = JSON.parse(res.getContentText());
    console.log('Đã đồng bộ lịch giảng dạy: ' + out.valid + '/' + out.rows + ' dòng hợp lệ · ' + out.inserted + ' buổi trên web');
    if (out.skipped_bad_date || out.skipped_no_course) console.log('Dòng bị bỏ qua: sai ngày=' + out.skipped_bad_date + ', thiếu khóa=' + out.skipped_no_course + ' · ví dụ: ' + JSON.stringify(out.examples));
    if (out.unknown_class) console.log('Khóa chưa có trong app (chỉ admin thấy): ' + JSON.stringify(out.examples.unknown_class));
  } finally {
    lock.releaseLock();
  }
}

/** Tìm tab lịch: theo tên ưu tiên, nếu không có thì tab đầu tiên có đủ ô tiêu đề KEY_HEADERS (TextFinder, không đọc giá trị ô khác). */
function findScheduleSheet_(ss) {
  const sheets = ss.getSheets();
  for (let i = 0; i < SCHEDULE_SETTINGS.SHEET_NAMES.length; i++) {
    const want = SCHEDULE_SETTINGS.SHEET_NAMES[i].toLowerCase();
    for (let j = 0; j < sheets.length; j++) {
      if (sheets[j].getName().toLowerCase() === want && findScheduleHeaderRow_(sheets[j])) return sheets[j];
    }
  }
  for (let j = 0; j < sheets.length; j++) {
    if (findScheduleHeaderRow_(sheets[j])) return sheets[j];
  }
  return null;
}

/** Dòng tiêu đề: dòng đầu tiên (trong MAX_HEADER_ROW) chứa đủ mọi KEY_HEADERS; 0 nếu không thấy. */
function findScheduleHeaderRow_(sheet) {
  let common = null;
  for (let k = 0; k < SCHEDULE_SETTINGS.KEY_HEADERS.length; k++) {
    const rows = {};
    sheet.createTextFinder(SCHEDULE_SETTINGS.KEY_HEADERS[k]).matchEntireCell(true).matchCase(false).findAll().forEach(function (r) {
      if (r.getRow() <= SCHEDULE_SETTINGS.MAX_HEADER_ROW) rows[r.getRow()] = true;
    });
    common = common === null ? rows : Object.keys(common).reduce(function (acc, key) { if (rows[key]) acc[key] = true; return acc; }, {});
  }
  const found = Object.keys(common || {}).map(Number).sort(function (a, b) { return a - b; });
  return found.length ? found[0] : 0;
}

/** Đọc bảng nhưng CHỈ các cột trong SCHEDULE_ALLOWED (từng cột một). Ngày đổi sang yyyy-MM-dd theo múi giờ của Sheet. */
function readScheduleTable_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headerRow = findScheduleHeaderRow_(sheet) || SCHEDULE_SETTINGS.FALLBACK_HEADER_ROW;
  if (lastRow <= headerRow || lastCol < 1) return null;
  const tz = sheet.getParent().getSpreadsheetTimeZone();

  const titles = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const cols = [];
  const seen = {};
  titles.forEach(function (v, i) {
    const name = String(v == null ? '' : v).trim().normalize('NFC').toUpperCase().replace(/\s+/g, ' ');
    if (SCHEDULE_ALLOWED.indexOf(name) >= 0 && !seen[name]) { seen[name] = true; cols.push({ name: name, index: i + 1 }); }
  });
  if (!seen['NGÀY'] || !seen['KHÓA']) return null;

  const n = lastRow - headerRow;
  const data = cols.map(function (c) {
    return sheet.getRange(headerRow + 1, c.index, n, 1).getValues().map(function (r) {
      let v = r[0];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      return v === '' ? null : v;
    });
  });
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = cols.map(function (_, c) { return data[c][r]; });
    if (row.some(function (v) { return v !== null; })) rows.push(row);
  }
  return { headers: cols.map(function (c) { return c.name; }), rows: rows };
}

function scheduleHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
