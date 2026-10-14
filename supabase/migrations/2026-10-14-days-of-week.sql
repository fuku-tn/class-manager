-- Thứ học của lớp (cột DAYS OF WEEK tab COURSE, vd "24" = Thứ 2 & Thứ 4, "78" = Thứ 7 & CN). Chạy trên Supabase; an toàn chạy lại.
alter table classes add column if not exists days_of_week text;
