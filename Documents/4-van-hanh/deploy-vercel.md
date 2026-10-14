# Triển khai lên Vercel

Webapp chạy được trên Vercel: Express trở thành một Vercel Function, `public/` được CDN phục vụ, dữ liệu ở Supabase. Nguồn: [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

## Code đã được chuẩn bị
| Thay đổi | Lý do |
|---|---|
| `src/index.js` — xuất app Express (default export) với DB "lười" (`openDbLazy`) | Vercel cần điểm vào xuất app đồng bộ; kết nối DB mở ở lần gọi đầu |
| Đổi tên `src/app.js` → `src/create-app.js`, `src/server.js` → `src/dev-server.js` | Vercel tự tìm `app/index/server` trong `src/`; tránh nhập nhằng với điểm vào thật. Chạy máy nhà vẫn là `npm start` |
| Chart.js chép vào `public/vendor/chart.umd.min.js` (`npm run vendor` để cập nhật) | `express.static()` **bị bỏ qua** trên Vercel và `node_modules` không phải file tĩnh |
| `trust proxy` khi có biến `VERCEL` | Bộ giới hạn đăng nhập sai lấy đúng IP khách |
| `vercel.json` → `regions: ["hnd1"]` (Tokyo) | Cùng vùng với Supabase `ap-northeast-1`, giảm độ trễ |
| `.vercelignore` | Không đưa test, tài liệu, Excel, `.env` vào bản triển khai |
| Pool kết nối nhỏ hơn khi chạy trên Vercel | Mỗi instance serverless chỉ giữ ít kết nối |

## Các bước (qua giao diện web — dễ nhất)
1. Đẩy code mới lên GitHub (`git push`).
2. Vào https://vercel.com/new → đăng nhập bằng GitHub → **Import** repo `class-manager`.
3. Framework Preset: để **Express/Other** (tự nhận). Build/Output: để mặc định.
4. **Environment Variables** — thêm:
   - `DATABASE_URL` = chuỗi **Transaction pooler** của Supabase (Connect → *Transaction pooler*, cổng **6543**), thay mật khẩu. Dùng 6543 cho serverless vì mỗi lần gọi có thể là một instance mới — Session pooler (5432) dễ cạn kết nối.
   - `SUPABASE_URL` = `https://<mã-project>.supabase.co` và `SUPABASE_PUBLISHABLE_KEY` = khóa *publishable* (Supabase → Project Settings → API Keys). Hai biến này bật **đồng bộ thời gian thực** khi nhiều người cùng điểm danh; thiếu thì app vẫn chạy nhưng chỉ tự làm mới mỗi 3 giây. Không dùng khóa `service_role`.
   - (tuỳ chọn) `ATTENDANCE_THRESHOLD`, `MISSING_HW_ALERT`.
   - Không cần `NODE_ENV` — Vercel tự đặt `production` (cookie đăng nhập có cờ `Secure`).
5. **Deploy**. Xong có địa chỉ `https://<tên>.vercel.app`.
6. Kiểm tra: mở địa chỉ → đăng nhập; mở `/api/health` → `{"ok":true}`.

Nếu build lỗi: mở **Deployments → Build Logs / Runtime Logs** và gửi lỗi cho Claude.

## Gặp "Lỗi máy chủ" khi đăng nhập?
Từ bản này, màn hình đăng nhập tự báo lý do nếu là lỗi database (vd "Không kết nối được cơ sở dữ liệu: thiếu biến DATABASE_URL trên máy chủ"). Lỗi 500 chung chung "Lỗi máy chủ" thì xem Runtime Logs. Có thể mở `https://<tên>.vercel.app/api/health/db`:
| Kết quả | Nguyên nhân | Cách sửa |
|---|---|---|
| `{"ok":true}` | Kết nối tốt | Lỗi ở chỗ khác → xem Runtime Logs |
| `thiếu biến DATABASE_URL` | Chưa đặt biến, hoặc đặt nhưng chưa **Redeploy** / sai môi trường (Production/Preview) | Settings → Environment Variables → thêm cho **Production** → Deployments → Redeploy |
| `sai mật khẩu database` | Mật khẩu sai, hoặc còn nguyên chữ `[YOUR-PASSWORD]` | Thay bằng mật khẩu thật (bỏ cả dấu `[ ]`); ký tự đặc biệt phải mã hóa URL (`@` → `%40`) hoặc đặt lại mật khẩu chỉ gồm chữ và số |
| `không đúng định dạng` | Dán sai chuỗi | Dán lại nguyên chuỗi từ Supabase › Connect |
| `không kết nối được` / `sai tên người dùng` | Sai mã project hoặc vùng (`aws-0-ap-northeast-1`) | Copy lại chuỗi **Transaction pooler** từ Supabase |
| `chưa tạo bảng` | Chưa chạy `supabase/schema.sql` | Chạy trong SQL Editor |
Sau khi sửa biến môi trường **phải Redeploy** thì mới có hiệu lực. Endpoint này chỉ trả về loại lỗi, không lộ chuỗi kết nối. Code cũng tự bỏ qua dấu nháy/khoảng trắng dán thừa và tham số `?pgbouncer=true`.

## Biến môi trường đồng bộ Google Sheet
Thêm `SYNC_TOKEN` (chuỗi ngẫu nhiên dài) rồi Redeploy; cùng giá trị này đặt trong Script properties của Apps Script. Chi tiết: [google-sheet-sync.md](../3-ky-thuat/google-sheet-sync.md). Không đặt thì địa chỉ `/api/sync/transactions` trả 503 (tắt).

## Nhập Excel trên web
Mục "Nhập Excel" (admin) tải file lên hàm serverless: thân yêu cầu tối đa ~4,5MB trên Vercel (file điểm danh hiện ~1,3MB). File lớn hơn → dùng `npm run import` trên máy. Lượt nhập điểm danh mất ~20 giây cho 54 lớp; nếu gặp timeout, kiểm tra thời gian chạy tối đa của hàm (Settings → Functions → Max Duration) hoặc dùng lệnh trên máy. `exceljs` đã chuyển sang `dependencies` để có mặt khi chạy.

## Header bảo mật (CSP)
`vercel.json` có khối `headers` áp cho mọi đường dẫn (file tĩnh do CDN phục vụ không đi qua Express). Nội dung giống `src/security-headers.js` — test kiểm hai nơi khớp. Nếu sau này thêm dịch vụ ngoài (analytics, font mới, API khác) mà trang bị chặn, mở Console của trình duyệt xem dòng "violates the following Content Security Policy" rồi thêm nguồn vào **cả hai** nơi.
Khi nghi CSP gây lỗi: có thể tạm thời xóa khối `headers` trong `vercel.json` và triển khai lại để so sánh.

## Trước khi mở cho người khác dùng (bắt buộc xem)
- Trang sẽ **công khai trên Internet** và chứa email/SĐT học viên. Việc duy nhất ngăn người lạ là đăng nhập.
  - **Đổi mật khẩu tài khoản admin tạm** (hỏi chủ dự án), hoặc tạo admin riêng (`npm run create-admin`) rồi khóa tài khoản tạm.
  - **Đặt lại mật khẩu database Supabase** (đã từng lộ trong chat) rồi cập nhật `DATABASE_URL` ở Vercel (Settings → Environment Variables → Redeploy).
  - Cân nhắc bật **Deployment Protection** của Vercel (Settings → Deployment Protection) nếu chỉ dùng nội bộ; bản Preview mặc định đã được bảo vệ.
- Giới hạn đăng nhập sai (8 lần/15 phút) nằm **trong bộ nhớ từng instance**, nên trên serverless chỉ giảm thiểu chứ không chặn tuyệt đối brute-force. Dùng mật khẩu dài; cần chắc hơn thì bật Vercel Firewall rate limit hoặc chuyển bộ đếm sang DB.
- `DATABASE_URL` chỉ đặt ở Vercel, **không** commit.

## Vận hành
- **Cập nhật:** `git push` lên `main` → Vercel tự triển khai bản mới (có Instant Rollback nếu lỗi).
- **Nhập Excel:** vẫn chạy trên máy bạn (`npm run import`) với `DATABASE_URL` trong `.env` trỏ tới Supabase — không cần chạy trên Vercel.
- **Đổi cấu trúc bảng:** chạy `alter table` trên Supabase trước, rồi mới triển khai code dùng cột mới.
- **Chạy máy nhà:** `npm start` (cổng 3000, hoặc `PORT=3100 npm start`) dùng cùng database Supabase → máy nhà và bản Vercel **dùng chung dữ liệu thật**; thao tác thử nên cẩn thận.
- **Độ trễ:** lần gọi đầu sau lúc rảnh có thể chậm vài giây (khởi động lạnh + mở kết nối DB).

## Chưa kiểm thử
Chưa triển khai thật lên Vercel (cần tài khoản của bạn). Đã kiểm tra tại chỗ: nạp `src/index.js` như Vercel (default export là app Express), chạy trên DB Supabase thật (health, đăng nhập, dashboard khớp số liệu), file tĩnh `public/` phục vụ được, 15 test pass.
