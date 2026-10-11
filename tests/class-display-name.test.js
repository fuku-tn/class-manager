import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classDisplayName } from '../public/js/class-filter.mjs';

test('classDisplayName: mã ngắn → "BIE 104"; giữ số 0 đầu; không phân biệt hoa thường', () => {
  assert.equal(classDisplayName({ code: 'P2.BIE.P104.HY.AA.041026', short_code: 'BIE104' }), 'BIE 104');
  assert.equal(classDisplayName({ code: 'x', short_code: 'BIE099' }), 'BIE 099');
  assert.equal(classDisplayName({ code: 'x', short_code: 'eba 112' }), 'EBA 112');
});

test('classDisplayName: thiếu mã ngắn thì suy ra từ mã đầy đủ; không suy ra được thì giữ mã gốc', () => {
  assert.equal(classDisplayName({ code: 'P2.BIE.P104.HY.AA.041026', short_code: null }), 'BIE 104');
  assert.equal(classDisplayName({ code: 'P2.SIA.B088.HY.MA.080326' }), 'SIA 088');
  assert.equal(classDisplayName({ code: 'TEST.01' }), 'TEST.01');
  assert.equal(classDisplayName({ code: 'ABC' }), 'ABC');
  assert.equal(classDisplayName(null), '');
});
