// Nhật ký sự kiện ghi danh (append-only): ai/khi nào/từ đâu thêm, đổi trạng thái, gỡ khỏi lớp học viên.
// Có chụp lại mã/tên học viên và mã lớp để vẫn đọc được khi bản ghi gốc đã bị xóa.
// q: db hoặc transaction (cần .run/.all). Ghi trong CÙNG transaction với thay đổi để không bao giờ lệch nhau.
const EVENTS = ['enrolled', 'status_changed', 'removed', 'missing_from_sheet', 'reappeared', 'graduation', 'sheet_status', 'moved_to_potential'];

async function logEvents(q, events) {
  if (!events.length) return 0;
  const col = (k) => events.map((e) => e[k] ?? null);
  await q.run(
    `insert into enrollment_events (enrollment_id, class_id, class_code, student_id, student_code, full_name,
                                    event, from_status, to_status, source, actor_id, actor_name, note)
     select * from unnest($1::bigint[], $2::bigint[], $3::text[], $4::bigint[], $5::text[], $6::text[],
                          $7::text[], $8::text[], $9::text[], $10::text[], $11::bigint[], $12::text[], $13::text[])`,
    [col('enrollment_id'), col('class_id'), col('class_code'), col('student_id'), col('student_code'), col('full_name'),
      col('event'), col('from_status'), col('to_status'), col('source'), col('actor_id'), col('actor_name'), col('note')]);
  return events.length;
}

// enrollment_id -> sự kiện gần nhất, trong các lớp đã cho.
async function latestEvents(q, classIds) {
  if (!classIds.length) return new Map();
  const rows = await q.all(
    `select distinct on (enrollment_id) enrollment_id, event from enrollment_events
     where class_id = any($1::bigint[]) and enrollment_id is not null order by enrollment_id, id desc`, [classIds]);
  return new Map(rows.map((r) => [r.enrollment_id, r.event]));
}

module.exports = { logEvents, latestEvents, EVENTS };
