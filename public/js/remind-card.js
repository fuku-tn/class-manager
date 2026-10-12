// Vẽ thẻ tiến độ của 1 học viên lên <canvas> (ảnh PNG copy/dán thẳng vào chat). Chuyển từ bộ kit nhắc bài (src/card.js).
// Thẻ CHỈ chứa dữ liệu của đúng 1 học viên. Con số done/pct do MÁY CHỦ tính (stats.js) — ở đây chỉ vẽ.
const FONT = '"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';
const LABEL = (h) => h.replace(/^HOMEWORK (\d+)/, 'Homework $1').replace('CAPSTONE PROJECT', 'Capstone Project');

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// s: { name, d:[0|1], done, total, pct }; theme: token màu; snapDate: "dd/MM/yyyy"; hdr: nhãn các bài.
export function drawCard(s, { hdr, theme: t, snapDate, scale }) {
  const T = hdr.length;
  const { done, pct } = s;
  const W = 520; const PAD = 20; const HEAD = 128; const SUM = 132; const ROW = 54; const BOT = 14; const H = HEAD + SUM + ROW * T + BOT;
  const sc = scale || Math.max(2, Math.ceil((typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1));
  const cv = document.createElement('canvas');
  cv.width = (W + PAD * 2) * sc; cv.height = (H + PAD * 2) * sc;
  const c = cv.getContext('2d');
  c.scale(sc, sc);
  c.fillStyle = t.bg; c.fillRect(0, 0, W + PAD * 2, H + PAD * 2);
  c.translate(PAD, PAD);
  c.save(); c.shadowColor = t.shadow; c.shadowBlur = 24; c.shadowOffsetY = 8; c.fillStyle = '#fff'; rr(c, 0, 0, W, H, 18); c.fill(); c.restore();
  c.save(); rr(c, 0, 0, W, H, 18); c.clip();
  const g = c.createLinearGradient(0, 0, W, HEAD); g.addColorStop(0, t.headerFrom); g.addColorStop(1, t.headerTo);
  c.fillStyle = g; c.fillRect(0, 0, W, HEAD); c.fillStyle = t.accent; c.fillRect(0, HEAD - 5, W, 5);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillStyle = t.tagColor || t.headerText; c.font = `${t.tagWeight || 400} 12px ${FONT}`;
  if ('letterSpacing' in c) c.letterSpacing = '1.4px';
  c.fillText('TIẾN ĐỘ HOMEWORK', 24, 38);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  const nw = t.nameWeight || 400; c.fillStyle = t.headerText;
  let fs = 25; c.font = `${nw} ${fs}px ${FONT}`;
  while (c.measureText(s.name).width > W - 48 && fs > 16) { fs--; c.font = `${nw} ${fs}px ${FONT}`; }
  c.fillText(s.name, 24, 78); c.fillStyle = t.subColor || t.headerText;
  c.font = `400 12.5px ${FONT}`; c.fillText(`Cập nhật ngày ${snapDate}`, 24, 102);
  // vòng tròn %
  const cx = 76; const cy = HEAD + SUM / 2;
  c.lineWidth = 12; c.strokeStyle = t.donutTrack; c.beginPath(); c.arc(cx, cy, 46, 0, Math.PI * 2); c.stroke();
  if (pct > 0) { c.strokeStyle = t.donutFill; c.beginPath(); c.arc(cx, cy, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct / 100); c.stroke(); }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = t.ok; c.font = `700 ${pct === 100 ? 21 : 25}px ${FONT}`; c.fillText(`${pct}%`, cx, cy - 6);
  c.fillStyle = t.mute; c.font = `400 11px ${FONT}`; c.fillText('hoàn thành', cx, cy + 15);
  c.textAlign = 'left'; c.fillStyle = t.ok; c.font = `700 19px ${FONT}`; c.fillText(`${done}/${T} bài đã hoàn thành`, cx + 72, cy);
  // danh sách bài
  const y0 = HEAD + SUM;
  hdr.forEach((h, k) => {
    const top = y0 + k * ROW; const ok = s.d[k]; const iy = top + (ROW - 30) / 2;
    if (k < T - 1) { c.strokeStyle = t.line; c.lineWidth = 1; c.setLineDash([]); c.beginPath(); c.moveTo(24, top + ROW + 0.5); c.lineTo(W - 24, top + ROW + 0.5); c.stroke(); }
    if (ok) {
      c.fillStyle = t.ok; rr(c, 24, iy, 30, 30, 8); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([]);
      c.beginPath(); c.moveTo(32, iy + 15); c.lineTo(37, iy + 20); c.lineTo(46, iy + 10); c.stroke();
    } else { c.strokeStyle = t.dash; c.lineWidth = 2; c.setLineDash([4, 3]); rr(c, 25, iy + 1, 28, 28, 8); c.stroke(); c.setLineDash([]); }
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = t.ink; c.font = `600 15.5px ${FONT}`; c.fillText(LABEL(h), 68, top + ROW / 2);
    c.textAlign = 'right'; c.fillStyle = ok ? t.ok : t.warn; c.font = `700 13px ${FONT}`; c.fillText(ok ? 'Đã hoàn thành' : 'Đang thực hiện', W - 24, top + ROW / 2);
  });
  c.restore();
  return cv;
}

/** Copy ảnh vào clipboard (cần HTTPS/localhost + thao tác click). Trả về true/false; false thì hướng dẫn chuột phải → Copy image. */
export async function copyCanvasImage(cv) {
  try {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch { return false; }
}
