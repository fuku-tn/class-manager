# Archive — nội dung đã bỏ hoặc thay thế

Không xóa hẳn: khi một quyết định/tài liệu/đoạn code lỗi thời, chuyển vào đây kèm ngày và lý do để tra lại được.
Mẫu mỗi mục: `### [ngày] Tiêu đề` → *Nội dung cũ* → *Lý do bỏ* → *Thay bằng*.

---

### [2026-10-09] SQLite làm cơ sở dữ liệu chạy thật
- **Nội dung cũ:** `node:sqlite`, file `data/app.db`, API đồng bộ, SQL dùng `?`, cột boolean là 0/1, ngày là chuỗi.
- **Lý do bỏ:** chủ dự án muốn dùng Supabase; không muốn giữ hai nơi dữ liệu lệch nhau.
- **Thay bằng:** Postgres/Supabase qua `pg` (`src/db.js`), SQL `$n`, boolean thật, `date`/`timestamptz`. Schema cũ: `legacy/sqlite-schema.sql`; dữ liệu cũ: `legacy/app.sqlite.db`; công cụ chuyển một lần: `npm run migrate-pg`.


### [2026-10-09] Lưu trữ bằng Excel (hiện trạng trước khi có webapp)
- **Nội dung cũ:** mỗi lớp là 1 sheet rộng ~47 cột; mỗi buổi/HW chiếm 2 cột (giá trị `X` + cột ghi chú), điểm danh tính tay vào cột `ATTENDANCE RATE`.
- **Lý do bỏ:** nhiều cột lặp (`SESSION n`, `NOTE SSn`…) khó truy vấn; thêm buổi/bài phải sửa cấu trúc; tỉ lệ tính tay dễ sai; khó phân quyền và nhiều người cùng sửa.
- **Thay bằng:** schema chuẩn hóa (`enrollments`, `sessions`, `attendance`, `assignments`, `submissions`) trong `src/schema.sql`. File Excel mẫu vẫn giữ làm nguồn nhập (`npm run import`).

### [2026-10-09] Phương án frontend/lưu trữ không chọn
- React (Vite), Next.js: bỏ vì phức tạp hơn nhu cầu giai đoạn đầu; cân nhắc lại nếu giao diện lớn lên.
- Đọc/ghi thẳng Excel: bỏ vì dễ hỏng dữ liệu khi nhiều người dùng và không chuyển Supabase được.
- Nối Supabase ngay: hoãn vì chưa có project Supabase; thiết kế sẵn để chuyển sau.

### [2026-10-10] Voucher (bảng `vouchers`, cột `VOUCHER GG MAPS`...)
- **Nội dung cũ:** bảng `vouchers` (số tiền, ngày gửi, hạn, trạng thái) nhập từ file điểm danh đầu tiên (18 dòng); có ô nhập trong hộp thoại học viên và cột "Voucher" trong danh sách học viên.
- **Lý do bỏ:** chủ dự án yêu cầu không lưu dữ liệu liên quan đến tiền và bảo bỏ hẳn voucher.
- **Thay bằng:** không có. Bảng bị xóa vĩnh viễn trên Supabase (không sao lưu số tiền); bộ nhập không đọc các cột `VOUCHER*`/`EXPIRATION*`.

### [2026-10-18] Mục "Việc còn dở" đã hoàn thành (dọn khỏi memory.md)
- **Nội dung cũ:** "Thêm nút Đổi mật khẩu", "Đồng bộ Sheet Transactions tự động… Company", "Upload Excel trực tiếp trên web", "Chương trình chưa có giáo trình (EBA, SIA/SCA, PBM…)".
- **Lý do bỏ:** đã làm (nút 🔑 đổi mật khẩu; Apps Script `sync-transactions.gs` + tab COMPANY; trang `#/import`; số buổi EBA 6, PBM 10, BIE 8/12).
- **Thay bằng:** mục còn lại "Số buổi chuẩn còn thiếu: DDM, SQL, BSM, DBC, WKS" trong memory.md.

### [2026-10-18] Mục "Điểm bài tập (thang 10)" thu gọn ở cuối trang Bài tập
- **Nội dung cũ:** khung `<details>` riêng dưới bảng bài tập, bảng điểm từng HW + Module + Điểm TB, tải khi mở.
- **Lý do bỏ:** chủ dự án thấy điểm nằm dưới khó theo dõi.
- **Thay bằng:** điểm hiện ngay trong ô HW, thẻ Điểm TB cả lớp, cột Điểm TB sắp xếp được, chọn cách hiển thị.

### [2026-10-18] Sao lưu giữ 28 bản (≈ 14 ngày)
- **Nội dung cũ:** `backup-scheduled.cmd` chạy `--keep 28`.
- **Lý do bỏ:** chủ dự án chỉ muốn giữ 3 bản gần nhất.
- **Thay bằng:** `--keep 3` (đã dọn 8 bản cũ trên máy ngày 18/10/2026).

### [2026-10-18] Điểm HW đồng bộ từ Google Sheet bảng điểm (Apps Script `sync-points.gs`)
- **Nội dung cũ:** Google Sheet bảng điểm riêng + `scripts/google-apps-script/sync-points.gs` (hẹn giờ 5 phút, Script properties `SYNC_URL` = `/api/sync/points`, `SYNC_TOKEN`) gửi 5 cột StudentID/Course/HW/Point/Module.
- **Lý do bỏ:** chủ dự án chuyển sang chấm điểm trong file Excel "Chấm điểm.xlsx" (bảng `Point_Transform`), chỉ cần cập nhật 1 lần/ngày.
- **Thay bằng:** `npm run import-points` + lịch 12:00 (`scripts/points-scheduled.cmd`, Refresh Excel rồi nhập). Route `/api/sync/points` vẫn còn nhưng trả 410 trừ khi `POINTS_SHEET_SYNC=1`; file `.gs` giữ lại để tham khảo/bật lại.
