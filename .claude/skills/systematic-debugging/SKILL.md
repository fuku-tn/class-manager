---
name: systematic-debugging
description: Dùng khi gặp lỗi, test đỏ, kết quả lạ hoặc web báo lỗi (vd "không kết nối được cơ sở dữ liệu", điểm không khớp, lịch bị đè, đồng bộ Sheet thất bại) — TRƯỚC khi đề xuất cách sửa. Bắt buộc tìm nguyên nhân gốc bằng bằng chứng rồi mới sửa; không đoán, không vá triệu chứng.
---

# Gỡ lỗi có hệ thống

Nguồn ý tưởng: bộ skill obra/superpowers (MIT), đã rút gọn và gắn với project Class Manager.

**Luật sắt:** chưa tìm ra nguyên nhân gốc thì chưa được sửa. Đoán rồi thử là mất thời gian hơn và dễ làm hỏng dữ liệu thật.

## 4 giai đoạn (xong giai đoạn trước mới sang giai đoạn sau)

### 1. Tìm nguyên nhân gốc
1. **Đọc kỹ thông báo lỗi** (cả stack trace, mã lỗi, dòng file). Thông báo thường đã nói thẳng nguyên nhân.
2. **Tái hiện ổn định**: lỗi xảy ra mọi lần hay thỉnh thoảng? Bước nào gây ra? Chưa tái hiện được thì thu thập thêm dữ liệu, đừng đoán.
3. **Xem thay đổi gần đây**: `git log -5`, `git diff`, biến môi trường/Vercel, migration, Sheet vừa sửa.
4. **Thu bằng chứng ở từng lớp** (trình duyệt → route Express → service → Supabase pooler → dữ liệu). Chạy MỘT lần để biết hỏng ở lớp nào rồi mới đào sâu lớp đó:
   - Lỗi web thật: `curl .../api/health/db`; xem bảng `sync_runs` (cột `ok`, `error`, `summary` của từng lượt đồng bộ); `describeDbError` trong `src/db.js` dịch lỗi kết nối sang tiếng Việt.
   - Lỗi dữ liệu: chạy script CHỈ ĐỌC trước (`npm run audit-scores`, `--dry-run`), không sửa dữ liệu thật khi chưa hiểu nguyên nhân.
   - Lỗi test: chạy riêng file đó `node --test tests/<file>.test.js`, đọc `actual`/`expected`.
5. **Lần ngược dòng dữ liệu** khi giá trị sai nằm sâu trong chuỗi gọi (xem `references/root-cause-tracing.md`): giá trị sai đến từ đâu → ai truyền vào → lên đến nguồn. Sửa ở nguồn.

### 2. So sánh mẫu
Tìm chỗ tương tự đang chạy đúng trong cùng code (vd route khác đã dùng `requireClassAccess`, importer khác đã dùng `unnest`), liệt kê MỌI điểm khác nhau, dù nhỏ.

### 3. Giả thuyết và thử
- Nêu **một** giả thuyết: "Tôi nghĩ X là nguyên nhân vì Y".
- Thử bằng thay đổi **nhỏ nhất**, mỗi lần một biến.
- Sai thì lập giả thuyết mới, không chồng thêm bản vá.
- Không biết thì nói "tôi chưa hiểu X", hỏi chủ dự án hoặc tra thêm.

### 4. Sửa
1. **Viết test tái hiện trước** (xem skill `test-driven-development`), thấy nó đỏ.
2. Sửa **một** chỗ, đúng nguyên nhân gốc. Không gộp refactor "tiện thể".
3. Chạy lại test tái hiện + cả bộ `npm test` (skill `verification-before-completion`).
4. **Sửa 3 lần vẫn không được → dừng**: có thể kiến trúc sai; bàn với chủ dự án trước khi thử lần 4.

## Dấu hiệu đang đi sai (quay lại giai đoạn 1)
"Sửa tạm đã, tìm hiểu sau" · "thử đổi X xem sao" · sửa nhiều chỗ cùng lúc · bỏ qua test, "tôi tự kiểm tra tay" · đề xuất cách sửa khi chưa lần theo dữ liệu · "thử thêm một lần nữa" sau 2 lần thất bại.

## Những lỗi đã gặp ở project này (tra nhanh)
| Triệu chứng | Nguyên nhân gốc đã biết | Chỗ xem |
|---|---|---|
| "database hết kết nối (dùng Transaction pooler, cổng 6543)" | Vercel dùng Session pooler 5432, nhiều instance cạn slot | `serverlessUrl` trong `src/db.js`, `Documents/4-van-hanh/deploy-vercel.md` |
| Chỉnh lịch/điểm tay rồi tự quay về như cũ | Đồng bộ Calendar / Excel 12:00 ghi đè toàn bộ — sửa phải ở nguồn (Sheet/Excel) | CLAUDE.md mục 10c, 14d |
| Điểm 12.5/14 bị bỏ | Excel cộng điểm nhiều file, bản công thức cũ không chặn 10 | `parseScore` trong `importPoints.js` |
| Học viên "chưa có điểm" | Có thể chỉ là không làm bài (không phải thiếu chấm) — hỏi chủ dự án trước khi coi là lỗi | memory.md 1/11/2026 |
| Danh sách lớp bị nút đè | z-index của hàng nút lớn hơn thanh trên | `public/css/style.css` (`.topbar`, `.modal-back`) |

## Hỗ trợ
- `references/root-cause-tracing.md` — lần ngược dòng dữ liệu.
- `references/defense-in-depth.md` — sau khi tìm ra gốc, chặn lỗi ở nhiều lớp (route → service → schema/CHECK).
