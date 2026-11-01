---
name: test-driven-development
description: Dùng khi thêm tính năng, sửa lỗi hoặc đổi hành vi của Class Manager — viết test (node:test + PGlite) TRƯỚC, thấy nó đỏ đúng lý do, rồi mới viết code tối thiểu cho xanh, rồi dọn. Dùng cùng skill run-tests và systematic-debugging.
---

# Viết test trước (TDD) cho Class Manager

Nguồn ý tưởng: bộ skill obra/superpowers (MIT), đã rút gọn và gắn với bộ test của project. Cách chạy/đọc kết quả: skill `run-tests`; chiến lược: `Documents/3-ky-thuat/testing.md`.

**Nguyên tắc:** chưa thấy test đỏ thì chưa biết test có bắt được lỗi hay không.

## Khi nào dùng
Tính năng mới, sửa lỗi, đổi hành vi, đổi công thức (`stats.js`, `gpa.js`), đổi quy tắc đồng bộ/nhập. Ngoại lệ (hỏi chủ dự án): chỉnh CSS/chữ, tài liệu, script dùng một lần.

## Vòng Đỏ → Xanh → Dọn
1. **ĐỎ — viết một test** cho một hành vi, tên nói rõ hành vi (tiếng Việt như các test hiện có), dùng code thật.
   - API: dùng `startTestApp()` trong `tests/helpers.js` (`t.addUser`, `t.login`, `t.db`, `t.close`) — xem mẫu ở `tests/gpa.test.js`, `tests/graduation-auto.test.js`.
   - Công thức thuần: gọi thẳng hàm (`gpa.computeGpa`, `attendanceRate`…).
2. **Chạy riêng file đó:** `node --test tests/<file>.test.js`. Bắt buộc thấy **fail** và đúng lý do (thiếu tính năng, không phải gõ sai tên). Test xanh ngay = đang test hành vi đã có → sửa test.
3. **XANH — viết code tối thiểu** cho test qua. Không thêm tính năng, không "tiện thể" cải tiến.
4. **Chạy lại:** file test, rồi **cả bộ `npm test`** (một file xanh chưa phải bộ xanh). Test đỏ nào cũng phải xử lý hoặc báo tên.
5. **DỌN** (chỉ khi đang xanh): bỏ trùng lặp, đặt tên rõ; không thêm hành vi mới.
6. Lặp với hành vi tiếp theo.

## Ràng buộc riêng của project
- **Không dùng dữ liệu học viên thật** trong test (quy tắc 12); dựng dữ liệu mẫu (`G1`, `P.801`…).
- Test không chạm Supabase thật (PGlite trong bộ nhớ).
- Đổi schema → test kiểm hai file `schema.sql` giống nhau + có migration (xem `tests/scores-manual.test.js`).
- Công thức tỉ lệ/GPA chỉ nằm ở `stats.js`/`gpa.js` — test ở đó, không tính lại trong test bằng cách sao chép công thức; dùng số tính tay làm kỳ vọng.
- Sửa lỗi: test tái hiện phải **đỏ trước khi sửa**; sau khi sửa, thử hoàn tác bản sửa để xác nhận test đỏ lại (red-green), rồi khôi phục.

## Viết test tốt (chi tiết ở `references/writing-good-tests.md`)
- Một hành vi mỗi test; tên có chữ "và" thì tách.
- Kỳ vọng tự tính tay, không lấy ngược từ chính code.
- Kiểm hành vi thật, không kiểm mock.
- Tự hỏi: "thay đổi nào trong code thật sự làm test này đỏ?" — không trả lời được thì test vô nghĩa.

## Biện minh hay gặp
| Cớ | Thực tế |
|---|---|
| "Đơn giản quá, không cần test" | Code đơn giản vẫn hỏng; test mất 30 giây |
| "Viết test sau cũng vậy" | Test viết sau qua ngay nên không chứng minh gì; nó chỉ kiểm điều mình nhớ ra |
| "Đã thử tay rồi" | Thử tay không lưu lại, không chạy lại được |
| "Chỉ là sửa nhỏ" | Sửa nhỏ không test là nơi sinh lỗi quay lại |
