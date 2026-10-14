# Sao lưu và khôi phục dữ liệu

## Tóm tắt
| Việc | Lệnh | Ghi chú |
|---|---|---|
| Sao lưu toàn bộ | `npm run backup` | Chỉ đọc database; ~6 giây; ra thư mục `private-data/backups/<ngày_giờ>/` |
| Sao lưu + giữ N bản mới nhất | `npm run backup -- --keep 8` | Lịch tự động dùng lệnh này |
| Thử khôi phục | `npm run restore -- <thư-mục> --dry-run` | Chạy hết rồi hoàn tác |
| Khôi phục thật | `RESTORE_DATABASE_URL=… npm run restore -- <thư-mục>` | **Chỉ** vào database trống |

## Sao lưu tự động (Windows Task Scheduler)
Đã cài trên máy chủ dự án (14/10/2026):

| Mục | Giá trị |
|---|---|
| Tên tác vụ | `ClassManager - Sao luu du lieu` |
| Lịch | Thứ Hai hằng tuần, 8:00 sáng; **máy tắt lúc đó thì chạy bù** khi mở máy (cần đăng nhập Windows và có mạng) |
| Chạy | `scripts/backup-scheduled.cmd` → `scripts/backup.js --keep 8` |
| Giữ | 8 bản mới nhất (bản cũ hơn tự xóa; chỉ xóa thư mục dạng `yyyy-mm-dd_hhmm`) |
| Nhật ký | `private-data/backups/backup-log.txt` (mỗi lần chạy: thời điểm, số dòng từng bảng, lỗi nếu có) |

**Thao tác thường gặp** (mở *Task Scheduler* → *Task Scheduler Library* → tìm tên tác vụ):
- Chạy ngay: chuột phải → *Run* (hoặc PowerShell: `Start-ScheduledTask -TaskName 'ClassManager - Sao luu du lieu'`).
- Đổi ngày/giờ: chuột phải → *Properties* → *Triggers* → *Edit*.
- Tạm dừng: chuột phải → *Disable*; gỡ hẳn: *Delete*.
- Kiểm tra lần chạy gần nhất: cột *Last Run Result* = `0x0` là thành công; khác 0 thì xem `backup-log.txt`.
- Đổi máy: chạy lại lệnh `Register-ScheduledTask` trong mục "Cài lại lịch" bên dưới.

**Cài lại lịch** (PowerShell, sửa `$repo` theo vị trí thư mục dự án):
```powershell
$repo = 'D:\Phuc Documents\Claude Code Training (DLLT)\Course'
$action = New-ScheduledTaskAction -Execute "`"$repo\scriptsackup-scheduled.cmd`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 8:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'ClassManager - Sao luu du lieu' -Action $action -Trigger $trigger -Settings $settings -Force
```

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
- Lịch tự động đã lo **mỗi tuần**; chạy thêm bằng tay **trước mọi thay đổi lớn** (nhập Excel hàng loạt, chạy migration, dọn dữ liệu).
- Giữ ít nhất 4 bản gần nhất; xóa bản cũ để tránh tích dữ liệu cá nhân không cần thiết.
- Gói Supabase trả phí có thêm sao lưu tự động hằng ngày (Database → Backups); gói miễn phí thì dùng lệnh ở trên.
