/**
 * Đồng bộ ĐIỂM BÀI TẬP từ danh sách file bài làm trên SharePoint → Class Manager (webapp lớp học).
 * Bảng nguồn (một tab trong Google Sheet, do Power Automate ghi hoặc dán từ scores_STARTTRAIN.csv) có 3 cột:
 *   Path (hoặc Key) = "Shared Documents/STARTTRAIN/<CHƯƠNG TRÌNH>/<LỚP>/<TÊN HỌC VIÊN>/[HW1/Basic/…]/<tên file>"
 *   Name  = tên file
 *   Point = điểm chấm cho file đó
 * Web tự suy ra lớp, học viên (ghép theo tên), bài (HW1…, Mini Project, Capstone) từ Path; điểm của một bài = TỔNG điểm các file (tối đa 10).
 *
 * Cách dùng (xem Documents/3-ky-thuat/google-sheet-sync.md):
 *  1. Mở Google Sheet chứa tab điểm → Tiện ích mở rộng (Extensions) → Apps Script → tạo file .gs mới, dán toàn bộ file này.
 *  2. Project Settings → Script properties: thêm
 *       SCORE_FILES_URL = https://<tên-miền-web>/api/sync/score-files
 *       SYNC_TOKEN      = (cùng mã đồng bộ do chủ dự án cấp; đã có sẵn nếu dán chung dự án với các script khác)
 *  3. Chạy hàm setupScoreFiles() một lần, cấp quyền khi được hỏi. Từ đó mỗi 30 phút script kiểm tra và chỉ gửi khi bảng đổi.
 *
 * Tab: tên "scores_STARTTRAIN"/"Scores"/"Điểm"; không có thì tự tìm tab có ô tiêu đề "Path" (hoặc "Key") và "Point". Cột khác (UpdatedAt…) được bỏ qua.
 * AN TOÀN: chỉ đọc 3 cột Path, Name, Point và chỉ gửi dòng có điểm. Web KHÔNG lưu đường dẫn/tên học viên; không có dữ liệu tiền.
 * Thứ tự ưu tiên điểm trên web: gõ tay > file Excel "Chấm điểm" > nguồn SharePoint này (chỉ điền ô còn trống và cập nhật điểm do chính nó nhập;
 * không xóa điểm nào). Một lượt gửi tối đa ~15.000 dòng có điểm (cả bảng phải nằm trong MỘT lượt vì điểm = tổng các file).
 */
const SCORE_FILES_SETTINGS = {
  SHEET_NAMES: ['scores_STARTTRAIN', 'Scores', 'Điểm', 'Diem'],
  PATH_HEADERS: ['Path', 'Key'],     // tên cột đường dẫn: "Path" hoặc "Key" (bảng Power Automate dùng "Key")
  POINT_HEADER: 'Point',
  MAX_HEADER_ROW: 10,
  EVERY_MINUTES: 30,                 // chu kỳ kiểm tra (1, 5, 10, 15, 30)
  RESEND_AFTER_MINUTES: 180,         // không đổi gì vẫn gửi lại mỗi 3 giờ một lần
  MAX_ROWS: 15000,
};
const SCORE_FILES_COLUMNS = ['PATH', 'NAME', 'POINT'];

/** Chạy MỘT lần: tạo bộ hẹn giờ rồi đồng bộ ngay. */
function setupScoreFiles() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SCORE_FILES_URL') || !props.getProperty('SYNC_TOKEN')) {
    throw new Error('Thiếu SCORE_FILES_URL hoặc SYNC_TOKEN: vào Project Settings → Script properties để thêm.');
  }
  stopScoreFiles();
  ScriptApp.newTrigger('syncScoreFiles').timeBased().everyMinutes(SCORE_FILES_SETTINGS.EVERY_MINUTES).create();
  syncScoreFiles(true);
}

/** Gỡ bộ hẹn giờ (tạm dừng đồng bộ điểm file). */
function stopScoreFiles() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncScoreFiles'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** Theo hẹn giờ: chỉ gửi khi bảng đổi (hoặc quá RESEND_AFTER_MINUTES). Tham số sự kiện của trigger không phải "ép gửi". */
function syncScoreFiles(forceArg) {
  const force = forceArg === true;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SCORE_FILES_URL');
    const token = props.getProperty('SYNC_TOKEN');
    if (!url || !token) throw new Error('Thiếu SCORE_FILES_URL hoặc SYNC_TOKEN trong Script properties');

    const sheet = findScoreFilesSheet_(SpreadsheetApp.getActiveSpreadsheet());
    const table = sheet && readScoreFilesTable_(sheet);
    if (!table) throw new Error('Không tìm thấy tab điểm (cần tiêu đề Path hoặc Key, và Point)');
    if (table.rows.length > SCORE_FILES_SETTINGS.MAX_ROWS) {
      throw new Error('Bảng có ' + table.rows.length + ' dòng có điểm, vượt giới hạn ' + SCORE_FILES_SETTINGS.MAX_ROWS + ' dòng/lượt — hãy lọc bớt (vd chỉ giữ các lớp đang học)');
    }

    const payload = JSON.stringify({ files: table });
    const digest = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload));
    const last = Number(props.getProperty('SCOREFILES_LAST_SENT') || 0);
    const unchanged = props.getProperty('SCOREFILES_DIGEST') === digest;
    if (!force && unchanged && Date.now() - last < SCORE_FILES_SETTINGS.RESEND_AFTER_MINUTES * 60000) return;

    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-Sync-Token': token }, payload: payload,
    });
    const code = res.getResponseCode();
    if (code !== 200) throw new Error('Máy chủ trả ' + code + ': ' + res.getContentText().slice(0, 300));
    const out = JSON.parse(res.getContentText());
    props.setProperty('SCOREFILES_DIGEST', digest);
    props.setProperty('SCOREFILES_LAST_SENT', String(Date.now()));
    console.log('Điểm file: ' + table.rows.length + ' dòng gửi · ghép được ' + out.matched + ' bài · thêm mới ' + out.inserted + ' · cập nhật ' + out.updated +
      ' · không ghép được tên ' + out.unmatched_students + ' · tên trùng ' + out.ambiguous_students + ' · bỏ qua không nhận ra bài ' + out.skipped_no_item +
      (out.skipped_no_assignment ? ' · bài chưa có trong lớp ' + out.skipped_no_assignment : ''));
  } finally {
    lock.releaseLock();
  }
}

function norm_(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, ' '); }

function findScoreFilesSheet_(ss) {
  const wanted = SCORE_FILES_SETTINGS.SHEET_NAMES.map(norm_);
  const sheets = ss.getSheets();
  const byName = sheets.filter(function (s) { return wanted.indexOf(norm_(s.getName())) >= 0; })[0];
  if (byName) return byName;
  return sheets.filter(function (s) { return findScoreFilesHeader_(s) !== null; })[0] || null;
}

/** Tìm hàng tiêu đề (trong MAX_HEADER_ROW hàng đầu) có cột đường dẫn (Path/Key) và Point; trả { row (1-based), index: {PATH, NAME, POINT} } hoặc null. */
function findScoreFilesHeader_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1 || sheet.getLastRow() < 1) return null;
  const top = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), SCORE_FILES_SETTINGS.MAX_HEADER_ROW), lastCol).getValues();
  for (let r = 0; r < top.length; r++) {
    const cells = top[r].map(norm_);
    const pathAt = SCORE_FILES_SETTINGS.PATH_HEADERS.map(function (k) { return cells.indexOf(norm_(k)); }).filter(function (i) { return i >= 0; })[0];
    const pointAt = cells.indexOf(norm_(SCORE_FILES_SETTINGS.POINT_HEADER));
    if (pathAt === undefined || pointAt < 0) continue;
    const nameAt = cells.indexOf('NAME');
    const index = { PATH: pathAt, POINT: pointAt };
    if (nameAt >= 0) index.NAME = nameAt;
    return { row: r + 1, index: index };
  }
  return null;
}

/** Chỉ đọc 3 cột Path, Name, Point; chỉ giữ dòng có điểm. */
function readScoreFilesTable_(sheet) {
  const head = findScoreFilesHeader_(sheet);
  if (!head) return null;
  const nRows = sheet.getLastRow() - head.row;
  if (nRows < 1) return { headers: SCORE_FILES_COLUMNS.slice(), rows: [] };
  const values = sheet.getRange(head.row + 1, 1, nRows, sheet.getLastColumn()).getValues();
  const rows = [];
  values.forEach(function (v) {
    const point = v[head.index.POINT];
    if (point === '' || point === null) return;
    rows.push([String(v[head.index.PATH] == null ? '' : v[head.index.PATH]), head.index.NAME == null ? '' : String(v[head.index.NAME] == null ? '' : v[head.index.NAME]), point]);
  });
  return { headers: SCORE_FILES_COLUMNS.slice(), rows: rows };
}
