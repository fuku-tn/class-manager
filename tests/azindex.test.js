// Thanh chữ cái A–Z ở trang Điểm danh: chữ đầu của HỌ (từ đầu tiên của họ tên), bỏ dấu, Đ là chữ riêng.
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('chữ cái đầu của họ: bỏ dấu, Đ riêng, tên rỗng/ký tự lạ → #', async () => {
  const { surnameInitial } = await import('../public/js/class-filter.mjs');
  const f = surnameInitial;
  assert.deepEqual(['Bùi Minh Tiến', 'Châu Bích Hoa', 'Chu Thị Mỹ Linh', 'Đặng Lạc Diệp', 'đinh mai', 'Ân Hoàng', 'Ông Văn', 'Lê Trần Phương Trinh', '  Võ Thị Hạnh', 'Ơn Nghĩa'].map(f),
    ['B', 'C', 'C', 'Đ', 'Đ', 'A', 'O', 'L', 'V', 'O']);
  assert.deepEqual([f(''), f(null), f('123 abc'), f('(Ghi chú)')], ['#', '#', '#', '#']);
  // Đ phân biệt với D
  assert.notEqual(f('Đỗ Ngọc Lý'), f('Dương Văn A'));
});

test('azindex.js không dùng innerHTML (chống XSS) và chỉ nhận dữ liệu qua data-initial', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'js', 'azindex.js'), 'utf8');
  assert.ok(!/innerHTML|eval\(/.test(src));
  assert.match(src, /data-initial|dataset\.initial/);
});
