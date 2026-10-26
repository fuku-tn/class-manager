# User flow — Class Manager

Các luồng thao tác chính theo từng người dùng. Mỗi luồng gồm: **ai**, **mục tiêu**, **các bước**, **ngoại lệ**.
Xem thêm: [sitemap.md](sitemap.md) · [wireframe.md](wireframe.md) · [../DESIGN.md](../../DESIGN.md).

## Mục lục
1. [Người dùng và mục tiêu](#1-người-dùng-và-mục-tiêu)
2. [Đăng nhập, đổi mật khẩu](#2-đăng-nhập-đổi-mật-khẩu)
3. [Điểm danh một buổi](#3-điểm-danh-một-buổi)
4. [Theo dõi bài tập và điểm](#4-theo-dõi-bài-tập-và-điểm)
5. [Nhắc bài học viên](#5-nhắc-bài-học-viên)
6. [Danh sách tốt nghiệp](#6-danh-sách-tốt-nghiệp)
7. [Học viên từ Google Sheet vào lớp (luồng hệ thống)](#7-học-viên-từ-google-sheet-vào-lớp-luồng-hệ-thống)
8. [Admin: xử lý cảnh báo và nhập dữ liệu](#8-admin-xử-lý-cảnh-báo-và-nhập-dữ-liệu)
9. [Admin: quản lý người dùng và quyền](#9-admin-quản-lý-người-dùng-và-quyền)
10. [Khách: chỉ xem](#10-khách-chỉ-xem)
11. [Xem lịch khai giảng và giảng dạy](#11-xem-lịch-khai-giảng-và-giảng-dạy)

---

## 1. Người dùng và mục tiêu

| Người dùng | Mục tiêu chính | Thao tác thường gặp |
|---|---|---|
| **Giảng viên** | Điểm danh, chấm/ghi nhận bài, biết ai cần nhắc | Điểm danh, cập nhật HW, xem Dashboard |
| **Giảng viên có quyền Nhắc bài** | Nhắc học viên làm bài hàng loạt | Sao chép tin nhắn/ảnh, gửi tổng quan |
| **Giảng viên có quyền xem lớp chưa diễn ra / Potential** | Chuẩn bị lớp mới, theo dõi người chưa vào lớp | Xem lớp sắp khai giảng, danh sách Potential |
| **Admin** | Giữ dữ liệu đúng, phân quyền, công bố tốt nghiệp | Nhập/đối soát, quản lý người dùng, công bố |
| **Khách** | Xem số liệu | Xem Dashboard, danh sách |

---

## 2. Đăng nhập, đổi mật khẩu

**Ai:** mọi người · **Mục tiêu:** vào hệ thống an toàn.

```mermaid
flowchart TD
  A([Mở web]) --> B{Đã có phiên?}
  B -- Có --> H[Trang chủ / lớp gần nhất]
  B -- Không --> L[Nhập email + mật khẩu]
  L --> C{Đúng?}
  C -- Đúng --> H
  C -- Sai --> D{Sai ≥ 8 lần / 15 phút?}
  D -- Chưa --> L
  D -- Rồi --> LK[Khóa tạm 15 phút] --> L
  H --> P[Bấm biểu tượng chìa khóa]
  P --> Q[Nhập mật khẩu hiện tại + mật khẩu mới ×2]
  Q --> R{≥ 10 ký tự, khác cũ,<br/>không chứa email?}
  R -- Không --> Q
  R -- Có --> S[Đã đổi · thiết bị khác bị đăng xuất]
```

**Ngoại lệ:** tài khoản bị khóa (admin) → không đăng nhập được; khách không có nút đổi mật khẩu.

---

## 3. Điểm danh một buổi

**Ai:** giảng viên của lớp, admin · **Mục tiêu:** ghi nhận chuyên cần nhanh, không ghi đè nhầm người khác.

```mermaid
flowchart TD
  A[Chọn lớp trên thanh] --> B[Tab Điểm danh]
  B --> C{Cách điểm danh}
  C -- Cả lớp có mặt --> D["Bấm 'Cả lớp ✓' ở đầu cột buổi<br/>(chỉ điền ô còn trống)"]
  C -- Từng người --> E[Bấm ô học viên → chọn trạng thái]
  D --> F
  E --> F{Có mặt · Đi trễ · Vắng · Có phép · Ghi chú}
  F --> G[Ô cập nhật ngay, tỉ lệ chuyên cần tự tính lại]
  G --> H{Người khác vừa đổi ô này?}
  H -- Không --> I[Lưu · các màn hình khác tự làm mới]
  H -- Có --> J[Báo xung đột · ô trở về giá trị mới nhất]
  J --> E
```

**Ghi chú:** `✓` có mặt · `T` đi trễ · `V` vắng · `P` có phép · `·` chưa điểm danh. Ô chưa điểm danh của buổi đã diễn ra tính là **vắng**; vắng có phép được **nửa buổi** (vẫn nằm trong mẫu số). Bấm "Bỏ tất cả" để xóa điểm danh của một buổi.

---

## 4. Theo dõi bài tập và điểm

**Ai:** giảng viên, admin · **Mục tiêu:** biết ai đã nộp, điểm bao nhiêu.

```mermaid
flowchart TD
  A[Tab Bài tập] --> F{Lớp có điểm?}
  F -- Có --> G["Ô HW hiện dấu trạng thái + điểm · thẻ Điểm TB cả lớp · cột Điểm TB"]
  F -- Chưa --> B[Bảng học viên × bài, chỉ trạng thái]
  G --> M["Chọn: Trạng thái + điểm / Chỉ điểm / Chỉ trạng thái"]
  G --> S["Bấm tiêu đề Điểm TB → sắp cao→thấp / thấp→cao / theo tên"]
  G --> C
  B --> C[Bấm ô → Đã nộp / Nộp lại / Thiếu / ★ Challenge / ghi chú]
  C --> D[Tiến độ HW % của học viên tự cập nhật]
```

Điểm đến từ **Google Sheet bảng điểm** (tự đồng bộ), giảng viên **không nhập tay** trên web. Điểm không làm đổi trạng thái nộp bài.

---

## 5. Nhắc bài học viên

**Ai:** admin + giảng viên có quyền Nhắc bài · **Mục tiêu:** gửi nhắc cá nhân hoặc báo cáo chung cho cả lớp.

```mermaid
flowchart TD
  A[Tab Nhắc bài] --> B{Chế độ}
  B -- Từng học viên --> C[Chọn học viên / phím ← →]
  C --> D[Kiểm tra Anh/Chị, tên gọi, ngày cập nhật]
  D --> E{Gửi gì?}
  E -- Ảnh thẻ --> F["Sao chép ảnh · hoặc Chế độ chụp"]
  E -- Tin nhắn --> G[Sao chép tin nhắn]
  B -- Tổng quan lớp --> H[Chọn ngưỡng ẩn danh]
  H --> I["Thẻ tổng quan (không tên) → Chế độ chụp / dán vào nhóm"]
  B -- Lớp chưa có bài trong hệ thống --> J[Dán bảng homework → Kiểm tra → Áp dụng]
```

**Người không có quyền** chỉ thấy thẻ tiến độ của từng học viên: không có tin nhắn, không có nút sao chép/chụp, không có tổng quan.

---

## 6. Danh sách tốt nghiệp

**Ai:** giảng viên của lớp đặt kết quả; admin công bố · **Mục tiêu:** chốt ai tốt nghiệp.

```mermaid
flowchart TD
  A[Tab Tốt nghiệp] --> B[Xem quy tắc áp dụng]
  B --> C{Quy tắc có sẵn?}
  C -- Chưa --> D[Không có gợi ý · đặt kết quả thủ công]
  C -- Có --> E[Hệ thống gợi ý Đạt / Chưa đạt / Chưa đủ dữ liệu]
  E --> F[Giảng viên xem lý do · 'Áp dụng gợi ý' cho người chưa xét]
  D --> G
  F --> G[Đặt Tốt nghiệp / Chưa đạt từng học viên · ghi chú · chứng chỉ]
  G --> H[Admin kiểm tra → Công bố]
  H --> I[Giảng viên bị khóa · chỉ admin sửa được]
```

**Quy tắc số buổi** theo Quy định 003/2026: đạt khi `có mặt + vắng có phép ≥ tối thiểu` của chương trình. Đang học mà còn đủ buổi để đạt thì chưa kết luận. Điều kiện **điểm** chưa áp dụng (chờ quy trình từ chủ dự án).

---

## 7. Học viên từ Google Sheet vào lớp (luồng hệ thống)

**Ai:** hệ thống tự chạy (mỗi phút) · **Mục tiêu:** danh sách lớp luôn khớp Google Sheet vận hành.

```mermaid
flowchart TD
  A[Dòng trong Sheet PERSONAL] --> B{Có mã học viên + mã lớp hợp lệ?}
  B -- Không --> X[Bỏ qua · được đếm ở trang Nhập Excel]
  B -- Có --> C{STATUS}
  C -- "Chưa thanh toán" --> P[Potential · không có tên trong lớp]
  C -- "Không tham gia" --> Q[Trong lớp, hiển thị như Bảo lưu]
  C -- "Đã thanh toán / Đã cọc / Scholarship / Bảo lưu khóa trước" --> R[Trong danh sách và điểm danh]
  P -- "Đổi sang trạng thái khác" --> R
  R -- "Biến mất khỏi PERSONAL" --> P2[Chuyển Potential · giữ snapshot điểm danh]
  P2 -- "Xuất hiện lại" --> R2[Về lớp · khôi phục điểm danh]
  R -- "Đổi nhãn (vd Đã cọc → Đã thanh toán)" --> L[Ghi lịch sử đổi trạng thái]
```

**Lưu ý**
- **COMPANY (B2B)** không áp dụng Potential: học bình thường dù "Chưa thanh toán"; biến mất chỉ cảnh báo.
- Một lượt Sheet có thay đổi bất thường (thêm/chuyển > 5% hoặc 100 người) bị **từ chối cả lượt**, dữ liệu giữ nguyên.
- Học viên admin đã "Gỡ khỏi lớp" không bị tự thêm lại.

---

## 8. Admin: xử lý cảnh báo và nhập dữ liệu

**Ai:** admin · **Mục tiêu:** dữ liệu đúng, biết khi đồng bộ có vấn đề.

```mermaid
flowchart TD
  A[Trang Nhập Excel] --> B{Việc cần làm}
  B -- Xem sức khỏe đồng bộ --> C["Trạng thái lần gần nhất · số dòng bị bỏ qua · cảnh báo 'đã lâu không có dữ liệu'"]
  B -- Nhập đăng ký / lớp --> D[Chọn file → Chạy thử]
  B -- Nhập điểm danh + bài tập --> D
  D --> E{Kết quả chạy thử đúng?}
  E -- Không --> F[Sửa file / xem cột bị bỏ qua] --> D
  E -- Có --> G[Nhập thật · màn hình đang mở tự cập nhật]
  C --> H{Có lỗi 409 'Đồng bộ bị chặn'?}
  H -- Có --> I[Kiểm tra Google Sheet có bị sửa dở · chờ vài phút lượt sau tự chạy]
```

---

## 9. Admin: quản lý người dùng và quyền

**Ai:** admin · **Mục tiêu:** cấp đúng quyền cho đúng người.

```mermaid
flowchart TD
  A[Trang Người dùng] --> B{Việc cần làm}
  B -- Thêm người --> C["+ Thêm người dùng<br/>(email, mật khẩu ≥ 10 ký tự, vai trò)"]
  B -- Phân lớp --> D[Phân lớp → chọn các lớp]
  B -- Bật quyền --> E["Nhắc bài · Xem lớp chưa diễn ra · Xem Potential<br/>(bấm công tắc từng người)"]
  B -- Ngừng dùng --> F[Khóa / Mở khóa]
  B -- Kiểm tra bảo mật --> G["Nhật ký đăng nhập (90 ngày): ai, giờ nào, sai mấy lần"]
```

Người mới nhận mật khẩu tạm qua kênh riêng và **tự đổi** bằng biểu tượng chìa khóa.

---

## 10. Khách: chỉ xem

**Ai:** tài khoản khách · **Mục tiêu:** xem số liệu mà không thể sửa.

```mermaid
flowchart LR
  A[Đăng nhập tài khoản khách] --> B[Trang chủ / Dashboard / Học viên / Điểm danh / Bài tập / Tốt nghiệp]
  B --> C[Chỉ xem: nút ghi bị ẩn · máy chủ từ chối mọi thao tác ghi]
  B -. không có .-> D["Nhắc bài · Potential · Điểm · Quản trị"]
```

---

## 11. Xem lịch khai giảng và giảng dạy

**Ai:** mọi tài khoản (mỗi người chỉ thấy lớp mình có quyền) · **Mục tiêu:** biết hôm nào lớp nào khai giảng, hôm nào lớp nào học.

```mermaid
flowchart TD
  A[Thanh trên → 🗓 Lịch] --> B[Lịch tháng hiện tại, hôm nay tô vàng]
  B --> C["‹ › chuyển tháng · Chọn tháng (kèm số lớp khai giảng) · lọc chương trình"]
  B --> D[Bấm một ngày]
  D --> E["Khung dưới: thẻ từng lớp (ca, chương trình, hình thức, B2C/B2B, thứ học)"]
  E --> F[Bấm thẻ → Dashboard lớp]
  B --> G{Lớp chưa có thứ học?}
  G -- Có --> H["Chỉ hiện ngày khai giảng; tên lớp liệt kê dưới lịch"]
```

Bế giảng và giảng viên từng buổi: chờ chủ dự án gửi dữ liệu.
