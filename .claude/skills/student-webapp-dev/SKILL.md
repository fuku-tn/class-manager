---
name: student-webapp-dev
description: Thêm hoặc sửa tính năng của webapp quản lý lớp học (học viên, điểm danh, bài tập, dashboard) đúng kiến trúc và quy tắc của project. Dùng khi người dùng yêu cầu tính năng mới, sửa lỗi, thêm trang/endpoint/cột dữ liệu trong project Class Manager.
---

# Phát triển webapp quản lý lớp

## Trước khi code
1. Đọc `CLAUDE.md` (quy tắc bắt buộc) và `memory.md` (giả định/việc dở).
2. Đọc `Documents/1-tong-quan/context.md` nếu yêu cầu liên quan đến cách tính tỉ lệ, trạng thái, Excel.
3. Yêu cầu mơ hồ về **quy tắc nghiệp vụ** (ai được tính, tính thế nào) → hỏi người dùng; không tự đoán. Ghi giả định mới vào `memory.md`.

## Các bước
1. **Dữ liệu:** sửa `src/schema.sql` **và** `supabase/schema.sql`; đưa câu `alter table`/`create table` để chạy trên Supabase. Bảng mới bật RLS.
2. **Backend:** route ở `src/routes/` (theo lớp → `classData.js`, đã có `requireClassAccess`). Validate bằng danh sách cho phép; kiểm tra đối tượng thuộc đúng `req.cls`; ghi nhiều bước → `db.tx()`. SQL dùng `$1…` qua `db.all/one/run/tx` (async).
3. **Công thức:** chỉ trong `src/services/stats.js`.
4. **Frontend:** trang ở `public/js/pages/`, đăng ký trong `main.js` nếu là trang mới. Dựng DOM bằng `h()`; không `innerHTML` với dữ liệu. Có trạng thái rỗng, lỗi (toast tiếng Việt), dùng được ở màn hình hẹp.
5. **Test:** thêm vào `tests/` (xem skill `run-tests`): đường đi đúng + đầu vào sai + quyền truy cập.
6. **Tài liệu:** cập nhật bảng API trong `Documents/3-ky-thuat/code-guide.md`; ghi quyết định vào `memory.md`; nội dung lỗi thời → `Archive.md`.

## Đừng
- Tính tỉ lệ ở frontend hoặc lặp công thức ở nhiều chỗ.
- Thêm thư viện nặng khi vài chục dòng JS là đủ (project cố tình ít phụ thuộc).
- Lặp truy vấn từng dòng tới Supabase (chậm) — dùng `unnest`/`Promise.all`.
- Ghi thử nghiệm lên Supabase thật khi không cần; `npm test` dùng PGlite.
- Nói "xong" khi chưa chạy `npm test`; nói rõ phần giao diện nào chưa thử trên trình duyệt.
