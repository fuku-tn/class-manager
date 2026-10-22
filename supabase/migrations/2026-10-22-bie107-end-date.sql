-- BIE107 (B2B): buổi học cuối 10/11/2026. Lớp B2B không có giai đoạn chấm bài nên kết thúc ngay trong ngày này (services/timing.js).
update classes set end_date = '2026-11-10' where short_code = 'BIE107' and end_date is null;
