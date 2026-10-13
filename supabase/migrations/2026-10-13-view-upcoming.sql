-- Quyền xem (chỉ xem) mọi lớp CHƯA DIỄN RA, không cần được phân công. Chạy trên Supabase; an toàn chạy lại.
alter table users add column if not exists can_view_upcoming boolean not null default false;
update users set can_view_upcoming = true where email = 'ly.doan@starttrain.local';
