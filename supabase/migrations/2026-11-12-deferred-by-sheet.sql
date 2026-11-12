-- Bảo lưu theo Google Sheet (chủ dự án chốt 12/11/2026): cột DEFERRAL STATUS = TRUE của sheet PERSONAL là bảo lưu của khóa ghi ở DEFERRAL COURSE.
-- Cờ này đánh dấu ghi danh bị chuyển sang "bảo lưu" BỞI SHEET (để khi Sheet bỏ tick thì trả về đang học; bảo lưu đặt tay trên web thì không bị đụng).
alter table enrollments add column if not exists deferred_by_sheet boolean not null default false;
