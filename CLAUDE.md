# Class Manager — Webapp quản lý lớp học

Webapp Node.js quản lý học viên, điểm danh, bài tập (HW/Capstone) theo từng lớp, có Dashboard theo dõi.
Giao diện và tài liệu bằng **tiếng Việt**; tên biến/hàm/bảng bằng **tiếng Anh**.

## Đọc trước khi làm việc
| Cần gì | Đọc |
|---|---|
| Bối cảnh, thuật ngữ, quy tắc nghiệp vụ, cấu trúc Excel | [Documents/context.md](Documents/context.md) |
| Mục tiêu, phạm vi, tính năng, lộ trình | [Documents/project-overview.md](Documents/project-overview.md) |
| Kiến trúc, API, code backend & frontend, chuyển Supabase | [Documents/code-guide.md](Documents/code-guide.md) |
| Quy trình làm việc / thêm tính năng / phát hành | [Documents/workflow.md](Documents/workflow.md) |
| Triển khai lên Vercel | [Documents/deploy-vercel.md](Documents/deploy-vercel.md) |
| Đồng bộ tự động từ Google Sheet | [Documents/google-sheet-sync.md](Documents/google-sheet-sync.md) |
| Chiến lược & checklist kiểm thử | [Documents/testing.md](Documents/testing.md) |
| Quyết định, giả định, việc đang dở | [memory.md](memory.md) |
| Nội dung đã bỏ/thay thế (không xóa hẳn) | [Archive.md](Archive.md) |

## Lệnh
```
npm install
# .env cần DATABASE_URL (Supabase > Connect > Session pooler, cổng 5432) — xem Documents/supabase-guide.md
npm run create-admin -- email "Họ tên" matkhau   # tạo/đặt lại admin
npm run create-guest -- email "Họ tên" matkhau   # tạo/đặt lại tài khoản KHÁCH (chỉ xem)
npm run import -- danh-sach-hoc-vien-mau.xlsx [--dry-run]   # điểm danh + bài tập từ workbook nhiều sheet (chỉ sheet đang HIỆN); X=đi học, O=vắng có phép, trống=vắng
npm run import-tx -- Transacitons.xlsx session-management.xlsx [--dry-run]   # lớp, giáo trình, học viên, ghi danh (KHÔNG đọc cột tiền)
# Hoặc nhập qua web: đăng nhập admin → mục "Nhập Excel" (#/import): Chạy thử → Nhập thật; xong thì màn hình đang mở tự cập nhật
npm start        # http://localhost:3000   (PORT=3100 npm start nếu cổng bận; npm run dev: tự reload)
npm test         # node:test, Postgres trong bộ nhớ (PGlite) — KHÔNG đụng Supabase
```
Cần Node >= 22.13. Dữ liệu thật nằm trên **Supabase (Postgres)**.

## Cấu trúc
- `src/` backend: `create-app.js` (Express), `dev-server.js` (chạy máy nhà), `index.js` (điểm vào Vercel — **đừng thêm file tên app/index/server khác trong `src/`**), `routes/` (auth, users, classes, classData, overview, import), `services/` (stats, importExcel), `schema.sql` (Postgres), `db.js` (pg Pool / PGlite), `auth.js`
- `public/` frontend ES modules thuần: `js/main.js` (router hash), `js/pages/*` (có `home.js` + `home-lake.js`), `js/lake-sim.mjs` (mô phỏng sóng hồ, thuần số học), `js/class-picker.js` + `js/class-filter.mjs` (chọn/lọc lớp), `js/ui.js` (helper DOM), `css/style.css`
- `scripts/` CLI · `supabase/schema.sql` (bản dán vào SQL Editor, giữ giống `src/schema.sql`) · `legacy/` (SQLite cũ, chỉ để tham khảo) · `tests/` · `Documents/` · `.claude/skills/`

## Quy tắc bắt buộc
1. **Mọi công thức tỉ lệ** (điểm danh, HW) chỉ nằm ở `src/services/stats.js` (dùng `attendanceRate()` kể cả khi tổng hợp bằng SQL như `routes/overview.js`). Không tính lại ở frontend/route.
2. **Frontend không dùng `innerHTML` với dữ liệu** — dựng DOM bằng `h()` trong `ui.js` (chống XSS).
3. **SQL luôn dùng tham số `$1, $2…`** qua `db.all/one/run/tx`, không nối chuỗi. Mọi truy cập DB là `async`; nhiều lệnh ghi liên quan → `db.tx(async (t) => …)`. Nạp nhiều dòng → `unnest` (mỗi vòng tới Supabase ~50-100ms).
4. Vai trò `guest` **chỉ xem**: middleware `blockGuestWrites` (`src/auth.js`, gắn ở `create-app.js` cho `/api`) chặn mọi POST/PUT/DELETE trừ đăng xuất. Route ghi mới tự được bảo vệ; frontend phải ẩn nút ghi khi `state.user.role === 'guest'`. Mọi route theo lớp phải qua `requireClassAccess` (giảng viên chỉ thấy lớp được phân công); thao tác xóa/tạo lớp/quản lý user chỉ admin.
5. Đổi schema → sửa `src/schema.sql` **và** `supabase/schema.sql`, rồi **chạy SQL tương ứng (ALTER) trên Supabase** (schema chỉ dùng `if not exists`, không tự thêm cột); cập nhật `Documents/code-guide.md`, thêm test. Bảng mới phải `enable row level security`.
6. Thông báo lỗi trả về cho người dùng bằng tiếng Việt.
7. **Header bảo mật/CSP** khai báo ở `src/security-headers.js` **và** `vercel.json` (file tĩnh không đi qua Express); test kiểm hai nơi khớp. Không thêm script inline hay `onclick=` vào HTML (CSP `script-src 'self'`); nguồn ngoài mới (CDN, API) phải được thêm vào CSP.
8. Vercel **bỏ qua `express.static()`**: file tĩnh phải nằm trong `public/` (kể cả thư viện — Chart.js ở `public/vendor/`, cập nhật bằng `npm run vendor`).
9. **KHÔNG lấy, lưu, hiển thị bất kỳ dữ liệu liên quan đến tiền** (giá, số tiền đã đóng, giảm giá, trạng thái thanh toán...) — yêu cầu của chủ dự án. Bộ nhập chỉ đọc cột trong danh sách cho phép (`ALLOWED_*`), không "đọc hết rồi bỏ". Cột `STATUS` của Transactions trộn thanh toán với trạng thái học: chỉ lấy "Không tham gia" và "Bảo lưu khóa trước". Bộ nhập điểm danh **không đọc cột voucher** (`VOUCHER*`, `EXPIRATION*`). Bảng `vouchers` đã bị xóa (2026-10-10); đừng thêm lại.
10. **Đồng bộ Google Sheet** (`routes/sync.js`, xác thực `SYNC_TOKEN`, đứng **trước** `express.json` 100KB trong `create-app.js`): chỉ nhận cột trong `ALLOWED_*`, chạy `importTransactions` với `preserveManual` (chỉ thêm/điền chỗ trống, không đè sửa tay, không xóa). Danh sách cột trong `scripts/google-apps-script/sync-transactions.gs` phải khớp `ALLOWED_*` (test kiểm). Không ghi mã bí mật vào repo.
10a. **Mọi thay đổi ghi danh phải ghi `enrollment_events`** (thêm vào lớp, đổi trạng thái, gỡ khỏi lớp, không còn/xuất hiện lại trong Sheet) bằng `services/history.js` **trong cùng transaction**; nhật ký chỉ thêm, không sửa/xóa. "Gỡ khỏi lớp" (`DELETE /students/:id`) chỉ admin và bắt buộc có `reason`. Đồng bộ Sheet chỉ **cảnh báo** học viên không còn trong Sheet (không tự chuyển nghỉ) và không tự thêm lại học viên admin đã gỡ.
10a-5. **Tốt nghiệp:** quy tắc có trạng thái `none/provisional/confirmed` — `none` thì KHÔNG gợi ý; không tự đặt quy tắc cho giáo trình khi chủ dự án chưa cung cấp. Gợi ý (`graduation.js`) chỉ để tham khảo, kết quả cuối do người đặt và ghi `enrollment_events`; công bố/sửa quy tắc chỉ admin; sau công bố giảng viên bị khóa. Điểm Module sẽ thêm vào quy tắc sau (chủ dự án sẽ cung cấp quy trình).
10a-4. **Giai đoạn lớp:** `end_date` là buổi học CUỐI; sau đó +14 ngày nộp & chấm bài, +14 ngày công bố tốt nghiệp rồi mới "đã kết thúc". Chỉ tính ở `services/timing.js`; đừng tự so ngày ở nơi khác.
10a-3. **FORM (hồ sơ đăng ký):** không bao giờ lưu họ tên/giới tính/ngày sinh/SĐT/email/địa chỉ/tên công ty/kỳ vọng; email/SĐT chỉ đi qua mã băm; hồ sơ chỉ admin xem (`/profiles` dùng `requireAdmin`, không đưa vào `/students`). Danh sách cột trong Apps Script phải khớp `FORM_COLUMNS` (test kiểm).
10a-2. **B2B/B2C:** tab COMPANY → `enrollments.segment = 'b2b'` + `company_name`; không lấy cột DOB/tiền. Cờ `is_b2b/is_b2c` của lớp do `/api/classes` tính (chữ B trong mã lớp hoặc có học viên B2B).
10b. **Nhập Excel qua web** (`routes/import.js`, admin): file chỉ ở bộ nhớ, ≤4MB (giới hạn Vercel), importer dùng `exceljs` (nằm ở `dependencies`, nạp lười khi dùng) và vẫn chỉ đọc cột trong danh sách cho phép; sau khi nhập thật phải `realtime.publishMany`. Mỗi lớp một transaction chạy song song (≤3) nên **sắp học viên theo mã trước khi upsert** (tránh deadlock).
11. **Ghi một ô điểm danh/bài tập** phải đi qua route có `expected` + `updated_by` và gọi `realtime.publish` sau khi ghi thành công; frontend cập nhật ô tại chỗ (không dựng lại bảng). Đừng bỏ cơ chế này khi thêm loại ô mới.
12. Không commit `.env`, `node_modules/`, `legacy/*.db`, file `.xlsx/.csv` (dữ liệu học viên thật). Không đưa dữ liệu học viên thật vào repo/test ngoài file mẫu.
13. Xong một thay đổi: chạy `npm test`; cập nhật [memory.md](memory.md) nếu có quyết định/giả định mới; nội dung lỗi thời chuyển sang [Archive.md](Archive.md).

## Skill của project (`.claude/skills/`)
- `student-webapp-dev` — thêm/sửa tính năng đúng kiến trúc của project
- `import-excel` — nhập/đối soát dữ liệu từ file Excel của lớp
- `run-tests` — chạy và đọc kết quả kiểm thử, thêm test cho thay đổi
- `class-manager-review` — điều phối review độc lập (agent `rules-reviewer`, `schema-guard`, `import-auditor` trong `.claude/agents/`, chỉ đọc). Dùng trước khi commit/đẩy; agent mới tạo cần **mở phiên mới** mới gọi được dạng subagent
- `supabase`, `supabase-postgres-best-practices` — skill chính thức của Supabase (cài bằng `npx skills add supabase/agent-skills`; đã rà: chỉ gồm file markdown). Dùng khi đổi schema, RLS, index, truy vấn chậm, kết nối

## MCP
- `.mcp.json` (git-ignore): máy chủ MCP Supabase của project (mã project nằm trong URL). Cần đăng nhập 1 lần: chạy `claude` rồi `/mcp` ở terminal thường. Nên thêm `&read_only=true` vào URL nếu chỉ cần đọc — database chứa dữ liệu học viên thật.
