# Bảo mật — những gì đã có và việc cần tự làm

## Đã có trong ứng dụng
| Lớp | Nội dung |
|---|---|
| Mật khẩu | Băm bằng scrypt (có salt riêng). Tối thiểu **10 ký tự**, không chứa tên đăng nhập (email), khác mật khẩu cũ. Tự đổi ở nút chìa khóa trên thanh trên cùng (`POST /api/auth/password`); đổi xong các thiết bị khác bị đăng xuất. Tài khoản khách không đổi được |
| Chống đoán mật khẩu | Sai 8 lần / 15 phút (cùng IP + email) hoặc 30 lần / 15 phút (cùng IP) → khóa tạm. Bộ đếm lưu trong bảng `auth_events` của database (serverless không có bộ nhớ chung); đăng nhập đúng thì cặp IP+email đếm lại |
| Nhật ký | Bảng `auth_events`: đăng nhập, sai, bị khóa, đổi mật khẩu — kèm IP và thiết bị, giữ 90 ngày, không lưu mật khẩu. Admin xem ở trang Người dùng → "Nhật ký đăng nhập" (`GET /api/auth/events`) |
| Phiên | Cookie HttpOnly + Secure + SameSite=Lax, 7 ngày, token băm trong DB |
| Quyền | admin / giảng viên (theo lớp) / khách (chỉ xem) kiểm ở máy chủ; tin nhắn nhắc bài chỉ cho người có quyền |
| Dữ liệu | RLS bật cho mọi bảng (chỉ máy chủ truy cập); không lưu dữ liệu tiền; hồ sơ đăng ký chỉ admin |
| Header | CSP, frame-ancestors 'none' (`src/security-headers.js` + `vercel.json`) |

## Việc cần tự làm (không nằm trong code)
1. **Bật xác thực 2 bước** cho GitHub, Vercel, Supabase (xem hướng dẫn trong phần trả lời của trợ lý hoặc mục dưới).
2. **Mật khẩu**: mỗi người tự đổi mật khẩu của mình bằng nút chìa khóa; admin nên dùng mật khẩu dài (cụm 4 từ).
3. **Tài khoản khách dùng chung**: đổi mật khẩu khi có người không còn cần truy cập (`npm run create-guest -- email "Tên" matkhau`).
4. **Người nghỉ việc**: vào trang Người dùng bấm "Khóa".
5. **Sao lưu**: kiểm tra Supabase đã bật backup, thử khôi phục một lần.

## Khi nghi bị lộ
- Lộ mật khẩu của một người: đặt lại bằng `npm run create-admin` / `create-guest` (cũng đăng xuất mọi phiên), xem nhật ký đăng nhập để biết có đăng nhập lạ không.
- Lộ mật khẩu database: Supabase → Database → Reset password, rồi cập nhật `.env` và biến `DATABASE_URL` trên Vercel.
- Lộ `SYNC_TOKEN`: đổi ở Vercel và trong Apps Script của Google Sheet.
