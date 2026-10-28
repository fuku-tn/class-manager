// Bảng Module của từng bài (tương đương sheet "Module" / Table_Module trong file "Chấm điểm.xlsx": Course 3 chữ · HW · Module).
// Khóa theo tên bài NHƯ TRONG EXCEL (trước bí danh): BIH "Mini Project 3" được lưu ở bài HW5 nhưng Module tra theo mini:3.
// Nguồn điểm không mang theo Module (danh sách file SharePoint) dùng bảng này để điền Module như XLOOKUP của quy trình Excel thủ công.
// Chương trình chưa có trong bảng (PBM, SCA…) thì Module để trống — chủ dự án cung cấp bảng thì thêm vào đây (và vào test).
const MODULES = {
  // BIE trước BIE104: giữ nguyên Module như cũ (chủ dự án chốt 28/10/2026)
  BIE: { 'hw:1': 'Business Intelligence Literacy', 'hw:2': 'Data Transformation', 'hw:3': 'Data Transformation', 'hw:4': 'Data Modeling', 'hw:5': 'Data Visualization', 'capstone:1': 'Project' },
  // BIE104 (chủ dự án chốt 28/10/2026): 6 HW — tách HW5/HW6
  BIE104: { 'hw:1': 'Business Intelligence Literacy', 'hw:2': 'Data Transformation', 'hw:3': 'Data Transformation', 'hw:4': 'Data Modeling', 'hw:5': 'Data Visualization (IBCS)', 'hw:6': 'Data Storytelling', 'capstone:1': 'Project' },
  // Từ BIE105 trở đi: vẫn 5 HW nhưng đổi nội dung từng bài + Capstone Project
  BIE_NEW: { 'hw:1': 'Business Intelligence Literacy', 'hw:2': 'Data Transformation', 'hw:3': 'Data Modeling', 'hw:4': 'Data Visualization (IBCS)', 'hw:5': 'Data Storytelling', 'capstone:1': 'Project' },
  EBA: { 'hw:1': 'Excel Formulas 1', 'hw:2': 'Excel Formulas 2', 'hw:3': 'Excel Formulas 3', 'hw:4': 'Data Management', 'capstone:1': 'Project' },
  BIH: { 'hw:1': 'Data Transformation', 'hw:2': 'Data Transformation', 'hw:3': 'Data Modeling', 'mini:1': 'Data Visualization', 'mini:2': 'Dashboard Visualization', 'hw:4': 'Data Statistics', 'mini:3': 'Data Problem Solving', 'capstone:1': 'Project' },
};

// Bộ module áp cho lớp: BIE tách theo thời kỳ (BIE104 riêng, từ BIE105 là bộ mới), chương trình khác theo mã chương trình.
function tableFor(short) {
  const m = /^([A-Z]+)(\d+)?/.exec(String(short ?? '').toUpperCase());
  if (!m) return null;
  if (m[1] === 'BIE' && m[2]) { const n = Number(m[2]); return n === 104 ? MODULES.BIE104 : n >= 105 ? MODULES.BIE_NEW : MODULES.BIE; }
  return MODULES[m[1]] ?? null;
}

// short = mã lớp ngắn ("BIH100"); kind/seq theo tên bài trong Excel. Không có trong bảng → null.
function moduleFor(short, kind, seq) {
  return tableFor(short)?.[`${kind}:${kind === 'capstone' ? 1 : seq}`] ?? null;
}

// Số HW của lớp BIE/BIH (BIE104 có 6, còn lại 5); chương trình khác → null (không giới hạn). Cột HW vượt số này mà không có điểm thì không tạo.
function hwCountFor(short) {
  const m = /^([A-Z]+)(\d+)?/.exec(String(short ?? '').toUpperCase());
  if (!m || !['BIE', 'BIH'].includes(m[1])) return null;
  return m[1] === 'BIE' && Number(m[2]) === 104 ? 6 : 5;
}

// Từ BIE105: 5 HW + Capstone Project (tạo sẵn khi đồng bộ lớp). Các lớp trước đó lấy bài từ Excel điểm danh.
const bieHasDefaultCapstone = (short) => { const m = /^BIE(\d+)$/.exec(String(short ?? '').toUpperCase()); return !!m && Number(m[1]) >= 105; };

module.exports = { MODULES, moduleFor, hwCountFor, bieHasDefaultCapstone };
