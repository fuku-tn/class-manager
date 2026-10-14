---
name: run-tests
description: Chạy, đọc kết quả và viết thêm test cho webapp Class Manager (node:test). Dùng sau mỗi thay đổi code, khi người dùng nói "chạy test", "kiểm thử", hoặc khi cần thêm test cho tính năng/bug mới.
---

# Kiểm thử

## Chạy
`npm test` — dùng PGlite (Postgres trong bộ nhớ), không đụng Supabase, ~15 giây. Chi tiết chiến lược: `Documents/3-ky-thuat/testing.md`.

## Đọc kết quả
- Báo đúng số liệu `pass/fail` từ output; nếu fail, dán tên test + thông điệp assert, rồi tìm nguyên nhân gốc (đừng sửa test cho khớp code trừ khi test sai thật).
- Test bị `skip` (vd file Excel mẫu không có) phải nêu ra, không tính là đã kiểm.

## Viết test mới
1. Dùng `startTestApp()` trong `tests/helpers.js` (`t.addUser`, `t.login`, `t.client`).
2. Mỗi thay đổi: đường đi đúng + một đầu vào sai (400/404/409) + kiểm tra quyền (401/403) nếu có.
3. Công thức: dựng ví dụ nhỏ, tự tính số mong đợi bằng tay.
4. Import: dùng `await openDb({ memory: true })` + `importExcel`.

## Phần test tự động không phủ
Giao diện trình duyệt (chưa có E2E). Luôn nói rõ điều này khi báo cáo; đưa người dùng checklist thử tay trong `Documents/3-ky-thuat/testing.md` hoặc tự mở app (`npm run dev`) nếu có công cụ trình duyệt.
