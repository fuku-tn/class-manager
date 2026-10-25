# Đối chiếu quy trình Excel thủ công ↔ Class Manager

Nguồn Excel: `quy-trinh-excel-thu-cong.md` (cùng thư mục). Cập nhật 25/10/2026.

| Bước trong Excel | Việc | Trên web | Chỗ trong code |
|---|---|---|---|
| Bảng thô `Name \| Point` | Mỗi dòng là một file bài làm; tên học viên nằm trong tên file ("HỌ TÊN - HWx - Combine…") | `Path \| Name \| Point`; **tên học viên lấy từ thư mục** `…/<LỚP>/<HỌC VIÊN>/…` (đáng tin hơn tên file) | `parseScoreFileRows` |
| Bước 1: tách Họ tên · Course · HW | Chuẩn hóa tên, nhận HW1–5 / Mini Project 1–3 / Capstone | Chuẩn hóa tên bỏ dấu; nhận bài từ thư mục con + tên file (`HWn`, `Homework n`, `Mini Project n`/`MPn`, `Capstone`, `Project` không số) | `normName`, `detectItem` |
| Bước 1.4: nộp nhiều lần | Giữ từng lần nộp, gom ở bước sau | Cộng điểm các file cùng bài | `parseScoreFileRows` (nhóm theo lớp·tên·bài) |
| Bước 2: danh sách duy nhất + `SUMIFS` | Cặp (Họ tên, Course, HW) duy nhất | Nhóm theo `lớp\|tên\|bài` | `groups` |
| Bước 3.3: `MIN($M$1, SUMIFS(...))` | Trần 10 điểm | `Math.min(10, tổng)` | `MAX_SCORE` |
| Bước 3.2: `XLOOKUP` StudentID theo `FULL NAME` + `COURSE ID` | So khớp chính xác tên | So khớp (lớp, tên bỏ dấu) trong **ghi danh của lớp**; dự phòng đảo thứ tự họ–tên; trùng tên → bỏ qua và đếm | `resolveScoreFiles` |
| Bước 3.4: `XLOOKUP` Module (`Table_Module`) | HW → Module theo chương trình 3 chữ | Bảng cố định | `scoreModules.js` |
| Bước 3.5: lớp mới → `Course_Map`, `Table_Module` | Thêm lớp/HW | Lớp đã có trong app (đồng bộ từ sheet COURSE); cột bài tạo sẵn; Module thêm vào `scoreModules.js` | `DEFAULT_ASSIGNMENTS`, `scoreModules.js` |
| Bước 4: đếm `"Không tìm thấy"` cột A và F = 0 | Kiểm tên và Module | `unmatched_students`, `ambiguous_students` = 0; thiếu/sai Module = 0 | `npm run audit-scores` |
| Bước 4: đối chiếu số dòng theo Course | Số điểm từng lớp | Bảng độ phủ theo lớp + so với bản sao lưu gần nhất | `audit-scores`, `--vs-backup` |
| Bước 4: không điểm > `$M$1`, không `#N/A` | Chặn trần, không lỗi | Cột `score` có ràng buộc 0–10 trong database | `schema.sql` |
| "Ghi cho người dùng danh sách tên chưa khớp. Đừng sửa âm thầm" | Không tự gán StudentID | Báo số đếm theo lớp; `--verbose` trên máy người dùng mới in tên | `importScoreFiles`, `audit-scores` |

## Khác biệt đáng chú ý
- Excel tra `StudentProfile` (mọi học viên); web chỉ ghép với **học viên đang ghi danh trong đúng lớp** → tránh gán nhầm sang lớp khác, nhưng học viên chưa ghi danh vào lớp sẽ thành "không ghép tên".
- Excel không có thứ tự ưu tiên nguồn; web có: **gõ tay > Excel > SharePoint**, và cột `Source` trong bản sao lưu điểm để khôi phục đúng.
- Bảng Module hiện chỉ có BIE, BIH, EBA (đúng như sheet `Module` của Excel). PBM, SCA chưa có → Module để trống.
