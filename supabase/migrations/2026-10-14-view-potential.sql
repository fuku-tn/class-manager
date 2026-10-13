-- Danh sách Potential chỉ cho admin và tài khoản được bật can_view_potential (hiện: Đoàn Ly). Chạy trên Supabase; an toàn chạy lại.
alter table users add column if not exists can_view_potential boolean not null default false;
update users set can_view_potential = true where email = 'ly.doan@starttrain.local';
