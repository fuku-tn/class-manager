// Đặt giao diện sáng/tối trước khi CSS vẽ để không bị chớp. Nằm trong file riêng (không inline) để CSP chặn được script inline.
try { document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark'; } catch (e) { document.documentElement.dataset.theme = 'dark'; }
