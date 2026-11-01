---
name: verification-before-completion
description: Dùng TRƯỚC khi nói "xong", "đã sửa", "test qua hết", trước khi commit/đẩy hoặc báo kết quả cho chủ dự án. Bắt buộc chạy lệnh kiểm chứng và đọc kết quả thật rồi mới được khẳng định — bằng chứng trước, lời khẳng định sau. Áp dụng cho mọi thay đổi code, dữ liệu (migration, nhập điểm, sửa lịch) và khi tin báo cáo của subagent.
---

# Kiểm chứng trước khi báo xong

Nguồn ý tưởng: bộ skill obra/superpowers (MIT), đã rút gọn và gắn với quy tắc 13 trong `CLAUDE.md`.

**Nguyên tắc:** không khẳng định điều gì chưa kiểm chứng trong chính lượt này. "Chắc là chạy được", "should pass" không phải bằng chứng.

## Cổng kiểm chứng (làm đủ 5 bước, không bỏ bước)
1. **Xác định** lệnh nào chứng minh được điều sắp khẳng định.
2. **Chạy** lệnh đó đầy đủ, mới (không dùng kết quả của lần chạy cũ).
3. **Đọc** toàn bộ kết quả: số pass/fail, mã thoát, cảnh báo.
4. **Đối chiếu**: kết quả có đúng với điều sắp nói không? Không → nói đúng tình trạng thật, kèm số liệu.
5. **Chỉ khi đó** mới viết "xong/đã sửa/qua hết" và nêu bằng chứng (ví dụ "238/238 test qua").

## Điều gì chứng minh điều gì (project Class Manager)
| Khẳng định | Cần chạy | Chưa đủ |
|---|---|---|
| Code không hỏng | `npm test` (cả bộ, báo đúng `pass/fail`) | chỉ chạy 1 file test; "đã đọc code thấy ổn" |
| Sửa được lỗi | tái hiện lỗi cũ (test viết trước, đã đỏ → xanh) | "đã sửa dòng đó" |
| Không có biến/hàm thừa, lỗi cú pháp frontend | `npx eslint` cấu hình tạm + test cú pháp `public/js` trong `npm test` | chỉ `node --check` một file |
| Migration/ALTER đã chạy | chạy `scripts/run-migration.js` rồi truy vấn lại cột/bảng trên Supabase | "đã viết file .sql" |
| Nhập điểm/đồng bộ đúng | `npm run import-points -- --dry-run`, `npm run audit-scores`, xem `sync_runs` | "đã chạy script" |
| Web thật chạy | `curl https://class-manager-rose.vercel.app/api/health/db` → 200 | "đã đẩy lên Vercel" |
| Giao diện đúng | mở trang bằng trình duyệt hoặc **nói rõ chưa mở thử** | khẳng định giao diện đẹp/đúng khi chưa xem |
| Subagent làm xong | `git diff`/đọc file thật, chạy lại test | tin dòng "đã xong" trong báo cáo của agent |

## Dấu hiệu phải dừng
- Dùng chữ "chắc", "có lẽ", "should", "probably" cho điều có thể kiểm chứng ngay.
- Sắp commit/đẩy mà chưa chạy `npm test`.
- Muốn khen kết quả ("Tuyệt!", "Xong rồi!") trước khi chạy lệnh.
- Chỉ kiểm chứng một phần rồi suy ra phần còn lại.
- Có test đỏ "không liên quan" lướt qua mà không báo. **Mọi test đỏ phải nêu tên trong báo cáo**, kể cả khi không do mình gây ra.

## Khi không kiểm chứng được
Nói thẳng: "chưa kiểm chứng được vì …" (ví dụ chưa mở trình duyệt, không có quyền vào Vercel, dữ liệu thật chỉ chủ dự án thấy) và nêu việc chủ dự án cần tự xem. Đây là cách báo cáo trung thực; không được che bằng giọng chắc chắn.

## Mẫu báo cáo
> Đã sửa X. Kiểm chứng: `npm test` → 241/241 qua; `audit-scores` → 0 điểm ngoài 0–10. Chưa kiểm chứng: hiển thị popup trên trình duyệt (bạn mở trang Tốt nghiệp xem giúp).
