-- Nguồn của điểm không gõ tay: 'excel' (file "Chấm điểm.xlsx") hoặc 'sharepoint' (danh sách file bài làm Path/Name/Point qua Apps Script).
-- Excel chỉ xóa điểm do chính Excel nhập; điểm 'sharepoint' không bị Excel xóa.
alter table homework_scores add column if not exists source text not null default 'excel' check (source in ('excel','sharepoint'));
