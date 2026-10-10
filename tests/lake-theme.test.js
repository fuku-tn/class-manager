import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAKE_PALETTES, lakePalette, lakeTheme } from '../public/js/lake-theme.mjs';

test('lake-theme: chọn bảng màu theo data-theme của trang', () => {
  assert.equal(lakeTheme({ documentElement: { dataset: { theme: 'light' } } }), 'light');
  assert.equal(lakeTheme({ documentElement: { dataset: { theme: 'dark' } } }), 'dark');
  assert.equal(lakeTheme({ documentElement: { dataset: {} } }), 'dark');
  assert.equal(lakeTheme(null), 'dark');
  assert.equal(lakePalette('light'), LAKE_PALETTES.light);
  assert.equal(lakePalette('bất kỳ'), LAKE_PALETTES.dark);
});

test('lake-theme: hai bảng màu đủ khóa, màu nước hợp lệ và khác nhau', () => {
  const keys = (o) => Object.keys(o).sort().join(',');
  assert.equal(keys(LAKE_PALETTES.dark), keys(LAKE_PALETTES.light));
  for (const pal of Object.values(LAKE_PALETTES)) {
    for (const k of ['deep', 'shallow', 'glint']) {
      assert.equal(pal.water[k].length, 3);
      for (const v of pal.water[k]) assert.ok(v >= 0 && v <= 1, `${k} ngoài khoảng 0..1`);
    }
    assert.ok(pal.sky.length >= 2 && pal.sky[0][0] === 0 && pal.sky.at(-1)[0] === 1);
    assert.equal(pal.ridges.length, 2);
  }
  const lum = (c) => c.reduce((a, b) => a + b, 0);
  assert.ok(lum(LAKE_PALETTES.light.water.deep) > lum(LAKE_PALETTES.dark.water.deep), 'nước ban ngày phải sáng hơn');
});
