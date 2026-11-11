-- Quyền theo lớp (chủ dự án chốt 11/11/2026): mọi tài khoản XEM được mọi lớp (đã/đang/sắp diễn ra); ai không được phân công thì chỉ xem.
-- Cờ này cho phép một tài khoản SỬA mọi lớp (như giảng viên được phân công vào tất cả lớp), vẫn thua admin (không tạo/xóa lớp, không quản lý người dùng).
alter table users add column if not exists can_all_classes boolean not null default false;
