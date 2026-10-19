// Lịch khai giảng: ca theo thứ học (S78 sáng, T78 tối, ngày thường tối, còn lại theo Sub 4 của mã lớp).
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('ca khai giảng: chữ S/T trước thứ học > lớp chỉ học ngày thường = tối > Sub 4 của mã lớp', async () => {
  const { openingShift, formatDays } = await import('../public/js/class-filter.mjs');
  const at = (days_of_week, shift) => openingShift({ days_of_week, shift });
  assert.deepEqual(at('S78', 'morning'), { shift: 'morning', source: 'days_letter' });
  assert.deepEqual(at('S78', 'afternoon'), { shift: 'morning', source: 'days_letter' });   // chữ S thắng Sub 4
  assert.deepEqual(at('T78', 'evening'), { shift: 'evening', source: 'days_letter' });
  for (const d of ['24', '35', '46', '246', 24, '2 4']) assert.equal(at(d, 'afternoon').shift, 'evening', String(d));   // ngày thường = tối, kể cả Sub 4 là AA
  assert.deepEqual(at('78', 'afternoon'), { shift: 'afternoon', source: 'sub4' });
  assert.deepEqual(at('78', 'morning'), { shift: 'morning', source: 'sub4' });
  assert.deepEqual(at('7', 'afternoon'), { shift: 'afternoon', source: 'sub4' });
  assert.deepEqual(at('8', 'full_day'), { shift: 'full_day', source: 'sub4' });
  assert.deepEqual(at(null, 'full_day'), { shift: 'full_day', source: 'sub4' });          // chưa có thứ học: theo Sub 4
  assert.deepEqual(at(null, null), { shift: null, source: null });
  assert.equal(formatDays('T78'), 'T7, CN (tối)');
});
