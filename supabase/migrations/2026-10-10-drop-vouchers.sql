-- Chủ dự án yêu cầu bỏ voucher (dữ liệu liên quan đến tiền). Xóa vĩnh viễn bảng vouchers.
-- Chạy SAU khi bản code không còn tham chiếu bảng này đã được triển khai.
drop table if exists vouchers;
