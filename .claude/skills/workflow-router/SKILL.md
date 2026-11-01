---
name: workflow-router
description: "Điều phối quy trình làm việc của Class Manager: ở ĐẦU mỗi yêu cầu của chủ dự án (thêm/sửa tính năng, sửa lỗi, nhập hoặc chỉnh dữ liệu điểm/lịch/ghi danh, xuất file, review, đẩy code, hỏi tình trạng dữ liệu) hãy dùng skill này để quyết định (1) skill nào áp dụng và theo thứ tự nào, (2) có cần gọi subagent kiểm tra (rules-reviewer, schema-guard, import-auditor, score-coverage-auditor, score-calc-checker) hay không, gọi lúc nào, bao nhiêu agent. Mặc định KHÔNG gọi agent; chỉ gọi reviewer chỉ-đọc ở cuối thay đổi lớn. Dùng cả khi người dùng nói 'làm giúp tôi', 'sửa', 'thêm', 'kiểm tra', 'cập nhật', 'commit', 'đẩy lên' mà chưa nêu rõ skill/agent."
---

# Điều phối quy trình — Class Manager

Skill này là **bộ điều phối ở luồng chính**, không phải một subagent: subagent trong Claude Code không gọi được subagent khác, và thêm một agent chỉ để chọn đường đi làm mỗi việc chậm và tốn hơn. Chủ dự án đã cho phép (yêu cầu ngày 1/11/2026) áp dụng bảng quyết định dưới đây, kể cả tự gọi các reviewer **chỉ-đọc** theo điều kiện ở mục 3 mà không cần hỏi lại từng lần.

## 1. Chọn skill theo loại việc
Làm theo thứ tự trong cột "Chuỗi". Việc nhỏ (đổi chữ/CSS, trả lời câu hỏi, đọc tài liệu) → không cần skill.

| Việc chủ dự án giao | Chuỗi skill |
|---|---|
| Thêm/sửa tính năng, trang, endpoint, cột dữ liệu | `student-webapp-dev` → `test-driven-development` → (đổi schema/RLS/truy vấn chậm: `supabase`, `supabase-postgres-best-practices`) → `run-tests` → `verification-before-completion` |
| Lỗi, test đỏ, web báo lỗi, số liệu lạ | `systematic-debugging` (tìm gốc trước) → `test-driven-development` (test tái hiện) → `verification-before-completion` |
| Nhập/đối soát file Excel điểm danh, Transactions | `import-excel` (luôn `--dry-run` trước) → `verification-before-completion` |
| Điểm từ danh sách file SharePoint | `import-score-files` |
| Chấm điểm, Module, "ai chưa có điểm", điểm lệch file | `cham-diem-hw` (+ `npm run audit-scores` chỉ đọc) |
| Chạy/viết test | `run-tests` (+ `test-driven-development` khi viết mới) |
| Rà soát, review, "kiểm tra trước khi commit" | `class-manager-review` (điều phối các agent chỉ-đọc) |
| Nhận kết quả review / góp ý | `receiving-code-review` (kiểm chứng rồi mới sửa) |
| Báo "xong", commit, đẩy lên | `verification-before-completion` (+ mục 3 nếu thay đổi lớn) |
| Chỉnh dữ liệu thật (lịch, điểm, ghi danh) | Xác nhận phạm vi → chỉnh bằng script có giao dịch → nhắc nguồn gốc (Sheet/Excel sẽ ghi đè nếu không sửa ở nguồn) |
| Chỉ hỏi tình trạng ("đã cập nhật chưa?", "liệt kê…") | Chạy script **chỉ đọc**; không cần skill, không cần agent |

Thay đổi tài liệu/quyết định: sau khi xong luôn ghi `memory.md` (quy tắc 13 của CLAUDE.md).

## 2. Mặc định: không gọi agent
Mỗi lần gọi agent là một phiên riêng, tốn thời gian và token, và agent không thấy ngữ cảnh cuộc trò chuyện. Chỉ gọi khi lợi ích rõ ràng (mục 3) hoặc chủ dự án yêu cầu. Việc đơn lẻ, đọc/ghi vài file, một lệnh script → làm trực tiếp ở luồng chính.

## 3. Khi nào gọi agent (chỉ-đọc, tự động được phép)
Chạy **một lần ở cuối** thay đổi (sau khi `npm test` xanh, trước commit/đẩy), không chạy sau từng bước nhỏ. Gọi song song trong một message, tối đa 3 agent mỗi lượt.

| Điều kiện (xem `git diff HEAD --stat`) | Agent |
|---|---|
| Đổi route, phân quyền/đăng nhập, công thức (`stats.js`, `gpa.js`), frontend lớn (hơn khoảng 150 dòng), hoặc quy tắc trong CLAUDE.md có thể bị chạm | `rules-reviewer` |
| Đổi `src/schema.sql`, `supabase/`, migration | `schema-guard` |
| Đổi `src/services/import*.js`, `scripts/import*.js`, hoặc chủ dự án đưa file `.xlsx` mới | `import-auditor` (không bao giờ nhập thật) |
| Vừa nhập điểm / chủ dự án hỏi điểm "đủ chưa" | `score-coverage-auditor` |
| Đổi `importPoints.js`, `importScoreFiles.js`, `pointsExcel.js`, `scoreModules.js`, `graduation.js`, `gpa.js`, `transcript.js`, hoặc hỏi "điểm đúng chưa" | `score-calc-checker` |

**Không gọi agent khi:** chỉ đổi CSS/chữ/tài liệu/test; thay đổi dưới khoảng 30 dòng không đụng vùng nhạy cảm ở bảng trên; cùng một reviewer đã chạy trong phiên này mà diff không đổi từ đó; chủ dự án nói "không cần review". Chi tiết cách gọi và gộp báo cáo: skill `class-manager-review`.

**Ràng buộc cứng:** không gọi agent có quyền ghi; không để agent in họ tên/email học viên; báo cáo agent chỉ là gợi ý — kiểm lại bằng code thật (skill `receiving-code-review`) rồi mới sửa; không tự sửa code theo báo cáo nếu chủ dự án chưa đồng ý hướng sửa.

## 4. Cách thực hiện ở đầu mỗi yêu cầu
1. Phân loại việc theo bảng mục 1 (một câu trong đầu, không cần nói ra trừ khi mơ hồ).
2. Nếu yêu cầu **mơ hồ ở điểm có thể làm sai dữ liệu thật** (ví dụ "dời lịch" nhưng không rõ lớp/buổi), hỏi đúng một câu; còn lại thì chọn mặc định hợp lý và nêu giả định trong báo cáo.
3. Làm việc theo chuỗi skill, báo cáo cuối: kết quả đã kiểm chứng, giả định, điều chưa kiểm chứng được, bước chủ dự án cần làm (vd cập nhật Sheet).
4. Tới cuối thay đổi: đối chiếu mục 3 để quyết định có gọi reviewer; nêu lý do khi gọi hoặc khi bỏ qua (một dòng).

## Kịch bản kiểm thử (đã tự rà)
- **Nên kích hoạt:** "thêm cột GPA vào trang Tốt nghiệp" (tính năng → chuỗi dev + TDD, cuối cùng `rules-reviewer` + `score-calc-checker` vì đụng `graduation.js`) · "web báo lỗi hết kết nối" (→ `systematic-debugging`, không gọi agent) · "nhập file điểm mới" (→ `cham-diem-hw`/`import-score-files`, sau nhập `score-coverage-auditor`).
- **Không nên gọi agent:** "đổi màu nút Xuất CSV" (chỉ CSS) · "ai chưa có điểm lớp BIH098?" (script chỉ đọc) · sửa lỗi chính tả trong `memory.md`.
- **Gần kề dễ nhầm:** "review giúp tôi" → đây là việc của `class-manager-review`, skill này chỉ chọn nó; "viết test" → `run-tests`, không phải router.
