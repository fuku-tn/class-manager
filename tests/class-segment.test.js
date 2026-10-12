import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentFlags, countBySegment, filterClasses, pickerFilter } from '../public/js/class-filter.mjs';

const classes = [
  { id: 1, code: 'P2.BIE.P104.HY.AA.041026', short_code: 'BIE104', program: 'BIE', timing: 'running' },
  { id: 2, code: 'P1.EBA.B071.OF.MA.010126', short_code: 'EBA071', program: 'EBA', timing: 'finished' },
  { id: 3, code: 'P2.BIE.B088.HY.MA.080326', short_code: 'BIE088', program: 'BIE', timing: 'finished', is_b2b: true, is_b2c: true }, // lớp hỗn hợp
  { id: 4, code: 'TEST.01', short_code: null, program: null, timing: 'unknown' },
];

test('segmentFlags: theo cờ máy chủ, thiếu thì suy từ chữ thứ 3 của mã lớp', () => {
  assert.deepEqual(segmentFlags(classes[0]), { b2b: false, b2c: true });
  assert.deepEqual(segmentFlags(classes[1]), { b2b: true, b2c: false });
  assert.deepEqual(segmentFlags(classes[2]), { b2b: true, b2c: true });
  assert.deepEqual(segmentFlags(classes[3]), { b2b: false, b2c: true });
});

test('filterClasses/countBySegment: lớp hỗn hợp có ở cả hai bộ lọc', () => {
  assert.deepEqual(countBySegment(classes), { all: 4, b2c: 3, b2b: 2 });
  assert.deepEqual(filterClasses(classes, { segment: 'b2b' }).map((c) => c.id), [2, 3]);
  assert.deepEqual(filterClasses(classes, { segment: 'b2c' }).map((c) => c.id), [1, 3, 4]);
  assert.deepEqual(filterClasses(classes, { segment: 'b2b', program: 'BIE' }).map((c) => c.id), [3]);
  assert.equal(filterClasses(classes, {}).length, 4);
});

test('pickerFilter: đang gõ tìm thì bỏ qua chip B2B/B2C để vẫn thấy mọi lớp khớp', () => {
  assert.deepEqual(pickerFilter(classes, { q: '', segment: 'b2b' }).map((c) => c.id), [2, 3]);
  assert.deepEqual(pickerFilter(classes, { q: 'BIE104', segment: 'b2b' }).map((c) => c.id), [1]);
});
