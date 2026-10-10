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
| Chiến lược & checklist kiểm thử | [Documents/testing.md](Documents/testing.md) |
| Quyết định, giả định, việc đang dở | [memory.md](memory.md) |
| Nội dung đã bỏ/thay thế (không xóa hẳn) | [Archive.md](Archive.md) |

## Lệnh
```
npm install
# .env cần DATABASE_URL (Supabase > Connect > Session pooler, cổng 5432) — xem Documents/supabase-guide.md
npm run create-admin -- email "Họ tên" matkhau   # tạo/đặt lại admin
npm run import -- danh-sach-hoc-vien-mau.xlsx    # nhập lớp từ Excel lên Supabase (chạy lại an toàn)
npm start        # http://localhost:3000   (PORT=3100 npm start nếu cổng bận; npm run dev: tự reload)
npm test         # node:test, Postgres trong bộ nhớ (PGlite) — KHÔNG đụng Supabase
```
Cần Node >= 22.13. Dữ liệu thật nằm trên **Supabase (Postgres)**.

## Cấu trúc
- `src/` backend: `create-app.js` (Express), `dev-server.js` (chạy máy nhà), `index.js` (điểm vào Vercel — **đừng thêm file tên app/index/server khác trong `src/`**), `routes/` (auth, users, classes, classData), `services/` (stats, importExcel), `schema.sql` (Postgres), `db.js` (pg Pool / PGlite), `auth.js`
- `public/` frontend ES modules thuần: `js/main.js` (router hash), `js/pages/*`, `js/ui.js` (helper DOM), `css/style.css`
- `scripts/` CLI · `supabase/schema.sql` (bản dán vào SQL Editor, giữ giống `src/schema.sql`) · `legacy/` (SQLite cũ, chỉ để tham khảo) · `tests/` · `Documents/` · `.claude/skills/`

## Quy tắc bắt buộc
1. **Mọi công thức tỉ lệ** (điểm danh, HW) chỉ nằm ở `src/services/stats.js`. Không tính lại ở frontend.
2. **Frontend không dùng `innerHTML` với dữ liệu** — dựng DOM bằng `h()` trong `ui.js` (chống XSS).
3. **SQL luôn dùng tham số `$1, $2…`** qua `db.all/one/run/tx`, không nối chuỗi. Mọi truy cập DB là `async`; nhiều lệnh ghi liên quan → `db.tx(async (t) => …)`. Nạp nhiều dòng → `unnest` (mỗi vòng tới Supabase ~50-100ms).
4. Mọi route theo lớp phải qua `requireClassAccess` (giảng viên chỉ thấy lớp được phân công); thao tác xóa/tạo lớp/quản lý user chỉ admin.
5. Đổi schema → sửa `src/schema.sql` **và** `supabase/schema.sql`, rồi **chạy SQL tương ứng (ALTER) trên Supabase** (schema chỉ dùng `if not exists`, không tự thêm cột); cập nhật `Documents/code-guide.md`, thêm test. Bảng mới phải `enable row level security`.
6. Thông báo lỗi trả về cho người dùng bằng tiếng Việt.
7. Vercel **bỏ qua `express.static()`**: file tĩnh phải nằm trong `public/` (kể cả thư viện — Chart.js ở `public/vendor/`, cập nhật bằng `npm run vendor`).
8. **Ghi một ô điểm danh/bài tập** phải đi qua route có `expected` + `updated_by` và gọi `realtime.publish` sau khi ghi thành công; frontend cập nhật ô tại chỗ (không dựng lại bảng). Đừng bỏ cơ chế này khi thêm loại ô mới.
9. Không commit `.env`, `node_modules/`, `legacy/*.db`, file `.xlsx/.csv` (dữ liệu học viên thật). Không đưa dữ liệu học viên thật vào repo/test ngoài file mẫu.
10. Xong một thay đổi: chạy `npm test`; cập nhật [memory.md](memory.md) nếu có quyết định/giả định mới; nội dung lỗi thời chuyển sang [Archive.md](Archive.md).

## Skill của project (`.claude/skills/`)
- `student-webapp-dev` — thêm/sửa tính năng đúng kiến trúc của project
- `import-excel` — nhập/đối soát dữ liệu từ file Excel của lớp
- `run-tests` — chạy và đọc kết quả kiểm thử, thêm test cho thay đổi
- `supabase`, `supabase-postgres-best-practices` — skill chính thức của Supabase (cài bằng `npx skills add supabase/agent-skills`; đã rà: chỉ gồm file markdown). Dùng khi đổi schema, RLS, index, truy vấn chậm, kết nối

## MCP
- `.mcp.json` (git-ignore): máy chủ MCP Supabase của project (mã project nằm trong URL). Cần đăng nhập 1 lần: chạy `claude` rồi `/mcp` ở terminal thường. Nên thêm `&read_only=true` vào URL nếu chỉ cần đọc — database chứa dữ liệu học viên thật.
