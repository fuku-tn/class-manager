# Ngữ cảnh (Context)

## Bài toán
Chủ dự án (giảng viên/quản lý đào tạo) hiện lưu danh sách học viên, điểm danh, bài tập của từng lớp trong **một file Excel**. Cần webapp để nhiều giảng viên/trợ giảng cùng cập nhật và để xem Dashboard theo dõi từng lớp.

## Người dùng
| Vai trò | Quyền |
|---|---|
| `admin` | Xem mọi lớp; tạo/sửa lớp; quản lý người dùng & phân lớp; xóa học viên khỏi lớp |
| `instructor` (giảng viên/trợ giảng) | Chỉ thấy lớp được phân công; thêm/sửa học viên, điểm danh, ghi nhận bài tập |

## Thuật ngữ
| Từ | Nghĩa |
|---|---|
| Lớp (class) | Một khóa chạy với mã riêng, vd `P2.BIE.P101.HY.AA.260726` |
| Ghi danh (enrollment) | Học viên trong một lớp cụ thể. Một học viên có thể học nhiều lớp |
| Buổi (session) | Một buổi học (mẫu có 8). `held` = đã diễn ra/đã điểm danh |
| HW | Homework — mẫu có 6 bài. `collected` = đã bắt đầu thu |
| Capstone | Dự án cuối khóa, tính riêng, không nằm trong tỉ lệ HW |
| Challenge | Phần bài làm thêm tùy chọn trong HW (ghi nhận bằng cờ ★) |
| Hình thức (mode) | Online / Offline / Hybrid |
| Voucher GG Maps | Voucher tặng học viên (số tiền, ngày gửi, hạn, trạng thái) |

## Trạng thái
- Điểm danh: `present` Có mặt · `late` Đi trễ · `absent` Vắng · `excused` Có phép
- Bài tập: `submitted` Đã nộp · `resubmit` Nộp lại · `missing` Thiếu
- Khóa học: `active` Đang học · `deferred` Bảo lưu · `dropped` Nghỉ học · `completed` Hoàn thành

## Quy tắc nghiệp vụ (nguồn sự thật: `src/services/stats.js`)
1. **Tỉ lệ điểm danh** = (có mặt + trễ) ÷ (số buổi đã diễn ra − số buổi có phép). Chưa có bản ghi ở buổi đã diễn ra = vắng.
2. **Tỉ lệ HW** = số HW `submitted` ÷ số HW đã thu. `resubmit` chưa tính. Chưa có bản ghi ở bài đã thu = thiếu.
3. Buổi/bài **chưa diễn ra/chưa thu** không làm giảm tỉ lệ của ai. Một buổi tự chuyển sang "đã diễn ra" khi có điểm danh đầu tiên (hoặc bấm "Cả lớp ✓").
4. Dashboard chỉ tính học viên `active` + `completed`; bảo lưu/nghỉ chỉ hiện ở số liệu tổng.
5. "Cần chú ý": điểm danh < 80% hoặc thiếu ≥ 2 HW (cấu hình bằng biến môi trường).
6. Mã học viên (`P.13027`) là duy nhất toàn hệ thống; số điện thoại có thể trùng (người thân đăng ký chung).

Các quy tắc trên là **giả định đã đối chiếu với file mẫu** nhưng cần chủ dự án xác nhận — xem bảng trong [memory.md](../memory.md).

## File Excel mẫu: `danh-sach-hoc-vien-mau.xlsx`
Sheet duy nhất, **2 lớp** cùng sheet (tách theo `COURSE ID`): `P2.BIE.P101.HY.AA.260726` (46 học viên, đủ 8 buổi) và `P2.BIE.P104.HY.AA.041026` (26 học viên, mới có buổi 1). Dòng 2-4 (Phase, chủ đề, số đếm) chỉ mô tả lớp P101.
- Dòng 2: tên phase (`Phase 1`). Dòng 3: chủ đề gộp — Buổi 1-3 *Data Transformation*, Buổi 4-5 *Data Storytelling & Data Model*, Buổi 6-8 *Data Visualization*; các ô `HW`.
- Dòng 4: số người có mặt/nộp từng buổi/bài (dùng để đối soát — test import so khớp các số này).
- **Dòng 5 là tiêu đề cột; dữ liệu từ dòng 6.**
- Cột định danh: `STUDENT ID`, `FULL NAME`, `EMAIL`, `PHONE` (mất số 0 đầu → import tự thêm), `COURSE ID` (= mã lớp), `MODE`, `COURSE STATUS`, `ATTENDANCE RATE`, `CERTIFICATE STATUS`, `FORM`, `CUSTOMER ID`, `SUBINDEX`.
- Mỗi buổi/bài là cặp cột: `SESSION n` / `NOTE SSn`, `HOMEWORK n` / `NOTE HWn`, `CAPSTONE PROJECT` / `NOTE CP`. Giá trị `X` (hoặc `x`) = có mặt/đã nộp; trống = không.
- Giá trị lạ như `O` ở ô buổi/bài (2 học viên P104) không phải `X` → tính vắng/thiếu và import in cảnh báo.
- Cột `ATTENDANCE RATE` của Excel chia cho **tổng số buổi (8)**; webapp chia cho số buổi **đã diễn ra** (xem memory.md #10).
- Ghi chú thường gặp: "Học từ buổi 2", "Trùng lịch EBA113", "Vào trễ", "Có làm Challenge", "Còn thiếu bài", "Nộp lại", "Challenge chưa chấm".
- Voucher: `VOUCHER GG MAPS` (số tiền), `VOUCHER SENT DATE`, `EXPIRATION DATE`, `VOUCHER STATUS`.

Import map theo **tên cột** (không theo vị trí), nên thêm buổi/bài mới vào file vẫn nhập được.

## Vì sao không giữ cấu trúc Excel khi lưu trữ
Excel là bảng "rộng" (mỗi buổi = 2 cột). Cơ sở dữ liệu nên là bảng "dài": mỗi lượt điểm danh = 1 dòng `(học viên, buổi, trạng thái, ghi chú)`. Lợi ích: thêm buổi/bài không đổi cấu trúc, tính tỉ lệ bằng truy vấn, phân quyền theo lớp, lịch sử cập nhật, chuyển Supabase thẳng. Chi tiết: [code-guide.md](code-guide.md#mô-hình-dữ-liệu).

## Ràng buộc
- Dữ liệu cá nhân học viên (email, SĐT) — chỉ người đăng nhập mới xem được; không đưa dữ liệu thật vào repo công khai.
- Chạy được trên Windows, không cần biên dịch native, ít phụ thuộc.
- Giai đoạn sau chuyển sang Supabase: dữ liệu nằm trên Supabase (Postgres); không dùng tính năng riêng của một nhà cung cấp ngoài Postgres chuẩn.
