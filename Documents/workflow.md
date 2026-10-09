# Quy trình làm web

## 1. Cài đặt lần đầu
```
npm install
# tạo .env có DATABASE_URL của Supabase (xem supabase-guide.md)
npm run create-admin -- ban@vidu.com "Tên Bạn" matkhau-it-nhat-8-ky-tu
npm run import -- danh-sach-hoc-vien-mau.xlsx
npm start            # mở http://localhost:3000 và đăng nhập (PORT=3100 npm start nếu cổng bận)
```

## 2. Vòng lặp phát triển một tính năng
1. **Làm rõ yêu cầu** — ghi 2-3 dòng "Người dùng làm gì → thấy gì". Nếu đụng quy tắc tính toán, ghi giả định vào [memory.md](../memory.md) và hỏi chủ dự án.
2. **Dữ liệu** — cần bảng/cột mới? Sửa `src/schema.sql` **và** `supabase/schema.sql`, rồi chạy `create table`/`alter table` tương ứng trong Supabase SQL Editor (test dùng schema trong repo nên tự cập nhật; Supabase thì không). Bảng mới nhớ `enable row level security`.
3. **Backend** — route trong `src/routes/`, công thức trong `src/services/stats.js`.
4. **Test trước/cùng lúc** — thêm test vào `tests/` (xem [testing.md](testing.md)). `npm test` phải xanh.
5. **Frontend** — trang trong `public/js/pages/`, dùng `h()` và `formModal`. Chạy `npm run dev`, thử trên trình duyệt.
6. **Tài liệu** — cập nhật bảng API trong code-guide, `memory.md`; chuyển nội dung cũ vào `Archive.md`.
7. **Rà soát** — checklist bên dưới.

## 3. Checklist trước khi coi là xong
- [ ] `npm test` xanh
- [ ] Đã thử tay trên trình duyệt: luồng chính + 1 trường hợp lỗi (mất mạng/dữ liệu sai)
- [ ] Giảng viên không thấy/không sửa được lớp không được phân công
- [ ] Không có `innerHTML` với dữ liệu; SQL dùng `$1, $2…` (tham số hóa)
- [ ] Thông báo lỗi tiếng Việt, dễ hiểu
- [ ] Giao diện dùng được ở màn hình hẹp (điện thoại) — bảng cuộn ngang, cột tên cố định
- [ ] Tài liệu đã cập nhật

## 4. Làm việc với Excel
- Nhập: `npm run import -- <file.xlsx> [mã-lớp]` — chạy lại an toàn (cập nhật, không nhân đôi).
- Sau import, **đối soát**: số trên Dashboard phải khớp dòng 4 của Excel. File mẫu đã có test cho việc này.
- Cột mới ở Excel: map theo tên trong `services/importExcel.js`, thêm test.

## 5. Sao lưu & phát hành
- Sao lưu: dữ liệu ở Supabase — bật backup trong dashboard; có thể xuất CSV từng bảng ở Table Editor.
- Triển khai Vercel: xem [deploy-vercel.md](deploy-vercel.md). Triển khai nơi khác: đặt `NODE_ENV=production` (bật cookie Secure) và `DATABASE_URL` trong biến môi trường của nền tảng, chạy sau HTTPS. Có thể chạy nhiều tiến trình (DB tách riêng); lưu ý bộ đếm đăng nhập sai đang nằm trong bộ nhớ từng tiến trình.
- Đổi mật khẩu admin mặc định; mỗi giảng viên một tài khoản riêng.

## 6. Quy ước làm việc với Claude Code
- Bắt đầu phiên: Claude đọc `CLAUDE.md` → `memory.md`. Kết thúc: cập nhật `memory.md`.
- Dùng skill: `student-webapp-dev` (tính năng), `import-excel` (dữ liệu), `run-tests` (kiểm thử).
- Yêu cầu mơ hồ → Claude hỏi lại, không đoán quy tắc nghiệp vụ.
- Git: dự án chưa là git repo. Khi `git init`, `.gitignore` đã loại `.env`, `node_modules/`, `legacy/*.db`, `data/` và mọi file `.xlsx/.xls/.csv` (chứa dữ liệu học viên thật). Dùng repo **private**; kiểm tra `git status` trước lần push đầu.
