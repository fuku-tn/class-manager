-- Loại bài "Mini Project" (kind = 'mini', MP1, MP2…): điểm đến từ Google Sheet bảng điểm ("Mini Project 1"…).
-- Không tính vào % hoàn thành HW hay quy tắc tốt nghiệp. Chạy trên Supabase TRƯỚC khi đẩy code; an toàn chạy lại.
alter table assignments drop constraint if exists assignments_kind_check;
alter table assignments add constraint assignments_kind_check check (kind in ('hw', 'capstone', 'mini'));
