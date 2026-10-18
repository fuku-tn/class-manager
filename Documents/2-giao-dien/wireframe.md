# Wireframe — Class Manager

Bố cục từng màn hình (dạng khung chữ, không phải thiết kế đồ họa cuối). Giao diện thật có hai chế độ **tối/sáng**, bảng màu vàng đồng + xanh đêm.
Xem thêm: [sitemap.md](sitemap.md) · [user-flow.md](user-flow.md).

**Ký hiệu:** `[Nút]` · `(____)` ô nhập · `[v]` danh sách thả · `▮` thanh/biểu đồ · `★` nhấn mạnh · `░` vùng mờ/nền.

## Mục lục
0. Khung chung (thanh trên) · 1. Đăng nhập · 2. Trang chủ · 3. Dashboard · 4. Học viên · 5. Điểm danh · 6. Bài tập + Điểm · 7. Tốt nghiệp · 8. Nhắc bài · 9. Potential · 10. Lớp học · 11. Người dùng · 12. Nhập Excel · 13. Khảo sát · 14. Hộp thoại · 15. Điện thoại

---

## 0. Khung chung (mọi màn hình sau đăng nhập)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO] Starttrain     🏠 Trang chủ  ▦ Dashboard  👥 Học viên  📅 Điểm danh  📄 Bài tập        │
│        THE NEXT ANALYST  🎓 Tốt nghiệp  🔔 Nhắc bài  ➕ Potential     [BIE 101 ▾] 🛡 ⬇ 💬  ☀   (A) 🔑 ⎋ │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│                                   NỘI DUNG TRANG                                             │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
 Các tab hiện theo quyền (xem sitemap §3). 🛡 Lớp học · ⬇ Nhập Excel · 💬 Khảo sát (admin).
 Dưới 1300px: chỉ biểu tượng. Dưới 900px: thanh tab xuống hàng riêng, cuộn ngang.
```

---

## 1. Đăng nhập

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [LOGO lớn] Starttrain                                                      │
│            THE NEXT ANALYST                                                │
│                                                                            │
│  QUẢN LÝ LỚP HỌC                              ┌──────────────────────────┐ │
│  Lớp học gọn gàng,                            │ Đăng nhập                │ │
│  số liệu rõ ràng.                             │ Dùng tài khoản giảng     │ │
│                                               │ viên hoặc quản trị...    │ │
│  Theo dõi học viên, điểm danh và bài tập      │ Email                    │ │
│  từng lớp trên một Dashboard duy nhất.        │ (ban@starttrain.vn_____) │ │
│                                               │ Mật khẩu                 │ │
│  ✓ Điểm danh nhanh chỉ với một cú bấm         │ (____________________)   │ │
│  ✓ Tỉ lệ chuyên cần và hoàn thành tự tính     │ [      Đăng nhập      ]  │ │
│  ✓ Cảnh báo học viên cần chú ý                │ ⚠ lỗi (nếu có)           │ │
│                                               └──────────────────────────┘ │
│  Starttrain | The Next Analyst                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Trang chủ

```
┌ [Thanh trên] ───────────────────────────────────────────────────────────────┐
│ STARTTRAIN · THE NEXT ANALYST                                                │
│ Mọi lớp học.                                                                 │
│ Điểm danh. / Bài tập. / Chuyên cần. / Giáo trình.   (chữ xoay)               │
│ Một nơi theo dõi.                                                            │
│ Xin chào Phúc. Theo dõi chuyên cần, bài tập và tiến độ từng buổi…            │
│ (➜) Mở lớp đang học      ▦ Điểm danh nhanh                       ↓ Cuộn      │
│ ┌ Lớp đang học ───────────┬ Học viên đang học ─────┬ Chuyên cần trung bình ┐ │
│ │ 34  (7 sắp mở · 3 chấm  │ 2.970                  │ 76%                   │ │
│ │ bài/công bố)            │                        │                       │ │
│ └─────────────────────────┴────────────────────────┴───────────────────────┘ │
│ ĐANG HOẠT ĐỘNG   Lớp đang học và đang chấm bài              Tất cả lớp ➜ (admin)│
│ ‹ ┌────────────┐ ┌────────────┐ ┌────────────┐ ›   băng chuyền 1–3 thẻ, tự chạy │
│   │ BIE ·ĐANG HỌC│ │ EBA ·CHẤM  │ │ BIH ·CÔNG BỐ│     mỗi 5 giây                │
│   │ BIE 101     │ │ EBA 120     │ │ BIH 098     │                              │
│   │ Hybrid·Tối  │ │ Online      │ │ Hybrid      │                              │
│   │ 04/10→22/11 │ │ Nộp & chấm  │ │ Công bố     │                              │
│   │ ▮▮▮▮▯ 5/8   │ │ bài đến …   │ │ tốt nghiệp… │                              │
│   │ 48 HV · 76% │ │ 34 HV · 71% │ │ 78 HV · 80% │                              │
│   └────────────┘ └────────────┘ └────────────┘                                 │
│ ● ○ ○                                                                          │
│ SẮP TỚI   Lớp sắp khai giảng  (chỉ hiện nếu có)                                │
│ ┌───────────────────────┐ ┌───────────────────────┐                            │
│ │ BIE 105               │ │ PBM 022               │  → bấm mở danh sách học viên│
│ │ 02/11 · 12 học viên   │ │ 24/10 · 30 học viên   │                            │
│ └───────────────────────┘ └───────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────────┘
 Bấm thẻ lớp → Dashboard của lớp đó.
```

---

## 3. Dashboard lớp

```
┌ [Thanh trên] ──────────────────────────────────────────────────────────────────┐
│ ĐANG HỌC · TỔNG QUAN LỚP HỌC                        ┌─ CHUYÊN CẦN TRUNG BÌNH ─┐│
│ Theo dõi lớp  BIE 101                               │  76%                     ││
│ 24 học viên đang học · 6/8 buổi đã diễn ra.         │ 24/24      7.5      24   ││
│ Buổi cuối 01/12 · Nộp & chấm bài đến 15/12 ·        │ Đang học  Điểm TB  Cần   ││
│ Công bố tốt nghiệp 29/12                            │                  chú ý   ││
│                                                     │ [Xem học viên cần chú ý] ││
│                                                     └──────────────────────────┘│
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐            │
│ │Đang học  │Bảo lưu/  │Buổi đã   │Điểm danh │ ★Điểm TB │Cần chú ý │            │
│ │ 24/24    │nghỉ 0 / 0│diễn ra   │TB  76%   │   7.5    │   24     │            │
│ │          │          │ 6/8      │          │          │ (đỏ)     │            │
│ └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘            │
│ ┌ Điểm danh theo buổi ┐ ┌ Nộp bài tập ───────┐ ┌ Hình thức học ──┐              │
│ │ ▮ ▮ ▮ ▮ ▮ ▮         │ │ ▮ ▮ ▮ ▮ ▮          │ │   ◔ 16 Hybrid    │              │
│ │ số ghi trên từng đoạn│ │ số ghi trên cột     │ │   ● 8 Offline    │              │
│ │ B1 B2 B3 B4 B5 B6   │ │ HW1 HW2 HW3 HW4 HW5 │ │                  │              │
│ │ ● Có mặt ● Trễ …     │ │ ● Đã nộp ● Nộp lại │ │                  │              │
│ └─────────────────────┘ └─────────────────────┘ └──────────────────┘              │
│ (admin) ┌ Hồ sơ lớp từ phiếu đăng ký ┐ ┌ Khảo sát sau khóa của lớp ┐             │
│ CẦN CHÚ Ý — Học viên cần chú ý (24)                                              │
│ Điểm danh dưới 80% hoặc thiếu từ 2 bài HW trở lên.                               │
│ │ Mã     │ Họ tên        │ Hình thức │ Điểm danh │ HW thiếu │                     │
│ │ P.1300 │ Nguyễn An     │ Hybrid    │ [ 0% ]    │ [ 3 ]    │                     │
│ ┌ Điểm danh ┐ ┌ Học viên ┐ ┌ Bài tập ┐   ← lối tắt                                │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Học viên

```
┌ [Thanh trên] ─────────────────────────────────────────────────────────────────┐
│ Học viên  [BIE 101]                                  [Xuất CSV] [+ Thêm học viên]│
│ (🔍 Tìm theo tên, mã, email…)  [Mọi trạng thái v]  [Mọi hình thức v]   48/48 HV │
│ ┌──────┬──────────────┬────────────┬─────────┬────────┬─────────────┬───────┬──┬────────┐
│ │ Mã   │ Họ tên       │ Email      │ SĐT     │ Hình   │ Trạng thái  │Điểm   │HW│Điểm TB │
│ │      │ (B2B · công ty)│          │         │ thức   │ + nhãn Sheet│danh   │  │        │
│ ├──────┼──────────────┼────────────┼─────────┼────────┼─────────────┼───────┼──┼────────┤
│ │P.1300│ Nguyễn An    │ an@…       │ 0901…   │ Hybrid │[Đang học]   │ 83%   │100%│ 8.2  │
│ │      │              │            │         │        │ Đã thanh toán│      │  │        │
│ │P.1301│ Trần Bình    │ …          │ …       │ Online │[Bảo lưu]    │ —     │ —│  —     │
│ └──────┴──────────────┴────────────┴─────────┴────────┴─────────────┴───────┴──┴────────┘
│  Hàng bấm được → hộp thoại sửa (không có với khách)                              │
│ ▸ Lịch sử thay đổi của lớp                                                       │
│   Thời điểm │ Học viên │ Sự kiện │ Từ → Sang │ Nguồn │ Người │ Ghi chú            │
└─────────────────────────────────────────────────────────────────────────────────┘
 Lớp chưa khai giảng: nhãn trạng thái là "Lớp chưa diễn ra".
```

---

## 5. Điểm danh

```
┌ [Thanh trên] ─────────────────────────────────────────────────────────────────────┐
│ Điểm danh [BIE 101]  ● Tự làm mới                                                 │
│ Chọn trong ô để đổi:  [✓ Có mặt] [T Đi trễ] [V Vắng] [P Có phép]  · số dưới tên    │
│ buổi = hiện diện/sĩ số                                                             │
│ (🔍 Tìm học viên…)                                      Sắp xếp [Mặc định v]       │
│ ┌────────────────┬────────┬────────┬────────┬────────┬── … ──┬────────┐           │
│ │ Học viên       │ B1     │ B2     │ B3     │ B4     │       │ Tỉ lệ  │           │
│ │                │ 22/24  │ 20/24  │ —      │ —      │       │        │           │
│ │                │[Cả lớp ✓][Bỏ tất cả]  (mỗi buổi)         │        │           │
│ ├────────────────┼────────┼────────┼────────┼────────┼───────┼────────┤           │
│ │ Nguyễn An      │ [ ✓ ]  │ [ T ]  │ [ · ]  │ [ · ]  │       │  83%   │           │
│ │ P.13000        │        │        │        │        │       │        │           │
│ │ Trần Bình      │ [ V ]  │ [ P ]  │ [ · ]  │ [ · ]  │       │  50%   │           │
│ └────────────────┴────────┴────────┴────────┴────────┴───────┴────────┘           │
│  Bấm ô → danh sách: · Chưa điểm danh / ✓ / T / V / P / ✎ Ghi chú…                  │
│  Cột tên cố định khi cuộn ngang. Khách: ô chỉ xem.                                 │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Bài tập + Điểm

```
┌ [Thanh trên] ───────────────────────────────────────────────────────────────────┐
│ Bài tập [BIE 101]  ● Tự làm mới                                                 │
│ Bấm ô để cập nhật: [✓ Đã nộp] [↻ Nộp lại] [✗ Thiếu]  ★ = có làm Challenge        │
│ (Điểm TB cả lớp 7.88 /10)  22/24 học viên có điểm · 4 bài đã có điểm  (ẩn với khách)│
│ (🔍 Tìm học viên…)  [Trạng thái + điểm] [Chỉ điểm] [Chỉ trạng thái]              │
│ ┌────────────────┬───────┬───────┬───────┬───────┬──────┬─────────────┬─────────┐ │
│ │ Học viên       │ HW1   │ HW2   │ HW3   │ HW4   │ HW5  │ Hoàn thành  │Điểm TB ↓│ │
│ │ Nguyễn An      │[✓ 8]  │[✓ 8.8]│[↻ 10] │[✗]    │[·]   │    60%      │  8.93   │ │
│ │ Trần Bình      │[✓ 4.5]│[✓ 10] │[✓]    │[✗]    │[·]   │    60%      │  7.25   │ │
│ └────────────────┴───────┴───────┴───────┴───────┴──────┴─────────────┴─────────┘ │
│  Màu ô = trạng thái nộp, số = điểm (thang 10). Bấm "Điểm TB" để sắp xếp.          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Tốt nghiệp

```
┌ [Thanh trên] ───────────────────────────────────────────────────────────────────┐
│ Tốt nghiệp [BIE 101]                         (admin) [Sửa quy tắc] [Công bố]    │
│ ⓘ Danh sách đã công bố lúc 29/12 14:00 bởi Admin   (nếu đã công bố)             │
│ Điều kiện gợi ý: Có mặt ≥ 6 buổi (vắng có phép không bị trừ) · HW 2/2 · Capstone │
│  — số buổi theo Quy định 003/2026/QĐ-STARTTRAIN; phần bài tập tạm theo Excel cũ  │
│ [Tốt nghiệp 12] [Chưa đạt 3] [Chưa xét 9]   Gợi ý: 14 đạt · 6 chưa đạt           │
│ [Áp dụng gợi ý] [Xuất CSV]                                                       │
│ ┌──────┬────────────┬────────┬──────┬─────────┬────────────┬─────────────────┐ │
│ │ Mã   │ Họ tên     │Điểm danh│ HW  │Capstone │ Gợi ý      │ Kết quả [v]     │ │
│ │P.1300│ Nguyễn An  │ 83%     │ 2/2 │ Đã nộp  │ ✓ Đạt      │ [Tốt nghiệp v]  │ │
│ │P.1301│ Trần Bình  │ 50%     │ 1/2 │ Chưa    │ ✗ Chưa đạt:│ [Chưa xét v]    │ │
│ │      │            │         │     │         │  Có mặt 4/6│  Ghi chú · CC   │ │
│ └──────┴────────────┴────────┴──────┴─────────┴────────────┴─────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Nhắc bài

### 8a. Từng học viên (người có quyền)
```
┌ [Thanh trên] ───────────────────────────────────────────────────────────────────┐
│ Nhắc bài [EBA 120]                                                               │
│ [Từng học viên] [Tổng quan lớp]                                                  │
│ [Dương Thị Ngọc Duyên v] [←] [→] [Sao chép ảnh] [Sao chép tin nhắn]             │
│ [Đang xưng: Chị — đổi] [Chế độ chụp]                                             │
│ Lớp (EBA) · Phạm vi (các tuần đã học) · Ngày cập nhật · Tên gọi · Màu [EBA v]     │
│ ┌────── thẻ ảnh ────────────┐  ┌ TIN NHẮN GỬI RIÊNG (không nằm trong ảnh) ──────┐│
│ │ TIẾN ĐỘ HOMEWORK           │  │ Chị Ngọc Duyên ơi, em check HW lớp EBA thấy    ││
│ │ Dương Thị Ngọc Duyên       │  │ mình chỉ còn HW3 nữa là hoàn thành đầy đủ…     ││
│ │ Cập nhật ngày 12/10/2026   │  │ Kiểm tra: đúng tên, Anh/Chị, ngày cập nhật.    ││
│ │ ◔ 75%   3/4 bài đã hoàn thành│ └─────────────────────────────────────────────┘│
│ │ ✓ Homework 1  Đã hoàn thành │                                                  │
│ │ ✓ Homework 2  Đã hoàn thành │                                                  │
│ │ ▢ Homework 3  Đang thực hiện│                                                  │
│ └────────────────────────────┘                                                  │
│ ▸ Nạp bảng homework từ Excel (dán)                                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 8b. Người không có quyền
```
│ Nhắc bài [EBA 120]                                                               │
│ [Dương Thị Ngọc Duyên v] [←] [→]                                                 │
│ ┌────── thẻ tiến độ (chỉ xem; không tin nhắn, không nút sao chép/chụp) ─────┐    │
```

### 8c. Tổng quan lớp (không có tên học viên)
```
│ Tiêu đề (Tiến độ homework lớp EBA120___)  Ngưỡng ẩn danh (1)  [Chế độ chụp]     │
│ ┌───────────── thẻ tổng quan ─────────────────────────────┐                    │
│ │ Tiến độ homework lớp EBA120                              │                    │
│ │ [ 6 Học viên ] [ 1/6 Hoàn thành đủ 4/4 ] [ 75% TB ]      │                    │
│ │ SỐ HỌC VIÊN ĐÃ HOÀN THÀNH THEO TỪNG BÀI                  │                    │
│ │ HW1 ▮▮▮▮▮▮▮▯ 5/6 83%     HW2 ▮▮▮▮▯ 4/6 67%  …           │                    │
│ └──────────────────────────────────────────────────────────┘                    │
```

---

## 9. Potential

```
┌ [Thanh trên] ───────────────────────────────────────────────────────────────────┐
│ Potential [EBA 120]                                                  12 người   │
│ Những người có trong sheet PERSONAL nhưng chưa có tên trong danh sách học viên  │
│ và điểm danh… Khi đủ điều kiện hoặc xuất hiện lại thì tự quay về danh sách lớp. │
│ ┌──────┬────────────┬────────┬────────┬─────────────────┬────────────────┬──────┐
│ │ Mã   │ Họ tên     │ Email  │ SĐT    │ Trạng thái Sheet│ Lý do          │ Từ   │
│ │P.1310│ Lê Văn C   │ …      │ …      │ Chưa thanh toán │ Chưa thanh toán│ 14/10│
│ │P.1288│ Phạm D     │ …      │ …      │ Đã thanh toán   │ Đã bị xóa khỏi │ 13/10│
│ │      │            │        │        │                 │ sheet PERSONAL │      │
│ └──────┴────────────┴────────┴────────┴─────────────────┴────────────────┴──────┘
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Lớp học (admin)

```
│ Lớp học   124/124 lớp                                       [+ Tạo lớp mới]     │
│ (🔍 Tìm lớp…)                                                                    │
│ Giai đoạn:   (Tất cả 124) (Đang hoạt động 37) (Đang học 28) (Sắp mở 7) (Đã kết thúc 80)│
│ Loại:        (B2C + B2B) (B2C 112) (B2B 27)                                      │
│ Chương trình:(Mọi chương trình) (EBA 64) (BIE 28) (BIH 10) (PBM 7) …              │
│ ┌──────────┬──────────────┬─────────────┬──────────────┬────────┬────────────┐ │
│ │ Lớp      │ Chương trình │ Hình thức·ca│ Thời gian    │ Học viên│ Trạng thái │ │
│ │ BIE 101 B2C│ BIE        │ Hybrid·Tối  │ 04/10→22/11  │ 48     │ [Đang học] │ │
│ │ P2.BIE.P101…│            │             │              │        │            │ │
│ └──────────┴──────────────┴─────────────┴──────────────┴────────┴────────────┘ │
│  Hàng bấm được → Dashboard của lớp                                              │
```

## 11. Người dùng (admin)

```
│ Người dùng                                                  [+ Thêm người dùng] │
│ ┌────────┬───────┬──────────┬──────────────┬──────────────┬────────┬─────────┬────────┐
│ │ Họ tên │ Email │ Vai trò  │ Nhắc bài     │ Xem lớp chưa │ Xem    │ Lớp được│ Trạng  │
│ │        │       │          │ (tin nhắn+ảnh)│ diễn ra      │Potential│ phân    │ thái   │
│ │ Đoàn Ly│ ly@…  │ Giảng viên│[Được dùng—tắt]│[Được xem—tắt]│[Được xem]│ 124 lớp │[Phân lớp][Khóa]│
│ └────────┴───────┴──────────┴──────────────┴──────────────┴────────┴─────────┴────────┘
│ ▸ Nhật ký đăng nhập (200 sự kiện gần nhất)                                      │
│   Thời gian │ Sự kiện (Đăng nhập / sai / khóa tạm / đổi mật khẩu) │ Email │ IP │ Thiết bị │
```

## 12. Nhập Excel (admin)

```
│ Nhập dữ liệu từ Excel                                                           │
│ ┌ Đồng bộ tự động từ Google Sheet ─────────────────────────────────────────┐   │
│ │ ● Lần gần nhất: 09:25 · OK   ⚠ 3 dòng bỏ qua (thiếu mã) · …              │   │
│ └──────────────────────────────────────────────────────────────────────────┘   │
│ ┌ Nhập đăng ký / lớp ──────────────┐ ┌ Nhập điểm danh + bài tập ───────────┐   │
│ │ [Chọn file .xlsx]                │ │ [Chọn file .xlsx]                    │   │
│ │ [Chạy thử]  [Nhập thật]          │ │ [Chạy thử]  [Nhập thật]              │   │
│ │ Kết quả: lớp/học viên/ghi danh   │ │ Kết quả: dòng bỏ qua, cảnh báo       │   │
│ └──────────────────────────────────┘ └──────────────────────────────────────┘   │
```

## 13. Khảo sát (admin)

```
│ Khảo sát sau khóa                                                  Chỉ admin    │
│ ┌ Toàn trung tâm ──────────────────────────────────────────────────────────┐   │
│ │ NPS · điểm TB theo nhóm câu hỏi · số phiếu                                │   │
│ └──────────────────────────────────────────────────────────────────────────┘   │
│ ┌ Theo lớp ────────────────────────────────────────────────────────────────┐   │
│ │ Lớp │ Số phiếu │ NPS │ TB các nhóm …  (lớp < 5 phiếu: chỉ tham khảo)       │   │
```

---

## 14. Hộp thoại

```
 Đổi mật khẩu                        Thêm học viên                    Phân lớp cho …
┌─────────────────────────┐   ┌─────────────────────────────┐   ┌──────────────────────┐
│ Mật khẩu hiện tại       │   │ Mã học viên (vd P.13027)    │   │ ☑ BIE 101            │
│ (________________)      │   │ Họ tên · Email · SĐT        │   │ ☐ BIE 102            │
│ Mật khẩu mới (≥ 10 ký tự)│  │ Hình thức [v]               │   │ ☑ EBA 120            │
│ (________________)      │   │       [Hủy]  [Lưu]          │   │     [Hủy]  [Lưu]     │
│ Nhập lại mật khẩu mới   │   └─────────────────────────────┘   └──────────────────────┘
│ [Hủy] [Đổi mật khẩu]    │   Gỡ khỏi lớp (admin): bắt buộc nhập lý do → ghi nhật ký
└─────────────────────────┘
```

---

## 15. Điện thoại (≤ 640px)

```
┌─────────────────────┐        ┌─────────────────────┐
│ [LOGO]  Starttrain  │        │ Điểm danh  [BIE 101] │
│ [BIE 101 ▾]  ☀ (A) ⎋│        │ (🔍 Tìm học viên…)   │
│ ▦ 👥 📅 📄 🎓 🔔  →  │ ← tab  │ ┌───────────────────┐│
├─────────────────────┤  cuộn  │ │ Học viên │ B1 │ B2 ││ ← bảng cuộn ngang,
│ Nội dung xếp 1 cột  │  ngang │ │ Nguyễn An│ ✓  │ T  ││   cột tên cố định
│ (thẻ, bảng cuộn)    │        │ └───────────────────┘│
└─────────────────────┘        └─────────────────────┘
 Hero/Dashboard xếp 1 cột; băng chuyền trang chủ hiện 1 thẻ; chỉ biểu tượng ở thanh tab.
```
