// Bảng Module của từng bài (tương đương sheet "Module" / Table_Module trong file "Chấm điểm.xlsx": Course 3 chữ · HW · Module).
// Khóa theo tên bài NHƯ TRONG EXCEL (trước bí danh): BIH "Mini Project 3" được lưu ở bài HW5 nhưng Module tra theo mini:3.
// Nguồn điểm không mang theo Module (danh sách file SharePoint) dùng bảng này để điền Module như XLOOKUP của quy trình Excel thủ công.
// Chương trình chưa có trong bảng (PBM, SCA…) thì Module để trống — chủ dự án cung cấp bảng thì thêm vào đây (và vào test).
const MODULES = {
  BIE: { 'hw:1': 'Business Intelligence Literacy', 'hw:2': 'Data Transformation', 'hw:3': 'Data Transformation', 'hw:4': 'Data Modeling', 'hw:5': 'Data Visualization', 'capstone:1': 'Project' },
  EBA: { 'hw:1': 'Excel Formulas 1', 'hw:2': 'Excel Formulas 2', 'hw:3': 'Excel Formulas 3', 'hw:4': 'Data Management', 'capstone:1': 'Project' },
  BIH: { 'hw:1': 'Data Transformation', 'hw:2': 'Data Transformation', 'hw:3': 'Data Modeling', 'mini:1': 'Data Visualization', 'mini:2': 'Dashboard Visualization', 'hw:4': 'Data Statistics', 'mini:3': 'Data Problem Solving', 'capstone:1': 'Project' },
};

// short = mã lớp ngắn ("BIH100"); kind/seq theo tên bài trong Excel. Không có trong bảng → null.
function moduleFor(short, kind, seq) {
  const prog = /^([A-Z]+)/.exec(String(short ?? '').toUpperCase())?.[1];
  return MODULES[prog]?.[`${kind}:${kind === 'capstone' ? 1 : seq}`] ?? null;
}

module.exports = { MODULES, moduleFor };
