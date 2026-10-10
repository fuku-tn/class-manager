// Bảng màu cảnh hồ theo giao diện. Thuần dữ liệu (không DOM) để test được.
// dark = hoàng hôn/đêm trăng, light = hồ ban ngày nắng nhẹ. Màu nước dạng [r,g,b] 0..1 cho shader.
export const LAKE_PALETTES = {
  dark: {
    sky: [[0, '#0a1023'], [0.38, '#18234a'], [0.68, '#465383'], [0.88, '#bf8f8a'], [1, '#efc49c']],
    stars: 1,
    orb: { core: '#fff7de', edge: '#e6c184', glow: 'rgba(255,224,168,0.5)', glow2: 'rgba(240,186,128,0.14)', x: 0.7, y: 0.42, size: 0.072, craters: true },
    ridges: [
      { top: '#46527f', bottom: '#2a3561', rim: 'rgba(240,206,156,0.30)', base: 0.93, amp: 0.30, seed: 11 },
      { top: '#222c55', bottom: '#121a37', rim: null, base: 0.985, amp: 0.17, seed: 23 },
    ],
    haze: 'rgba(240,198,168,0.26)',
    water: { deep: [0.015, 0.03, 0.08], shallow: [0.06, 0.09, 0.19], glint: [1.0, 0.86, 0.6], glintStrength: 0.95, fresnelNear: 0.32 },
    textTone: 'light',
  },
  light: {
    sky: [[0, '#5d93d6'], [0.42, '#9fc2ea'], [0.78, '#d8e7f5'], [0.94, '#f6e9d6'], [1, '#fbf1e2']],
    stars: 0,
    orb: { core: '#fffef8', edge: '#fff3d4', glow: 'rgba(255,250,232,0.85)', glow2: 'rgba(255,240,206,0.28)', x: 0.72, y: 0.34, size: 0.055, craters: false },
    ridges: [
      { top: '#a7bbd7', bottom: '#8ea4c6', rim: 'rgba(255,255,255,0.45)', base: 0.93, amp: 0.30, seed: 11 },
      { top: '#7389ad', bottom: '#5c7197', rim: null, base: 0.985, amp: 0.17, seed: 23 },
    ],
    haze: 'rgba(255,255,255,0.5)',
    water: { deep: [0.13, 0.24, 0.37], shallow: [0.30, 0.45, 0.60], glint: [1.0, 0.99, 0.94], glintStrength: 1.15, fresnelNear: 0.38 },
    textTone: 'dark',
  },
};

export function lakeTheme(doc = typeof document !== 'undefined' ? document : null) {
  return doc?.documentElement?.dataset?.theme === 'light' ? 'light' : 'dark';
}

export function lakePalette(theme) {
  return theme === 'light' ? LAKE_PALETTES.light : LAKE_PALETTES.dark;
}
