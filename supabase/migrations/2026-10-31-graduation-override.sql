-- Kết quả tốt nghiệp của lớp xét tự động có thể được admin chỉnh tay (vì có lúc điểm bị chấm sai ở một số bài).
-- Cờ này phân biệt "chỉnh tay" với kết quả chỉ được chốt lúc công bố.
alter table enrollments add column if not exists graduation_override boolean not null default false;
