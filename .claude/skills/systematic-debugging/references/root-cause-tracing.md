# Lần ngược dòng dữ liệu (root cause tracing)

Nguồn ý tưởng: obra/superpowers (MIT), rút gọn.

**Nguyên tắc:** lỗi thường hiện ra ở nơi sâu trong chuỗi gọi, nhưng nguyên nhân nằm ở nơi giá trị sai được tạo ra. Lần ngược lên cho tới nguồn rồi sửa ở nguồn, không vá ở chỗ lỗi hiện ra.

## Các bước
1. **Ghi lại triệu chứng** chính xác (thông báo, giá trị sai, dòng nào).
2. **Tìm nguyên nhân trực tiếp**: dòng code nào trực tiếp tạo ra triệu chứng?
3. **Hỏi: ai gọi dòng này, truyền giá trị gì?** Lên một tầng, lặp lại.
4. **Tiếp tục lên** đến khi thấy nơi giá trị sai bắt đầu (đầu vào người dùng, dữ liệu Sheet/Excel, cấu hình, migration…).
5. **Sửa tại nguồn.** Sau đó mới thêm kiểm tra ở các tầng giữa (xem `defense-in-depth.md`).

## Ví dụ ở project này
- **Triệu chứng:** Top Performance báo "database hết kết nối".
  - Trực tiếp: `pool.query` lỗi `max clients reached` (`src/db.js`).
  - Ai gọi: route `/top-performance` → `loadClassData` (nhiều truy vấn song song).
  - Lên nữa: mỗi instance Vercel mở tới 3 kết nối vào **Session pooler 5432**.
  - Nguồn: `DATABASE_URL` trên Vercel là Session pooler → sửa bằng tự đổi sang Transaction pooler 6543 và giữ ít kết nối hơn, chứ không phải bỏ tính năng.
- **Triệu chứng:** điểm 12.5 của một học viên bị bỏ qua khi nhập.
  - Trực tiếp: `parseScore` trả `null` vì > 10.
  - Nguồn: công thức Excel `SUMIFS` cộng điểm nhiều file mà không chặn 10 → sửa quy tắc chặn 10 ở bộ nhập (và nhắc cập nhật công thức Excel).

## Mẹo công cụ
- Trong test dùng `console.error` (không dùng logger) để in dữ liệu tạm; nhớ xóa sau khi xong.
- Muốn biết test/chỗ nào gây ra tác động phụ: in `new Error().stack` ngay trước thao tác nghi vấn.
- Truy vấn dữ liệu thật chỉ bằng script **chỉ đọc**, không in họ tên khi không cần.
