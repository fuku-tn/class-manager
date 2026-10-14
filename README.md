# Class Manager — Starttrain

Webapp quản lý lớp học: học viên, điểm danh, bài tập/điểm, tốt nghiệp, nhắc bài — đồng bộ tự động từ Google Sheet, chạy trên Vercel + Supabase.

## Bắt đầu
```
npm install
cp .env.example .env      # điền DATABASE_URL (xem Documents/3-ky-thuat/supabase-guide.md)
npm test                  # Postgres trong bộ nhớ, không chạm dữ liệu thật
npm start                 # http://localhost:3000
```
Cần Node >= 22.13.

## Thư mục
| Thư mục / file | Nội dung |
|---|---|
| `src/` | Backend Express (route, nghiệp vụ, kết nối DB, schema) |
| `public/` | Giao diện (HTML/CSS/JS thuần), logo, thư viện tĩnh |
| `scripts/` | Lệnh CLI và script Google Apps Script |
| `supabase/` | Schema + migration cho Supabase |
| `tests/` | Kiểm thử tự động |
| `Documents/` | Tài liệu theo nhóm — xem [Documents/README.md](Documents/README.md) |
| `DESIGN.md` | Thiết kế tổng thể |
| `CLAUDE.md` | Quy tắc bắt buộc khi sửa code (cho người và Claude Code) |
| `memory.md` · `Archive.md` | Nhật ký quyết định · nội dung đã thay thế |
| `private-data/` | **Chỉ trên máy, không lên Git**: file Excel có dữ liệu học viên thật, văn bản nội bộ |

## Đọc tiếp
[DESIGN.md](DESIGN.md) → [Documents/README.md](Documents/README.md) → [CLAUDE.md](CLAUDE.md) (quy tắc bắt buộc).
