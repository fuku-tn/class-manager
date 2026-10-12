// Theme của thẻ tiến độ homework theo lớp/chương trình (token màu như docs/05-theme của bộ kit nhắc bài).
// Mỗi chương trình có màu riêng (header + vạch nhấn); thân thẻ và chữ đổi theo chế độ sáng/tối của trang. 'class-manager' = đúng màu trang.
// 3 theme đầu lấy từ bộ kit; bie-ocean-blue và pbm-plum-gold là đề xuất mới (đổi được trên giao diện).
export const THEMES = {
  // Mặc định: cùng bảng màu với giao diện trang (nền xanh đêm, vàng đồng nhấn, xanh ngọc cho tiến độ).
  'class-manager': {
    label: 'Theo giao diện trang',
    surface: '#0d1730', onOk: '#0d1730', tagColor: '#e3c48e', subColor: '#9ba7c0', nameWeight: 600,
    headerFrom: '#111d3b', headerTo: '#1b2c58', accent: '#c9a46a', headerText: '#f1ede4', ok: '#62d6a5', donutFill: '#62d6a5',
    donutTrack: '#25314f', ink: '#f1ede4', mute: '#9ba7c0', line: 'rgba(255,255,255,.10)', dash: '#3d4c70', warn: '#f2c070', bg: '#070d1b', shadow: 'rgba(0,0,0,.55)',
  },
  'excel-green': {
    label: 'EBA — Xanh Excel',
    headerFrom: '#185c37', headerTo: '#107c41', accent: '#33c481', headerText: '#ffffff', ok: '#185c37', donutFill: '#21a366',
    donutTrack: '#e3f4ea', ink: '#17251d', mute: '#5d7066', line: '#d5e6dc', dash: '#c3d3c9', warn: '#b45309', bg: '#e9efeb', shadow: 'rgba(14,59,34,.16)',
    dark: { ok: '#5fd6a0', donutFill: '#33c481' },
  },
  'bih-forest-sand': {
    label: 'BIH — Rừng & cát',
    nameWeight: 700, tagWeight: 600, tagColor: 'rgba(255,255,255,.8)', subColor: 'rgba(255,255,255,.85)',
    headerFrom: '#1c4c39', headerTo: '#2c6650', accent: '#a79d79', headerText: '#ffffff', ok: '#1c4c39', donutFill: '#2f7a5a',
    donutTrack: '#dfece5', ink: '#17251d', mute: '#6a6853', line: '#e0dac6', dash: '#c3d3c9', warn: '#7a6f46', bg: '#f0ede3', shadow: 'rgba(28,76,57,.18)',
    dark: { ok: '#7fd1ae', donutFill: '#4fae8a' },
  },
  'sca-olive-lemon': {
    label: 'SCA — Olive & chanh',
    headerFrom: '#94ae4f', headerTo: '#a9c063', accent: '#e4d05d', headerText: '#ffffff', ok: '#4d6a14', donutFill: '#94ae4f',
    donutTrack: '#eef2dc', ink: '#232b14', mute: '#686c4f', line: '#e3e8cc', dash: '#cdd5ae', warn: '#8a7416', bg: '#f6f5e8', shadow: 'rgba(77,106,20,.18)',
    dark: { ok: '#c4d97a', donutFill: '#a9c063' },
  },
  'bie-ocean-blue': {
    label: 'BIE — Xanh biển (đề xuất)',
    headerFrom: '#1e3a8a', headerTo: '#2563eb', accent: '#93c5fd', headerText: '#ffffff', ok: '#166a43', donutFill: '#21a366',
    donutTrack: '#e3f4ea', ink: '#16213a', mute: '#5b6b86', line: '#d6e2f5', dash: '#bccbe3', warn: '#b45309', bg: '#eaf0fb', shadow: 'rgba(30,58,138,.18)',
    dark: { ok: '#62d6a5', donutFill: '#62d6a5' },
  },
  'pbm-plum-gold': {
    label: 'PBM — Tím & vàng (đề xuất)',
    headerFrom: '#4a2c6d', headerTo: '#6b3f94', accent: '#e6b84a', headerText: '#ffffff', ok: '#166a43', donutFill: '#21a366',
    donutTrack: '#e3f4ea', ink: '#231a2e', mute: '#6a5c78', line: '#e3d8ee', dash: '#cdbfdc', warn: '#9a6a0a', bg: '#f3eef8', shadow: 'rgba(74,44,109,.18)',
    dark: { ok: '#62d6a5', donutFill: '#62d6a5' },
  },
};
// Bản sáng của theme mặc định (khi trang đang ở chế độ sáng): nền kem, thẻ trắng, header xanh đêm, nhấn vàng đồng đậm.
const CM_LIGHT = {
  surface: '#ffffff', onOk: '#ffffff', tagColor: '#e3c48e', subColor: '#c5cde0', nameWeight: 600,
  headerFrom: '#15203a', headerTo: '#26385f', accent: '#a97d38', headerText: '#f6f2ea', ok: '#0f7a56', donutFill: '#1a9a6e',
  donutTrack: '#e4e8f1', ink: '#15203a', mute: '#5d6a85', line: 'rgba(21,32,58,.11)', dash: '#c7cfdf', warn: '#9a5a00', bg: '#f4f1ea', shadow: 'rgba(21,32,58,.18)',
};
const isLight = () => typeof document === 'undefined' || document.documentElement.dataset.theme === 'light';
// Chế độ tối: giữ header + vạch nhấn của chương trình, thân thẻ dùng nền tối của trang; vòng/dấu tick dùng bản xanh sáng.
const DARK_BODY = {
  surface: '#0d1730', onOk: '#0d1730', donutTrack: '#25314f', ink: '#f1ede4', mute: '#9ba7c0', line: 'rgba(255,255,255,.10)',
  dash: '#3d4c70', warn: '#f2c070', bg: '#070d1b', shadow: 'rgba(0,0,0,.55)',
};
export const themeOf = (key) => {
  const k = THEMES[key] ? key : 'class-manager';
  const t = THEMES[k];
  const light = isLight();
  if (k === 'class-manager') return light ? { ...t, ...CM_LIGHT } : t;
  return light ? t : { ...t, ...DARK_BODY, ...t.dark };
};
export const shortHw = (h) => (/CAPSTONE/i.test(h) ? 'Capstone' : h.replace(/HOMEWORK /i, 'HW'));
