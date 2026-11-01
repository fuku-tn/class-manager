// Xuất Transcript (bảng điểm) ra CSV theo đúng cấu trúc sheet TRANSCRIPT/Certificate trong thư mục transcripts/ (BIE099/BIE101, BIH98, EBA117/EBA118):
// 1 dòng / học viên, cột phẳng: student_name … transcript_no, rồi module_N_name/grade/interpretation/result, rồi total_modules_completed,
// total_sessions_earned ("8 SESSIONS"), grade_point_average ("2.62 / 4.00"), overall_classification, academic_standing.
// Cấu trúc module + trọng số của từng chương trình và công thức GPA nằm ở gpa.js (dùng chung với trang Tốt nghiệp).
const gpa = require('./gpa');

const PROGRAMS = {
  BIE: { program: 'BUSINESS INTELLIGENCE ESSENTIALS', specialization: '' },
  BIH: { program: 'BUSINESS INTELLIGENCE HR ANALYTICS', specialization: 'HUMAN RESOURCES ANALYTICS' },
  EBA: { program: 'EXCEL FOR BUSINESS ANALYTICS', specialization: '' },
};
const CREDENTIAL = 'PROFESSIONAL CERTIFICATE OF ACHIEVEMENT';
const COMPLETED = 'SUCCESSFULLY COMPLETED';
const INCOMPLETE = 'INCOMPLETE - CHƯA HOÀN THÀNH ĐỦ MODULE';

// Họ tên IN HOA KHÔNG DẤU như các file mẫu ("DO THAO UYEN")
const plainUpper = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, ' ').trim().toUpperCase();
const iso = (d) => (d ? String(d).slice(0, 10) : '');
const certNumber = (s) => { const m = /(\d+)\s*$/.exec(String(s ?? '')); return m ? Number(m[1]) : null; };

// Điểm danh các module tính theo buổi (BIH 6, 8): có mặt → A+ / OUTSTANDING; vắng → C / SATISFACTORY; cả hai đều PASS và không vào GPA (trọng số 0).
const ATTENDANCE_GRADE = { present: { letter: 'A+', interpretation: 'OUTSTANDING' }, absent: { letter: 'C', interpretation: 'SATISFACTORY' } };

function columnsFor(spec) {
  const cols = ['student_name', 'email', 'student_id', 'date_of_birth', 'nationality', 'program', 'specialization', 'credential_awarded', 'enrollment_date',
    'completion_date', 'certificate_no', 'issued_date', 'transcript_no'];
  spec.forEach((_, i) => cols.push(`module_${i + 1}_name`, `module_${i + 1}_grade`, `module_${i + 1}_interpretation`, `module_${i + 1}_result`));
  cols.push('total_modules_completed', 'total_sessions_earned', 'grade_point_average', 'overall_classification', 'academic_standing');
  return cols;
}

// cls: lớp; data: kết quả loadClassData; passedIds: Set enrollment_id đã tốt nghiệp (kết quả hiệu lực của trang Tốt nghiệp, kể cả admin chỉnh tay);
// scope: 'graduates' (chỉ người tốt nghiệp — để làm chứng chỉ) | 'all' (cả lớp, người chưa đạt ghi INCOMPLETE).
function buildTranscript(cls, data, passedIds, { scope = 'graduates' } = {}) {
  const spec = gpa.moduleSpec(cls.short_code);
  const info = PROGRAMS[String(cls.program ?? '').toUpperCase()];
  if (!spec || !info) {
    const e = new Error(`Lớp ${cls.short_code ?? cls.code} chưa có mẫu Transcript (hiện có BIE, BIH, EBA; BIE107 và các chương trình khác chưa có)`);
    e.status = 422; e.expose = true; throw e;
  }
  const gpaMap = gpa.classGpa(data, cls.short_code);
  const sessionByNo = new Map(data.sessions.map((s) => [s.session_no, s.id]));
  const presentAt = new Set(data.attendance.filter((a) => a.status === 'present').map((a) => `${a.enrollment_id}:${a.session_id}`));

  // transcript_no = certificate_no + "-" + thứ tự tăng dần theo số chứng chỉ trong lớp (như EBA117: …004001 → -3)
  const certs = data.enrollments.filter((e) => passedIds.has(e.id)).map((e) => certNumber(e.certificate_number)).filter((n) => n != null).sort((a, b) => a - b);
  const rankOf = (n) => certs.indexOf(n) + 1;

  const warnings = [];
  let noCert = 0; let manual = 0;
  const list = data.enrollments.filter((e) => ['active', 'completed'].includes(e.course_status) && (scope === 'all' || passedIds.has(e.id)));
  const rows = list.map((e) => {
    const graduate = passedIds.has(e.id);
    const g = gpaMap.get(e.id) ?? { gpa: null, modules: [] };
    const byName = new Map(g.modules.map((m) => [m.official, m]));
    const out = [plainUpper(e.full_name), e.email ?? '', e.student_code, '', 'VIETNAMESE', info.program, info.specialization, CREDENTIAL,
      iso(cls.start_date), graduate ? iso(cls.end_date) : '', graduate ? (e.certificate_number ?? '') : '', graduate ? iso(e.certificate_sent_date) : ''];
    const cn = graduate ? certNumber(e.certificate_number) : null;
    out.push(cn != null ? `${e.certificate_number}-${rankOf(cn)}` : '');
    let completed = 0;
    for (const m of spec) {
      let cell = ['', '', '', ''];
      if (m.session != null) {   // module theo điểm danh
        const sid = sessionByNo.get(m.session);
        if (sid != null) { const t = ATTENDANCE_GRADE[presentAt.has(`${e.id}:${sid}`) ? 'present' : 'absent']; cell = [m.name, t.letter, t.interpretation, 'PASS']; completed++; }
      } else {
        const r = byName.get(m.name);   // không có = module chưa giao; pending = đã nộp nhưng chưa chấm → để trống phần điểm
        if (r && !r.pending) {
          const gr = gpa.gradeOf(r.score ?? 0);   // không làm bài = 0 = F
          cell = [m.name, gr.letter, gr.interpretation.toUpperCase(), gr.pass ? 'PASS' : 'FAIL'];
          if (gr.pass) completed++;
        } else cell = [m.name, '', '', ''];
      }
      out.push(...cell);
    }
    const value = g.gpa ?? 0;
    let classification = '';
    if (graduate) {
      if (value >= gpa.PASS_GPA) classification = gpa.classify(value).toUpperCase();
      else manual++;   // admin chỉnh tay cho đạt dù GPA < 2.5: để trống xếp loại (như EBA117 chờ quyết định)
      if (!e.certificate_number) noCert++;
    }
    const sessions = data.sessions.filter((s) => presentAt.has(`${e.id}:${s.id}`)).length;
    out.push(completed, `${sessions} SESSIONS`, `${value.toFixed(2)} / 4.00`, classification, graduate ? COMPLETED : INCOMPLETE);
    return out;
  });
  if (noCert) warnings.push(`${noCert} học viên chưa có số chứng chỉ nên certificate_no/transcript_no để trống`);
  if (manual) warnings.push(`${manual} học viên được admin chỉnh tay cho đạt dù GPA dưới 2.5 — overall_classification để trống`);
  warnings.push('date_of_birth để trống (hệ thống không lưu ngày sinh); issued_date lấy từ "Ngày gửi chứng chỉ"');
  return { columns: columnsFor(spec), rows, warnings, count: rows.length };
}

module.exports = { buildTranscript, columnsFor, PROGRAMS, plainUpper };
