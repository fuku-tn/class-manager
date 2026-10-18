# Kiểm thử

## Chạy
```
npm test        # node:test, ~15 giây
```
Dùng **PGlite** (Postgres thật chạy trong bộ nhớ) với `src/schema.sql` — không cần server, **không đụng Supabase**.

## Cấu trúc
| File | Nội dung |
|---|---|
| `tests/helpers.js` | `startTestApp()`: `openDb({ memory: true })` + server cổng ngẫu nhiên + client có cookie, `addUser`, `login` |
| `tests/api.test.js` | Auth, phân quyền, điểm danh, bài tập, dashboard, validation, XSS |
| `tests/concurrency.test.js` | Chặn ghi đè (409) khi hai người cùng sửa, ghi nhận người sửa, phát tin realtime (giả lập), cấu hình kênh |
| `tests/import-transactions.test.js` | Nhập Transactions + giáo trình: không lọt dữ liệu tiền, trạng thái, mẫu mặc định, chạy lại không trùng, dry-run |
| `tests/overview-and-filter.test.js` | Logic lọc lớp (không dấu, thời gian, chương trình, sắp xếp), API tổng quan (đếm lớp, chuyên cần loại buổi có phép, phạm vi quyền), `timing` trong danh sách lớp |
| `tests/security-headers.test.js` | Header/CSP từ Express khớp `vercel.json`; HTML không script inline; `public/js` không dùng `innerHTML`/`eval` |
| `tests/feedback.test.js` | Nhận diện mã lớp từ chữ tự do, NPS/điểm TB, nhập khảo sát không lưu email/tên/SĐT/chữ tự do/học phí, chạy thử không ghi, chạy lại không nhân đôi, API chỉ admin |
| `tests/graduation.test.js` | Đánh giá điều kiện (ngưỡng chuyên cần, nhóm HW, Capstone, thiếu dữ liệu), gợi ý theo quy tắc giáo trình, giảng viên đặt kết quả/khách bị chặn, nhật ký, áp dụng gợi ý chỉ cho người chưa xét, công bố (chỉ admin, khóa giảng viên), sửa quy tắc (admin, hợp lệ), lớp chưa có giáo trình dùng mặc định |
| `tests/class-phases.test.js` | Giai đoạn lớp theo ngày (biên +0/+14/+15/+28/+29 ngày), mốc ngày trả về, thiếu ngày kết thúc, tổng quan trang chủ gồm lớp chấm bài/công bố, nhóm lọc "Đang hoạt động" và chip |
| `tests/form-profile.test.js` | Làm gọn FORM (mục tiêu → nhãn, nguồn, phòng ban, kinh nghiệm, hình thức), mã băm email/SĐT chuẩn hóa, Apps Script chỉ có cột FORM cho phép và băm email/SĐT |
| `tests/sync-form.test.js` | FORM: ghép theo mã băm trong đúng lớp, bỏ mã băm khi khớp, phiếu mới nhất thắng, chờ xử lý/mơ hồ, không lưu thông tin cá nhân thô, ghép lại khi đăng ký sau, `/profiles` chỉ admin |
| `tests/sync-company.test.js` | Tab COMPANY: tag B2B + tên công ty, bỏ DOB/FEE; `/api/classes` trả cờ B2B/B2C và công ty; lớp hỗn hợp; chưa gửi COMPANY thì không dò thiếu; thiếu cột → 422 |
| `tests/class-segment.test.js` | `segmentFlags`/`countBySegment`/`filterClasses`/`pickerFilter` theo B2B/B2C (lớp hỗn hợp ở cả hai) |
| `tests/enrollment-events.test.js` | Nhật ký ghi danh: thêm/đổi trạng thái trên web (kèm người làm), "Gỡ khỏi lớp" chỉ admin + bắt buộc lý do + chụp lại thông tin + kèm số điểm danh bị xóa; quyền xem nhật ký theo lớp; đồng bộ Sheet ghi sự kiện không trùng; "không còn trong Sheet" chỉ cảnh báo, không ghi trùng, "xuất hiện lại"; Sheet ít bất thường thì bỏ dò; không tự thêm lại người đã gỡ |
| `tests/frontend-children.test.js` | Quét `public/js`: `replaceChildren`/`append` không được nhận tham số dạng `a && b`, `a ? b : null` (sẽ hiện chữ "false"/"null" trên trang) — dùng `h()` hoặc `setChildren()` |
| `tests/frontend-syntax.test.js` | Mọi file `public/js` đọc được (lỗi cú pháp một file làm hỏng cả trang) |
| `tests/sync.test.js` | Đồng bộ Google Sheet: cần đúng mã (401/503); tạo lớp/học viên/ghi danh, bỏ cột tiền, ngày không lệch múi giờ, chạy lại không đổi; không đè sửa tay (tên, trạng thái nghỉ); "Không tham gia" → dropped; thiếu cột → 422; lớp thiếu giáo trình vẫn nhận; nhật ký chỉ admin; danh sách cột trong script khớp máy chủ và không có chữ liên quan tiền |
| `tests/attendance-extras.test.js` | PUT trả % chuyên cần + hiện diện/sĩ số khớp GET (có phép loại khỏi mẫu số, không có mẫu số → null); "Bỏ tất cả" xóa cả buổi, 404 buổi khác lớp, khách bị 403 |
| `tests/student-sort.test.js` | Sắp xếp theo tên (từ cuối, collation tiếng Việt), họ tên, mã (số tự nhiên), tỉ lệ (trống xuống cuối), vắng nhiều, trạng thái; không đổi mảng gốc |
| `tests/import-api.test.js` | Nhập Excel qua web: chỉ admin (401/403), từ chối file rỗng/không phải xlsx/thiếu sheet, chạy thử không đổi DB, nhập thật ghi dữ liệu và không trả về cột tiền, nhập lại không nhân đôi |
| `tests/remind.test.js` | Nhắc bài: tin nhắn/tổng quan/cấu hình chỉ admin hoặc có quyền (người khác chỉ nhận tiến độ, không có chữ "em check HW"), khách 403, tổng quan không có tên học viên, gộp nhóm nhỏ, nhập bảng HW (chạy thử không ghi), bật/tắt quyền ở trang Người dùng, tên gọi/xưng hô |
| `tests/points.test.js` | Điểm bài tập từ tab Point: đọc nhãn HW/điểm, ghép theo StudentID + Course + HW, không lưu họ tên, chạy lại không đổi, sửa/xóa điểm theo Sheet, dòng sai được đếm, chốt chặn xóa hàng loạt, quyền xem (khách 403), cột script khớp máy chủ |
| `tests/view-upcoming.test.js` | Quyền xem lớp chưa diễn ra: chỉ thấy lớp upcoming, view_only, ghi bị 403, được phân công thì ghi được, bắt đầu lớp thì hết quyền, chỉ admin bật |
| `tests/backup.test.js` | Sao lưu đủ bảng theo thứ tự khóa ngoại, không có phiên đăng nhập; khôi phục vào DB trống đúng từng bảng (id, jsonb, số thập phân, ngày giờ, mật khẩu), bộ đếm id tiếp tục; từ chối DB đã có dữ liệu; chạy thử không ghi |
| `tests/auth-security.test.js` | Khóa đăng nhập sai 8 lần (đếm trong DB, theo IP+email), đúng thì đếm lại; đổi mật khẩu (kiểm hiện tại, ≥ 10 ký tự, không chứa email, hủy phiên khác, khách bị chặn); nhật ký chỉ admin và không chứa mật khẩu |
| `tests/guest.test.js` | Khách xem được lớp được phân công; mọi thao tác ghi (điểm danh, bài tập, học viên, buổi học, lớp, đổi mật khẩu) bị 403 và dữ liệu không đổi; đăng xuất được; schema có vai trò guest |
| `tests/lake-theme.test.js` | Bảng màu hồ chọn theo `data-theme`, hai bảng đủ khóa, màu nước hợp lệ, ban ngày sáng hơn |
| `tests/lake-sim.test.js` | Mô phỏng sóng hồ: ổn định/tắt dần, vòng sóng dẹt, không lan lên trời, lịch giọt rơi thưa; gỡ cảnh cũ |
| `tests/db-errors.test.js` | Phân loại lỗi cấu hình/kết nối DB; thiếu `DATABASE_URL` → đăng nhập trả 503 có lý do |
| `tests/import.test.js` | Nhập điểm danh nhiều sheet (workbook dựng trong test): X/O/trống, có phép không tính mẫu số, bỏ sheet ẩn và cột tiền, giáo trình theo tên sheet, khớp mã lớp lệch P/B, không ghi đè ô sửa trên app, dry-run |

## Đã được kiểm thử tự động (170 test)
- Chưa đăng nhập → 401; đăng nhập sai/đúng.
- Giảng viên không truy cập được lớp chưa được phân (403), sau khi phân thì được; không tạo lớp / xem user được.
- Tỉ lệ điểm danh: có phép không tính vào mẫu số (A=0.67, B=0.5).
- Dữ liệu sai: trạng thái lạ → 400; buổi/học viên không tồn tại hoặc **thuộc lớp khác** → 404.
- "Cả lớp ✓" chỉ điền ô trống, không ghi đè, chạy lại tạo 0 bản ghi.
- HW: "Nộp lại" không tính hoàn thành; bài chưa thu không tính vào mẫu số.
- Dashboard tổng hợp; thêm trùng học viên → 409; ngày sai định dạng → 400.
- Tên chứa HTML được lưu nguyên văn.
- Sao lưu/khôi phục: CSV ghi rồi đọc lại khớp (kể cả chuỗi rỗng, NULL, JSON, tiếng Việt), khôi phục chỉ vào database trống, chốt chặn không chép đè database chính.
- Đồng bộ điểm: ô HW chỉ có số, mã lớp nhiều kiểu viết (`BIE 102`, `BIE95`, mã đầy đủ), Mini Project tự tạo cột MP và không tính % HW, trả ví dụ dòng bị bỏ qua (không có mã/tên học viên).
- Lịch: khai giảng theo `start_date`, buổi học theo thứ học trong khoảng start..end (`classEventOn`, `weekdaysOf`, `formatDays`); đọc cột DAYS OF WEEK không lọt cột tiền.
- Import: 46 học viên; số có mặt theo buổi `[35,38,40,36,38,32,35,33]` và số nộp `[42,38,39,37,27,0,32]` đúng bằng dòng 4 của Excel; số điện thoại khôi phục số 0 đầu.

## Chưa được kiểm thử tự động — phải thử tay
- **Toàn bộ giao diện trình duyệt** (render, click, modal, biểu đồ). Chưa có test E2E.
- Hiển thị trên điện thoại / chế độ tối.
- Phiên hết hạn giữa chừng (401 trong khi đang thao tác).
- Đăng nhập sai quá 8 lần (giới hạn tốc độ).
- Hiệu năng với lớp lớn (hàng trăm học viên).

## Checklist thử tay (5-10 phút)
1. Đăng nhập sai → báo lỗi; đúng → vào Dashboard.
2. Chọn lớp P101 trên thanh trên cùng (có thêm P104). Dashboard: các KPI, 3 biểu đồ hiện; số "Điểm danh theo buổi" = `35 38 40 36 38 32 35 33` (với file mẫu).
3. Học viên: tìm "Khang", lọc Bảo lưu (2 người), sửa 1 người, thêm 1 người, xuất CSV mở được trong Excel (tiếng Việt không lỗi).
4. Điểm danh: bấm 1 ô qua đủ 5 trạng thái; Shift+bấm ghi chú; "Cả lớp ✓" ở buổi mới; sửa ngày buổi.
5. Bài tập: mở 1 ô, đổi trạng thái + Challenge + ghi chú; kiểm tra ★ và tỉ lệ cột cuối.
6. Admin: tạo giảng viên, phân 1 lớp; đăng nhập bằng giảng viên → chỉ thấy lớp đó, không có menu Lớp học/Người dùng.
7. F5 ở từng tab — vẫn đúng trang, không mất đăng nhập.
8. Đổi tab nhanh nhiều lần liên tiếp: thanh điều hướng đứng yên, nội dung mờ dần rồi hiện lên, không chớp trắng, trang cuối cùng bấm là trang hiển thị.
9. Nút mặt trời/mặt trăng: đổi sáng/tối, biểu đồ vẽ lại đúng màu; F5 vẫn giữ lựa chọn.
10. **Hai người cùng điểm danh:** mở tab Điểm danh trên hai trình duyệt/máy (hai tài khoản). Huy hiệu đều là "Trực tiếp". Người 1 bấm một ô → người 2 thấy đổi và nháy vàng trong ~1 giây; rê chuột vào ô thấy tên người sửa. Tắt mạng máy 2, đổi ô ở máy 1, bật mạng máy 2 rồi bấm cùng ô → báo "Ô này vừa được … đổi", không ghi đè.
11. **Chọn lớp:** bấm nút lớp ở góc trên; mặc định chỉ hiện lớp đang học; gõ `bih 103`, chọn chip chương trình, dùng ↑ ↓ Enter; bấm ra ngoài/Esc để đóng. Trang Lớp học (admin) có cùng bộ lọc.
12. **Trang chủ:** mở `#/` — mặt hồ thỉnh thoảng gợn sóng nhẹ; chạm/di chuột vào mặt nước tạo vòng sóng; số liệu đếm lên, từ khóa xoay, thẻ lớp tự chạy và dừng khi rê chuột; bấm một thẻ mở Dashboard của lớp đó. Đặt chế độ "giảm chuyển động" của hệ điều hành → hồ đứng yên.
13. Thu nhỏ cửa sổ ≤ 640px (hoặc mở trên điện thoại): thanh điều hướng, hero, bảng cuộn ngang không tràn.

## Viết test mới
- Mỗi tính năng/bug sửa → ít nhất 1 test: đường đi đúng + 1 đầu vào sai + 1 kiểm tra quyền (nếu có).
- Dùng `startTestApp()`; tạo dữ liệu bằng API khi có thể, bằng `t.db` khi cần dựng nhanh.
- Quy tắc tính toán: viết số mong đợi **bằng tay** từ ví dụ nhỏ (xem test điểm danh), không lấy kết quả từ chính hàm đang test.
- Test import dùng file mẫu thật → tự bỏ qua (skip) nếu file không có.

## Chưa phủ: chính sách RLS và kết nối Supabase thật
PGlite không mô phỏng pooler/mạng/SSL của Supabase. Đã thử tay API trên Supabase (đăng nhập, dashboard, ghi/hoàn điểm danh, import lại). Khi thêm policy RLS cho truy cập trực tiếp từ trình duyệt: thêm test người dùng A không đọc được lớp của B.
