// Giai đoạn của lớp (múi giờ Việt Nam). "Ngày kết thúc" (end_date) là ngày của BUỔI HỌC CUỐI; lớp chưa xong ngay sau đó:
//   running    = từ ngày bắt đầu đến buổi cuối (đang học)
//   grading    = 14 ngày sau buổi cuối: nộp bài và chấm bài
//   graduation = 14 ngày tiếp theo: công bố danh sách tốt nghiệp
//   finished   = sau đó
//   upcoming   = sắp khai giảng · unknown = chưa có ngày bắt đầu
// Thiếu ngày kết thúc thì coi buổi cuối là sau ngày bắt đầu 90 ngày.
// LỚP B2B (mã lớp có chữ B ở phần thứ 3, vd P1.EBA.B071...): kết thúc NGAY TRONG NGÀY buổi cuối — không có 14 ngày
// nộp & chấm bài và 14 ngày công bố tốt nghiệp (chủ dự án chốt 2026-10-12).
const GRADING_DAYS = 14;
const GRADUATION_DAYS = 14;
const TODAY_SQL = "(now() at time zone 'Asia/Ho_Chi_Minh')::date";
const LAST_SESSION_SQL = '(coalesce(c.end_date, c.start_date + 90))';
const IS_B2B_CODE_SQL = "(left(split_part(c.code, '.', 3), 1) = 'B')";
const GRADING_SQL = `(case when ${IS_B2B_CODE_SQL} then 0 else ${GRADING_DAYS} end)`;
const GRADUATION_SQL = `(case when ${IS_B2B_CODE_SQL} then 0 else ${GRADUATION_DAYS} end)`;
const TIMING_SQL = `case
  when c.start_date is null then 'unknown'
  when c.start_date > ${TODAY_SQL} then 'upcoming'
  when ${LAST_SESSION_SQL} >= ${TODAY_SQL} then 'running'
  when ${LAST_SESSION_SQL} + ${GRADING_SQL} >= ${TODAY_SQL} then 'grading'
  when ${LAST_SESSION_SQL} + ${GRADING_SQL} + ${GRADUATION_SQL} >= ${TODAY_SQL} then 'graduation'
  else 'finished' end`;
// Các mốc ngày để hiển thị (NULL khi chưa có ngày bắt đầu).
const PHASE_DATES_SQL = `${LAST_SESSION_SQL} as last_session_date,
  ${LAST_SESSION_SQL} + ${GRADING_SQL} as grading_until,
  ${LAST_SESSION_SQL} + ${GRADING_SQL} + ${GRADUATION_SQL} as graduation_on`;
const ACTIVE_TIMINGS = ['running', 'grading', 'graduation'];
module.exports = { TODAY_SQL, TIMING_SQL, PHASE_DATES_SQL, GRADING_DAYS, GRADUATION_DAYS, ACTIVE_TIMINGS };
