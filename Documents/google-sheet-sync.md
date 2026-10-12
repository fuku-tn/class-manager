# Đồng bộ tự động từ Google Sheet

Mục tiêu: người khác thêm đăng ký vào Google Sheet → webapp tự có học viên/ghi danh mới **trong tối đa vài phút**, không cần mở file Excel `Transactions`.

```
Google Sheet ──(Apps Script, mỗi phút, chỉ khi có thay đổi)──▶ POST /api/sync/transactions ──▶ Supabase ──▶ màn hình đang mở tự cập nhật
```
Excel `Transactions` không còn nằm trên đường đi (vẫn dùng cho báo cáo khác nếu muốn).

## Cấu trúc Google Sheet hiện tại (đã đối chiếu 2026-10-11)
| Tab | Dùng cho đồng bộ? | Ghi chú |
|---|---|---|
| `PERSONAL` (~2.367 dòng) | **Có** — tương ứng sheet `Transactions` | 10 cột cho phép đều có đủ, trùng tên. Tab còn nhiều cột tiền (FEE, PAYMENT, DEPOSIT, AMOUNT DUE, ACTUAL REVENUE…) — **script không bao giờ đọc** |
| `COURSE` (~124 lớp) | **Có** | Tên cột `START DATE`, `EXPECTED END DATE` (máy chủ tự đổi về STARTDATE/ENDDATE). Có `LINK MS TEAMS`, `MEETING ID`, `PASS CODE`, cột doanh thu — không đọc |
| `FORM` (~610 dòng) | Chưa | Phiếu đăng ký (mã lớp, họ tên, SĐT, email, nguồn…) — dùng cho "đăng ký chờ duyệt" sau này |
| `COMPANY` (~754 dòng) | **Có** (học viên B2B) | Cùng cột với PERSONAL + `COMPANY NAME`; **không** lấy ngày sinh và cột tiền. Mỗi ghi danh được gắn nhãn B2B và tên công ty |

Đối chiếu với dữ liệu hiện có (giả lập trong bộ nhớ): file mới chỉ hơn **3 học viên, 4 ghi danh**; 1 dòng thiếu khóa học và 3 dòng khóa "TƯ VẤN" (không có trong COURSE) bị bỏ qua; 86 lớp chưa có giáo trình; 1 email nhiều mã, 7 mã nhiều email, 2 SĐT nhiều mã (đã biết từ trước).

## Cài đặt (làm một lần)
1. **Tạo mã bí mật** (chuỗi ngẫu nhiên dài, ví dụ 64 ký tự hex). Mã này **không** được ghi vào repo.
2. **Vercel** → Project → Settings → Environment Variables: thêm `SYNC_TOKEN` = mã trên (Production) → Redeploy.
3. **Google Sheet** → Tiện ích mở rộng (Extensions) → **Apps Script**:
   - Xóa nội dung mặc định, dán toàn bộ file `scripts/google-apps-script/sync-transactions.gs`.
   - Mặc định script tìm tab `PERSONAL` (hoặc `Transactions`) và `COURSE` (hoặc `Course`); nếu đổi tên tab thì sửa `CONFIG` ở đầu file.
   - **Dòng tiêu đề tự tìm** (dòng 1 là dòng tổng, tiêu đề thường ở dòng 2): script dùng TextFinder tìm ô `STUDENT ID` / `COURSE ID` trong 10 dòng đầu, không đọc giá trị các ô khác. Không tìm được thì dùng dòng 2; muốn cố định thì đặt `HEADER_ROW` trong `CONFIG`.
   - **Project Settings** (biểu tượng bánh răng) → *Script properties* → thêm:
     - `SYNC_URL` = `https://<tên-miền-webapp>/api/sync/transactions`
     - `SYNC_TOKEN` = mã ở bước 1
   - Chọn hàm **`setup`** → Run → cấp quyền khi được hỏi (script chỉ cần đọc Sheet và gọi URL ngoài).
4. Mở webapp → **Nhập Excel**: thẻ "Đồng bộ tự động" phải hiện "Lần nhận gần nhất …".

Tạm dừng: chạy hàm `stop`. Bật lại: chạy `setup`.

## B2B / B2C
- Học viên từ tab `PERSONAL` là **B2C**, từ tab `COMPANY` là **B2B** (kèm tên công ty). Mỗi ghi danh có `segment` + `company_name`.
- Lớp là **B2B** nếu mã lớp mang chữ `B` (vd `P2.BIE.B067...`) hoặc có học viên từ COMPANY; **B2C** nếu chữ khác `B` hoặc có học viên cá nhân. Lớp có cả hai hiện ở **cả hai bộ lọc**.
- Bộ lọc chip **B2C / B2B** ở ô chọn lớp và trang Lớp học (đếm theo bộ lọc thời gian đang chọn). Gõ tìm thì tìm trong tất cả lớp.
- Nếu script chưa gửi tab COMPANY thì app **không** dò "không còn trong Sheet" cho học viên B2B.

## Quy tắc đồng bộ
| Việc | Hành vi |
|---|---|
| Học viên/ghi danh/lớp **mới** trong Sheet | Được thêm đầy đủ |
| Học viên/ghi danh **đã có** | Chỉ **điền chỗ trống**; tên, email, SĐT, hình thức đã có không bị đè — sửa tay trên web được giữ |
| Trạng thái học | `Không tham gia` trong Sheet → `dropped` (nếu đang học). **Không bao giờ** đưa học viên đã nghỉ/bảo lưu/hoàn thành về "đang học" |
| Dòng bị xóa khỏi Sheet | **Không** xóa và **không** tự chuyển nghỉ. App ghi sự kiện "Không còn thấy trong Google Sheet" (một lần), hiện nhãn cam "Không còn trong Sheet" ở trang Học viên và đếm ở thẻ đồng bộ để admin quyết định. Xuất hiện lại thì ghi "Xuất hiện lại" và nhãn mất |
| Sheet đột nhiên ít hơn hẳn (< 50% lần trước) | Vẫn nhận các dòng có mặt nhưng **bỏ qua** bước dò "không còn trong Sheet" (phòng xóa nhầm/hỏng Sheet) |
| Học viên đã bị admin "Gỡ khỏi lớp" | Không tự thêm lại dù vẫn còn trong Sheet (muốn thêm lại thì thêm tay trên web) |
| Lớp mới (tab Course, 1–2 tuần đổi) | Được tạo; ngày bắt đầu/kết thúc theo Sheet |
| Lớp thiếu giáo trình | Vẫn nhận đăng ký; lớp chưa có giáo trình cho đến khi nạp (`npm run import-tx` kèm `session-management.xlsx`) |
| Điểm danh, bài tập | **Không** đồng bộ — web là nơi nhập chính |

## An toàn
- **Không lấy tiền:** script chỉ đọc đúng các cột cho phép (`ALLOWED_TX`, `ALLOWED_COURSE`) theo tên tiêu đề, từng cột một; cột khác không bao giờ được đọc. Máy chủ lọc lại một lần nữa và bỏ mọi cột lạ. Test kiểm danh sách trong script khớp với máy chủ.
- **Xác thực:** header `X-Sync-Token` so sánh bằng so sánh thời gian hằng; sai quá 20 lần/15 phút → khóa tạm. Chưa đặt `SYNC_TOKEN` thì địa chỉ này trả 503 (tắt).
- **Giới hạn:** thân yêu cầu ≤ 3MB, ≤ 20.000 dòng (Vercel giới hạn ~4,5MB).
- **Nhật ký:** mỗi lần nhận được ghi vào bảng `sync_runs` (giữ 200 lần), hiển thị ở trang Nhập Excel. Script gửi ít nhất mỗi giờ một lần; quá 2 giờ không thấy gì → trang báo lỗi màu đỏ.

## Xử lý sự cố
| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Trang báo "Chưa bật" | Chưa có `SYNC_TOKEN` trên Vercel hoặc chưa Redeploy |
| Apps Script báo `401` | `SYNC_TOKEN` trong Script properties khác với trên Vercel |
| Apps Script báo `422 Thiếu cột STUDENT ID…` | Không tìm thấy dòng tiêu đề (đổi tên cột `STUDENT ID`/`COURSE ID`, hoặc tiêu đề ở dưới dòng 10): đặt `HEADER_ROW` đúng số dòng trong `CONFIG` |
| Không có dữ liệu mới dù Sheet đã đổi | Trigger bị gỡ/hết quyền (tài khoản cài script đổi mật khẩu, nghỉ việc…): chạy lại `setup` bằng tài khoản còn quyền |
| Trang báo lỗi màu đỏ "đã lâu không có dữ liệu" | Như trên — kiểm tra Executions trong Apps Script |

## Lưu ý vận hành
- Script chạy dưới **tài khoản Google của người cài**; nếu tài khoản đó mất quyền vào Sheet thì đồng bộ dừng (và trang báo đỏ sau 2 giờ).
- Hạn mức Apps Script (tài khoản thường ~90 phút chạy trigger/ngày): mỗi lần kiểm tra ~1–2 giây khi không có gì đổi nên chu kỳ 1 phút vẫn nằm trong hạn mức. Nếu bị chạm hạn mức, đặt `EVERY_MINUTES: 5`.
