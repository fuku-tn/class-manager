-- Voucher Google Maps của học viên (chủ dự án cho phép 22/10/2026, ngoại lệ có kiểm soát của quy tắc "không lưu tiền"):
-- chỉ admin và tài khoản được bật users.can_voucher (hiện: Đoàn Minh Lý) xem/sửa; nhập tay trên web, KHÔNG nhập từ Excel/Sheet.
-- Chạy trên Supabase TRƯỚC khi đẩy code (đăng nhập truy vấn cột can_voucher); an toàn chạy lại.
alter table users add column if not exists can_voucher boolean not null default false;
update users set can_voucher = true where email = 'ly.doan@starttrain.local';

create table if not exists enrollment_vouchers (
  enrollment_id   bigint primary key references enrollments(id) on delete cascade,
  amount          integer check (amount is null or (amount >= 0 and amount <= 100000000)),   -- VND
  sent_date       date,
  expiration_date date,
  status          text check (status is null or status = 'Used'),                            -- trống = chưa dùng
  updated_by      bigint references users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table enrollment_vouchers enable row level security;
