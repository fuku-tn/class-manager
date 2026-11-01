# Chặn lỗi nhiều lớp (defense in depth)

Nguồn ý tưởng: obra/superpowers (MIT), rút gọn.

**Nguyên tắc:** sau khi sửa đúng nguyên nhân gốc, kiểm tra dữ liệu ở MỌI lớp nó đi qua để lỗi cùng loại không thể quay lại. Một lớp có thể bị đường khác lách qua (importer khác, script CLI, test) — nhiều lớp thì không.

## Bốn lớp trong Class Manager
1. **Cửa vào (route/bộ nhập):** từ chối đầu vào vô lý ngay biên — ví dụ `ATT_STATUS`/`SUB_STATUS` trong `classData.js`, điều kiện dòng hợp lệ của đồng bộ Sheet (`STUDENT_ID_RE`, `ALLOWED_*`), điểm 0–10.
2. **Nghiệp vụ (service):** kiểm tra hợp lý cho đúng thao tác — ví dụ chốt chặn 5% của `importTransactions`, chốt chặn 50% của lịch giảng, `expected` chống ghi đè ô.
3. **Môi trường/quyền:** chặn việc nguy hiểm theo ngữ cảnh — `blockGuestWrites`, `requireClassAccess`, `requireAdmin`, `can_*`; tắt Google Sheet điểm (410) khi đã chuyển nguồn.
4. **Dấu vết:** ghi lại để điều tra — `enrollment_events` (chỉ thêm), `sync_runs`, log số đếm (không ghi họ tên/đường dẫn).
(Thêm một lớp cuối là ràng buộc trong database: `CHECK`, `unique`, `not null`, RLS.)

## Cách áp dụng
1. Vẽ đường đi của dữ liệu lỗi qua các lớp.
2. Với mỗi lớp, tự hỏi: "lớp này có chặn được giá trị đó không?" Chưa thì thêm.
3. Viết test cho từng lớp (đường đi khác nhau cần test khác nhau).
4. Đừng dừng ở lớp đầu tiên chặn được.
