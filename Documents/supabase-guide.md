# Hướng dẫn chuyển dữ liệu lên Supabase

Hướng dẫn này đã được thực hiện (2026-10-09): **webapp chạy trực tiếp trên Supabase**. Giữ lại để dựng lại môi trường mới hoặc thay project.

## Bước 1 — Tạo project
1. Vào https://supabase.com → đăng nhập → **New project**.
2. Đặt tên (vd `class-manager`), chọn **Region gần nhất** (Singapore), đặt **Database password** — *lưu lại ngay*, sau này chỉ xem được bằng cách reset.
3. Chờ ~2 phút để project khởi tạo.

## Bước 2 — Tạo bảng
1. Menu trái → **SQL Editor** → **New query**.
2. Mở file [supabase/schema.sql](../supabase/schema.sql), copy toàn bộ, dán vào, bấm **Run**. Kết quả "Success. No rows returned".
3. Vào **Table Editor**: thấy 11 bảng. Mỗi bảng có nhãn RLS đã bật (đúng ý — xem mục Bảo mật).

## Bước 3 — Lấy chuỗi kết nối
1. Bấm nút **Connect** ở đầu trang project.
2. Chọn tab **Session pooler** (dùng được trên mạng IPv4 thông thường; chuỗi "Direct connection" chỉ hỗ trợ IPv6 nên hay lỗi trên máy cá nhân).
3. Copy chuỗi dạng `postgresql://postgres.<mã-project>:[YOUR-PASSWORD]@aws-0-<vùng>.pooler.supabase.com:5432/postgres`, thay `[YOUR-PASSWORD]` bằng mật khẩu ở Bước 1.
   Mật khẩu có ký tự đặc biệt (`@`, `#`, `/`…) phải mã hóa URL (`@` → `%40`), hoặc đặt lại mật khẩu chỉ gồm chữ và số.

## Bước 4 — Nạp dữ liệu
Cách hiện hành: `npm run import -- danh-sach-hoc-vien-mau.xlsx` (nạp thẳng từ Excel, chạy lại an toàn) và `npm run create-admin -- email "Tên" matkhau`.

Cách cũ (chỉ khi có bản SQLite trong `legacy/app.sqlite.db`):
Tạo file `.env` ở thư mục gốc dự án (file này đã nằm trong `.gitignore`, **không bao giờ gửi cho ai hay commit**):
```
DATABASE_URL=postgresql://postgres.xxxx:MATKHAU@aws-0-xx.pooler.supabase.com:5432/postgres
```
Chạy:
```
npm run migrate-pg
```
Kết quả mong đợi (số dòng theo dữ liệu hiện tại): `classes 2 · students 72 · enrollments 72 · sessions 16 · attendance 394 · assignments 14 · submissions 276 · vouchers 18`.
Script chạy trong một transaction: lỗi giữa chừng thì hoàn tác toàn bộ. Nó **xóa dữ liệu cũ trong 11 bảng đích** rồi nạp lại, nên chỉ dùng khi Supabase chưa có dữ liệu nhập tay riêng.

## Bước 5 — Kiểm tra
Trong **SQL Editor** chạy các truy vấn đối soát:
```sql
select c.code, count(*) as hoc_vien
from enrollments e join classes c on c.id = e.class_id group by c.code;      -- 46 và 26

select s.session_no, count(*) filter (where a.status in ('present','late')) as co_mat
from attendance a join sessions s on s.id = a.session_id
join classes c on c.id = s.class_id
where c.code = 'P2.BIE.P101.HY.AA.260726' group by s.session_no order by 1;  -- 35,38,40,36,38,32,35,33
```

## Bước 6 — Webapp dùng Supabase (đã làm)
Truy cập dữ liệu qua `src/db.js` (`pg`). Chạy: `PORT=3100 npm start`. Test không dùng Supabase mà dùng PGlite (Postgres trong bộ nhớ).

## Bảo mật (quan trọng)
- Dữ liệu có email, SĐT học viên. Schema đã **bật RLS và không tạo policy** → khóa API công khai (`anon key`) không đọc được gì. Đừng tắt RLS.
- Server Node dùng chuỗi kết nối Postgres (vai trò `postgres`, bỏ qua RLS) → chỉ đặt ở `.env` trên server, **không đưa xuống trình duyệt**.
- Không dùng `service_role` key trong code chạy ở trình duyệt.
- Nếu sau này cho trình duyệt gọi thẳng Supabase, mới viết policy theo lớp (mẫu ở [code-guide.md](code-guide.md#chuyển-sang-supabase)) và dùng Supabase Auth thay cho bảng `users` tự quản.
- Bảng `users` có `password_hash` (băm scrypt) và `auth_sessions` được chuyển theo để tài khoản admin giữ nguyên; xóa phiên cũ nếu muốn: `truncate auth_sessions;`.
- Gói Free: project không hoạt động ~1 tuần sẽ bị tạm dừng; nên bật sao lưu khi dùng thật.
