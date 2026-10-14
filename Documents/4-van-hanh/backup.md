# Sao lưu và khôi phục dữ liệu

## Tóm tắt
| Việc | Lệnh | Ghi chú |
|---|---|---|
| Sao lưu toàn bộ | `npm run backup` | Chỉ đọc database; ~6 giây; ra thư mục `private-data/backups/<ngày_giờ>/` |
| Thử khôi phục | `npm run restore -- <thư-mục> --dry-run` | Chạy hết rồi hoàn tác |
| Khôi phục thật | `RESTORE_DATABASE_URL=… npm run restore -- <thư-mục>` | **Chỉ** vào database trống |

## Bản sao lưu gồm gì
```
private-data/backups/2026-10-14_1925/
├─ manifest.json        thời điểm sao lưu, số dòng từng bảng, thứ tự khôi phục
├─ tables/<bảng>.json   dữ liệu đầy đủ của 19 bảng (dùng để khôi phục)
└─ xem-nhanh.xlsx       mở bằng Excel để xem: mỗi bảng một sheet (đã bỏ cột mã băm mật khẩu)
```
- Đọc trong **một giao dịch chỉ-đọc** (ảnh chụp nhất quán tại một thời điểm), không khóa ai, không ghi gì.
- **Không** có bảng phiên đăng nhập (`auth_sessions`): sau khi khôi phục, mọi người đăng nhập lại bằng mật khẩu cũ.
- Thứ tự bảng tự tính theo khóa ngoại nên bảng mới thêm sau này cũng tự được sao lưu.

## An toàn
- Bản sao lưu chứa **dữ liệu cá nhân học viên và mã băm mật khẩu** → chỉ để trong `private-data/` (không lên Git/Vercel). Nếu cất ra ngoài (ổ cứng ngoài, Google Drive cá nhân), nên nén có mật khẩu.
- **Không gửi bản sao lưu qua chat/email.**
- Lệnh khôi phục **từ chối** database đã có dữ liệu → không thể vô tình đè lên dữ liệu thật đang chạy.
- Sau khi khôi phục, số dòng từng bảng được đối chiếu với `manifest.json`; lệch thì hoàn tác toàn bộ.

## Khi nào dùng khôi phục
- Chuyển sang project Supabase mới (đổi vùng, đổi tài khoản): tạo project mới → đặt `RESTORE_DATABASE_URL` là chuỗi kết nối của project mới → `npm run restore -- <thư-mục>` (thiếu bảng thì lệnh tự tạo theo `src/schema.sql`) → đổi `DATABASE_URL` trên Vercel.
- Dữ liệu bị hỏng nặng: khôi phục vào một project mới rồi chuyển sang, không xóa project cũ cho tới khi kiểm tra xong.

## Gợi ý lịch
- Sao lưu **mỗi tuần** và **trước mọi thay đổi lớn** (nhập Excel hàng loạt, chạy migration, dọn dữ liệu).
- Giữ ít nhất 4 bản gần nhất; xóa bản cũ để tránh tích dữ liệu cá nhân không cần thiết.
- Gói Supabase trả phí có thêm sao lưu tự động hằng ngày (Database → Backups); gói miễn phí thì dùng lệnh ở trên.
