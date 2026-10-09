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
