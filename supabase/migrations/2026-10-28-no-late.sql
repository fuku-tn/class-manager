-- Bỏ trạng thái "đi trễ" khỏi điểm danh (chủ dự án chốt 28/10/2026): ai đang bị đánh trễ thì đổi thành có mặt.
-- Chỉ đổi dữ liệu, không đổi schema (CHECK vẫn cho phép 'late' nhưng ứng dụng không còn ghi/đọc trạng thái này).
update attendance set status = 'present' where status = 'late';
