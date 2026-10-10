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

## Nguồn dữ liệu của công ty (flow hiện tại)
Sale chốt + học viên đóng tiền → học viên điền form → Google Sheet form → một người copy sang Sheet **Transactions** (gán/lấy lại mã học viên) → cập nhật file Excel điểm danh trên SharePoint → lớp mới có danh sách để điểm danh. Ba nơi lưu, hai lần copy tay; chưa có lịch sử sửa.

### `Transacitons.xlsx` (4 sheet; app dùng 2 sheet đầu tiên)
| Sheet | Dòng | Vai trò | App |
|---|---|---|---|
| **Course** | 124 | Danh sách lớp: mã ngắn (`BIE101`), mã đầy đủ (`COURSE ID`), ngày bắt đầu/kết thúc, khóa kế tiếp | ✅ nhập |
| **Transactions** | 2.363 | Sổ ghi danh: học viên × khóa (1.892 học viên, 1–6 lần học) | ✅ nhập (chỉ cột cho phép) |
| Form | 606 | Đăng ký từ form: hồ sơ cá nhân, công việc, nguồn biết đến | ⏳ chưa dùng |
| Company | 754 | Học viên theo công ty (nhóm riêng, hầu hết offline) | ⏳ làm sau |

- Khóa nối: `COURSE` (mã ngắn) ở Transactions/Form/Company ↔ `COURSE` ở Course.
- `SUBINDEX` = số lần học → **tự tính** từ lịch sử ghi danh, không nhập tay.
- Cặp (học viên, khóa) là duy nhất → khóa chống trùng. Trùng người còn lại rất ít: 1 email có 2 mã, 7 mã có >1 email, 2 SĐT có 2 mã (báo cáo local `data/bao-cao-trung-lap.csv`).
- Cột đọc: Course = COURSE, COURSE ID, STARTDATE, ENDDATE, NEXT COURSE; Transactions = STUDENT ID, CUSTOMER ID, FULL NAME, EMAIL, PHONE, COURSE, MODE, GENDER, STATUS, REGISTRATION SOURCE. **Không có cột tiền nào được đọc.**
- `STATUS`: `Đã thanh toán / Chưa thanh toán / Đã cọc / Scholarship` = thanh toán → **bỏ, không lưu**. `Không tham gia` → `course_status = dropped`. `Bảo lưu khóa trước` = học viên dùng suất chuyển từ một khóa đã thanh toán trước đó (126/128 trường hợp xuất hiện sau dòng "Đã thanh toán") → **không phải bảo lưu khóa này**; lưu cờ riêng `carried_over`, vẫn tính là đang học.

### Mã lớp `P2.BIE.P101.HY.AA.260726`
`P2` nhóm chương trình (P1 = EBA, P2 = BI) · `BIE` chương trình · `P101` số thứ tự (chữ `B` thay `P` = lớp riêng/doanh nghiệp, chưa xác nhận) · `HY/ON/OF` = Hybrid/Online/Offline · ca học `MM` sáng, `AA` chiều, `EE` tối, `MA` cả ngày (sáng + chiều) · `260726` = ngày bắt đầu 26/07/2026 (ddmmyy).

### Chương trình và giáo trình
| Mã | Tên | Số buổi \| giờ (theo Form) |
|---|---|---|
| BIE | Business Intelligence Essentials | 8 buổi (30–32 giờ) hoặc 12 buổi (30–32 giờ) |
| BIH | Business Intelligence HR Analytics | 22 buổi (44 giờ) hoặc 11 buổi (44 giờ) |
| EBA | Excel for Business Analytics | 6 buổi (12–15 giờ) |
| SIA/SCA | Sales Incentive Analytics | 8 buổi (16 giờ) |
| PBM | Practical Business Management | 10 buổi (20 giờ) |

`session-management.xlsx` có 4 mẫu giáo trình BI (BIE-8, BIE-12, BIH-20 = 22 buổi, BIH-11): cùng nội dung, khác nhịp theo buổi. Mẫu của từng lớp: lớp 097–106 đã xác nhận theo số người đăng ký; lớp BI cũ hơn theo **lớp mới** (BIE → BIE-8, BIH → BIH-20). Chương trình khác chưa có giáo trình.

## Vì sao không giữ cấu trúc Excel khi lưu trữ
Excel là bảng "rộng" (mỗi buổi = 2 cột). Cơ sở dữ liệu nên là bảng "dài": mỗi lượt điểm danh = 1 dòng `(học viên, buổi, trạng thái, ghi chú)`. Lợi ích: thêm buổi/bài không đổi cấu trúc, tính tỉ lệ bằng truy vấn, phân quyền theo lớp, lịch sử cập nhật, chuyển Supabase thẳng. Chi tiết: [code-guide.md](code-guide.md#mô-hình-dữ-liệu).

## Ràng buộc
- Dữ liệu cá nhân học viên (email, SĐT) — chỉ người đăng nhập mới xem được; không đưa dữ liệu thật vào repo công khai.
- Chạy được trên Windows, không cần biên dịch native, ít phụ thuộc.
- Giai đoạn sau chuyển sang Supabase: dữ liệu nằm trên Supabase (Postgres); không dùng tính năng riêng của một nhà cung cấp ngoài Postgres chuẩn.
