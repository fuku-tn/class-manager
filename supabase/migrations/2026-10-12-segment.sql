-- Phân loại B2C/B2B cho từng ghi danh + tên công ty (học viên từ tab COMPANY của Google Sheet). Chạy trên Supabase; an toàn chạy lại.
alter table enrollments add column if not exists segment text not null default 'b2c';
alter table enrollments drop constraint if exists enrollments_segment_check;
alter table enrollments add constraint enrollments_segment_check check (segment in ('b2c','b2b'));
alter table enrollments add column if not exists company_name text;
-- Ghi danh đã có trong lớp mang mã B (lớp B2B): coi là B2B.
update enrollments e set segment = 'b2b' from classes c
  where c.id = e.class_id and left(split_part(c.code, '.', 3), 1) = 'B' and e.segment = 'b2c';
