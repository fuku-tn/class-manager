# Hướng dẫn code — Backend & Frontend

## Kiến trúc
```
Trình duyệt (public/, ES modules, router hash)
      │  fetch JSON, cookie phiên HttpOnly
      ▼
Express (src/create-app.js) ── attachUser → requireAuth → [requireAdmin] → requireClassAccess
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
```
| Bảng | Ghi chú |
|---|---|
| `students` | Người học, duy nhất theo `student_code` |
| `enrollments` | Học viên trong lớp: `mode`, `course_status`, `certificate_status`; `UNIQUE(class_id, student_id)` |
| `sessions` | `session_no`, `title`, `session_date`, `held` |
| `attendance` | `status` ∈ present/late/absent/excused + `note`; `UNIQUE(enrollment_id, session_id)` |
| `assignments` | `kind` hw/capstone, `seq`, `collected` |
| `submissions` | `status` ∈ submitted/resubmit/missing, `challenge`, `note` |
| `users`, `auth_sessions` | Tài khoản + phiên đăng nhập (băm SHA-256 của token) |
| `curricula`, `curriculum_items` | Mẫu giáo trình (BIE-8…): mỗi dòng item = module/công cụ/giờ/nội dung của một buổi |
| `classes` (mở rộng) | `short_code`, `program`, `delivery_mode`, `shift`, `end_date`, `next_short_code`, `curriculum_id` |
| `students.gender`, `enrollments.registration_source`, `enrollments.carried_over` | Nguồn: Transactions. Không có cột tiền |

Schema nằm ở `src/schema.sql` (app + test dùng) và bản sao `supabase/schema.sql` (dán vào SQL Editor) — giữ hai file giống nhau. `create table if not exists` không thêm cột vào bảng đã có: đổi cột thì chạy `alter table …` trên Supabase.

Chỉ lưu **sự kiện đã ghi nhận**; tỉ lệ luôn được tính, không lưu (tránh lệch số).

## Backend

### API (tiền tố `/api`, trả JSON, lỗi `{error: "…"}` tiếng Việt)
| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password` | – / đăng nhập | Phiên cookie, giới hạn 8 lần sai/15 phút |
| `GET/POST /users` · `PUT /users/:id/classes` · `PUT /users/:id/active` | admin | Quản lý người dùng, phân lớp, khóa tài khoản |
| `GET /classes` · `POST /classes` | đăng nhập / admin | Danh sách lớp được phép (kèm `timing` = running/upcoming/finished/unknown theo ngày, múi giờ VN; thiếu ngày kết thúc coi là 90 ngày); tạo lớp (+ buổi, HW, Capstone) |
| `GET /overview` | đăng nhập | Cho trang Home: số lớp/học viên/chuyên cần của lớp **đang diễn ra** trong phạm vi quyền, danh sách lớp nổi bật và sắp khai giảng |
| `GET/PUT /classes/:classId` | lớp / admin | Chi tiết, sửa lớp |
| `GET /classes/:classId/dashboard` | lớp | KPI + số liệu biểu đồ + danh sách cần chú ý |
| `GET /classes/:classId/sessions` · `PUT …/sessions/:sid` | lớp | Tên/ngày buổi |
| `GET /classes/:classId/assignments` · `PUT …/assignments/:aid` | lớp | Tên/hạn bài |
| `GET/POST /classes/:classId/students` · `PUT/DELETE …/students/:eid` | lớp (DELETE: admin) | Học viên + thống kê; xóa khỏi lớp |
| `GET/PUT /classes/:classId/attendance` | lớp | Ma trận (mỗi ô có `by`, `at`); ghi 1 ô (`status:null` = xóa). Body có thể kèm `expected` (trạng thái người dùng đang thấy): khác với DB → **409** + `current`, không ghi đè |
| `POST /classes/:classId/sessions/:sid/attendance/bulk` | lớp | Điền trạng thái cho ô trống của học viên `active` |
| `GET/PUT /classes/:classId/submissions` | lớp | Ma trận bài tập; ghi 1 ô (cùng cơ chế `expected`/409) |
| `GET /classes/:classId/realtime` | lớp | `{url, key, channel}` để trình duyệt nghe tin thay đổi của lớp; `null` nếu server chưa cấu hình Supabase |

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
- **Thương hiệu:** "Starttrain | The Next Analyst" (hằng `BRAND` + `logo()` trong `ui.js`, tiêu đề tab/favicon ở `index.html`). Font **Inter** (sans-serif, không chân; Google Fonts, dự phòng `system-ui`).
- **Phong cách (theo ảnh tham khảo "Haven Realty"):** nền tối xanh navy + vầng sáng vàng/xanh, vàng champagne làm màu nhấn, thẻ kính mờ (`backdrop-filter`), nút vàng bo tròn, nhãn nhỏ viết hoa giãn chữ (`.eyebrow`), thẻ lối tắt có nút mũi tên tròn. Mặc định **tối**; nút mặt trời/mặt trăng đổi sang **sáng** (lưu `localStorage.theme`, gán `data-theme` trước khi CSS tải để không chớp).
- **Màu:** chỉ dùng biến CSS ở `:root` / `:root[data-theme="light"]` trong `style.css`: `--gold*`, `--glass*`, `--solid*`, `--bg-glow-*`, 4 màu trạng thái cố định `--ok/--warn/--bad/--info`, `--cat-1..4` cho biểu đồ phân loại. Không viết mã màu trực tiếp trong JS/CSS ngoài hai khối đó. Biểu đồ đọc màu từ biến lúc vẽ → đổi giao diện thì `route()` được gọi lại để vẽ lại.
- **Bố cục:** thanh điều hướng ngang (logo · Dashboard/Học viên/Điểm danh/Bài tập · chọn lớp · quản trị · đổi giao diện · người dùng). Dưới 900px thanh này chia thành các hàng, menu cuộn ngang.
- **Chọn lớp (`class-picker.js` + `class-filter.mjs`):** thay dropdown liệt kê toàn bộ lớp. Nút hiện lớp hiện tại; bấm mở bảng có ô tìm (không phân biệt dấu/hoa thường, nhiều từ khóa là AND, tìm được cả ngày `dd/mm/yy`), chip lọc **thời gian** (Đang học / Sắp mở / Đã kết thúc / Tất cả — mặc định chỉ "Đang học" nếu có) và **chương trình** (BIE, BIH, EBA...), tối đa 60 dòng, điều khiển bàn phím (↑ ↓ Enter Esc). Bộ lọc được nhớ trong `localStorage`. Logic lọc thuần nằm ở `class-filter.mjs` (có test); trang **Lớp học** của admin dùng chung.
- **Trang chủ (`pages/home.js`, route `#/`):** hero "vũ trụ rộng lớn" (theo ảnh tham khảo EOSAI; **không** dùng ảnh gốc) — cảnh SVG vẽ tay ở `pages/home-scene.js`: bầu trời hoàng hôn, hành tinh có vòng quỹ đạo và vệ tinh chạy quanh, cổng đá khổng lồ, mây trôi, mặt nước phản chiếu, bóng người; 3 lớp thị sai theo con trỏ (`--mx/--my`), sao nhấp nháy, hành tinh nổi, ánh nước lung linh; chữ xoay mảnh (Inter 300), số liệu đếm lên, băng chuyền lớp đang học tự chạy (dừng khi rê chuột/tab ẩn), hàng lớp sắp khai giảng. Mọi chuyển động tắt khi `prefers-reduced-motion`.
- **Chuyển trang mượt (`main.js`):** khung (`buildShell`) dựng **một lần**; mỗi lần đổi tab chỉ `transitionTo()` vùng `.view`: mờ dần nội dung cũ (140ms) → tải trang mới song song → hiện nội dung mới với hiệu ứng `rise` lần lượt từng khối. Thanh tiến trình vàng chỉ hiện nếu tải > 180ms. Có token chống chạy chồng khi bấm nhanh; tôn trọng `prefers-reduced-motion`. Danh sách lớp được cache, chỉ tải lại ở trang Lớp học/Người dùng.
- Biểu tượng SVG dựng bằng DOM (`icon(name)` trong `ui.js`).
- Chart.js phục vụ tại `/vendor/chart.umd.min.js` từ `public/vendor/` (Vercel không phục vụ `node_modules`; cập nhật bằng `npm run vendor`).

## Bảo mật (đã có)
scrypt băm mật khẩu · token phiên ngẫu nhiên 256-bit, chỉ lưu băm · cookie HttpOnly + SameSite=Lax (+ Secure khi `NODE_ENV=production`) · SQL tham số hóa · DOM dựng bằng textContent · header `nosniff`, `X-Frame-Options` · giới hạn body 100KB · giới hạn đăng nhập sai.
**Chưa có:** HTTPS (đặt sau reverse proxy khi triển khai), CSP, CSRF token (SameSite=Lax + API chỉ nhận JSON là lớp bảo vệ hiện tại), nhật ký kiểm toán.

## Nhập điểm danh (`services/importExcel.js`)
- CLI: `npm run import -- <file.xlsx> [--dry-run] [--sheets "BIE-8,BIE-12"]`. Mặc định đọc mọi sheet **đang hiện** có cột `SESSION n` (sheet ẩn = bản cũ). Chạy trong **một transaction**: lỗi thì hoàn tác toàn bộ; `--dry-run` luôn hoàn tác.
- Danh sách cột cho phép (`isAllowedHeader`): cột ngoài danh sách (kể cả voucher/tiền) không bao giờ được đọc. Có test dùng dữ liệu mồi ở cột voucher.
- `parseAttendanceCell`: X/x → có mặt, O → có phép, trống → vắng, `X\nX` → có mặt + cảnh báo, chữ khác → vắng + cảnh báo.
- Khớp lớp: theo `classes.code`, nếu không có thì theo mã ngắn (`BIE088`); không có nữa mới tạo lớp mới (kèm cảnh báo).
- Giáo trình: tên sheet trùng `curricula.code` (BIE-8/BIE-12) thì **đặt** `classes.curriculum_id`; số buổi = `curricula.session_count` (cột vượt số này bị bỏ + cảnh báo); tên buổi lấy từ module giáo trình (chỉ ghi đè tên còn mặc định).
- **Không ghi đè** ô đã được sửa trực tiếp trên app (`updated_by` khác null) — được đếm là `kept_from_app`; không hạ `course_status` đã có về "đang học".
- Cần tỉ lệ đúng khi có `excused`: nằm ở `services/stats.js` (mẫu số trừ buổi có phép), không tính lại ở nơi khác.

## Nhập Transactions + giáo trình (`services/importTransactions.js`)
- CLI: `npm run import-tx -- <Transacitons.xlsx> <session-management.xlsx> [--dry-run]`. `--dry-run` chạy toàn bộ trong một transaction rồi hoàn tác, chỉ in số liệu.
- **Danh sách cột cho phép** (`ALLOWED_COURSE`, `ALLOWED_TX`, `ALLOWED_CURRICULUM`): chỉ chỉ số cột nằm trong danh sách mới được đọc. Không đọc cột nào khác (kể cả cột tiền). Có test dùng "dữ liệu mồi" ở cột tiền để chứng minh không lọt vào DB.
- Idempotent: upsert theo `classes.code`, `students.student_code`, `(class, student)`. Không ghi đè `course_status` đã đặt tay (`deferred`/`completed`) và tên buổi do người dùng tự đặt.
- Tên buổi sinh từ module của giáo trình: `Buổi n — Module1 + Module2`. Lớp chưa có giáo trình (EBA, SIA, PBM...) chưa có buổi.
- Di chuyển cấu trúc: `supabase/migrations/2026-10-10-curricula-and-class-fields.sql` (chỉ thêm), chạy bằng `node scripts/run-migration.js <file>`.

## Đồng bộ thời gian thực (nhiều người cùng điểm danh)
Mục tiêu: người này đánh dấu thì người kia thấy trong ~1 giây và không vô tình ghi đè.
1. **Phát tin:** sau mỗi lần ghi thành công (điểm danh, bài tập, "Cả lớp ✓", sửa buổi), server gọi `services/realtime.publish(classId, {kind})` → Supabase Realtime **Broadcast** (REST). Tin chỉ là tín hiệu `{kind}`, **không chứa dữ liệu học viên**.
2. **Nghe tin:** trình duyệt (`public/js/live.js`) lấy cấu hình ở `GET …/realtime`, nạp `public/vendor/supabase.js`, đăng ký kênh của lớp. Nhận tin → tải lại ma trận qua API có đăng nhập → chỉ vẽ lại các ô thay đổi (nháy vàng). Đo thực tế: ~0,8–1,1 giây từ lúc A bấm đến lúc B thấy.
3. **Kênh:** tên `cls-<id>-<hmac 20 ký tự>`, sinh từ bí mật của server; chỉ người đã đăng nhập và có quyền vào lớp mới lấy được. Kênh là public của Supabase nhưng vì tin không mang dữ liệu nên người ngoài nghe được cũng chỉ biết "có thay đổi".
4. **Dự phòng:** mất kết nối realtime → hỏi lại mỗi 3s; bình thường vá tin lỡ mỗi ~20s; quay lại tab/kết nối lại → đồng bộ ngay. Huy hiệu "Trực tiếp / Đang kết nối… / Tự làm mới" ở đầu trang.
5. **Chặn ghi đè:** client gửi `expected`; server khóa dòng (`select … for update`) và so sánh trong transaction; ô trống tạo đồng thời được chặn bằng `ON CONFLICT … WHERE`. Không gửi `expected` → ghi đè như API cũ.
6. **Người sửa:** cột `updated_by` (attendance, submissions) → tooltip "Có mặt · An, 14:05".
Biến môi trường: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (hoặc `NEXT_PUBLIC_…` cùng tên) — khóa *publishable* vốn công khai, **không** dùng `service_role`. Tùy chọn `REALTIME_SECRET` (mặc định suy ra từ `DATABASE_URL`).

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
