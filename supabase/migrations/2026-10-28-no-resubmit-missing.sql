-- Bỏ trạng thái "Nộp lại" và "Thiếu" của bài tập (chủ dự án chốt 28/10/2026): chỉ còn "Đã nộp"; ô trống = chưa nộp.
-- Xóa các dòng không còn ý nghĩa (không có ghi chú/challenge); dòng có ghi chú vẫn giữ nhưng ứng dụng bỏ qua trạng thái cũ.
delete from submissions where status in ('resubmit', 'missing') and note is null and challenge is false;
