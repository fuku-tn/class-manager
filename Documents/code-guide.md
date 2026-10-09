# Hướng dẫn code — Backend & Frontend

## Kiến trúc
```
Trình duyệt (public/, ES modules, router hash)
      │  fetch JSON, cookie phiên HttpOnly
      ▼
Express (src/app.js) ── attachUser → requireAuth → [requireAdmin] → requireClassAccess
      │
      ├─ routes/  (auth, users, classes, classData)  — validate + SQL
      ├─ services/stats.js        — MỌI công thức tỉ lệ/dashboard
      ├─ services/importExcel.js  — Excel → DB
      └─ db.js (pg Pool → Supabase; PGlite cho test) + schema.sql
```

## Mô hình dữ liệu
```
users ─< class_instructors >─ classes ─< sessions
                                  │  └< assignments
                                  └< enrollments >─ students
                                        ├< attendance  (enrollment × session)
                                        ├< submissions (enrollment × assignment)
                                        └─ vouchers (1-1)
```
| Bảng | Ghi chú |
|---|---|
| `students` | Người học, duy nhất theo `student_code` |
| `enrollments` | Học viên trong lớp: `mode`, `course_status`, `certificate_status`; `UNIQUE(class_id, student_id)` |
| `sessions` | `session_no`, `title`, `session_date`, `held` |
| `attendance` | `status` ∈ present/late/absent/excused + `note`; `UNIQUE(enrollment_id, session_id)` |
| `assignments` | `kind` hw/capstone, `seq`, `collected` |
| `submissions` | `status` ∈ submitted/resubmit/missing, `challenge`, `note` |
| `vouchers` | Số tiền, ngày gửi, hạn, trạng thái |
| `users`, `auth_sessions` | Tài khoản + phiên đăng nhập (băm SHA-256 của token) |

Schema nằm ở `src/schema.sql` (app + test dùng) và bản sao `supabase/schema.sql` (dán vào SQL Editor) — giữ hai file giống nhau. `create table if not exists` không thêm cột vào bảng đã có: đổi cột thì chạy `alter table …` trên Supabase.

Chỉ lưu **sự kiện đã ghi nhận**; tỉ lệ luôn được tính, không lưu (tránh lệch số).

## Backend

### API (tiền tố `/api`, trả JSON, lỗi `{error: "…"}` tiếng Việt)
| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password` | – / đăng nhập | Phiên cookie, giới hạn 8 lần sai/15 phút |
| `GET/POST /users` · `PUT /users/:id/classes` · `PUT /users/:id/active` | admin | Quản lý người dùng, phân lớp, khóa tài khoản |
| `GET /classes` · `POST /classes` | đăng nhập / admin | Danh sách lớp được phép; tạo lớp (+ buổi, HW, Capstone) |
| `GET/PUT /classes/:classId` | lớp / admin | Chi tiết, sửa lớp |
| `GET /classes/:classId/dashboard` | lớp | KPI + số liệu biểu đồ + danh sách cần chú ý |
| `GET /classes/:classId/sessions` · `PUT …/sessions/:sid` | lớp | Tên/ngày buổi |
| `GET /classes/:classId/assignments` · `PUT …/assignments/:aid` | lớp | Tên/hạn bài |
| `GET/POST /classes/:classId/students` · `PUT/DELETE …/students/:eid` | lớp (DELETE: admin) | Học viên + thống kê; xóa khỏi lớp |
| `GET/PUT /classes/:classId/attendance` | lớp | Ma trận; ghi 1 ô (`status:null` = xóa) |
| `POST /classes/:classId/sessions/:sid/attendance/bulk` | lớp | Điền trạng thái cho ô trống của học viên `active` |
| `GET/PUT /classes/:classId/submissions` | lớp | Ma trận bài tập; ghi 1 ô |

### Quy ước
- Router `module.exports = (db) => router` để test truyền DB bộ nhớ (PGlite) vào. Express 5: handler `async` ném lỗi thì tự vào error handler.
- Truy cập DB chỉ qua `db.all/one/run/tx` (`src/db.js`), SQL dạng `$1, $2…`. `db.tx(async (t) => …)` cho nhiều lệnh ghi; ném `Error` có `.status` để trả mã 4xx. Ngày (`date`, `timestamptz`) và `bigint` được ép về chuỗi/số trong `db.js`.
- Kiểm tra đầu vào bằng danh sách cho phép (`ATT_STATUS`, `MODES`…) và regex ngày `yyyy-mm-dd`; trả 400/404/409 có thông điệp.
- Luôn kiểm tra `enrollment`/`session`/`assignment` thuộc đúng `req.cls` (chặn ghi chéo lớp — có test).
- Nhiều lệnh ghi liên quan → bọc `transaction(db, fn)`.
- Thêm cấu hình bằng biến môi trường (`.env.example`).

### Thêm một endpoint (ví dụ)
1. Viết route trong `routes/classData.js` (đã có `requireClassAccess`).
2. Công thức mới → `services/stats.js`, không đặt trong route.
3. Thêm test trong `tests/api.test.js`; ghi lại bảng API ở trên.

## Frontend
- Không build, không framework. `public/js/main.js` đọc `location.hash`, nạp trang tương ứng trong `pages/`, bọc bằng `shell()` (thanh trên cùng).
- Mỗi trang là `async function render*({ cls, state, refreshClasses, navigate })` trả về một `Node`.
- `ui.js`: `h(tag, attrs, ...children)` dựng DOM (tự escape — **không dùng `innerHTML` với dữ liệu**), `formModal`, `confirmModal`, `toast`, `downloadCsv`.
- `api.js`: `get/post/put/del`, ném `Error` với thông điệp của server; `status 401` → quay về đăng nhập.
- Ma trận điểm danh/bài tập cập nhật **lạc quan** (đổi ô ngay, hoàn tác nếu API lỗi).
- Màu theo biến CSS (`style.css`), tự theo chế độ sáng/tối của hệ điều hành. Biểu đồ đọc màu từ cùng các biến.
- Chart.js phục vụ tại `/vendor/chart.js/chart.umd.js` từ `node_modules`.

## Bảo mật (đã có)
scrypt băm mật khẩu · token phiên ngẫu nhiên 256-bit, chỉ lưu băm · cookie HttpOnly + SameSite=Lax (+ Secure khi `NODE_ENV=production`) · SQL tham số hóa · DOM dựng bằng textContent · header `nosniff`, `X-Frame-Options` · giới hạn body 100KB · giới hạn đăng nhập sai.
**Chưa có:** HTTPS (đặt sau reverse proxy khi triển khai), CSP, CSRF token (SameSite=Lax + API chỉ nhận JSON là lớp bảo vệ hiện tại), nhật ký kiểm toán.

## Supabase (đã chuyển — 2026-10-09)
- Webapp kết nối Postgres của Supabase qua `DATABASE_URL` (Session pooler, cổng 5432) bằng `pg.Pool` (tối đa 5 kết nối). SSL bật tự động (trừ localhost).
- Bảng đều **bật RLS và không có policy**: chỉ server (chuỗi Postgres, vai trò `postgres`) truy cập được; khóa `anon`/`publishable` công khai không đọc được gì. Trình duyệt **không** gọi Supabase trực tiếp — mọi thứ đi qua Express.
- Auth vẫn tự quản (bảng `users`). Chuyển sang Supabase Auth là bước riêng: tạo `profiles(id uuid → auth.users)`, viết policy theo `class_instructors`, thay `src/auth.js`.
- Mẫu policy khi cho phép truy cập trực tiếp từ trình duyệt:
  ```sql
  create policy "đọc theo lớp được phân" on enrollments for select using (
    exists (select 1 from class_instructors ci where ci.class_id = enrollments.class_id and ci.user_id = auth.uid()));
  ```
- Hiệu năng: mỗi truy vấn tới Supabase (vùng Tokyo) ~50-100ms → gom truy vấn (`Promise.all`, `unnest`, `returning`) thay vì lặp từng dòng.
- Sao lưu: bật backup trong Supabase (gói Free chỉ có sao lưu hằng ngày hạn chế; PITR cần gói trả phí).
- Lịch sử: bản SQLite cũ ở `legacy/` (xem [Archive.md](../Archive.md)).

### Vì sao cách lưu này "thông minh hơn" Excel
- Một dòng = một sự kiện → thêm buổi/bài không đổi cấu trúc.
- Tỉ lệ tính bằng truy vấn → luôn đúng, không gõ tay.
- Ràng buộc `UNIQUE`/`CHECK` chặn dữ liệu bẩn (trùng học viên, trạng thái lạ).
- Một học viên học nhiều lớp mà không nhân bản thông tin cá nhân.
- Phân quyền theo lớp, có thể ghi lịch sử ai sửa gì (thêm bảng `audit_log` khi cần).
