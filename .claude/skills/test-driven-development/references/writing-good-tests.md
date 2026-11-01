# Viết test tốt

Nguồn ý tưởng: obra/superpowers (MIT), rút gọn cho Class Manager.

## 1. Nêu được "thay đổi nào làm test đỏ"
Trước khi viết test, nói được: *thay đổi nào ở code sản phẩm sẽ làm test này đỏ?* (đổi hằng số, sai nhánh, thiếu cập nhật trạng thái, trả về rỗng, thiếu kiểm tra đầu vào 0/rỗng/sai quyền).
- **Tự tính kỳ vọng bằng tay** (số cụ thể: `3.29`, `[1, 2, 3]`), không tính lại bằng chính công thức đang test.
- **Không viết test "dò thay đổi"**: test chỉ đỏ khi ai đó cố ý sửa (kiểm nguyên văn một chuỗi cấu hình, so cả đoạn văn bản) thì không bảo vệ gì.
- **Kiểm hành vi, không kiểm chữ.** Với tệp cấu hình/Apps Script, kiểm điều mà chương trình dựa vào (danh sách cột khớp `ALLOWED_*`), không kiểm câu chữ.
- **Kiểm code của mình**, không kiểm thư viện (Express, pg…).

## 2. Chạy thứ thật
- Ưu tiên PGlite + `startTestApp()` thật hơn là giả lập (mock) phức tạp.
- Mock chỉ khi bất khả kháng (mạng ngoài như Google, Supabase Realtime) — và khi đó hiểu rõ hàm thật có tác dụng phụ gì rồi mới mock.
- **Mock không được "ăn" assertion**: không kiểm "hàm mock đã được gọi" thay cho kiểm kết quả.
- Dữ liệu mẫu phải **đủ cấu trúc như thật** (đủ cột/trường), kẻo test xanh còn chạy thật thì vỡ.
- Code chỉ dùng cho test thì để trong tệp test/helper, không đưa vào module sản phẩm.

## 3. Test đi cùng code
Tính năng không có test thì chưa xong. Test nằm trong cùng thay đổi (commit) với code.

## 4. Kiểm tra đột biến (mutation check)
Thử phá code có chủ ý (đổi `>=` thành `>`, bỏ một nhánh, trả về rỗng) → test phải đỏ. Không đỏ = test yếu.

## Dấu hiệu test kém
- Khởi tạo và kiểm chứng dùng cùng một đối tượng nên luôn bằng nhau.
- Test chỉ đỏ khi chương trình sập.
- Test đỏ mỗi lần ai đó cố ý đổi, nhưng không bao giờ đỏ khi hỏng thật.
- Kỳ vọng ẩn sau vòng lặp/hàm dựng khiến không đọc ra được giá trị.
- Mock chiếm hơn nửa nội dung test.
- Chỉ viết để "đủ độ phủ".
