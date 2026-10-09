---
name: import-excel
description: Nhập hoặc đối soát danh sách học viên, điểm danh, bài tập từ file Excel của lớp vào database của webapp Class Manager. Dùng khi người dùng đưa file .xlsx lớp mới, muốn cập nhật lớp từ Excel, hoặc kiểm tra số liệu webapp có khớp Excel không.
---

# Nhập & đối soát Excel

## Cấu trúc file được hỗ trợ
Mô tả đầy đủ ở `Documents/context.md` (mục "File Excel mẫu"). Tóm tắt: **dòng 5 = tiêu đề, dữ liệu từ dòng 6**; cột nhận theo **tên** (`STUDENT ID`, `FULL NAME`, `COURSE ID`, `SESSION n`/`NOTE SSn`, `HOMEWORK n`/`NOTE HWn`, `CAPSTONE PROJECT`/`NOTE CP`, `VOUCHER …`). Giá trị `X` = có mặt/đã nộp.

## Quy trình
1. **Xem trước file** (đừng nhập mù): đọc tiêu đề, đếm dòng, liệt kê giá trị lạ ở ô điểm danh/bài (ngoài `X`/trống), `COURSE ID` có nhiều giá trị không, `MODE` ngoài Online/Offline/Hybrid. Với Python trên Windows dùng `python -I -X utf8`.
2. **Báo người dùng** những điểm lệch so với mẫu; hỏi nếu có cột mới chưa biết nghĩa.
3. **Nhập:** `npm run import -- <file.xlsx> [mã-lớp]`. Chạy lại an toàn (cập nhật, không nhân đôi). Lệnh ghi thẳng vào Supabase (theo `DATABASE_URL` trong `.env`): mỗi COURSE ID thành một lớp; ghi đè điểm danh/bài của học viên có trong file — nói rõ với người dùng nếu họ đã sửa tay trên web.
4. **Đối soát:** dòng 4 của Excel chứa số có mặt/nộp từng buổi/bài. So với Dashboard (hoặc `buildDashboard`). Với file mẫu: buổi `[35,38,40,36,38,32,35,33]`, nộp `[42,38,39,37,27,0,32]`. Cột `ATTENDANCE RATE` trong Excel phải ≈ tỉ lệ webapp tính (vd 6/8 = 0.75).
5. In kết quả: số học viên, số mới, cảnh báo. Nêu rõ dòng bị bỏ qua.

## Quy tắc chuyển đổi (xem `src/services/importExcel.js`)
- Buổi/bài **không ai có dấu X** = chưa diễn ra/chưa thu → không tạo bản ghi (không kéo tụt tỉ lệ).
- Ô trống ở buổi đã diễn ra = `absent`; ở bài đã thu = `missing`. Ghi chú có "trễ" + `X` → `late`.
- Ghi chú chứa "Challenge" (không có "chưa") → cờ challenge.
- `COURSE STATUS` Deferred → `deferred`; trống → `active`.
- SĐT 9 chữ số → thêm số 0 đầu.

## Khi file khác mẫu
Sửa `importExcel.js` (map theo tên cột), thêm test trong `tests/import.test.js`, cập nhật `Documents/context.md`. Không đưa file chứa dữ liệu thật vào repo công khai.
