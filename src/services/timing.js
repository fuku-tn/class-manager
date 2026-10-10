// Phân loại lớp theo thời gian (múi giờ Việt Nam): running = đang diễn ra, upcoming = sắp khai giảng,
// finished = đã kết thúc, unknown = chưa có ngày bắt đầu. Thiếu ngày kết thúc thì coi lớp kéo dài 90 ngày.
const TODAY_SQL = "(now() at time zone 'Asia/Ho_Chi_Minh')::date";
const TIMING_SQL = `case
  when c.start_date is null then 'unknown'
  when c.start_date > ${TODAY_SQL} then 'upcoming'
  when coalesce(c.end_date, c.start_date + 90) < ${TODAY_SQL} then 'finished'
  else 'running' end`;
module.exports = { TODAY_SQL, TIMING_SQL };
