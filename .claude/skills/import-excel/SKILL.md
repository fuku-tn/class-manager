---
name: import-excel
description: Nhập hoặc đối soát điểm danh, bài tập, danh sách học viên từ workbook Excel nhiều sheet của lớp vào database Class Manager (Supabase). Dùng khi người dùng đưa file .xlsx điểm danh mới, muốn cập nhật điểm danh từ Excel, hoặc kiểm tra số liệu app có khớp Excel không.
---

# Nhập & đối soát điểm danh từ Excel

## Cấu trúc & quy tắc (đầy đủ ở `Documents/context.md`, mục "File Excel điểm danh")
- Workbook nhiều sheet theo chương trình (`BIE-8`, `BIE-12`, `BIH`, `EBA`, `PBM`, `SCA`, `DDM`, `BIF`). **Chỉ sheet đang hiện** được nhập; sheet ẩn là bản cũ.
- Ô điểm danh: **X = đi học, O = vắng có phép, trống = vắng**. Buổi không ai có X/O = chưa diễn ra.
- Tỉ lệ = (có mặt + trễ) ÷ (buổi đã diễn ra − buổi có phép). Cột `ATTENDANCE RATE` của Excel tính khác (÷ tổng số buổi, coi O như vắng) nên **không** dùng để đối soát.
- **Không đọc cột voucher/tiền.** Đừng sửa bộ nhập để đọc thêm cột mà chưa hỏi chủ dự án.

## Quy trình
1. **Khảo sát file trước** (python `-I -X utf8`, bỏ cảnh báo openpyxl): liệt kê sheet (trạng thái hiện/ẩn), dòng tiêu đề, số lớp, **tập giá trị** của các ô SESSION/HOMEWORK. Ký hiệu lạ ngoài X/O/trống phải báo lại. Không in họ tên/email/SĐT hàng loạt.
2. **Chạy thử:** `npm run import -- <file> --dry-run`. Đọc bảng theo lớp (có mặt/trễ/có phép/vắng/giữ từ app), danh sách cảnh báo, lớp mới, lớp đổi giáo trình.
3. **Báo người dùng** các điểm bất thường (lớp tạo mới, cột bị bỏ vì vượt giáo trình, học viên trùng, học viên mới hàng loạt) rồi mới chạy thật: `npm run import -- <file>`.
4. **Đối soát:** đếm X/O/trống của file với số trong bảng kết quả; với lớp có `O`, so tỉ lệ cũ (coi O là vắng) và mới. Số liệu cũ đã nhập không được mất (điểm danh, bài tập, voucher).
5. Cập nhật `memory.md`; commit khi người dùng yêu cầu.

## An toàn
- Nhập chạy trong 1 transaction, idempotent. **Không ghi đè** ô đã sửa trực tiếp trên app (`kept_from_app`); không hạ trạng thái "nghỉ/bảo lưu".
- Dữ liệu thật ghi thẳng Supabase → luôn `--dry-run` trước và nói rõ khi file có thể ghi đè dữ liệu của lần nhập trước.
- File `.xlsx/.csv` chứa dữ liệu cá nhân: đã git-ignore, không bao giờ commit.
