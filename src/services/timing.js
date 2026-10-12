// Giai đoạn của lớp (múi giờ Việt Nam). "Ngày kết thúc" (end_date) là ngày của BUỔI HỌC CUỐI; lớp chưa xong ngay sau đó:
//   running    = từ ngày bắt đầu đến buổi cuối (đang học)
//   grading    = 14 ngày sau buổi cuối: nộp bài và chấm bài
//   graduation = 14 ngày tiếp theo: công bố danh sách tốt nghiệp
//   finished   = sau đó
//   upcoming   = sắp khai giảng · unknown = chưa có ngày bắt đầu
// Thiếu ngày kết thúc thì coi buổi cuối là sau ngày bắt đầu 90 ngày.
const GRADING_DAYS = 14;
const GRADUATION_DAYS = 14;
const TODAY_SQL = "(now() at time zone 'Asia/Ho_Chi_Minh')::date";
const LAST_SESSION_SQL = '(coalesce(c.end_date, c.start_date + 90))';
const TIMING_SQL = `case
  when c.start_date is null then 'unknown'
  when c.start_date > ${TODAY_SQL} then 'upcoming'
  when ${LAST_SESSION_SQL} >= ${TODAY_SQL} then 'running'
  when ${LAST_SESSION_SQL} + ${GRADING_DAYS} >= ${TODAY_SQL} then 'grading'
  when ${LAST_SESSION_SQL} + ${GRADING_DAYS + GRADUATION_DAYS} >= ${TODAY_SQL} then 'graduation'
  else 'finished' end`;
// Các mốc ngày để hiển thị (NULL khi chưa có ngày bắt đầu).
const PHASE_DATES_SQL = `${LAST_SESSION_SQL} as last_session_date,
  ${LAST_SESSION_SQL} + ${GRADING_DAYS} as grading_until,
  ${LAST_SESSION_SQL} + ${GRADING_DAYS + GRADUATION_DAYS} as graduation_on`;
const ACTIVE_TIMINGS = ['running', 'grading', 'graduation'];
module.exports = { TODAY_SQL, TIMING_SQL, PHASE_DATES_SQL, GRADING_DAYS, GRADUATION_DAYS, ACTIVE_TIMINGS };
