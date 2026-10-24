-- Mọi lớp EBA có 4 HW + 1 Capstone Project (chủ dự án chốt 24/10/2026). Chỉ THÊM bài còn thiếu (cột trống), không xóa/sửa bài hay tick đã có.
insert into assignments (class_id, kind, seq, title)
select c.id, b.kind, b.seq, b.title
  from classes c
 cross join (values ('hw', 1, 'HW 1'), ('hw', 2, 'HW 2'), ('hw', 3, 'HW 3'), ('hw', 4, 'HW 4'), ('capstone', 1, 'Capstone Project')) as b(kind, seq, title)
 where c.short_code ~ '^EBA[0-9]+$'
on conflict (class_id, kind, seq) do nothing;
