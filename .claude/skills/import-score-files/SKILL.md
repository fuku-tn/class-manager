---
name: import-score-files
description: Nhập/đối soát điểm bài tập từ danh sách FILE bài làm trên SharePoint (bảng Path · Name · Point, vd scores_STARTTRAIN.csv) vào Class Manager. Dùng khi người dùng đưa file CSV điểm dạng đường dẫn thư mục, muốn cập nhật điểm HW/Mini Project/Capstone của học viên theo lớp, hoặc chỉnh Apps Script sync-score-files.gs.
---

# Nhập điểm từ danh sách file SharePoint

## Cấu trúc file (đã khảo sát 24/10/2026, 2.733 dòng)
- 3 cột: `Path`, `Name` (= tên file), `Point` (điểm chấm cho **từng file**, có thể trống).
- `Path` = `Shared Documents/STARTTRAIN/<CHƯƠNG TRÌNH>/<LỚP>/<TÊN HỌC VIÊN>/[HW1/Basic|Challenge/…]/<file>`. Lớp viết `BIH96`/`PBM21` → chuẩn hóa `BIH096`/`PBM021`. Không có mã học viên → ghép theo **(lớp, tên bỏ dấu)**.
- Thư mục chương trình khác (`BIF`, `FILE GỬI HV`) hoặc file ở cấp lớp → bỏ qua (đếm `skipped_bad_path`).

## Quy tắc đã chốt bằng số liệu
- **Điểm của một bài = TỔNG điểm các file của học viên trong bài đó, tối đa 10** (đối chiếu 898 bài đã có điểm Excel: tổng khớp 870, max/lần cuối chỉ ~60%).
- Nhận diện bài từ thư mục con + tên file: `HWn`/`Homework n`/`Bài tập n`, `Mini Project n`/`MPn`, `Capstone`/`Project` (không số). `Project 1` (BIH) mơ hồ → bỏ qua, báo `skipped_no_item`.
- Ưu tiên: **gõ tay > Excel "Chấm điểm" > SharePoint**. SharePoint chỉ điền ô trống và cập nhật điểm do chính nó nhập (`homework_scores.source = 'sharepoint'`); không xóa điểm nào.
- Web không lưu đường dẫn/tên học viên; kết quả API chỉ có số đếm theo lớp.

## Cách làm
1. Chạy thử: `npm run import-score-files -- <file.csv> --dry-run --verbose` (in tên không ghép được, chỉ trên máy bạn). Đọc `unmatched_students`, `ambiguous_students`, `skipped_no_item`, `skipped_no_assignment`.
2. Tên không ghép được → sửa tên học viên trong app/Sheet cho khớp thư mục SharePoint (hoặc đổi tên thư mục), chạy lại.
3. Nhập thật: bỏ `--dry-run`. Tự động: Apps Script `scripts/google-apps-script/sync-score-files.gs` → `POST /api/sync/score-files`.
4. Đổi quy tắc (cách gộp, nhận diện bài) chỉ ở `src/services/importScoreFiles.js` + cập nhật `tests/score-files.test.js`; luôn đối chiếu lại với điểm Excel hiện có trước khi đổi.
