-- Nhắc homework: quyền dùng (can_remind), xưng hô/tên gọi theo học viên, cấu hình theo lớp. Chạy trên Supabase; an toàn chạy lại.
alter table users add column if not exists can_remind boolean not null default false;

alter table students add column if not exists honorific text;
alter table students drop constraint if exists students_honorific_check;
alter table students add constraint students_honorific_check check (honorific in ('Anh','Chị'));
alter table students add column if not exists call_name text;

create table if not exists remind_config (
  class_id       bigint primary key references classes(id) on delete cascade,
  cls_label      text,
  scope          text,
  overview_title text,
  min_group      integer not null default 1 check (min_group >= 1),
  theme          text,
  updated_by     bigint references users(id) on delete set null,
  updated_at     timestamptz not null default now()
);
alter table remind_config enable row level security;

-- Chủ dự án chốt (2026-10-12): admin + Thuận, Trung, Tuấn được dùng tin nhắn/chụp ảnh; Phạm Hoài An chỉ xem từng học viên.
update users set can_remind = true where email in ('thuan.pham@starttrain.local', 'trung.phan@starttrain.local', 'tuan.ho@starttrain.local');
update users set can_remind = false where email = 'an.pham@starttrain.local';
