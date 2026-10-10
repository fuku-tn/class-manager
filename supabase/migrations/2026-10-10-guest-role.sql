-- Thêm vai trò 'guest' (chỉ xem). Chạy trên Supabase SQL Editor; an toàn chạy lại.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin','instructor','guest'));
