// Hồ sơ đăng ký từ tab FORM của Google Sheet.
//
// QUYỀN RIÊNG TƯ (chủ dự án chốt): KHÔNG lưu họ tên, giới tính, ngày sinh, SĐT, email, địa chỉ liên hệ, tên công ty,
// địa chỉ nhận tại nhà, kỳ vọng sau khóa học. Email/SĐT chỉ đi qua dưới dạng MÃ BĂM (SHA-256) để ghép với học viên
// đã đăng ký; mã băm chỉ được giữ ở các phiếu CHƯA khớp ai (để ghép lại sau), phiếu đã khớp thì bỏ mã băm.
// Nội dung dài được làm gọn (mục tiêu → nhãn ngắn, "English (Tiếng Việt)" → phần tiếng Việt, kinh nghiệm → khoảng).
const crypto = require('node:crypto');

// Tên cột mà Apps Script gửi sang (đã đổi từ tiêu đề tiếng Việt). EMAIL HASH / PHONE HASH = mã băm.
const FORM_COLUMNS = ['SUBMITTED AT', 'COURSE', 'DELIVERY', 'JOB TITLE', 'EXPERIENCE', 'DEPARTMENT', 'HR FUNCTION', 'INDUSTRY',
  'PROVINCE', 'SOURCE', 'MATERIAL DELIVERY', 'GOALS', 'EMAIL HASH', 'PHONE HASH'];

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
// Chuẩn hóa PHẢI giống hệt trong scripts/google-apps-script/sync-transactions.gs
const hashEmail = (v) => { const e = String(v ?? '').trim().toLowerCase(); return e.includes('@') ? sha(e) : null; };
const hashPhone = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 8 ? sha(d.slice(-9)) : null; };

const isNull = (v) => v == null || String(v).trim() === '' || /^null$/i.test(String(v).trim());
const clean = (v, max = 80) => (isNull(v) ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, max));
// "Human Resources Department (Phòng Nhân sự)" -> "Phòng Nhân sự"
function vietnamese(v) {
  const s = clean(v, 200);
  if (!s) return null;
  const m = /\(([^()]+)\)\s*$/.exec(s);
  return (m ? m[1] : s).trim().slice(0, 80);
}

function delivery(v) {
  const s = clean(v);
  if (!s) return null;
  const l = s.toLowerCase();
  if (l.includes('hybrid')) return 'Hybrid';
  if (l.includes('offline')) return 'Offline';
  if (l.includes('online')) return 'Online';
  return s;
}

function experience(v) {
  if (isNull(v)) return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return '0–1 năm';
  if (n <= 3) return '2–3 năm';
  if (n <= 5) return '4–5 năm';
  if (n <= 10) return '6–10 năm';
  return 'Trên 10 năm';
}

const SOURCE_GROUPS = [
  ['Mạng xã hội', /facebook|instagram|tiktok|linkedin|zalo|youtube|social|mạng xã hội/i],
  ['Người quen giới thiệu', /friend|người quen|giới thiệu|recommend/i],
  ['Website', /website|google|bing|tìm kiếm|search/i],
  ['Công ty/tổ chức', /company|organization|organisation|công ty|tổ chức/i],
];
function sources(v) {
  const s = clean(v, 300);
  if (!s) return [];
  const out = SOURCE_GROUPS.filter(([, re]) => re.test(s)).map(([label]) => label);
  return out.length ? out : ['Khác'];
}

const GOAL_LABELS = [
  ['Tư duy phân tích', /thinking|tư duy/i],
  ['Thành thạo công cụ', /\btools?\b|công cụ/i],
  ['Ra quyết định', /decision|ra quyết định/i],
  ['Chứng chỉ', /certificate|chứng chỉ/i],
  ['CV/chuyển việc', /\bcv\b|career opportunities|chuyển job/i],
  ['Kiến thức kinh doanh', /business knowledge|kiến thức kinh doanh/i],
  ['Chuyển ngành', /transition|chuyển đổi ngành|data\/analytics/i],
  ['Theo yêu cầu công ty', /training requirements|yêu cầu công ty|company/i],
];
// "a (x, y), b" -> tách theo dấu phẩy NGOÀI ngoặc. Không khớp nhãn nào -> "Khác" (không lưu chữ tự do).
function goals(v) {
  if (isNull(v)) return [];
  const parts = String(v).split(/[,;\n]+(?![^()]*\))/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const hit = GOAL_LABELS.find(([, re]) => re.test(p));
    const label = hit ? hit[0] : 'Khác';
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

const iso = (v) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// Một dòng FORM (theo FORM_COLUMNS) -> bản ghi đã gọn.
function condenseRow(rec) {
  return {
    short_code: clean(rec.COURSE, 30)?.toUpperCase() ?? null,
    submitted_at: iso(rec['SUBMITTED AT']),
    delivery: delivery(rec.DELIVERY),
    department: vietnamese(rec.DEPARTMENT),
    job_title: vietnamese(rec['JOB TITLE']),
    hr_function: vietnamese(rec['HR FUNCTION']),
    industry: vietnamese(rec.INDUSTRY),
    province: clean(rec.PROVINCE, 60),
    experience: experience(rec.EXPERIENCE),
    sources: sources(rec.SOURCE),
    material_delivery: vietnamese(rec['MATERIAL DELIVERY']),
    goals: goals(rec.GOALS),
    email_hash: clean(rec['EMAIL HASH'], 64),
    phone_hash: clean(rec['PHONE HASH'], 64),
  };
}

const COLS = ['enrollment_id', 'short_code', 'submitted_at', 'delivery', 'department', 'job_title', 'hr_function', 'industry',
  'province', 'experience', 'sources', 'material_delivery', 'goals', 'email_hash', 'phone_hash'];

async function insertRows(t, list, { onConflict = '' } = {}) {
  if (!list.length) return;
  const col = (k) => list.map((r) => (k === 'sources' || k === 'goals' ? JSON.stringify(r[k] ?? []) : (r[k] ?? null)));
  await t.run(
    `insert into registration_forms (enrollment_id, short_code, submitted_at, delivery, department, job_title, hr_function, industry,
                                     province, experience, sources, material_delivery, goals, email_hash, phone_hash, updated_at)
     select u.enrollment_id, u.short_code, u.submitted_at::timestamptz, u.delivery, u.department, u.job_title, u.hr_function, u.industry,
            u.province, u.experience, u.sources::jsonb, u.material_delivery, u.goals::jsonb, u.email_hash, u.phone_hash, now()
     from unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                 $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[], $15::text[])
       as u(enrollment_id, short_code, submitted_at, delivery, department, job_title, hr_function, industry,
            province, experience, sources, material_delivery, goals, email_hash, phone_hash)
     ${onConflict}`,
    COLS.map((k) => col(k)));
}

// table: { headers, rows } đã lọc theo FORM_COLUMNS. Ghép từng phiếu với ghi danh của đúng lớp (mã lớp) bằng mã băm
// email, không có thì SĐT. Ghép được duy nhất một ghi danh -> hồ sơ của ghi danh đó (phiếu mới nhất thắng).
// Không ghép được/mơ hồ -> "chờ xử lý" (giữ mã băm để ghép lại ở lần đồng bộ sau).
async function applyForms(db, table) {
  const idx = Object.fromEntries(table.headers.map((h, i) => [h, i]));
  const recs = table.rows.map((r) => condenseRow(Object.fromEntries(FORM_COLUMNS.map((c) => [c, idx[c] == null ? null : r[idx[c]]]))))
    .filter((r) => r.short_code);
  const result = { rows: recs.length, matched: 0, pending: 0, ambiguous: 0 };
  return db.tx(async (t) => {
    const shorts = [...new Set(recs.map((r) => r.short_code))];
    const enr = shorts.length ? await t.all(
      `select e.id, c.short_code, s.email, s.phone from enrollments e
       join classes c on c.id = e.class_id join students s on s.id = e.student_id
       where upper(c.short_code) = any($1::text[])`, [shorts]) : [];
    const byEmail = new Map();
    const byPhone = new Map();
    const add = (m, k, id) => { if (k) (m.get(k) ?? m.set(k, new Set()).get(k)).add(id); };
    for (const e of enr) {
      const sc = String(e.short_code).toUpperCase();
      add(byEmail, `${sc}|${hashEmail(e.email)}`, e.id);
      add(byPhone, `${sc}|${hashPhone(e.phone)}`, e.id);
    }
    const best = new Map(); // enrollment_id -> bản ghi mới nhất
    const pending = [];
    for (const r of recs) {
      let ids = r.email_hash ? byEmail.get(`${r.short_code}|${r.email_hash}`) : null;
      if (!ids?.size && r.phone_hash) ids = byPhone.get(`${r.short_code}|${r.phone_hash}`);
      if (ids?.size === 1) {
        const id = [...ids][0];
        const cur = best.get(id);
        if (!cur || (r.submitted_at ?? '') >= (cur.submitted_at ?? '')) best.set(id, { ...r, enrollment_id: id, email_hash: null, phone_hash: null });
      } else {
        if (ids?.size > 1) result.ambiguous++;
        pending.push({ ...r, enrollment_id: null });
      }
    }
    result.matched = best.size;
    result.pending = pending.length;
    await insertRows(t, [...best.values()], {
      onConflict: `on conflict (enrollment_id) do update set short_code = excluded.short_code, submitted_at = excluded.submitted_at,
        delivery = excluded.delivery, department = excluded.department, job_title = excluded.job_title, hr_function = excluded.hr_function,
        industry = excluded.industry, province = excluded.province, experience = excluded.experience, sources = excluded.sources,
        material_delivery = excluded.material_delivery, goals = excluded.goals, email_hash = null, phone_hash = null, updated_at = now()
        where registration_forms.submitted_at is null or excluded.submitted_at >= registration_forms.submitted_at`,
    });
    // Phiếu chờ xử lý: lấy lại toàn bộ từ lần gửi này (payload luôn là cả tab FORM)
    await t.run('delete from registration_forms where enrollment_id is null');
    await insertRows(t, pending);
    return result;
  });
}

// Tổng hợp để hiển thị: [{ label, count }] giảm dần theo số lượng.
function tally(values) {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
}

module.exports = { FORM_COLUMNS, hashEmail, hashPhone, condenseRow, applyForms, tally, goals, sources, experience, vietnamese, delivery };
