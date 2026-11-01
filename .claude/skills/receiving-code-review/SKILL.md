---
name: receiving-code-review
description: Dùng khi nhận góp ý/review — từ chủ dự án, từ báo cáo của các agent rules-reviewer, schema-guard, import-auditor, score-coverage-auditor, score-calc-checker, hoặc từ reviewer bên ngoài — TRƯỚC khi sửa theo. Yêu cầu kiểm chứng với code thật và quy tắc CLAUDE.md, hỏi lại khi chưa rõ, phản biện có lý lẽ thay vì đồng ý máy móc.
---

# Tiếp nhận góp ý review

Nguồn ý tưởng: bộ skill obra/superpowers (MIT), đã rút gọn và gắn với quy trình `class-manager-review`.

**Nguyên tắc:** kiểm chứng trước khi làm, hỏi trước khi đoán, đúng kỹ thuật quan trọng hơn dễ nghe.

## Quy trình
1. **Đọc hết** góp ý, chưa phản ứng.
2. **Hiểu**: nhắc lại yêu cầu bằng lời của mình (hoặc hỏi).
3. **Kiểm chứng** với code thật: góp ý đúng cho *project này* không? Có làm hỏng chức năng đang chạy không? Vì sao hiện tại đang viết như vậy (xem `memory.md`, `CLAUDE.md`, `git log`)?
4. **Đánh giá** có khớp quyết định đã chốt của chủ dự án không. Xung đột quyết định đã chốt → dừng, hỏi chủ dự án trước.
5. **Trả lời**: ghi nhận kỹ thuật, hoặc phản biện có lý lẽ.
6. **Sửa từng mục một**, chạy `npm test` sau từng mục (skill `verification-before-completion`).

## Khi chưa rõ
Còn bất kỳ mục nào chưa rõ → **chưa làm mục nào**, hỏi hết một lượt (các mục thường liên quan nhau). Ví dụ: "Em hiểu mục 1, 2, 3, 6. Cần anh/chị làm rõ mục 4 và 5 trước khi sửa."

## Với góp ý từ agent hoặc reviewer ngoài
Trước khi sửa, kiểm tra: đúng với repo này? Có phá chức năng khác? Reviewer có đủ ngữ cảnh? Có điểm nào mâu thuẫn quy tắc bắt buộc trong `CLAUDE.md`?
- Sai → phản biện bằng lý lẽ, dẫn test/code.
- Không kiểm chứng được → nói rõ "chưa kiểm chứng được vì …, có nên điều tra/hỏi thêm không?".
- Báo cáo của agent chỉ-đọc (rules-reviewer…) là **gợi ý cần kiểm lại**, không phải sự thật; đọc `git diff`/code thật trước khi sửa.

## YAGNI
Reviewer đòi "làm cho đàng hoàng"/thêm tính năng: tìm xem có nơi nào dùng thật không (`grep`). Không dùng → đề xuất bỏ thay vì làm thêm; dùng rồi thì làm đúng.

## Thứ tự sửa khi có nhiều mục
1. Lỗi chặn/an toàn (bảo mật, mất dữ liệu, sai điểm).
2. Sửa đơn giản (chính tả, import thừa).
3. Sửa phức tạp (logic, refactor).
Mỗi mục kiểm lại để không gây lỗi mới.

## Khi nào phản biện
Góp ý làm hỏng chức năng cũ · thiếu ngữ cảnh · vi phạm YAGNI · sai với stack này · có lý do tương thích/lịch sử · trái quyết định của chủ dự án. Phản biện bằng lý lẽ kỹ thuật, câu hỏi cụ thể, dẫn test; không phòng thủ.

## Cách nói
- Đúng: nói việc đã sửa ("Đã sửa: … ở `file:dòng`"), hoặc cứ sửa rồi cho thấy kết quả.
- Không đồng ý máy móc ("Anh/chị nói đúng quá!"), không khen/cảm ơn hình thức — hành động đã đủ cho thấy đã nghe.
- Nếu phản biện sai: nói thẳng "Đã kiểm lại, góp ý đúng vì …, đang sửa", không biện hộ dài dòng.
