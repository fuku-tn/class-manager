---
name: cham-diem-hw-tong-hop
description: Gom điểm bài tập (HW/Mini Project/Capstone) từ các sheet export thô của từng lớp (BIE, BIH, EBA) thành bảng "Tổng điểm" có StudentID và Module, bằng công thức Excel có thể kiểm tra.
---

## When to use
Dùng khi người dùng đưa file Excel chấm điểm gồm nhiều sheet lớp (ví dụ BIE99, BIE101, BIE102, BIH98, BIH100, BIH103, EBA117–EBA120). Mỗi sheet có export thô 2 cột `Name | Point`. Người dùng muốn làm sạch, gom điểm, gắn StudentID và Module, hoặc thêm một lớp/HW mới vào bảng tổng. Cũng dùng khi họ nói "cập nhật bảng Tổng điểm", "thêm lớp mới", "tìm không ra StudentID", "chuẩn hóa tên".

## Cấu trúc workbook chuẩn
| Sheet | Vai trò |
|---|---|
| `<MãLớp>` (vd BIH100) | Cột A:B = bảng thô `Name`, `Point` (tên bảng dạng `BIH_100`, `BIE101_HW`...). Cột E:I = bảng sạch `<MãLớp>_HW_Clean`. |
| `Module` | Bảng `Table_Module` (Course 3 ký tự BIE/BIH/EBA, HW, Module). Là bảng tra HW → Module. |
| `StudentProfile` | Bảng `StudentProfile` (STUDENT ID, COURSE ID, FULL NAME...). Là nguồn StudentID. |
| `Tổng điểm` | Bảng `Point_Transform` (StudentID, Họ và tên, Course, HW, Point, Module). Bảng `Course_Map` (Course → Course ID đầy đủ) ở I1:J11. Ô `M1` = điểm tối đa mỗi HW (10), nhãn ở L1. |
| `BIE_HW1` | Điểm HW1 gộp từ nguồn khác của BIE99/101/102. Tên có thêm cột "Họ và tên (chuẩn)". |

## Quy trình

### Bước 1 — Làm sạch từng sheet lớp (`<MãLớp>_HW_Clean`, cột E:H)
1. Mỗi dòng thô `Name` có dạng `HỌ TÊN - [Mã lớp -] HWx - Combine/Tên bài`. Tách ra: Họ và tên, Course (mã lớp), HW (HW1…HW5, Mini Project 1–3, Capstone Project).
2. Chuẩn hóa tên: viết hoa đầu từ, có dấu tiếng Việt đầy đủ, bỏ khoảng trắng thừa. Cùng một người phải ra cùng một chuỗi ở mọi dòng và mọi sheet, vì bước tra StudentID so khớp chính xác theo tên.
3. Cột `Point` của bảng sạch phải là công thức trỏ về bảng thô, không gõ tay:
   - Có cột `Dòng gốc` (I): `=INDEX(<BảngThô>[Point],[@[Dòng gốc]]-1)`.
   - Không có `Dòng gốc`: `=B<dòng>` trỏ trực tiếp.
   - `Dòng gốc` là số dòng trong sheet của bản ghi thô. Dùng nó khi các dòng thô bị bỏ qua (dòng trùng, dòng rác) để truy vết được.
4. Một người có thể nộp nhiều lần (Combine B-1, B-5, C-1...). Bảng sạch giữ từng lần nộp, và bước gom điểm bên dưới cộng chúng lại.
5. Done when: số dòng bảng sạch khớp với số dòng thô còn hợp lệ. Mọi dòng có Họ và tên, Course, HW. Không có `#REF!`.

### Bước 2 — Danh sách duy nhất cho mỗi lớp
Ở các sheet có lưới tổng hợp (vd BIH100 J:M): `J2 =SORT(UNIQUE(<MãLớp>_HW_Clean[[Họ và tên]:[HW]]),{1,3},1)`. Cột Point: `=SUMIFS(<MãLớp>_HW_Clean[Point],<MãLớp>_HW_Clean[Họ và tên],J2,<MãLớp>_HW_Clean[HW],L2)`.

### Bước 3 — Dựng bảng `Point_Transform` ở `Tổng điểm`
1. Mỗi dòng là một cặp (Họ và tên, Course, HW) duy nhất, lấy từ danh sách ở Bước 2. Dán giá trị cho 3 cột B:D.
2. Cột A `StudentID`:
   `=XLOOKUP(1,(StudentProfile[FULL NAME]=[@[Họ và tên]])*(StudentProfile[COURSE ID]=XLOOKUP([@Course],Course_Map[Course],Course_Map[Course ID])),StudentProfile[STUDENT ID],"Không tìm thấy")`
3. Cột E `Point` (tách riêng cho từng lớp, trỏ đúng bảng sạch của lớp đó, trần là `$M$1`):
   `=MIN($M$1,SUMIFS(<MãLớp>_HW_Clean[Point],<MãLớp>_HW_Clean[Họ và tên],[@[Họ và tên]],<MãLớp>_HW_Clean[HW],[@HW]))`
   Dùng `MIN` với `$M$1` để tổng nhiều lần nộp không vượt điểm tối đa. Không nhúng số 10 vào công thức.
4. Cột F `Module`:
   `=XLOOKUP(1,(Table_Module[Course]=LEFT([@Course],3))*(Table_Module[HW]=[@HW]),Table_Module[Module],"Không tìm thấy")`
5. Lớp mới: thêm dòng vào `Course_Map` (Course → Course ID, copy từ cột COURSE ID của `StudentProfile`). Thêm các HW của lớp vào `Table_Module` nếu chưa có.

### Bước 4 — Kiểm tra bắt buộc trước khi báo xong
- Đếm `"Không tìm thấy"` ở cột A và F của `Point_Transform`. Mục tiêu là 0.
- Nếu cột A còn lỗi, thủ phạm thường là:
  - Tên sai dấu hoặc sai thứ tự họ-tên so với `StudentProfile[FULL NAME]`.
  - Khoảng trắng thừa.
  - Course ID thiếu trong `Course_Map`.
  - Học viên không có trong `StudentProfile`.
  Liệt kê các tên lỗi cho người dùng. Không tự đoán hay gán StudentID.
- Nếu cột F còn lỗi, tên HW chưa có trong `Table_Module`. Sửa ở bảng đó, không sửa công thức.
- Đối chiếu số dòng theo Course, ví dụ BIE101=231, BIH100=195, BIH98=333, BIE99=199, BIE102=103, BIH103=24, EBA117=97, EBA118=67, EBA119=36, EBA120=18 (tổng 1303 dòng, lần chạy gần nhất).
- Không có điểm nào lớn hơn `$M$1`. Không có `#N/A`, `#REF!`, `#NAME?`.

## Quy ước
- Không hardcode điểm. `Point` luôn là công thức. Tham số (điểm tối đa) nằm ở `M1`.
- Ưu tiên tham chiếu bảng có cấu trúc (`Bảng[Cột]`, `[@Cột]`) để bảng tự mở rộng khi thêm dòng.
- Giữ nguyên format và tên bảng hiện có. Không đổi tên bảng đang được công thức khác dùng.
- Ghi cho người dùng danh sách các tên chưa khớp. Đừng sửa âm thầm.

## Ghi chú
Skill này được dựng lại từ cấu trúc và công thức hiện có trong file "Chấm điểm.xlsx". Các quy tắc chuẩn hóa tên cụ thể và quy ước xử lý các lần nộp trùng nên được người dùng xác nhận lại.