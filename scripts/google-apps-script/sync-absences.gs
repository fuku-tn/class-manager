/**
 * Đọc EMAIL XIN NGHỈ HỌC trong hộp thư academicaffairs.ste@gmail.com → gửi sang Class Manager (webapp lớp học).
 * Luồng: học viên gửi academicaffairs@starttrain.edu.vn → Power Automate chuyển tiếp sang Gmail này → script này đẩy từng thư sang web.
 * Web tự nhận ra học viên (theo email người gửi), tìm NGÀY xin nghỉ trong tiêu đề/nội dung, rồi báo bằng chuông "Xin nghỉ" (chỉ báo NGÀY xin nghỉ, không xác định buổi).
 *
 * Cách dùng (xem Documents/3-ky-thuat/google-sheet-sync.md):
 *  1. Đăng nhập Gmail academicaffairs.ste@gmail.com → script.google.com → dự án mới (hoặc dự án đang có SYNC URL / SYNC TOKEN) → dán file này.
 *  2. Project Settings → Script properties: thêm
 *       ABSENCE_URL = https://<tên-miền-web>/api/sync/absences
 *       SYNC_TOKEN  = (cùng mã đồng bộ do chủ dự án cấp)
 *  3. Chạy hàm setupAbsences() một lần, cấp quyền đọc Gmail khi được hỏi. Từ đó mỗi 5 phút script gửi các thư xin nghỉ mới.
 *
 * QUAN TRỌNG — người gửi thật: thư chuyển tiếp có "From" là hộp thư chuyển tiếp, nên flow Power Automate phải giữ email học viên:
 *   đặt Reply-To = email người gửi gốc, HOẶC thêm vào đầu nội dung một dòng "From: <email người gửi gốc>". Máy chủ tự đọc cả hai.
 *
 * Nhãn Gmail do script tạo: "CM-da-gui" (đã xử lý), "CM-chua-khop" (không nhận ra học viên/ngày — kiểm tra email học viên trong app rồi
 * gỡ nhãn để gửi lại; script cũng tự thử lại 3 ngày). Máy chủ KHÔNG lưu email người gửi, tiêu đề hay nội dung thư — chỉ học viên + ngày nghỉ.
 */
const ABSENCE_SETTINGS = {
  QUERY: 'subject:(nghỉ OR nghi OR vắng OR vang OR "xin phép" OR "xin phep") newer_than:30d',
  LABEL_DONE: 'CM-da-gui',
  LABEL_UNMATCHED: 'CM-chua-khop',
  RETRY_UNMATCHED_DAYS: 3,
  EVERY_MINUTES: 5,
  MAX_PER_RUN: 50,
};

/** Chạy MỘT lần: tạo nhãn + bộ hẹn giờ, rồi gửi ngay. */
function setupAbsences() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ABSENCE_URL') || !props.getProperty('SYNC_TOKEN')) {
    throw new Error('Thiếu ABSENCE_URL hoặc SYNC_TOKEN: vào Project Settings → Script properties để thêm.');
  }
  stopAbsences();
  ScriptApp.newTrigger('syncAbsences').timeBased().everyMinutes(ABSENCE_SETTINGS.EVERY_MINUTES).create();
  syncAbsences();
}

/** Gỡ bộ hẹn giờ (tạm dừng). */
function stopAbsences() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncAbsences'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function label_(name) { return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); }

function syncAbsences() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('ABSENCE_URL');
    const token = props.getProperty('SYNC_TOKEN');
    if (!url || !token) throw new Error('Thiếu ABSENCE_URL hoặc SYNC_TOKEN trong Script properties');

    const done = label_(ABSENCE_SETTINGS.LABEL_DONE);
    const bad = label_(ABSENCE_SETTINGS.LABEL_UNMATCHED);
    const S = ABSENCE_SETTINGS;
    const fresh = GmailApp.search(S.QUERY + ' -label:' + S.LABEL_DONE + ' -label:' + S.LABEL_UNMATCHED, 0, S.MAX_PER_RUN);
    const retry = GmailApp.search(S.QUERY + ' label:' + S.LABEL_UNMATCHED + ' newer_than:' + S.RETRY_UNMATCHED_DAYS + 'd', 0, S.MAX_PER_RUN);
    const threads = fresh.concat(retry).slice(0, S.MAX_PER_RUN);
    if (!threads.length) return;

    const messages = [];
    const sent = [];   // chỉ đánh nhãn những chuỗi thư thật sự đã gửi (mỗi lượt tối đa 100 thư)
    threads.forEach(function (th) {
      if (messages.length + th.getMessageCount() > 100) return;
      sent.push(th);
      th.getMessages().forEach(function (m) {
        messages.push({
          id: m.getId(), from: m.getFrom(), replyTo: m.getReplyTo(), subject: m.getSubject(),
          body: m.getPlainBody().slice(0, 4000), received: m.getDate().toISOString(),
        });
      });
    });

    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-Sync-Token': token }, payload: JSON.stringify({ messages: messages }),
    });
    if (res.getResponseCode() !== 200) throw new Error('Máy chủ trả ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    const out = JSON.parse(res.getContentText());
    const unmatched = {};
    (out.unmatched_ids || []).forEach(function (id) { unmatched[id] = true; });
    sent.forEach(function (th) {
      const ids = th.getMessages().map(function (m) { return m.getId(); });
      const miss = ids.some(function (id) { return unmatched[id]; });
      if (miss) { th.addLabel(bad); } else { th.addLabel(done); th.removeLabel(bad); }
    });
    console.log('Đã gửi ' + messages.length + ' thư: khớp ' + out.matched + ', thêm ngày nghỉ ' + out.added + ', trùng ' + out.duplicates +
      ', chưa khớp ' + (out.unmatched + out.no_sender + out.no_date));
  } finally {
    lock.releaseLock();
  }
}
