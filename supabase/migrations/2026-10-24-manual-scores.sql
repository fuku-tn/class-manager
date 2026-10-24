-- Điểm gõ tay trên web (admin + giảng viên của lớp). manual = true: file Excel "Chấm điểm" KHÔNG ghi đè và KHÔNG xóa (chủ dự án chốt 24/10/2026:
-- "giữ điểm gõ tay, Excel chỉ điền vào ô còn trống"). updated_by: người gõ điểm gần nhất.
alter table homework_scores add column if not exists manual boolean not null default false;
alter table homework_scores add column if not exists updated_by bigint references users(id) on delete set null;
