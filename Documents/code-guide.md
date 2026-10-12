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

Chỉ mục: ngoài khóa duy nhất còn `idx_enrollments_class/student`, `idx_attendance_session`, `idx_submissions_assignment`, `idx_class_instructors_user`, `idx_auth_sessions_user`, `idx_classes_curriculum`.

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
- **Trang Điểm danh:** mỗi ô là `<select>` thật nằm trong suốt phía trên một ký hiệu (✓ T V P ·) — mở ra là danh sách đầy đủ ("✓ Có mặt", "T Đi trễ", "V Vắng", "P Có phép", "· Chưa điểm danh", "✎ Ghi chú…"), đóng lại chỉ hiện ký hiệu. Dưới tên buổi hiện **hiện diện/sĩ số** (`sessionSummaries()` trong `stats.js`; sĩ số = học viên đang học + đã hoàn thành; ô chưa điểm danh của buổi đã diễn ra tính là vắng). `PUT /attendance` trả luôn `enrollment` (% chuyên cần mới, số buổi) và `session` (hiện diện/sĩ số) nên số liệu đổi ngay không cần tải lại. Nút **Bỏ tất cả** → `DELETE /sessions/:id/attendance` (có hộp xác nhận; buổi quay về "chưa diễn ra"). **Sắp xếp** (`public/js/student-sort.mjs`, 11 cách): chỉ ở trình duyệt, lưu `localStorage` theo `att-sort:<user id>` nên mỗi tài khoản một lựa chọn riêng, không gửi lên máy chủ.
- **Thương hiệu:** "Starttrain | The Next Analyst" (hằng `BRAND` + `logo()` trong `ui.js`, tiêu đề tab/favicon ở `index.html`). Font **Inter** (sans-serif, không chân; Google Fonts, dự phòng `system-ui`).
- **Phong cách (theo ảnh tham khảo "Haven Realty"):** nền tối xanh navy + vầng sáng vàng/xanh, vàng champagne làm màu nhấn, thẻ kính mờ (`backdrop-filter`), nút vàng bo tròn, nhãn nhỏ viết hoa giãn chữ (`.eyebrow`), thẻ lối tắt có nút mũi tên tròn. Mặc định **tối**; nút mặt trời/mặt trăng đổi sang **sáng** (lưu `localStorage.theme`, gán `data-theme` trước khi CSS tải để không chớp).
- **Màu:** chỉ dùng biến CSS ở `:root` / `:root[data-theme="light"]` trong `style.css`: `--gold*`, `--glass*`, `--solid*`, `--bg-glow-*`, 4 màu trạng thái cố định `--ok/--warn/--bad/--info`, `--cat-1..4` cho biểu đồ phân loại. Không viết mã màu trực tiếp trong JS/CSS ngoài hai khối đó. Biểu đồ đọc màu từ biến lúc vẽ → đổi giao diện thì `route()` được gọi lại để vẽ lại.
- **Bố cục:** thanh điều hướng ngang (logo · Dashboard/Học viên/Điểm danh/Bài tập · chọn lớp · quản trị · đổi giao diện · người dùng). Dưới 900px thanh này chia thành các hàng, menu cuộn ngang.
- **Chọn lớp (`class-picker.js` + `class-filter.mjs`):** thay dropdown liệt kê toàn bộ lớp. Nút hiện lớp hiện tại; bấm mở bảng có ô tìm (không phân biệt dấu/hoa thường, nhiều từ khóa là AND, tìm được cả ngày `dd/mm/yy`), chip lọc **thời gian** (Đang học / Sắp mở / Đã kết thúc / Tất cả — mặc định chỉ "Đang học" nếu có) và **chương trình** (BIE, BIH, EBA...), tối đa 60 dòng, điều khiển bàn phím (↑ ↓ Enter Esc). Bộ lọc được nhớ trong `localStorage`. Logic lọc thuần nằm ở `class-filter.mjs` (có test); trang **Lớp học** của admin dùng chung.
- **Trang chủ (`pages/home.js`, route `#/`):** hero **mặt hồ** (`pages/home-lake.js` + `lake-sim.mjs`): trời, trăng/mặt trời, núi vẽ procedural ở độ phân giải thật của màn hình (DPR ≤ 2, rộng tối đa 2560px) thành texture; mặt nước render bằng **WebGL** (fragment shader: phản chiếu Fresnel, sóng li ti theo phối cảnh, vệt lấp lánh dưới trăng/mặt trời, sương chân trời), không WebGL thì dùng canvas 2D dự phòng. **Bảng màu theo giao diện** (`lake-theme.mjs`: tối = đêm trăng, sáng = hồ ban ngày; đổi giao diện thì Home vẽ lại, CSS `[data-theme="light"] .home-hero.cosmic` đổi chữ sang tối). Vòng sóng lấy từ **trường sóng** mô phỏng bằng phương trình sóng 2D (kx > ky nên vòng sóng dẹt theo phối cảnh), thỉnh thoảng có giọt rơi ngẫu nhiên (`createDropScheduler`, 2,6–6,5 giây/giọt), chạm/di chuột vào mặt nước tạo sóng, luôn có gợn li ti. Sóng mô phỏng ~30 bước/giây, GPU vẽ mỗi khung; WebGL context được giải phóng khi rời trang; dừng khi ngoài màn hình/tab ẩn/rời trang; `prefers-reduced-motion` chỉ vẽ một khung tĩnh. Chữ xoay mảnh (Inter 300), số liệu đếm lên, băng chuyền lớp đang học, lớp sắp khai giảng.
- **Chuyển trang mượt (`main.js`):** khung (`buildShell`) dựng **một lần**; mỗi lần đổi tab chỉ `transitionTo()` vùng `.view`: mờ dần nội dung cũ (140ms) → tải trang mới song song → hiện nội dung mới với hiệu ứng `rise` lần lượt từng khối. Thanh tiến trình vàng chỉ hiện nếu tải > 180ms. Có token chống chạy chồng khi bấm nhanh; tôn trọng `prefers-reduced-motion`. Danh sách lớp được cache, chỉ tải lại ở trang Lớp học/Người dùng.
- Biểu tượng SVG dựng bằng DOM (`icon(name)` trong `ui.js`).
- Chart.js phục vụ tại `/vendor/chart.umd.min.js` từ `public/vendor/` (Vercel không phục vụ `node_modules`; cập nhật bằng `npm run vendor`).

## Bảo mật (đã có)
- **Xác thực:** scrypt băm mật khẩu · token phiên ngẫu nhiên 256-bit, chỉ lưu băm · cookie HttpOnly + SameSite=Lax (+ Secure khi `NODE_ENV=production`) · giới hạn 8 lần đăng nhập sai/15 phút (trong bộ nhớ từng instance).
- **Dữ liệu:** SQL tham số hóa · RLS bật mọi bảng, không policy (chỉ server truy cập) · không lưu dữ liệu tiền.
- **Trình duyệt:** DOM dựng bằng `textContent` (test chặn `innerHTML`/`eval` trong `public/js`) · **CSP** `script-src 'self'` (không script inline), `connect-src` chỉ `'self'` + `*.supabase.co`/`wss`, `frame-ancestors 'none'`, `object-src 'none'` · `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. Nguồn: `src/security-headers.js`, lặp lại trong `vercel.json` cho file tĩnh; test `security-headers.test.js` giữ hai nơi khớp. Thêm nguồn ngoài (CDN, font, API) → sửa cả hai nơi.
- **Nhập Excel qua web:** `POST /api/import/attendance` và `/api/import/transactions` (admin; thân = file .xlsx octet-stream ≤4MB; `?dry_run=1` chạy thử rồi hoàn tác). Giao diện `#/import` bắt buộc chạy thử trước khi "Nhập thật". Attendance: các lớp chạy song song ≤3 transaction (21 giây cho 54 lớp so với 100 giây tuần tự); Transactions lấy giáo trình từ database (thiếu mẫu → 422 "Thiếu giáo trình"). Sau khi nhập thật phát `realtime.publishMany` cho từng lớp để màn hình đang mở tự cập nhật. File không lưu lại.
- **Đồng bộ Google Sheet:** `POST /api/sync/transactions` (header `X-Sync-Token` = `SYNC_TOKEN`, thân JSON `{ transactions: {headers, rows}, course?: {headers, rows} }`). Máy chủ chỉ giữ cột trong `ALLOWED_*`, dựng workbook trong bộ nhớ rồi gọi `importTransactions(..., { preserveManual: true })`; thiếu `course` thì dùng danh sách lớp trong database; có thay đổi thì `publishMany`; ghi `sync_runs`. `GET /api/import/sync-status` (admin) cho thẻ trạng thái ở trang Nhập Excel. Chi tiết: `Documents/google-sheet-sync.md`.
- **Nhật ký ghi danh (`enrollment_events`, `services/history.js`):** append-only, chụp lại mã/tên học viên + mã lớp nên vẫn đọc được sau khi xóa. Sự kiện: `enrolled`, `status_changed`, `removed`, `missing_from_sheet`, `reappeared`; nguồn `web`/`sync`/`import`; có `actor_name` khi do người dùng. Ghi ở: thêm/sửa/gỡ học viên (`classData.js`), nhập Transactions & đồng bộ Sheet (`importTransactions.js`), nhập điểm danh (`importExcel.js`). `GET /api/classes/:id/events` (100 gần nhất; mục "Lịch sử thay đổi của lớp" ở trang Học viên). `enrollments.origin` = `web`/`sheet`/`import`: chỉ ghi danh `sheet` (đã từng thấy trong Sheet) mới bị dò "không còn trong Sheet"; mỗi lần đồng bộ ghi 1 sự kiện/lần chuyển trạng thái (không ghi trùng); nếu Sheet ít hơn 50% lần trước thì bỏ qua bước dò (phòng xóa nhầm). Đồng bộ không tự thêm lại học viên đã bị admin gỡ (sự kiện `removed`).
- **B2B/B2C:** `enrollments.segment` (`b2c`/`b2b`) + `company_name`; `GET /api/classes` trả `is_b2b`, `is_b2c`, `companies` (suy từ chữ thứ 3 của mã lớp + học viên). Bộ lọc phía trình duyệt: `segmentFlags`, `countBySegment`, `filterClasses({segment})` trong `class-filter.mjs`. Đồng bộ tab COMPANY: `POST /api/sync/transactions` nhận thêm `company: {headers, rows}` (cột `SYNC_COMPANY_COLUMNS`), gộp vào cùng bộ nhập với cột `SEGMENT`.
- **Hồ sơ FORM (`services/formProfile.js`, bảng `registration_forms`):** `POST /api/sync/transactions` nhận thêm `form: {headers, rows}` (cột `FORM_COLUMNS`, email/SĐT đã băm ở Apps Script). `condenseRow` làm gọn; `applyForms` ghép theo (mã lớp + mã băm email → SĐT), một-ghi-danh-một-hồ-sơ (`enrollment_id` unique, phiếu mới nhất thắng), phiếu chờ có `enrollment_id` null và giữ mã băm (xóa-chèn lại mỗi lần vì payload là cả tab). `GET /api/classes/:id/profiles` **chỉ admin** (tổng hợp + từng học viên); `/students` không bao giờ trả hồ sơ.
- **Giai đoạn lớp (`services/timing.js`):** `TIMING_SQL` trả `upcoming | running | grading | graduation | finished | unknown` (buổi cuối = `end_date`, +14 ngày nộp/chấm bài, +14 ngày công bố tốt nghiệp); `PHASE_DATES_SQL` thêm `last_session_date`, `grading_until`, `graduation_on`. `/api/classes` và `/api/overview` trả cả mốc ngày; Trang chủ liệt kê lớp đang hoạt động (đang học → chấm bài → công bố) kèm nhãn giai đoạn; bộ lọc có nhóm ảo `active` ("Đang hoạt động", chỉ hiện chip khi khác "Đang học").
- **Tốt nghiệp (`services/graduation.js`, tab `Tốt nghiệp`):** `GET /api/classes/:id/graduation` (gợi ý + quyết định + chứng chỉ + tổng hợp, mọi vai trò xem), `PUT /graduation/:enrollmentId` (giảng viên của lớp/admin; sau công bố chỉ admin; ghi `enrollment_events` kiểu `graduation`), `POST /graduation-apply` (áp dụng gợi ý cho người chưa xét), `POST|DELETE /graduation-publish` (admin), `PUT /graduation-rules` (admin; sửa quy tắc của giáo trình đang gắn: `curricula.grad_*`). `evaluateGraduation` chỉ so sánh với ngưỡng; tỉ lệ chuyên cần vẫn từ `stats.js`. Cột mới: `enrollments.graduation_status/note/by/at`, `certificate_number`, `certificate_sent_date`; `classes.graduation_published_at/by`.
- **Vai trò:** `admin` (tất cả) · `instructor` (lớp được phân công, ghi được) · `guest` (lớp được phân công, **chỉ xem**: `blockGuestWrites` trả 403 "Tài khoản khách chỉ được xem" cho mọi phương thức ghi, kể cả đổi mật khẩu; giao diện ẩn nút sửa/thêm/điểm danh). Tạo khách: `npm run create-guest` hoặc trang Người dùng; phân lớp ở trang Người dùng.
- **API:** giới hạn body 100KB · chặn ghi chéo lớp · ghi ô có `expected` chống ghi đè.
- **Chưa có:** HTTPS ở máy nhà (Vercel có sẵn), CSRF token (hiện dựa vào SameSite=Lax + API chỉ nhận JSON), nhật ký kiểm toán đầy đủ, bộ đếm đăng nhập sai dùng chung nhiều instance.
- **Phụ thuộc:** `npm audit --omit=dev` = 0 lỗ hổng; `exceljs` (chỉ dùng cho lệnh nhập, máy chủ web không nạp) nằm ở `devDependencies`.

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
