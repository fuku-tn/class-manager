-- Trạng thái quy tắc tốt nghiệp: none = chưa có quy định (không gợi ý), provisional = tạm theo Excel cũ (chờ xác nhận),
-- confirmed = admin đã lưu/xác nhận. Chạy trên Supabase; an toàn chạy lại.
alter table curricula add column if not exists grad_rules_status text not null default 'none';
alter table curricula drop constraint if exists curricula_grad_rules_status_check;
alter table curricula add constraint curricula_grad_rules_status_check check (grad_rules_status in ('none','provisional','confirmed'));

-- Quy tắc lấy từ công thức Excel cũ: chỉ là tạm thời (chủ dự án sẽ cung cấp điều kiện tốt nghiệp chính thức).
update curricula set grad_rules_status = 'provisional' where code in ('BIE-8', 'BIE-12', 'BIH-20') and grad_rules_status = 'none';
-- BIH-11: chủ dự án yêu cầu khoan, gỡ quy tắc đã đặt.
update curricula set grad_attendance_min = 0.80, grad_hw_pool = null, grad_hw_min = null, grad_capstone = false, grad_rules_status = 'none'
  where code = 'BIH-11' and grad_rules_status <> 'confirmed';
