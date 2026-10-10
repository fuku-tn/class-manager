-- Chỉ mục cho khóa ngoại hay được dùng để tra cứu/xóa theo cột đó (gợi ý từ schema-guard).
-- Chỉ THÊM chỉ mục, không đổi dữ liệu. An toàn chạy lại.
create index if not exists idx_class_instructors_user on class_instructors (user_id);
create index if not exists idx_auth_sessions_user on auth_sessions (user_id);
create index if not exists idx_enrollments_student on enrollments (student_id);
create index if not exists idx_classes_curriculum on classes (curriculum_id);
