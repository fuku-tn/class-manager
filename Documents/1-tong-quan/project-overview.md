# Mô tả dự án

## Mục tiêu
Một webapp nội bộ để quản lý học viên theo lớp, điểm danh từng buổi, ghi nhận bài tập, và xem Dashboard theo dõi tiến độ — thay cho việc cập nhật tay trong Excel.

## Phạm vi giai đoạn 1 (đã làm)
| Nhóm | Tính năng |
|---|---|
| Truy cập | Đăng nhập; vai trò admin / giảng viên; phân lớp cho giảng viên |
| Lớp | Danh sách lớp, tạo lớp (tự sinh buổi + HW + Capstone), chọn lớp nhanh |
| Học viên | Danh sách + tìm kiếm + lọc trạng thái/hình thức; thêm, sửa, bảo lưu, xóa khỏi lớp; xuất CSV |
| Điểm danh | Ma trận học viên × buổi; bấm để đổi trạng thái; Shift+bấm để ghi chú; "Cả lớp ✓"; sửa tên/ngày buổi |
| Bài tập | Ma trận học viên × HW/Capstone; trạng thái, cờ Challenge, ghi chú |
| Trang chủ | Hero động, số liệu đếm lên, băng chuyền lớp đang diễn ra, lớp sắp khai giảng |
| Chọn lớp | Ô tìm + chip lọc theo thời gian/chương trình thay cho dropdown 124 lớp |
| Dashboard | KPI (số học viên, điểm danh TB, HW TB, cần chú ý), biểu đồ điểm danh theo buổi, nộp bài theo HW, hình thức học, danh sách học viên cần chú ý |
| Dữ liệu | Nhập từ Excel (`npm run import`), chạy lại an toàn |

## Ngoài phạm vi (chưa làm)
Upload Excel trên web · điểm số chi tiết · chứng chỉ tự động · gửi email/nhắc · app mobile · Supabase Auth · phân quyền theo từng buổi.

## Công nghệ
Node.js ≥ 22.13 · Express · Supabase Postgres (`pg`) · HTML/CSS/JS thuần (ES modules) · Chart.js · ExcelJS (import). Kiểm thử bằng `node:test` + PGlite.

## Màn hình
`#/` (Trang chủ) · `#/c/:id/dashboard` · `#/c/:id/students` · `#/c/:id/attendance` · `#/c/:id/homework` · `#/classes` (admin) · `#/users` (admin)

## Lộ trình
1. ✅ Nền tảng: schema, auth, API, import, 4 màn hình lớp, test API.
2. ⏳ Chủ dự án chạy thử, xác nhận giả định ([memory.md](../../memory.md)), chỉnh quy tắc tính.
3. Upload Excel trên web, trang chi tiết học viên.
4. ✅ Chuyển Supabase (Postgres, RLS bật). Còn lại: Supabase Auth — xem [code-guide.md](../3-ky-thuat/code-guide.md#supabase-đã-chuyển--2026-10-09).
5. Triển khai (VPS/Render/Railway), sao lưu tự động.

## Tiêu chí hoàn thành giai đoạn 1
- Nhập file mẫu: 46 học viên, số liệu Dashboard khớp dòng tổng trong Excel (đã có test).
- Giảng viên không thấy lớp không được phân công.
- `npm test` xanh.
