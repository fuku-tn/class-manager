---
name: cham-diem-hw
description: Quy trình chấm/gom điểm bài tập (HW, Mini Project, Capstone) cho Class Manager, gồm ánh xạ từ quy trình Excel thủ công trước đây (file "Chấm điểm.xlsx": bảng thô Name|Point → làm sạch → Tổng điểm có StudentID và Module) sang quy trình trên web (danh sách file SharePoint Path/Name/Point, file Excel Point_Transform, gõ tay). Dùng khi người dùng nói "cập nhật điểm", "thêm lớp/HW mới vào bảng điểm", "tìm không ra StudentID", "chuẩn hóa tên", "điểm thiếu Module", "điểm đã đủ chưa", hoặc đưa file điểm mới.
---

# Chấm điểm HW — từ Excel thủ công sang Class Manager

Tài liệu quy trình Excel gốc của chủ dự án: [references/quy-trinh-excel-thu-cong.md](references/quy-trinh-excel-thu-cong.md). Đối chiếu từng bước Excel ↔ web: [references/doi-chieu-excel-web.md](references/doi-chieu-excel-web.md). Đọc cả hai trước khi sửa cách tính điểm.

## Chọn đường nhập theo thứ bạn đang có
| Đang có | Làm | Ghi chú |
|---|---|---|
| `scores_*.csv` / tab Google Sheet `Path · Name · Point` (danh sách file bài làm SharePoint) | `npm run import-score-files -- <csv> --dry-run --verbose`, sửa tên lệch, rồi chạy thật (hoặc để Apps Script `sync-score-files.gs` chạy 10:00) | skill `import-score-files` |
| `Chấm điểm.xlsx` (bảng `Point_Transform` đã có StudentID) | `npm run import-points -- <xlsx> --dry-run` rồi chạy thật (lịch 12:00) | Excel là bản chuẩn của nguồn Excel |
| Chấm ngay trên web | Trang Bài tập → bấm ô → "Điểm (0–10)" | điểm gõ tay không bị nguồn nào ghi đè |

Ưu tiên khi hai nguồn lệch nhau: **gõ tay > Excel > SharePoint** (CLAUDE.md 14d/14d-2).

## Quy tắc tính (đã khớp quy trình Excel)
1. Điểm một bài = **tổng điểm các file** của học viên trong bài đó, **tối đa 10** (Excel: `=MIN($M$1, SUMIFS(...))`; web: `MAX_SCORE` trong `importScoreFiles.js`). Không nhúng số 10 rải rác — nếu đổi trần thì sửa một chỗ và test.
2. Khớp học viên theo **(lớp, tên)**, không bao giờ tự đoán/gán StudentID. Tên bỏ dấu, hạ chữ thường; đảo thứ tự họ–tên được chấp nhận khi chỉ có một học viên khớp. Tên không khớp / trùng tên → liệt kê cho người dùng, không đoán.
3. Module tra theo bảng (chương trình 3 chữ + tên bài) ở `src/services/scoreModules.js` (= sheet `Module`/`Table_Module` của Excel). BIH `Mini Project 3` lưu ở bài HW5 nhưng Module tra theo `mini:3`. Chương trình chưa có bảng (PBM, SCA) thì để trống và nói rõ — thêm bảng khi chủ dự án cung cấp.
4. Lớp mới: lớp phải có trong app (mã ngắn như `BIE108`) và đã có cột bài (HW/Capstone — `DEFAULT_ASSIGNMENTS`); chương trình mới thì thêm Module vào `scoreModules.js`.

## "Xong khi" (tương đương Bước 4 của Excel — kiểm bắt buộc trước khi báo xong)
- `npm run audit-scores -- --file <csv>`: **không ghép tên = 0 và trùng tên = 0** (hoặc đã liệt kê cho người dùng), **thiếu Module = 0** cho BIE/BIH/EBA, **sai Module = 0**, điểm ngoài 0–10 = 0.
- `npm run audit-scores -- --vs-backup` ngay sau lần nhập: không có điểm nào **MẤT** ngoài dự kiến; số điểm theo lớp khớp kỳ vọng (Excel cũ dùng bảng "đối chiếu số dòng theo Course").
- Báo cho người dùng danh sách học viên/lớp còn thiếu (mã lớp + mã học viên, không in họ tên hàng loạt). Phân biệt *sót khi nhập* với *nguồn chưa có điểm*.
- Có nghi ngờ → gọi agent `score-coverage-auditor` (đủ chưa) và `score-calc-checker` (đúng chưa).

## Việc cần chủ dự án xác nhận (chưa tự quyết)
- **Nộp lại nhiều lần:** file nộp lại (Combine B-1, B-5, "EDIT"…) hiện được **cộng dồn rồi chặn ở 10**. Có 15 bài bị chặn và 24 bài khác file Excel; nếu muốn chỉ lấy lần chấm mới nhất cho từng file thì cần quy ước nhận diện bản trùng.
- File không nhận ra bài (BIH "Project 1", EBA bài tập ngoài HW1–4): thuộc bài nào.
