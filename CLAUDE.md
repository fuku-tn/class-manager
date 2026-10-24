# Class Manager — Webapp quản lý lớp học

Webapp Node.js quản lý học viên, điểm danh, bài tập (HW/Capstone) theo từng lớp, có Dashboard theo dõi.
Giao diện và tài liệu bằng **tiếng Việt**; tên biến/hàm/bảng bằng **tiếng Anh**.

## Đọc trước khi làm việc
| Cần gì | Đọc |
|---|---|
| Thiết kế tổng thể: kiến trúc, mô hình dữ liệu, quy tắc, luồng, phân quyền, quyết định | [DESIGN.md](DESIGN.md) |
| Giao diện: sơ đồ trang, luồng thao tác, bố cục màn hình | [sitemap](Documents/2-giao-dien/sitemap.md) · [user-flow](Documents/2-giao-dien/user-flow.md) · [wireframe](Documents/2-giao-dien/wireframe.md) |
| Bối cảnh, thuật ngữ, quy tắc nghiệp vụ, cấu trúc Excel | [Documents/1-tong-quan/context.md](Documents/1-tong-quan/context.md) |
| Mục tiêu, phạm vi, tính năng, lộ trình | [Documents/1-tong-quan/project-overview.md](Documents/1-tong-quan/project-overview.md) |
| Kiến trúc, API, code backend & frontend, chuyển Supabase | [Documents/3-ky-thuat/code-guide.md](Documents/3-ky-thuat/code-guide.md) |
| Quy trình làm việc / thêm tính năng / phát hành | [Documents/4-van-hanh/workflow.md](Documents/4-van-hanh/workflow.md) |
| Triển khai lên Vercel | [Documents/4-van-hanh/deploy-vercel.md](Documents/4-van-hanh/deploy-vercel.md) |
| Đồng bộ tự động từ Google Sheet | [Documents/3-ky-thuat/google-sheet-sync.md](Documents/3-ky-thuat/google-sheet-sync.md) |
| Chiến lược & checklist kiểm thử | [Documents/3-ky-thuat/testing.md](Documents/3-ky-thuat/testing.md) |
| Bảo mật: đã có gì, việc cần tự làm, khi nghi bị lộ | [Documents/4-van-hanh/security.md](Documents/4-van-hanh/security.md) |
| Sao lưu / khôi phục dữ liệu | [Documents/4-van-hanh/backup.md](Documents/4-van-hanh/backup.md) |
| Quyết định, giả định, việc đang dở | [memory.md](memory.md) |
| Nội dung đã bỏ/thay thế (không xóa hẳn) | [Archive.md](Archive.md) |

## Lệnh
```
npm install
# .env cần DATABASE_URL (Supabase > Connect > Session pooler, cổng 5432) — xem Documents/3-ky-thuat/supabase-guide.md
npm run create-admin -- email "Họ tên" matkhau   # tạo/đặt lại admin
npm run create-guest -- email "Họ tên" matkhau   # tạo/đặt lại tài khoản KHÁCH (chỉ xem)
npm run import -- private-data/excel/danh-sach-hoc-vien-mau.xlsx [--dry-run] [--classes BIH073,BIE101]   # điểm danh + bài tập từ workbook nhiều sheet (chỉ sheet đang HIỆN); X=đi học, O=vắng có phép, trống=vắng
npm run import-tx -- private-data/excel/Transacitons.xlsx private-data/excel/session-management.xlsx [--dry-run]   # lớp, giáo trình, học viên, ghi danh (KHÔNG đọc cột tiền)
npm run import-feedback -- file.xlsx [--dry-run]   # khảo sát sau khóa (sheet FEEDBACK FORM): bỏ họ tên/email/SĐT, chữ tự do, câu hỏi học phí
# Hoặc nhập qua web: đăng nhập admin → mục "Nhập Excel" (#/import): Chạy thử → Nhập thật; xong thì màn hình đang mở tự cập nhật
npm start        # http://localhost:3000   (PORT=3100 npm start nếu cổng bận; npm run dev: tự reload)
npm test         # node:test, Postgres trong bộ nhớ (PGlite) — KHÔNG đụng Supabase
npm run import-points [-- file.xlsx|backup.csv] [--dry-run]   # điểm HW từ "Chấm điểm.xlsx" bảng Point_Transform (lịch 12:00: scripts/points-scheduled.cmd); trước khi nhập tự sao lưu điểm → private-data/backups/diem/ (giữ 1 bản)
npm run backup   # sao lưu toàn bộ dữ liệu (chỉ đọc) → private-data/backups/<ngày_giờ>/  — xem Documents/4-van-hanh/backup.md
npm run restore -- <thư-mục> [--dry-run]   # khôi phục, CHỈ vào database trống (RESTORE_DATABASE_URL hoặc DATABASE_URL)
```
Cần Node >= 22.13. Dữ liệu thật nằm trên **Supabase (Postgres)**.

## Cấu trúc
```
Course/
├─ README.md · CLAUDE.md · DESIGN.md · memory.md · Archive.md   (giới thiệu · hướng dẫn cho Claude · thiết kế · nhật ký quyết định · nội dung cũ)
├─ package.json · vercel.json · .env.example · .vercelignore · skills-lock.json
├─ src/            backend Express: create-app.js, index.js (điểm vào Vercel — đừng thêm file tên app/index/server khác), dev-server.js,
│                  db.js, auth.js, security-headers.js, schema.sql, routes/, services/
├─ public/         frontend ES modules thuần: index.html, css/, js/ (main.js router, ui.js, pages/*), assets/ (logo), vendor/ (Chart.js…)
├─ scripts/        CLI (create-admin, import*, run-migration…) + google-apps-script/ (sync-transactions.gs, sync-points.gs)
├─ supabase/       schema.sql (giữ giống src/schema.sql) + migrations/ (chạy trên Supabase TRƯỚC khi đẩy code)
├─ tests/          node:test + PGlite (không chạm Supabase)
├─ Documents/      tài liệu: 1-tong-quan/ · 2-giao-dien/ · 3-ky-thuat/ · 4-van-hanh/ (mục lục: Documents/README.md)
├─ legacy/         SQLite cũ, chỉ để tham khảo
├─ .claude/        skills/ + agents/ của project
├─ data/           (git-ignore) báo cáo sinh ra khi nhập, CSDL SQLite cũ
└─ private-data/   (git-ignore) excel/ dữ liệu học viên thật · van-ban/ văn bản nội bộ · remind-homework-kit/
```

## Quy tắc bắt buộc
1. **Mọi công thức tỉ lệ** (điểm danh, HW) chỉ nằm ở `src/services/stats.js` (dùng `attendanceRate()` kể cả khi tổng hợp bằng SQL như `routes/overview.js`). Không tính lại ở frontend/route.
2. **Frontend không dùng `innerHTML` với dữ liệu** — dựng DOM bằng `h()` trong `ui.js` (chống XSS).
3. **SQL luôn dùng tham số `$1, $2…`** qua `db.all/one/run/tx`, không nối chuỗi. Mọi truy cập DB là `async`; nhiều lệnh ghi liên quan → `db.tx(async (t) => …)`. Nạp nhiều dòng → `unnest` (mỗi vòng tới Supabase ~50-100ms).
4. Vai trò `guest` **chỉ xem**: middleware `blockGuestWrites` (`src/auth.js`, gắn ở `create-app.js` cho `/api`) chặn mọi POST/PUT/DELETE trừ đăng xuất. Route ghi mới tự được bảo vệ; frontend phải ẩn nút ghi khi `state.user.role === 'guest'`. Mọi route theo lớp phải qua `requireClassAccess` (giảng viên chỉ thấy lớp được phân công); thao tác xóa/tạo lớp/quản lý user chỉ admin.
5. Đổi schema → sửa `src/schema.sql` **và** `supabase/schema.sql`, rồi **chạy SQL tương ứng (ALTER) trên Supabase** (schema chỉ dùng `if not exists`, không tự thêm cột); cập nhật `Documents/3-ky-thuat/code-guide.md`, thêm test. Bảng mới phải `enable row level security`.
6. Thông báo lỗi trả về cho người dùng bằng tiếng Việt.
7. **Header bảo mật/CSP** khai báo ở `src/security-headers.js` **và** `vercel.json` (file tĩnh không đi qua Express); test kiểm hai nơi khớp. Không thêm script inline hay `onclick=` vào HTML (CSP `script-src 'self'`); nguồn ngoài mới (CDN, API) phải được thêm vào CSP.
8. Vercel **bỏ qua `express.static()`**: file tĩnh phải nằm trong `public/` (kể cả thư viện — Chart.js ở `public/vendor/`, cập nhật bằng `npm run vendor`).
9. **KHÔNG lấy, lưu, hiển thị bất kỳ dữ liệu liên quan đến tiền** (giá, số tiền đã đóng, giảm giá...) — yêu cầu của chủ dự án. **Ngoại lệ do chủ dự án cho phép (13/10/2026): chỉ NHÃN trạng thái đăng ký trong cột `STATUS`** (Đã thanh toán, Đã cọc, Chưa thanh toán, Scholarship, Bảo lưu khóa trước, Không tham gia — danh sách cố định `SHEET_STATUSES`, nhãn lạ bị bỏ) được lưu vào `enrollments.sheet_status`/`potential_students.last_status`/`enrollment_events`; vẫn tuyệt đối không có số tiền. Bộ nhập chỉ đọc cột trong danh sách cho phép (`ALLOWED_*`), không "đọc hết rồi bỏ". Quy tắc STATUS (PERSONAL): "Chưa thanh toán" → không có tên trong danh sách/điểm danh, vào bảng **Potential** (`potential_students`); "Không tham gia" → `deferred` (hiển thị như Bảo lưu); các nhãn còn lại → đang học. Đổi nhãn (vd Đã cọc → Đã thanh toán) ghi sự kiện `sheet_status` (admin + giảng viên của lớp xem ở Lịch sử). Bị xóa khỏi PERSONAL → xóa khỏi danh sách/điểm danh, chuyển Potential (có chụp lại điểm danh/bài tập để khôi phục khi quay lại; không tự xóa nếu đã có kết quả tốt nghiệp/chứng chỉ; COMPANY/B2B **không áp dụng**: học viên COMPANY học bình thường dù "Chưa thanh toán", chỉ cảnh báo khi biến mất — chủ dự án chốt 14/10/2026, đừng mở rộng). Bộ nhập điểm danh **không đọc cột voucher** (`VOUCHER*`, `EXPIRATION*`). Bảng `vouchers` đã bị xóa (2026-10-10); đừng thêm lại. **Ngoại lệ có kiểm soát thứ hai do chủ dự án cho phép (22/10/2026): voucher Google Maps của học viên** — xem quy tắc 14e; ngoài đúng chỗ đó vẫn KHÔNG lưu/hiển thị số tiền nào.
10. **Đồng bộ Google Sheet** (`routes/sync.js`, xác thực `SYNC_TOKEN`, đứng **trước** `express.json` 100KB trong `create-app.js`): chỉ nhận cột trong `ALLOWED_*`, chạy `importTransactions` với `preserveManual` (chỉ thêm/điền chỗ trống, không đè sửa tay, không xóa). Danh sách cột trong `scripts/google-apps-script/sync-transactions.gs` phải khớp `ALLOWED_*` (test kiểm). Không ghi mã bí mật vào repo. **Điều kiện dòng hợp lệ:** chỉ nhận dòng có mã học viên đúng dạng (`P.12345`/`B.00312`, regex `STUDENT_ID_RE`) VÀ mã lớp có trong sheet Course; dòng thiếu/sai bị bỏ qua và được đếm (`skipped_no_student_id`, `skipped_invalid_student_id`, `skipped_no_course`, `skipped_unknown_course`). Bảo lưu/chuyển lớp (STATUS, đổi mã lớp) không bị ảnh hưởng. **Chốt chặn:** một lượt đồng bộ tự động không được thêm/đánh dấu "không còn" quá max(100, 5%) ghi danh (`guard` trong `importTransactions.js`, trả 409, không ghi gì) — Sheet lệch cột từng tạo 1.556 ghi danh sai (13/10/2026). Khối lượng lớn hợp lệ thì dùng trang Nhập Excel.
10a. **Mọi thay đổi ghi danh phải ghi `enrollment_events`** (thêm vào lớp, đổi trạng thái, gỡ khỏi lớp, không còn/xuất hiện lại trong Sheet) bằng `services/history.js` **trong cùng transaction**; nhật ký chỉ thêm, không sửa/xóa. "Gỡ khỏi lớp" (`DELETE /students/:id`) chỉ admin và bắt buộc có `reason`. Đồng bộ Sheet: học viên B2C không còn trong PERSONAL được chuyển sang Potential (xem quy tắc 9); B2B chỉ cảnh báo; không tự thêm lại học viên admin đã gỡ (`removed`). Mọi thao tác này nằm trong chốt chặn 5%.
10c. **Lịch giảng dạy** (bảng `teaching_schedule`, Apps Script `sync-schedule.gs` → `POST /api/sync/schedule`, `services/importSchedule.js`): chỉ 9 cột `SCHEDULE_COLUMNS` (Ngày, Buổi, Khóa, Nội dung, Số buổi, Hình thức, Loại, Ghi chú, Giảng viên) — danh sách trong `.gs` phải khớp (test kiểm); Sheet là bản chuẩn, mỗi lượt thay toàn bộ trong một transaction, chốt chặn: lượt mới < 50% số dòng đang có (khi ≥ 20 dòng) thì từ chối (409). `GET /api/schedule/teaching`: admin thấy hết, người khác chỉ lớp được xem (như `/api/classes`); khóa chưa có trong app chỉ admin thấy. Bảng mới đã bật RLS; migration `2026-10-19-teaching-schedule.sql` chạy trước khi đẩy code.
10a-6. **Khảo sát sau khóa (`services/feedback.js`, bảng `course_feedback`):** không lấy email/họ tên/SĐT, câu trả lời chữ tự do, và câu hỏi về học phí (liên quan đến tiền); chỉ đọc cột khớp `QUESTIONS`. Chỉ admin xem (`/api/feedback`, `/classes/:id/feedback`). Điểm trung bình/NPS chỉ tính ở `stats.js`.
10a-5. **Tốt nghiệp:** **BIE-8, BIE-12, BIH-20, BIH-11, EBA-6, EBA-8 xét TỰ ĐỘNG** (chủ dự án chốt 18/10/2026; `AUTO_MIN_SESSIONS`, `buildAutoRows` trong `graduation.js`): đủ số buổi tối thiểu (6/9/16/9/EBA-6 5/EBA-8 6; BIH-11 chưa có trong Quy định → 9) + làm đủ MỌI bài đã giao (chỉ HW1–HW5; **EBA bắt buộc cố định HW1–HW4 + Capstone, EBA-8 HW1–HW3 + Capstone** dù chưa có tick (mọi lớp EBA đều được tạo sẵn cột HW1–HW4 + Capstone — `DEFAULT_ASSIGNMENTS.EBA`, 24/10/2026 — còn quy tắc tốt nghiệp EBA-8 giữ HW1–HW3 vì lớp cũ chưa có tick HW4), Mini Project, Capstone nếu lớp có Project; **có điểm thì phải ≥ 6**, chưa có điểm thì cần tick "Đã nộp"). Không đặt kết quả tay (409), kết quả đổi theo tick/điểm danh; đang học/đang nộp & chấm bài → "Đang học"; admin công bố thì chốt kết quả vào `enrollments.graduation_status` + `enrollment_events`. Giáo trình khác: quy tắc có trạng thái `none/provisional/confirmed` — `none` thì KHÔNG gợi ý; không tự đặt quy tắc cho giáo trình khi chủ dự án chưa cung cấp. Gợi ý (`graduation.js`) chỉ để tham khảo, kết quả cuối do người đặt và ghi `enrollment_events`; công bố/sửa quy tắc chỉ admin; sau công bố giảng viên bị khóa. Điểm Module sẽ thêm vào quy tắc sau (chủ dự án sẽ cung cấp quy trình). **Số buổi tối thiểu** theo Quy định 003/2026 (`MIN_SESSIONS` trong `graduation.js`) đã áp dụng; điều kiện điểm/xếp loại thì chưa — chỉ áp cho các lớp sau, đừng tự đặt.
10a-4. **Giai đoạn lớp:** `end_date` là buổi học CUỐI; sau đó +14 ngày nộp & chấm bài, +14 ngày công bố tốt nghiệp rồi mới "đã kết thúc" — **riêng lớp B2B (mã có chữ B) kết thúc ngay trong ngày buổi cuối**. Chỉ tính ở `services/timing.js`; đừng tự so ngày ở nơi khác.
10a-3. **FORM (hồ sơ đăng ký):** không bao giờ lưu họ tên/giới tính/ngày sinh/SĐT/email/địa chỉ/tên công ty/kỳ vọng; email/SĐT chỉ đi qua mã băm; hồ sơ chỉ admin xem (`/profiles` dùng `requireAdmin`, không đưa vào `/students`). Danh sách cột trong Apps Script phải khớp `FORM_COLUMNS` (test kiểm).
10a-2. **B2B/B2C:** tab COMPANY → `enrollments.segment = 'b2b'` + `company_name`; không lấy cột DOB/tiền. Cờ `is_b2b/is_b2c` của lớp do `/api/classes` tính (chữ B trong mã lớp hoặc có học viên B2B).
10b. **Nhập Excel qua web** (`routes/import.js`, admin): file chỉ ở bộ nhớ, ≤4MB (giới hạn Vercel), importer dùng `exceljs` (nằm ở `dependencies`, nạp lười khi dùng) và vẫn chỉ đọc cột trong danh sách cho phép; sau khi nhập thật phải `realtime.publishMany`. Mỗi lớp một transaction chạy song song (≤3) nên **sắp học viên theo mã trước khi upsert** (tránh deadlock).
11. **Ghi một ô điểm danh/bài tập** phải đi qua route có `expected` + `updated_by` và gọi `realtime.publish` sau khi ghi thành công; frontend cập nhật ô tại chỗ (không dựng lại bảng). Đừng bỏ cơ chế này khi thêm loại ô mới.
12. Không commit `.env`, `node_modules/`, `legacy/*.db`, file `.xlsx/.csv` (dữ liệu học viên thật). File dữ liệu/văn bản riêng tư đặt trong `private-data/` (git-ignore, chỉ trên máy). Không đưa dữ liệu học viên thật vào repo/test ngoài file mẫu.
13. Xong một thay đổi: chạy `npm test`; cập nhật [memory.md](memory.md) nếu có quyết định/giả định mới; nội dung lỗi thời chuyển sang [Archive.md](Archive.md).
14f. **Đơn xin nghỉ học qua email** (bảng `absence_requests`, `services/absence.js`, Apps Script `sync-absences.gs` đọc hộp thư academicaffairs.ste@gmail.com → `POST /api/sync/absences`, xác thực `SYNC_TOKEN`): máy chủ nhận diện học viên theo **email người gửi** (Reply-To, From, dòng `From:` hoặc `"from"` trong nội dung chuyển tiếp; bỏ hộp chuyển tiếp) khớp `students.email` (một email gắn nhiều mã học viên → ghi cho mọi mã đang học lớp nào đó), đọc NGÀY xin nghỉ trong tiêu đề (không có thì nội dung/`preview` của JSON flow), và **chỉ lưu học viên + ngày + mã thư + giờ nhận — KHÔNG lưu email người gửi, tiêu đề, nội dung thư** (test kiểm). Không khớp học viên đang học/không có ngày thì không ghi (Apps Script gắn nhãn `CM-chua-khop`). **Chỉ báo NGÀY — KHÔNG tự xác định buổi, không tô ô điểm danh, không tự ghi Có phép** (chủ dự án chốt 23/10/2026: "cứ báo là ngày bao nhiêu"): `GET /classes/:id/absences` trả đơn của mọi học viên đang học lớp đó (ngày nghỉ từ 7 ngày trước đến hết buổi cuối của lớp), chuông "Xin nghỉ" cạnh "Học bù" (rung khi có đơn mới), nút "Đã biết" (`POST …/dismiss`, admin/giảng viên của lớp, khách 403) để hết nhắc. Bảng có RLS; migration `2026-10-22-absence-requests.sql` chạy trước khi đẩy code.
14e. **Voucher Google Maps** (bảng `enrollment_vouchers`, popup "Voucher" ở trang Điểm danh `pages/vouchers.js`, `GET/PUT /api/classes/:id/vouchers[/:enrollmentId]`): số tiền voucher (500.000/1.000.000/1.500.000/2.000.000 hoặc tự nhập ≤ 100.000.000), ngày gửi, ngày hết hạn, trạng thái (trống = chưa dùng | `Used`) — **chỉ admin và tài khoản `users.can_voucher`** (hiện: Đoàn Minh Lý; admin bật ở trang Người dùng; máy chủ kiểm ở `needVoucher`, khách/giảng viên khác 403). **Nhập tay trên web; bộ nhập Excel/Sheet vẫn KHÔNG đọc cột voucher.** Không đưa voucher vào API học viên/điểm danh/bài tập/dashboard, tin nhắn nhắc bài, xuất CSV (test `tests/voucher.test.js` kiểm). Bảng có RLS; migration `2026-10-22-vouchers.sql` chạy trước khi đẩy code (đăng nhập truy vấn cột `can_voucher`).
14d. **Điểm bài tập** (bảng `homework_scores`): nguồn duy nhất là file Excel **"Chấm điểm.xlsx", bảng `Point_Transform`** (`services/pointsExcel.js` → `importPoints.js`, `npm run import-points`; lịch Task Scheduler 12:00 hằng ngày: Refresh Excel rồi nhập). Chỉ 5 cột `StudentID, Course, HW, Point, Module` (KHÔNG đọc cột họ tên, sheet StudentProfile); điểm thang 10 lưu riêng, không đổi trạng thái nộp bài; `Mini Project N` → `assignments.kind = 'mini'` (tự tạo, không tính % HW/tốt nghiệp/nhắc bài); **riêng BIH: Mini Project 3 = HW5** (lưu vào bài HW5, hiện tên MP3 — `POINT_ALIASES` ↔ `ASSIGNMENT_ALIASES` phải khớp). Google Sheet điểm đã tắt (`/api/sync/points` trả 410 trừ khi `POINTS_SHEET_SYNC=1`). Xem ở `GET /classes/:id/scores` (admin + giảng viên của lớp, khách 403); trung bình chỉ tính ở `stats.js` (`averageScore`). Quy tắc xếp loại/điểm tối thiểu của Quy định 003/2026 CHƯA áp dụng (chủ dự án sẽ đưa quy trình).
14c. **Potential** (`/api/classes/:id/potential`, tab `Potential`, sự kiện `moved_to_potential` trong lịch sử) chỉ cho admin và tài khoản có `users.can_view_potential` (hiện: Đoàn Ly; admin bật ở trang Người dùng). Giảng viên khác/khách bị 403 và không thấy sự kiện đó. Cột mới phải chạy migration trước khi đẩy code.
14b. **Xem lớp chưa diễn ra** (`users.can_view_upcoming`, admin bật ở trang Người dùng): tài khoản không phải khách được XEM (GET) mọi lớp có `timing = 'upcoming'` dù chưa phân công; ghi bị 403 (`requireClassAccess`); `/api/classes` trả `view_only`, frontend ẩn nút ghi như khách. Lớp bắt đầu thì quyền tự hết. Cột mới phải chạy migration trên Supabase **trước** khi đẩy code (`attachUser` truy vấn cột này).
14a. **Đăng nhập/mật khẩu** (`routes/auth.js`): giới hạn đăng nhập sai nằm trong DB (`auth_events`), không dùng bộ nhớ (serverless). Mật khẩu mới ≥ 10 ký tự; không ghi mật khẩu vào nhật ký; đổi mật khẩu phải hủy các phiên khác. Migration `auth_events` phải chạy trên Supabase **trước** khi đẩy code (đăng nhập truy vấn bảng này).
14. **Nhắc bài** (`routes/remind.js`): tin nhắn mẫu, tổng quan, cấu hình, ảnh thẻ chỉ cho admin hoặc `users.can_remind` — kiểm ở máy chủ, người khác chỉ nhận tiến độ từng học viên; tổng quan lớp **không có tên học viên**; khách 403. `private-data/remind-homework-kit/` (tên thật) git-ignore.

## Skill của project (`.claude/skills/`)
Mỗi skill gồm `SKILL.md` + 3 thư mục bắt buộc `references/` (tài liệu tra cứu), `assets/` (mẫu, tài nguyên), `scripts/` (script hỗ trợ); thư mục còn trống giữ bằng `.gitkeep`. Skill mới cũng phải tạo đủ ba thư mục này.
- `student-webapp-dev` — thêm/sửa tính năng đúng kiến trúc của project
- `import-excel` — nhập/đối soát dữ liệu từ file Excel của lớp
- `run-tests` — chạy và đọc kết quả kiểm thử, thêm test cho thay đổi
- `class-manager-review` — điều phối review độc lập (agent `rules-reviewer`, `schema-guard`, `import-auditor` trong `.claude/agents/`, chỉ đọc). Dùng trước khi commit/đẩy; agent mới tạo cần **mở phiên mới** mới gọi được dạng subagent
- `supabase`, `supabase-postgres-best-practices` — skill chính thức của Supabase (cài bằng `npx skills add supabase/agent-skills`; đã rà: chỉ gồm file markdown). Dùng khi đổi schema, RLS, index, truy vấn chậm, kết nối

## MCP
- `.mcp.json` (git-ignore): máy chủ MCP Supabase của project (mã project nằm trong URL). Cần đăng nhập 1 lần: chạy `claude` rồi `/mcp` ở terminal thường. Nên thêm `&read_only=true` vào URL nếu chỉ cần đọc — database chứa dữ liệu học viên thật.
