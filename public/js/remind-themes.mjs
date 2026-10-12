// Theme của thẻ tiến độ homework theo lớp/chương trình (token màu như docs/05-theme của bộ kit nhắc bài).
// Theme mặc định 'class-manager' lấy từ bảng màu của trang; các theme theo chương trình vẫn chọn được (vòng tiến độ giữ xanh lá).
// 3 theme đầu lấy từ bộ kit; bie-ocean-blue và pbm-plum-gold là đề xuất mới (đổi được trên giao diện).
export const THEMES = {
  // Mặc định: cùng bảng màu với giao diện trang (nền xanh đêm, vàng đồng nhấn, xanh ngọc cho tiến độ).
  'class-manager': {
    label: 'Theo giao diện trang (mặc định)',
    surface: '#0d1730', onOk: '#0d1730', tagColor: '#e3c48e', subColor: '#9ba7c0', nameWeight: 600,
    headerFrom: '#111d3b', headerTo: '#1b2c58', accent: '#c9a46a', headerText: '#f1ede4', ok: '#62d6a5', donutFill: '#62d6a5',
    donutTrack: '#25314f', ink: '#f1ede4', mute: '#9ba7c0', line: 'rgba(255,255,255,.10)', dash: '#3d4c70', warn: '#f2c070', bg: '#070d1b', shadow: 'rgba(0,0,0,.55)',
  },
  'excel-green': {
    label: 'EBA — Xanh Excel',
    headerFrom: '#185c37', headerTo: '#107c41', accent: '#33c481', headerText: '#ffffff', ok: '#185c37', donutFill: '#21a366',
    donutTrack: '#e3f4ea', ink: '#17251d', mute: '#5d7066', line: '#d5e6dc', dash: '#c3d3c9', warn: '#b45309', bg: '#e9efeb', shadow: 'rgba(14,59,34,.16)',
  },
  'bih-forest-sand': {
    label: 'BIH — Rừng & cát',
    nameWeight: 700, tagWeight: 600, tagColor: 'rgba(255,255,255,.8)', subColor: 'rgba(255,255,255,.85)',
    headerFrom: '#1c4c39', headerTo: '#2c6650', accent: '#a79d79', headerText: '#ffffff', ok: '#1c4c39', donutFill: '#2f7a5a',
    donutTrack: '#dfece5', ink: '#17251d', mute: '#6a6853', line: '#e0dac6', dash: '#c3d3c9', warn: '#7a6f46', bg: '#f0ede3', shadow: 'rgba(28,76,57,.18)',
  },
  'sca-olive-lemon': {
    label: 'SCA — Olive & chanh',
    headerFrom: '#94ae4f', headerTo: '#a9c063', accent: '#e4d05d', headerText: '#ffffff', ok: '#4d6a14', donutFill: '#94ae4f',
    donutTrack: '#eef2dc', ink: '#232b14', mute: '#686c4f', line: '#e3e8cc', dash: '#cdd5ae', warn: '#8a7416', bg: '#f6f5e8', shadow: 'rgba(77,106,20,.18)',
  },
  'bie-ocean-blue': {
    label: 'BIE — Xanh biển (đề xuất)',
    headerFrom: '#1e3a8a', headerTo: '#2563eb', accent: '#93c5fd', headerText: '#ffffff', ok: '#166a43', donutFill: '#21a366',
    donutTrack: '#e3f4ea', ink: '#16213a', mute: '#5b6b86', line: '#d6e2f5', dash: '#bccbe3', warn: '#b45309', bg: '#eaf0fb', shadow: 'rgba(30,58,138,.18)',
  },
  'pbm-plum-gold': {
    label: 'PBM — Tím & vàng (đề xuất)',
    headerFrom: '#4a2c6d', headerTo: '#6b3f94', accent: '#e6b84a', headerText: '#ffffff', ok: '#166a43', donutFill: '#21a366',
    donutTrack: '#e3f4ea', ink: '#231a2e', mute: '#6a5c78', line: '#e3d8ee', dash: '#cdbfdc', warn: '#9a6a0a', bg: '#f3eef8', shadow: 'rgba(74,44,109,.18)',
  },
};
export const themeOf = (key) => THEMES[key] ?? THEMES['class-manager'];
export const shortHw = (h) => (/CAPSTONE/i.test(h) ? 'Capstone' : h.replace(/HOMEWORK /i, 'HW'));
