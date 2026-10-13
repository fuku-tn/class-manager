-- Giáo trình mặc định: EBA = 6 buổi, PBM = 10 buổi (chủ dự án chốt 13/10/2026); 7 lớp BIE thực tế 12 buổi chuyển sang BIE-12.
-- Chưa có tên buổi/module (chủ dự án sẽ đưa file session-management sau). Chạy trên Supabase; an toàn chạy lại.
insert into curricula (code, program, name, session_count, total_hours) values
  ('EBA-6',  'EBA', 'Excel for Business Analytics — 6 buổi', 6, 0),
  ('PBM-10', 'PBM', 'Practical Business Management — 10 buổi', 10, 0)
on conflict (code) do nothing;

insert into curriculum_items (curriculum_id, session_no, seq)
select c.id, n, 1 from curricula c cross join generate_series(1, c.session_count) n
 where c.code in ('EBA-6', 'PBM-10')
on conflict (curriculum_id, session_no, seq) do nothing;

update classes set curriculum_id = (select id from curricula where code = 'BIE-12')
 where short_code in ('BIE068', 'BIE075', 'BIE078', 'BIE081', 'BIE085', 'BIE090', 'BIE092');
