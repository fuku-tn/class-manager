# Memory — quyết định, giả định, việc đang dở

Cập nhật file này mỗi khi chốt quyết định mới. Mục lỗi thời → chuyển sang [Archive.md](Archive.md).

## Quyết định đã chốt (2026-10-09)

- **Người dùng:** nhiều giảng viên/trợ giảng; 2 vai trò `admin` và `instructor`; giảng viên chỉ thấy lớp được phân công.
- **Lưu trữ:** ~~SQLite local~~ → **Supabase (Postgres)** từ 2026-10-09. Webapp kết nối trực tiếp qua `DATABASE_URL` (Session pooler, cổng 5432, thư viện `pg`). Test dùng PGlite (Postgres trong bộ nhớ). Bản SQLite cũ giữ ở `legacy/` để tham khảo.
- **Công nghệ:** Express + HTML/JS thuần (ES modules) + Chart.js (phục vụ từ `node_modules`, không CDN). Phụ thuộc: `express`, `exceljs`, `chart.js`, `pg`; dev: `@electric-sql/pglite`.
- **Ngôn ngữ:** giao diện + tài liệu tiếng Việt, code tiếng Anh.
- **Thương hiệu & giao diện:** "Starttrain | The Next Analyst"; font Inter (không chân — theo yêu cầu ban đầu của chủ dự án, dù ảnh tham khảo dùng chữ có chân cho tiêu đề). Từ 2026-10-09 theo ảnh tham khảo "Haven Realty": nền tối + vàng champagne `#c9a46a` + thẻ kính mờ, mặc định tối, có chế độ sáng. Màu/logo do Claude chọn tạm — **thay nếu Starttrain có bảng màu/logo chính thức** (biến trong `style.css`, `logo()` trong `ui.js`). Ảnh tham khảo chỉ dùng làm phong cách, **không** đưa ảnh bất động sản vào app.
- Auth tự viết (scrypt + phiên lưu DB + cookie HttpOnly), bảng `users` riêng. Chưa dùng Supabase Auth.
- **RLS bật trên mọi bảng, không policy**: chỉ server (chuỗi Postgres) đọc/ghi được; khóa `anon` công khai không đọc được gì.
- Mật khẩu DB đã từng gửi trong khung chat → nên reset trên Supabase rồi cập nhật `.env`.

## Giả định cần xác nhận với chủ dự án

| # | Giả định hiện tại | Ảnh hưởng nếu sai |
| --- | --- | --- |
| 1 | Ô trống trong buổi đã diễn ra = **Vắng**; ô trống ở bài đã thu = **Thiếu** | Tỉ lệ sai |
| 2 | Tỉ lệ điểm danh = (có mặt + trễ) / (buổi đã diễn ra − có phép). Khớp cột ATTENDANCE RATE mẫu (vd 6/8 = 0.75) | `services/stats.js` |
| 3 | Buổi/bài chỉ tính vào mẫu số khi **đã có ít nhất 1 bản ghi** (`held`/`collected`). HW6 mẫu không ai nộp → coi chưa thu | Dashboard |
| 4 | "Nộp lại" **không** tính hoàn thành HW | `stats.js` |
| 5 | Học viên "cần chú ý": điểm danh < 80% **hoặc** thiếu ≥ 2 HW (đổi bằng `ATTENDANCE_THRESHOLD`, `MISSING_HW_ALERT`) | Danh sách at-risk (mẫu đang ra 20/44 — có thể quá nhạy) |
| 6 | Ghi chú "Vào trễ" ở ô có mặt → trạng thái `late` khi import | Import |
| 7 | Chỉ học viên `active`/`completed` được tính trong Dashboard; `deferred`/`dropped` loại ra | Dashboard |
| 8 | Các cột `SUBINDEX` (= số lần học, tự tính), `CUSTOMER ID`, `FORM`, `CERTIFICATE STATUS`: chỉ lưu. Cột `VOUCHER*` bị bỏ hẳn (2026-10-10) | — |
| 9 | Chưa có ngày học của từng buổi (Excel không có) → để trống, nhập tay trong tab Điểm danh (nút ✎) | — |
| 10 | Một sheet có thể chứa nhiều lớp (tách theo `COURSE ID`); giá trị lạ như `O` ở ô buổi/bài (2 học viên P104 buổi 1) tính là vắng — khớp ATTENDANCE RATE = 0 trong Excel. Cột ATTENDANCE RATE của Excel chia cho **tổng số buổi (8)**, webapp chia cho **số buổi đã diễn ra** nên P104 hiện ~100% thay vì 13% | Cần xác nhận cách tính nào đúng |

## Việc còn dở / ý tưởng

- [ ] Thêm nút "Đổi mật khẩu" trên giao diện để giảng viên tự đổi mật khẩu cấp ban đầu.
- [ ] Xác nhận lớp dùng mẫu BIE-12 theo sheet: BIE068, 075 (B075), 078, 081, 085, 090, 092, 102 (đã đổi theo tên sheet, thay quy tắc mặc định BIE-8).
- [ ] Chương trình chưa có giáo trình (EBA, SIA/SCA, PBM, DDM, SQL...): 86 lớp chưa có buổi học → chưa điểm danh được. Cần giáo trình hoặc số buổi mặc định (Form gợi ý EBA 6, SIA 8, PBM 10).
- [ ] 122 lớp mới chưa phân cho 3 giảng viên (mới chỉ P101, P104); admin thấy tất cả. Cần quy tắc phân lớp.
- [ ] Bài tập (HW/Capstone) chỉ có ở P101/P104; chưa có giao diện thêm bài tập cho lớp khác.
- [ ] Bước tiếp: Form → đăng ký "chờ xác nhận" trong app; đồng bộ Sheet Transactions tự động (Apps Script đẩy hoặc service account đọc, chỉ các cột cho phép); Company.
- [ ] Rà báo cáo trùng lặp (`data/bao-cao-trung-lap.csv`, chỉ máy bạn): 1 email 2 mã, 7 mã nhiều email, 2 SĐT 2 mã.
- [ ] Thêm `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` vào Vercel (Production) để bật realtime, rồi Redeploy.
- [ ] Kiểm tra bản Vercel sau mỗi lần đẩy (đặc biệt sau khi thêm CSP): đăng nhập, Home, điểm danh realtime, biểu đồ.
- [ ] Đặt lại mật khẩu database Supabase (đã lộ trong chat) và cập nhật `DATABASE_URL` trong `.env`.
- [ ] Đổi mật khẩu tài khoản admin tạm (hỏi chủ dự án; không ghi mật khẩu vào repo) hoặc tạo admin riêng bằng `npm run create-admin`.
- [ ] Chủ dự án xác nhận các giả định ở trên (đặc biệt #1, #4, #5).
- [ ] Giao diện đã kiểm bằng Edge headless (13 bước, không vi phạm CSP); còn cần chủ dự án thử thao tác thật trên bản Vercel (bấm ô điểm danh nhiều người cùng lúc, hộp thoại, đổi sáng/tối).
- [ ] Upload Excel trực tiếp trên web (hiện chỉ có CLI `npm run import`).
- [ ] Thêm tab xem chi tiết 1 học viên (lịch sử điểm danh/HW qua các lớp).

## Nhật ký những gì đã làm

| Ngày | Việc | Kết quả / ghi chú |
| --- | --- | --- |
| 2026-10-09 | Dựng webapp Node.js: Express + frontend thuần + Chart.js; auth admin/giảng viên; 4 màn hình lớp + Lớp học + Người dùng | Chạy ở cổng 3100 (3000 bị DuHoc24 chiếm) |
| 2026-10-09 | Tạo bộ tài liệu: CLAUDE.md, memory.md, Archive.md, `Documents/` (context, project-overview, code-guide, workflow, testing, supabase-guide) và 3 skill trong `.claude/skills/` | — |
| 2026-10-09 | Import Excel lần đầu: lớp P101 (46 học viên) | Dashboard khớp dòng tổng của Excel |
| 2026-10-09 | Excel được thêm lớp P104 (26 học viên) cùng sheet → importer tách lớp theo `COURSE ID` | 2 lớp, 72 học viên; 2 ô `O` ở buổi 1 bị cảnh báo & tính vắng |
| 2026-10-09 | Thử kết nối Postgres local (localhost:5432) | Bị từ chối đăng nhập; chuyển sang Supabase |
| 2026-10-09 | Tạo schema Supabase (`supabase/schema.sql`, RLS bật, không policy) và chuyển dữ liệu SQLite → Supabase (`npm run migrate-pg`) | Số dòng khớp: 2 lớp, 72 học viên, 394 điểm danh, 276 bài nộp, 18 voucher |
| 2026-10-09 | Chuyển toàn bộ code sang Postgres/Supabase (`src/db.js` dùng `pg`; mọi route/service async); test dùng PGlite | 15 test pass; API thử trực tiếp trên Supabase (đăng nhập, dashboard, ghi/hoàn điểm danh, import lại ~5s) |
| 2026-10-09 | `.gitignore` loại `.env`, `data/`, `legacy/*.db`, `*.xlsx/xls/csv` (Excel chứa email/SĐT thật) | Chưa `git init`/push |

| 2026-10-09 | Làm mới giao diện: thanh bên navy, font Inter, bảng màu nhất quán (biến CSS), thương hiệu "Starttrain \| The Next Analyst" (logo, tiêu đề, trang đăng nhập), biểu đồ có trạng thái rỗng, responsive | Đã chụp màn hình bằng Edge headless (desktop 1366px + mobile 390px), không có lỗi JS; bảng màu chưa có xác nhận từ thương hiệu thật |
| 2026-10-09 | Giao diện v3 theo ảnh tham khảo (tối + vàng + kính mờ, thanh điều hướng ngang, hero + thẻ lối tắt ở Dashboard, nút đổi sáng/tối) và **chuyển tab mượt**: khung cố định, mờ dần/hiện lên, thanh tiến trình, cache danh sách lớp | Nguyên nhân chớp trắng cũ: mỗi lần đổi tab xóa cả trang rồi mới tải dữ liệu. Đo bằng Edge headless qua 4 lần đổi tab: khung không dựng lại, 0 khung hình trống, có đủ pha mờ dần/hiện lên; không lỗi JS |
| 2026-10-09 | Chuẩn bị triển khai Vercel: `src/index.js` (điểm vào), đổi tên `app.js→create-app.js`, `server.js→dev-server.js`, Chart.js vào `public/vendor`, `vercel.json` (vùng hnd1), `.vercelignore`, DB lười + `trust proxy`; viết `Documents/deploy-vercel.md` | Kiểm tra tại chỗ OK (nạp như Vercel, DB thật, 15 test). **Chưa deploy thật** — cần tài khoản Vercel của chủ dự án |
| 2026-10-10 | Kết nối Claude ↔ Supabase: thêm MCP server `supabase` (project scope, `.mcp.json`, git-ignore) và cài skill chính thức `supabase`, `supabase-postgres-best-practices` vào `.claude/skills/` | MCP đang chờ phê duyệt + đăng nhập (chủ dự án làm ở terminal thường). URL hiện **chưa** có `read_only=true` |
| 2026-10-10 | **Đồng bộ thời gian thực** điểm danh/bài tập: Supabase Realtime Broadcast (tín hiệu, không chứa dữ liệu) + tải lại ô thay đổi; chặn ghi đè bằng `expected`/409; cột `updated_by` (đã `alter table` trên Supabase) + tooltip người sửa; huy hiệu Trực tiếp | Đo bằng 2 trình duyệt trên dữ liệu thật: B thấy sau 0,8–1,1s; xung đột báo đúng. 24 test pass. **Cần đặt `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` trên Vercel** thì bản live mới có realtime tức thì |
| 2026-10-10 | Buổi 2–3 của P104 là dữ liệu thử của chủ dự án đã xóa → đặt `held=false` trên Supabase; code: xóa bản ghi cuối của một buổi/bài thì `held`/`collected` tự về false | P104 còn 1/8 buổi đã diễn ra; 25 test pass |
| 2026-10-10 | Tạo 3 tài khoản giảng viên trên Supabase, phân cả 2 lớp (thông tin đăng nhập gửi riêng cho từng người, không ghi vào repo) | Chưa có giao diện tự đổi mật khẩu (API `POST /api/auth/password` đã có) |
| 2026-10-10 | Chủ dự án chia sẻ flow đăng ký + `Transacitons.xlsx` (4 sheet) + `session-management.xlsx`; chốt: ca MM/AA/EE/MA = sáng/chiều/tối/cả ngày; không lưu trạng thái thanh toán; Company làm sau; lớp BI cũ theo mẫu của lớp mới | Xem Documents/context.md |
| 2026-10-10 | Thêm `curricula`, `curriculum_items`, cột mở rộng cho `classes`/`students`/`enrollments` (migration chỉ thêm) và **nhập 124 lớp, 4 giáo trình, 1.892 học viên, 2.359 lượt ghi danh, 441 buổi** vào Supabase (`npm run import-tx`) | Đối soát: P101 vẫn 35,38,40,36,38,32,35,33; điểm danh/bài tập/voucher cũ không bị xóa; 30 test pass. Cột tiền không được đọc |
| 2026-10-10 | Chủ dự án cập nhật `danh-sach-hoc-vien-mau.xlsx` thành workbook 16 sheet; chốt quy tắc ô **X = đi học, O = vắng có phép, trống = vắng**; viết lại bộ nhập điểm danh (nhiều sheet, bỏ sheet ẩn, bỏ cột voucher, không ghi đè ô sửa trên app) và nhập 54 lớp / 1.678 dòng học viên vào Supabase | Có mặt 12.394 (gồm 17 trễ), có phép 23, vắng 3.945; tạo thêm 202 buổi; +421 học viên (lớp `B…`/doanh nghiệp); vouchers 18 giữ nguyên; 33 test pass |
| 2026-10-10 | Chủ dự án chốt: sheet ẩn (Sheet1, BIH-Pre, BSM-Pre, SQL, BSM) **bỏ qua**; ô `X` gõ hai lần = một `X`; **bỏ hẳn voucher** → xóa bảng `vouchers` (18 dòng), gỡ khỏi API/giao diện/schema/test; P104 đã được chủ dự án sửa trên giao diện (1/8 buổi, TB 86%) | Migration `2026-10-10-drop-vouchers.sql`; 33 test pass |
| 2026-10-10 | Làm lại **bộ chọn lớp** (ô tìm + chip thời gian/chương trình, mặc định chỉ lớp đang học) và thêm **trang Home** động theo ảnh tham khảo ArtVista (hero + minh họa SVG động, đếm số, băng chuyền lớp, lớp sắp mở); API `GET /overview`, `timing` trong `GET /classes`; trang Lớp học (admin) dùng cùng bộ lọc | 39 test pass; kiểm tra bằng Edge headless (desktop + mobile), không lỗi JS |
| 2026-10-10 | Làm lại hero trang Home theo ảnh tham khảo "vũ trụ rộng lớn" (EOSAI): cảnh SVG tự vẽ (hành tinh + vòng quỹ đạo, cổng đá, mây, mặt nước, bóng người), chữ mảnh, nút tròn, thị sai | Chỉ lấy phong cách, không dùng ảnh gốc; 39 test pass; kiểm tra Edge headless desktop + mobile |
| 2026-10-10 | **Rà soát toàn dự án** (theo checklist `rules-reviewer`/`schema-guard`, thực hiện trực tiếp vì agent chưa nạp trong phiên): công thức chuyên cần ở `routes/overview.js` dời về `stats.js` (`attendanceRate`); thêm **CSP + header bảo mật** (`src/security-headers.js` + `vercel.json`, script theme ra file riêng); bộ chọn lớp tìm trong tất cả lớp khi đang gõ; 4 chỉ mục khóa ngoại (migration `fk-indexes`, đã chạy trên Supabase); `exceljs` → devDependencies (audit 0 lỗ hổng); ghim Node 22.x | 45 test pass; 13 bước UI trên Edge không vi phạm CSP; số liệu P101 không đổi; 12/12 bảng có RLS, không dữ liệu mồ côi |
| 2026-10-10 | Đổi hero trang Home từ cảnh SVG sang **mặt hồ** có sóng gợn nhẹ: canvas 2D tự vẽ + mô phỏng phương trình sóng (`lake-sim.mjs`), giọt rơi ngẫu nhiên thưa, chạm chuột tạo sóng; gỡ `home-scene.js` | Không cần repo ngoài. Đo trên Edge: ~30 khung/giây, vẽ 0,2 ms/khung, không vi phạm CSP; sửa lỗi vòng lặp không tiến do khung đầu dt=0; 50 test pass |
| 2026-10-10 | Hồ nước **thực và nét hơn, theo giao diện sáng/tối**: mặt nước chuyển sang WebGL (Fresnel, sóng li ti phối cảnh, vệt lấp lánh, vòng sóng từ `lake-sim` làm mượt trên GPU), cảnh trời vẽ ở độ phân giải thật; bảng màu `lake-theme.mjs` (đêm trăng / hồ ban ngày) + CSS chữ tối cho chế độ sáng; dự phòng canvas 2D | 52 test pass; Edge headless DPR 2: webgl 2560×1367, đổi sáng/tối vẽ lại đúng, mobile ổn, không vi phạm CSP/lỗi console |
| 2026-10-10 | Thêm vai trò **`guest` (chỉ xem)**: schema `check (role in ('admin','instructor','guest'))` (cả hai file + migration `guest-role`, đã chạy trên Supabase), middleware `blockGuestWrites` chặn mọi ghi trừ đăng xuất, giao diện ẩn nút/ô sửa, `npm run create-guest`. Tài khoản `guest@starttrain.local` gán 7 lớp đang diễn ra (mật khẩu chỉ gửi qua chat, không ghi vào repo) | 56 test pass; Edge: menu không có Lớp học/Người dùng, ô điểm danh/bài tập không bấm được, PUT trả 403 |

Chưa làm / chưa kiểm: thử tay thao tác ghi trên giao diện mới (bấm ô điểm danh, modal sửa) bằng chuột thật; Supabase Auth; upload Excel trên web; triển khai.
