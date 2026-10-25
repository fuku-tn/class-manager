---
name: class-manager-review
description: "Điều phối review độc lập cho project Class Manager bằng 5 subagent chỉ-đọc (rules-reviewer, schema-guard, import-auditor, score-coverage-auditor, score-calc-checker). Dùng khi người dùng nói 'review thay đổi', 'rà soát trước khi commit', 'kiểm tra theo quy tắc CLAUDE.md', 'rà schema/migration', 'đối soát file Excel mới', 'chạy lại review', 'review lại phần schema thôi', 'sửa xong rồi, kiểm lại giúp', 'kiểm tra có sót điểm học viên nào không', 'điểm đã đủ và đúng chưa', 'đối soát điểm với file SharePoint/Excel', 'vì sao điểm app khác file'. Cũng dùng cho yêu cầu tiếp theo: chạy lại một phần, kiểm lại sau khi sửa. Không dùng để viết tính năng (đó là student-webapp-dev) hay chạy test (run-tests)."
---

# Orchestrator review — Class Manager

## Chế độ thực thi: Ủy quyền cho subagent

Các reviewer độc lập, chỉ trả báo cáo, không cần trao đổi qua lại → gọi song song bằng công cụ Agent (`subagent_type`), một message chứa nhiều lời gọi. Không dùng Workflow/persistent team: luồng đơn giản, ít agent, không cần giữ hội thoại.

## Cấu hình agent

| Agent | Khi nào chạy | Việc | Model |
|---|---|---|---|
| `rules-reviewer` | Luôn chạy | Đối chiếu diff với quy tắc 1–4, 6–11 của `CLAUDE.md` | opus |
| `schema-guard` | Diff đụng `src/schema.sql`, `supabase/`, hoặc `tests/` liên quan DB; hoặc người dùng hỏi về schema | Hai schema đồng bộ, RLS, migration, không dữ liệu tiền | sonnet |
| `import-auditor` | Người dùng đưa file `.xlsx`, hoặc diff đụng `src/services/import*.js`/`scripts/import*.js` | Khảo sát + `--dry-run` + đối soát, không bao giờ nhập thật | sonnet |
| `score-coverage-auditor` | Người dùng hỏi điểm có đủ/sót không, đưa file điểm (`scores_*.csv`, `Chấm điểm.xlsx`), hoặc sau mỗi lần nhập điểm | Độ phủ điểm theo lớp (`npm run audit-scores`), điểm có ở nguồn mà chưa vào app và nguyên nhân; không in họ tên | sonnet |
| `score-calc-checker` | Người dùng hỏi điểm có đúng không / vì sao app khác file; diff đụng `importScoreFiles.js`, `importPoints.js`, `pointsExcel.js`, `stats.js`, `graduation.js`, route `/scores`, `homework.js` | Quy tắc gộp (tổng file, tối đa 10), bí danh BIH, ưu tiên gõ tay > Excel > SharePoint, công thức chỉ ở `stats.js`, test | opus |

Cả năm chỉ đọc. Review không tự sửa code. Hỏi "điểm đã đủ **và đúng** chưa" thì chạy song song `score-coverage-auditor` + `score-calc-checker`.

## Quy trình

### Bước 0: Xác định phạm vi và yêu cầu tiếp theo
1. Chạy `git status --short` và `git diff HEAD --stat` để biết file nào đổi.
2. Chọn agent theo bảng trên. Người dùng chỉ định rõ ("chỉ rà schema") thì chỉ chạy agent đó.
3. Nếu đây là lần review lại sau khi sửa: truyền cho agent kết quả review trước (danh sách phát hiện) để chúng kiểm lại mục cũ + phần diff mới, thay vì review từ đầu.
4. Với `import-auditor` mà chưa có đường dẫn file → hỏi người dùng đúng một câu: file nào, và là điểm danh hay Transactions.
5. Với hai agent điểm: không có file nguồn thì vẫn chạy được phần database (`npm run audit-scores`); có file `.csv`/`.xlsx` điểm thì truyền đường dẫn trong prompt. Nhắc cả hai **không dùng `--verbose`, không in họ tên** (dữ liệu học viên thật).

### Bước 1: Gọi song song
Trong **một** message, gọi Agent cho từng agent đã chọn, prompt gồm: phạm vi (danh sách file/diff), loại review, nhắc "chỉ đọc, trả đúng định dạng báo cáo của bạn". Ví dụ:

```
Agent(subagent_type: "rules-reviewer", prompt: "Review git diff HEAD và file untracked trong src/, public/, scripts/, tests/ theo quy tắc CLAUDE.md. Chỉ đọc. Trả báo cáo đúng định dạng.")
Agent(subagent_type: "schema-guard",  prompt: "Rà src/schema.sql, supabase/schema.sql, supabase/migrations/ theo diff hiện tại. Không truy cập DB. Trả báo cáo đúng định dạng.")
```

### Bước 2: Gộp kết quả
1. Gộp mọi phát hiện vào **một bảng** theo mức: Chặn → Nên sửa → Gợi ý. Cột: nguồn agent · quy tắc · `file:dòng` · vì sao · cách sửa.
2. Trùng nhau giữa các agent thì giữ một dòng, ghi cả hai nguồn. Mâu thuẫn thì nêu cả hai ý, không tự chọn.
3. Kiểm lại ngẫu nhiên các phát hiện mức Chặn bằng cách mở đúng dòng được trích trước khi báo cho người dùng; phát hiện không khớp dòng thật thì loại và ghi chú.
4. Gom các mục "Chưa kiểm được" của mọi agent thành một đoạn cuối (vd: trạng thái thật trên Supabase, giao diện trên trình duyệt).

### Bước 3: Kết luận và bước tiếp
- Kết luận một dòng: **có phát hiện Chặn / chỉ còn Nên sửa / sạch**.
- Gợi ý bước tiếp: sửa các mục Chặn (dùng skill `student-webapp-dev` nếu người dùng đồng ý), rồi `npm test` (skill `run-tests`), cập nhật `memory.md`. Không tự sửa khi chưa được đồng ý.

## Xử lý lỗi

| Tình huống | Cách ứng phó |
|---|---|
| Một agent lỗi/không trả kết quả | Chạy lại đúng agent đó một lần; vẫn lỗi thì báo trong kết luận là phần đó **chưa được review**. |
| `import-auditor` không kết nối được Supabase | Giữ phần khảo sát file, báo thiếu kết quả dry-run, không thử cách khác để đọc DB. |
| Diff rỗng | Báo "không có thay đổi để review"; hỏi người dùng muốn review commit/khoảng nào. |
| Agent đề nghị ghi/sửa file | Từ chối; review chỉ báo cáo. |

## Kịch bản kiểm thử
- **Điểm — bình thường:** người dùng hỏi "đã sót điểm học viên nào chưa" và đưa `scores_STARTTRAIN.csv` → chạy `score-coverage-auditor` (và `score-calc-checker` nếu hỏi cả "đúng chưa"); báo cáo chỉ có mã lớp/mã học viên, nêu rõ phần *sót khi nhập* khác với *chưa có điểm ở nguồn*.
- **Điểm — ngoại lệ:** app khác file 24 bài nhưng đều là điểm Excel/gõ tay → `score-calc-checker` ghi "hợp lệ theo thứ tự ưu tiên", không báo là lỗi.
- **Bình thường:** thêm cột vào `students` ở `src/schema.sql` nhưng quên `supabase/schema.sql` và migration → `schema-guard` báo 2 mục Chặn (lệch hai file, thiếu migration); `rules-reviewer` báo thiếu test nếu chưa có.
- **Ngoại lệ:** người dùng đưa `Transacitons.xlsx` có cột lạ `PAID` → `import-auditor` không đọc cột đó, chỉ báo tên cột và yêu cầu chủ dự án quyết định; kết luận không có số liệu tiền nào xuất hiện trong báo cáo.
