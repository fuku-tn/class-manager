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
| `FORM` (~610 dòng) | **Có** (hồ sơ đăng ký, **chỉ admin xem**) | Chỉ lấy 12 cột đã làm gọn; **không** lấy họ tên, giới tính, ngày sinh, SĐT, email, địa chỉ, tên công ty, kỳ vọng. Email/SĐT chỉ được băm để ghép |
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

## FORM (phiếu đăng ký) → hồ sơ học viên
- **Cột lấy (đã làm gọn):** thời gian đăng ký, mã lớp, hình thức học, vị trí, kinh nghiệm (theo khoảng), phòng ban (phần tiếng Việt), HR function, lĩnh vực, tỉnh/TP, nguồn biết đến (gom 5 nhóm), hình thức nhận giáo trình, **mục tiêu tham gia** (8 lựa chọn → nhãn ngắn: Tư duy phân tích · Thành thạo công cụ · Ra quyết định · Chứng chỉ · CV/chuyển việc · Kiến thức kinh doanh · Chuyển ngành · Theo yêu cầu công ty; chữ tự do → "Khác", không lưu).
- **Không lấy và không bao giờ đọc:** Họ và tên, Giới tính, Ngày sinh, Địa chỉ liên hệ, Tên công ty, Địa chỉ nhận tại nhà, Kỳ vọng sau khóa học. Email và Số điện thoại chỉ được **băm SHA-256 ngay trong Google** (email thường hóa; SĐT lấy 9 số cuối) rồi mới gửi; giá trị gốc không rời Google.
- **Ghép:** mã băm email (hoặc SĐT) + đúng mã lớp → ghi danh của lớp đó. Ghép được duy nhất một → hồ sơ của ghi danh (phiếu mới nhất thắng) và **bỏ mã băm**. Không khớp/mơ hồ (email dùng chung nhiều người trong cùng lớp) → "**chờ xử lý**" (giữ mã băm để ghép lại ở lần đồng bộ sau, khi học viên được đăng ký).
- **Hiển thị:** chỉ **admin** — khối "Hồ sơ đăng ký (FORM)" trong hộp sửa học viên, thẻ "Hồ sơ lớp từ phiếu đăng ký" ở Dashboard, và số phiếu chờ xử lý ở trang Nhập Excel. Giảng viên/khách bị chặn (403).

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

## Điểm bài tập — từ file Excel "Chấm điểm.xlsx" (từ 18/10/2026)
Nguồn điểm HW **duy nhất** là file Excel `Chấm điểm.xlsx`, bảng (Excel Table) **`Point_Transform`** (sheet "Tổng điểm"). Google Sheet điểm **không còn được nhận**: `/api/sync/points` trả 410 (bật lại tạm bằng biến `POINTS_SHEET_SYNC=1`) — chạy `stop()` trong Apps Script của Sheet điểm để tắt hẹn giờ.

| Việc | Cách |
|---|---|
| Tự động | Task Scheduler `ClassManager - Cap nhat diem`, **12:00 mỗi ngày** (máy tắt thì chạy bù khi mở, cần đăng nhập Windows + mạng) → `scripts/points-scheduled.cmd`: (1) `scripts/refresh-excel.ps1` mở file bằng Excel, **Refresh All** (Power Query) + tính lại, lưu; (2) `scripts/import-points.js` nhập bảng `Point_Transform`. Nhật ký: `private-data/points-log.txt` |
| Chạy tay | `npm run import-points -- [file] [--dry-run]` (chỉ nhập, không Refresh) · hoặc chạy ngay lịch: `Start-ScheduledTask -TaskName 'ClassManager - Cap nhat diem'` |
| Vị trí file | `POINTS_XLSX` trong `.env`, nếu không có thì `private-data/excel/Chấm điểm.xlsx`, rồi `Chấm điểm.xlsx` ở thư mục gốc (git-ignore `*.xlsx`) |

- **Sao lưu điểm trước mỗi lần nhập thật:** toàn bộ điểm đang có trên web được chụp ra `private-data/backups/diem/diem_<ngày_giờ>.csv` (5 cột như `Point_Transform`, không có họ tên); **chỉ giữ 1 bản mới nhất**, bản cũ tự xóa. Khôi phục điểm về lúc đó: `npm run import-points -- private-data/backups/diem/diem_<ngày_giờ>.csv` (thêm `--dry-run` để xem trước).
- File đang mở trong Excel lúc 12:00 → **không** Refresh/lưu đè (tránh mất phần đang sửa); vẫn nhập từ bản đã lưu gần nhất. Lưu file trước giờ chạy để điểm mới được lấy.
- Chỉ đọc 5 cột theo tên tiêu đề trong bảng `Point_Transform` (`POINT_SYNC_COLUMNS`); **không** đọc cột `Họ và tên`, sheet `StudentProfile` hay bảng khác. Ô công thức lấy giá trị Excel đã tính.
- File là **bản chuẩn**: sửa điểm thì web cập nhật; dòng biến mất thì web xóa điểm đó (chốt chặn: bỗng xóa > max(50, 20%) thì bỏ qua bước xóa). Mỗi lượt ghi `sync_runs` với `source = 'excel-points'`.

| Cột | Ý nghĩa |
|---|---|
| `StudentID` | Mã học viên (P.12345) — ghép với ghi danh của lớp |
| `Course` | Mã lớp viết tắt `BIE101` (cũng nhận `BIE 101`, `BIE-101`, `BIE95` → BIE095, hoặc mã đầy đủ `P2.BIE.P101.…`) |
| `HW` | Số thứ tự HW: `HW2`, `HW 2`, `HW-02`, `Bài 2` hoặc **chỉ số `2`**; `Capstone…` cho Capstone; `Mini Project 2` / `MP2` cho Mini Project (lớp chưa có cột MP thì **tự tạo**) — ghép với bài tập cùng số của lớp |
| `Point` | Điểm thang 10 (cho phép dấu phẩy "8,8"); trống / ngoài 0–10 bị bỏ qua |
| `Module` | Tên module (chỉ để hiển thị) |

- **Lớp BIH:** cột bài là HW1–HW4, MP1, MP2, MP3, Capstone. `Mini Project 3` **chính là HW5** → điểm lưu vào bài HW5 của lớp (giữ tick nộp HW5; tính % hoàn thành và quy tắc tốt nghiệp như HW5), giao diện hiện tên **MP3**. MP1, MP2 là Mini Project thường (không tính %). Bảng tương đương: `POINT_ALIASES` (`importPoints.js`) ↔ `ASSIGNMENT_ALIASES` (`class-filter.mjs`).
- Dòng không khớp bị bỏ qua và được đếm; nhật ký kèm `examples` (tối đa 10 mỗi loại: nhãn HW lạ, điểm lỗi, mã lớp chưa có, lớp + bài chưa có, lớp + bài của học viên không có trong lớp) — **không** có mã hay tên học viên.
- **Học viên phải có trong lớp** của app (qua đồng bộ đăng ký) thì điểm mới hiện.
- Xem điểm: trang **Học viên** (cột Điểm TB) và trang **Bài tập** (điểm ngay trong ô, cột Điểm TB) — admin + giảng viên của lớp; khách không thấy.

## Lịch giảng dạy (bảng "Calendar" trên Google Sheet, script riêng)
Bảng **Calendar** (Google Sheets table) có các cột `Ngày · Buổi · Khóa · Nội dung · Số buổi · Hình thức · Loại · Ghi chú` (+ tùy chọn `Giảng viên`). Script `scripts/google-apps-script/sync-schedule.gs` gửi bảng tới `POST /api/sync/schedule` (mã `SYNC_TOKEN`), web lưu ở bảng `teaching_schedule` và hiện ở **Lịch → tab Lịch giảng dạy**.

**Cài đặt (một lần):**
1. Mở Google Sheet có bảng Calendar → Tiện ích mở rộng → Apps Script → tạo file `.gs` mới, dán toàn bộ `sync-schedule.gs` (dùng chung dự án với script đăng ký được: hai script dùng tên khác nhau).
2. Project Settings → Script properties, thêm `SCHEDULE_URL` = `https://<tên-miền-web>/api/sync/schedule` và `SYNC_TOKEN` (cùng mã với Sheet đăng ký; nếu dán chung dự án thì đã có sẵn).
3. Chạy hàm `setupSchedule()` một lần, cấp quyền. Từ đó 5 phút kiểm tra một lần, chỉ gửi khi bảng đổi. Tạm dừng: `stopSchedule()`.

- Cột `Buổi`: **S** sáng · **C** chiều · **T** tối (cũng nhận Sáng/Chiều/Tối/Cả ngày). `Khóa` ghi ngắn `BIH98` cũng được (→ BIH098). `Ghi chú` "Khai giảng"/"Bế giảng" được đánh dấu trên lịch.
- **Sheet là bản chuẩn:** mỗi lượt thay toàn bộ lịch; sửa/xóa dòng thì web đổi theo. **Chốt chặn:** lượt mới ít hơn 50% số dòng đang có (khi đã có ≥ 20 dòng) bị từ chối (409), giữ lịch cũ.
- Dòng sai ngày / thiếu khóa bị bỏ qua và được đếm; khóa chưa có trong app vẫn lưu nhưng **chỉ admin thấy**. Kết quả (và ví dụ dòng lỗi) xem ở Apps Script → Executions.
- Mỗi người chỉ thấy lịch của lớp mình được xem (admin thấy hết).
- Chỉ đọc đúng các cột trong `SCHEDULE_COLUMNS` (`src/services/importSchedule.js` ↔ `SCHEDULE_ALLOWED` trong `.gs`, test kiểm khớp). Không có dữ liệu học viên hay tiền.

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
