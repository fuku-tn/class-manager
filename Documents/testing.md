# Kiểm thử

## Chạy
```
npm test        # node:test, ~15 giây
```
Dùng **PGlite** (Postgres thật chạy trong bộ nhớ) với `src/schema.sql` — không cần server, **không đụng Supabase**.

## Cấu trúc
| File | Nội dung |
|---|---|
| `tests/helpers.js` | `startTestApp()`: `openDb({ memory: true })` + server cổng ngẫu nhiên + client có cookie, `addUser`, `login` |
| `tests/api.test.js` | Auth, phân quyền, điểm danh, bài tập, dashboard, validation, XSS |
| `tests/db-errors.test.js` | Phân loại lỗi cấu hình/kết nối DB; thiếu `DATABASE_URL` → đăng nhập trả 503 có lý do |
| `tests/import.test.js` | Import file mẫu khớp số liệu Excel, chạy lại không trùng, lỗi thiếu cột |

## Đã được kiểm thử tự động (17 test)
- Chưa đăng nhập → 401; đăng nhập sai/đúng.
- Giảng viên không truy cập được lớp chưa được phân (403), sau khi phân thì được; không tạo lớp / xem user được.
- Tỉ lệ điểm danh: có phép không tính vào mẫu số (A=0.67, B=0.5).
- Dữ liệu sai: trạng thái lạ → 400; buổi/học viên không tồn tại hoặc **thuộc lớp khác** → 404.
- "Cả lớp ✓" chỉ điền ô trống, không ghi đè, chạy lại tạo 0 bản ghi.
- HW: "Nộp lại" không tính hoàn thành; bài chưa thu không tính vào mẫu số.
- Dashboard tổng hợp; thêm trùng học viên → 409; ngày sai định dạng → 400.
- Tên chứa HTML được lưu nguyên văn.
- Import: 46 học viên; số có mặt theo buổi `[35,38,40,36,38,32,35,33]` và số nộp `[42,38,39,37,27,0,32]` đúng bằng dòng 4 của Excel; số điện thoại khôi phục số 0 đầu.

## Chưa được kiểm thử tự động — phải thử tay
- **Toàn bộ giao diện trình duyệt** (render, click, modal, biểu đồ). Chưa có test E2E.
- Hiển thị trên điện thoại / chế độ tối.
- Phiên hết hạn giữa chừng (401 trong khi đang thao tác).
- Đăng nhập sai quá 8 lần (giới hạn tốc độ).
- Hiệu năng với lớp lớn (hàng trăm học viên).

## Checklist thử tay (5-10 phút)
1. Đăng nhập sai → báo lỗi; đúng → vào Dashboard.
2. Chọn lớp P101 trên thanh trên cùng (có thêm P104). Dashboard: các KPI, 3 biểu đồ hiện; số "Điểm danh theo buổi" = `35 38 40 36 38 32 35 33` (với file mẫu).
3. Học viên: tìm "Khang", lọc Bảo lưu (2 người), sửa 1 người, thêm 1 người, xuất CSV mở được trong Excel (tiếng Việt không lỗi).
4. Điểm danh: bấm 1 ô qua đủ 5 trạng thái; Shift+bấm ghi chú; "Cả lớp ✓" ở buổi mới; sửa ngày buổi.
5. Bài tập: mở 1 ô, đổi trạng thái + Challenge + ghi chú; kiểm tra ★ và tỉ lệ cột cuối.
6. Admin: tạo giảng viên, phân 1 lớp; đăng nhập bằng giảng viên → chỉ thấy lớp đó, không có menu Lớp học/Người dùng.
7. F5 ở từng tab — vẫn đúng trang, không mất đăng nhập.
8. Đổi tab nhanh nhiều lần liên tiếp: thanh điều hướng đứng yên, nội dung mờ dần rồi hiện lên, không chớp trắng, trang cuối cùng bấm là trang hiển thị.
9. Nút mặt trời/mặt trăng: đổi sáng/tối, biểu đồ vẽ lại đúng màu; F5 vẫn giữ lựa chọn.
10. Thu nhỏ cửa sổ ≤ 640px (hoặc mở trên điện thoại): thanh điều hướng, hero, bảng cuộn ngang không tràn.

## Viết test mới
- Mỗi tính năng/bug sửa → ít nhất 1 test: đường đi đúng + 1 đầu vào sai + 1 kiểm tra quyền (nếu có).
- Dùng `startTestApp()`; tạo dữ liệu bằng API khi có thể, bằng `t.db` khi cần dựng nhanh.
- Quy tắc tính toán: viết số mong đợi **bằng tay** từ ví dụ nhỏ (xem test điểm danh), không lấy kết quả từ chính hàm đang test.
- Test import dùng file mẫu thật → tự bỏ qua (skip) nếu file không có.

## Chưa phủ: chính sách RLS và kết nối Supabase thật
PGlite không mô phỏng pooler/mạng/SSL của Supabase. Đã thử tay API trên Supabase (đăng nhập, dashboard, ghi/hoàn điểm danh, import lại). Khi thêm policy RLS cho truy cập trực tiếp từ trình duyệt: thêm test người dùng A không đọc được lớp của B.
