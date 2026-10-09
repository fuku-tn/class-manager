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
   - (tuỳ chọn) `ATTENDANCE_THRESHOLD`, `MISSING_HW_ALERT`.
   - Không cần `NODE_ENV` — Vercel tự đặt `production` (cookie đăng nhập có cờ `Secure`).
5. **Deploy**. Xong có địa chỉ `https://<tên>.vercel.app`.
6. Kiểm tra: mở địa chỉ → đăng nhập; mở `/api/health` → `{"ok":true}`.

Nếu build lỗi: mở **Deployments → Build Logs / Runtime Logs** và gửi lỗi cho Claude.

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
