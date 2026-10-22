-- Thiết lập lớp theo yêu cầu chủ dự án 22/10/2026. An toàn chạy lại (chỉ thêm chỗ thiếu; chỉ xóa bài tập trống).
-- 1) BIE107 (lớp B2B, trong tab COMPANY): giáo trình BIE-6 = 6 buổi; bài tập = HW1, HW2, Mini Project 1.
insert into curricula (code, program, name, session_count) values ('BIE-6', 'BIE', 'Business Intelligence Essentials — 6 buổi (B2B)', 6)
  on conflict (code) do nothing;
insert into curriculum_items (curriculum_id, session_no, seq)
  select cu.id, n, 1 from curricula cu, generate_series(1, 6) n
   where cu.code = 'BIE-6' and not exists (select 1 from curriculum_items i where i.curriculum_id = cu.id);
insert into classes (code, name, short_code, program, delivery_mode, shift, start_date, curriculum_id)
  select 'P2.BIE.B107.HY.MA.161026', 'Business Intelligence Essentials — BIE107', 'BIE107', 'BIE', 'Hybrid', 'full_day', '2026-10-16', cu.id
    from curricula cu where cu.code = 'BIE-6'
  on conflict (code) do nothing;
insert into sessions (class_id, session_no, title)
  select c.id, n, 'Buổi ' || n from classes c, generate_series(1, 6) n where c.short_code = 'BIE107'
  on conflict (class_id, session_no) do nothing;
insert into assignments (class_id, kind, seq, title)
  select c.id, v.k, v.s, v.t from classes c, (values ('hw', 1, 'HW 1'), ('hw', 2, 'HW 2'), ('mini', 1, 'Mini Project 1')) as v(k, s, t)
   where c.short_code = 'BIE107'
  on conflict (class_id, kind, seq) do nothing;

-- 2) BIH100: thêm 1 cột điểm danh (buổi 23).
insert into sessions (class_id, session_no, title)
  select c.id, 23, 'Buổi 23' from classes c where c.short_code = 'BIH100'
  on conflict (class_id, session_no) do nothing;

-- 3) SCA, PBM: mỗi lớp 4 HW (thêm HW1–HW4 còn thiếu; bỏ HW5+/Capstone nếu chưa có tick hay điểm nào).
insert into assignments (class_id, kind, seq, title)
  select c.id, 'hw', n, 'HW ' || n from classes c, generate_series(1, 4) n where c.program in ('SCA', 'PBM')
  on conflict (class_id, kind, seq) do nothing;
delete from assignments a using classes c
 where c.id = a.class_id and c.program in ('SCA', 'PBM') and ((a.kind = 'hw' and a.seq > 4) or a.kind = 'capstone')
   and not exists (select 1 from submissions s where s.assignment_id = a.id)
   and not exists (select 1 from homework_scores h where h.assignment_id = a.id);
