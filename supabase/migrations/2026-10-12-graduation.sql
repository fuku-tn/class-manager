-- Danh sách tốt nghiệp: quy tắc theo giáo trình, quyết định theo ghi danh, công bố theo lớp. Chạy trên Supabase; an toàn chạy lại.
alter table curricula add column if not exists grad_attendance_min numeric(3,2) not null default 0.80;
alter table curricula add column if not exists grad_hw_pool integer;
alter table curricula add column if not exists grad_hw_min integer;
alter table curricula add column if not exists grad_capstone boolean not null default false;

alter table classes add column if not exists graduation_published_at timestamptz;
alter table classes add column if not exists graduation_published_by bigint references users(id) on delete set null;

alter table enrollments add column if not exists graduation_status text not null default 'pending';
alter table enrollments drop constraint if exists enrollments_graduation_status_check;
alter table enrollments add constraint enrollments_graduation_status_check check (graduation_status in ('pending','passed','failed'));
alter table enrollments add column if not exists graduation_note text;
alter table enrollments add column if not exists graduation_by bigint references users(id) on delete set null;
alter table enrollments add column if not exists graduation_at timestamptz;
alter table enrollments add column if not exists certificate_number text;
alter table enrollments add column if not exists certificate_sent_date date;

alter table enrollment_events drop constraint if exists enrollment_events_event_check;
alter table enrollment_events add constraint enrollment_events_event_check
  check (event in ('enrolled','status_changed','removed','missing_from_sheet','reappeared','graduation'));

-- Quy tắc ban đầu theo cột ELIGIBLE trong Excel (chủ dự án có thể sửa trong ứng dụng):
update curricula set grad_attendance_min = 0.80, grad_hw_pool = 2,    grad_hw_min = 2, grad_capstone = true where code = 'BIE-8';
update curricula set grad_attendance_min = 0.80, grad_hw_pool = 7,    grad_hw_min = 5, grad_capstone = true where code = 'BIE-12';
update curricula set grad_attendance_min = 0.80, grad_hw_pool = 5,    grad_hw_min = 5, grad_capstone = true where code in ('BIH-20', 'BIH-11');
