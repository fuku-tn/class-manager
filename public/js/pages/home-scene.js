// Cảnh "vũ trụ rộng lớn" cho hero trang chủ: bầu trời hoàng hôn, hành tinh, cổng đá khổng lồ,
// vòng quỹ đạo, mây trôi, mặt nước phản chiếu và một bóng người nhỏ. Vẽ bằng SVG (không dùng ảnh).
// Chuyển động chạy bằng CSS (xem .scene-* trong style.css) và tắt khi người dùng chọn giảm chuyển động.
import { svg } from '../ui.js';

const stop = (offset, color, opacity) => svg('stop', { offset, 'stop-color': color, ...(opacity != null ? { 'stop-opacity': opacity } : {}) });

// Một đám mây: vài hình elip chồng nhau, làm mờ nhẹ.
function cloud(x, y, scale, opacity, drift) {
  const blobs = [[0, 0, 70, 20], [-46, 8, 46, 15], [48, 9, 52, 16], [-8, -14, 40, 17], [26, -10, 34, 13]];
  return svg('g', { class: 'scene-cloud', style: `--drift:${drift}px;animation-duration:${26 + Math.abs(drift)}s`, opacity },
    svg('g', { transform: `translate(${x} ${y}) scale(${scale})`, filter: 'url(#cloudBlur)' },
      ...blobs.map(([dx, dy, rx, ry]) => svg('ellipse', { cx: dx, cy: dy, rx, ry, fill: 'url(#cloudFill)' }))));
}

export function scene() {
  // sao: sinh cố định (không ngẫu nhiên) để mỗi lần vẽ giống nhau
  const stars = Array.from({ length: 46 }, (_, i) => {
    const x = (i * 197 + 41) % 1200;
    const y = (i * 83 + 17) % 250;
    return svg('circle', { class: 'scene-star', cx: x, cy: y, r: i % 5 === 0 ? 1.7 : 1, fill: '#fff', style: `animation-delay:${(i % 9) * 0.5}s` });
  });
  const ringPath = 'M -430 0 a 430 124 0 1 0 860 0 a 430 124 0 1 0 -860 0';

  return svg('svg', {
    class: 'scene', viewBox: '0 0 1200 560', preserveAspectRatio: 'xMidYMid slice', role: 'img',
    'aria-label': 'Minh họa: cổng đá khổng lồ bên mặt nước, hành tinh và vòng quỹ đạo lúc hoàng hôn',
  },
  svg('defs', {},
    svg('linearGradient', { id: 'skyG', x1: 0, y1: 0, x2: 0, y2: 1 },
      stop(0, '#10172b'), stop(0.38, '#2c3752'), stop(0.62, '#6c7691'), stop(0.78, '#d9a98e'), stop(1, '#f1c9a1')),
    svg('linearGradient', { id: 'waterG', x1: 0, y1: 0, x2: 0, y2: 1 },
      stop(0, '#d9a98a', 0.65), stop(0.35, '#55587a', 0.9), stop(1, '#0a1022')),
    svg('radialGradient', { id: 'planetG', cx: '32%', cy: '30%', r: '78%' },
      stop(0, '#f1f3f8'), stop(0.45, '#b4bccf'), stop(0.8, '#566079'), stop(1, '#2a3350')),
    svg('radialGradient', { id: 'moonletG', cx: '35%', cy: '30%', r: '75%' }, stop(0, '#cfd5e3'), stop(1, '#4a5470')),
    svg('linearGradient', { id: 'faceG', x1: 0, y1: 0, x2: 1, y2: 0 }, stop(0, '#a5afc4'), stop(0.55, '#7f8aa4'), stop(1, '#5b6683')),
    svg('linearGradient', { id: 'sideG', x1: 0, y1: 0, x2: 1, y2: 0 }, stop(0, '#4d5875'), stop(1, '#2a3350')),
    svg('linearGradient', { id: 'cloudFill', x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#ffffff', 0.95), stop(1, '#f4d3b5', 0.85)),
    svg('linearGradient', { id: 'shaftG', x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#ffe3b8', 0.85), stop(1, '#ffcf99', 0)),
    svg('linearGradient', { id: 'reflFade', x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#8d97b2', 0.45), stop(1, '#0a1022', 0)),
    svg('filter', { id: 'cloudBlur', x: '-30%', y: '-60%', width: '160%', height: '220%' }, svg('feGaussianBlur', { stdDeviation: 4 })),
    svg('filter', { id: 'softBlur' }, svg('feGaussianBlur', { stdDeviation: 3 }))),

  svg('rect', { width: 1200, height: 560, fill: 'url(#skyG)' }),
  svg('g', { class: 'scene-layer l-far' }, ...stars),

  // hành tinh nhỏ trôi nổi
  svg('g', { class: 'scene-layer l-mid' },
    svg('g', { class: 'scene-float', style: 'animation-delay:-2s' }, svg('circle', { cx: 262, cy: 300, r: 15, fill: 'url(#moonletG)' })),
    svg('g', { class: 'scene-float', style: 'animation-delay:-5s' }, svg('circle', { cx: 1092, cy: 352, r: 7, fill: 'url(#moonletG)' })),
    // hành tinh lớn
    svg('g', { class: 'scene-float slow' },
      svg('circle', { cx: 700, cy: 236, r: 146, fill: '#ffd9ae', opacity: 0.16, filter: 'url(#softBlur)' }),
      svg('circle', { cx: 700, cy: 236, r: 136, fill: 'url(#planetG)' }),
      ...[[640, 190, 26], [742, 168, 17], [690, 290, 31], [770, 262, 13], [612, 262, 14]].map(([x, y, r]) =>
        svg('circle', { cx: x, cy: y, r, fill: '#3a4463', opacity: 0.22 })))),

  // cổng đá: thân + lỗ vòm (evenodd) + mặt hông
  svg('g', { class: 'scene-layer l-near' },
    svg('path', {
      d: 'M740 70 H940 V440 H740 Z M790 440 V238 a60 60 0 0 1 120 0 V440 Z',
      fill: 'url(#faceG)', 'fill-rule': 'evenodd',
    }),
    svg('path', { d: 'M940 70 L992 84 V430 L940 440 Z', fill: 'url(#sideG)' }),
    svg('path', { d: 'M910 238 a60 60 0 0 0 -120 0', fill: 'none', stroke: '#ffdcb0', 'stroke-opacity': 0.55, 'stroke-width': 2 })),

  // vòng quỹ đạo (đi trước cổng) và vệ tinh chạy trên vòng
  svg('g', { transform: 'translate(700 236) rotate(-17)' },
    svg('path', { d: ringPath, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 1.3 }),
    svg('circle', { r: 5.5, fill: '#fff3d6' }, svg('animateMotion', { dur: '30s', repeatCount: 'indefinite', path: ringPath }))),

  // mây
  svg('g', { class: 'scene-layer l-mid' },
    cloud(120, 470, 1.15, 0.92, 38), cloud(330, 436, 0.85, 0.78, -30),
    cloud(920, 322, 1.0, 0.95, 30), cloud(1090, 246, 0.9, 0.88, -26), cloud(660, 452, 0.7, 0.7, 24)),

  // núi đá nhỏ + bệ
  svg('path', { d: 'M1010 442 L1066 390 L1100 412 L1146 442 Z', fill: '#6b7592' }),
  svg('path', { d: 'M1066 390 L1082 404 L1070 400 L1058 410 Z', fill: '#e9cfae', opacity: 0.7 }),

  // mặt nước + phản chiếu
  svg('rect', { y: 440, width: 1200, height: 120, fill: 'url(#waterG)' }),
  svg('rect', { x: 740, y: 440, width: 252, height: 120, fill: 'url(#reflFade)' }),
  svg('polygon', { class: 'scene-shaft', points: '790,440 910,440 960,560 740,560', fill: 'url(#shaftG)' }),
  ...[462, 482, 504, 528].map((y, i) => svg('line', {
    class: 'scene-ripple', x1: 560 + i * 20, x2: 1040 - i * 40, y1: y, y2: y, stroke: '#ffe3b8', 'stroke-width': 1.2, style: `animation-delay:${i * 0.7}s`,
  })),
  svg('polygon', { points: '0,560 0,512 470,470 740,468 560,492 190,560', fill: '#090e1e', opacity: 0.86 }),

  // bóng người đứng nhìn ra xa
  svg('g', { class: 'scene-figure' },
    svg('circle', { cx: 508, cy: 418, r: 4.4, fill: '#080c19' }),
    svg('path', { d: 'M502 424 h12 l2 30 h-16 z', fill: '#080c19' }),
    svg('path', { d: 'M502 454 h12 l1 12 h-14 z', fill: '#080c19' })),
  svg('g', { opacity: 0.28, class: 'scene-shaft' },
    svg('path', { d: 'M502 470 h12 l2 30 h-16 z', fill: '#080c19' })));
}
