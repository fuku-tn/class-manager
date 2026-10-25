// Quy tắc bổ sung cho lịch giảng dạy (bảng teaching_schedule), chạy trong cùng transaction với importSchedule:
//  1. Khớp lịch khai giảng: buổi đầu của lớp phải trùng classes.start_date; lệch thì dời CẢ lớp đúng số ngày lệch
//     (chỉ khi lịch bắt đầu từ buổi 1 và lệch là bội của 7 để không đổi thứ học; còn lại chỉ báo, không tự sửa).
//  2. Giảng viên mặc định (chủ dự án chốt 25/10/2026) khi Sheet để trống: EBA và PBM buổi 9–10 → Phạm Hoài An;
//     BIE, SCA, BIH và PBM buổi 1–8 → Bùi Trường Sơn. Sheet có ghi giảng viên thì giữ nguyên.
const AN = 'Phạm Hoài An';
const SON = 'Bùi Trường Sơn';

const programOf = (short) => /^[A-Z]+/.exec(String(short ?? '').toUpperCase())?.[0] ?? '';

function defaultInstructor(short, sessionNo) {
  const p = programOf(short);
  if (p === 'EBA') return AN;
  if (p === 'BIE' || p === 'SCA' || p === 'BIH') return SON;
  if (p === 'PBM') {
    if (!Number.isInteger(sessionNo)) return null;
    if (sessionNo >= 9 && sessionNo <= 10) return AN;
    if (sessionNo >= 1 && sessionNo <= 8) return SON;
  }
  return null;
}

const dayNum = (s) => Math.round(Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`) / 864e5);

// `t` là transaction (db.tx). Trả số liệu để đưa vào báo cáo đồng bộ.
async function normalizeSchedule(t) {
  const out = { aligned_classes: 0, misaligned_classes: 0, instructors_filled: 0 };
  const firsts = await t.all(
    `select c.id, c.short_code, c.start_date::text as start_date, min(s.session_date)::text as first_date, min(s.session_no) as first_no
       from classes c join teaching_schedule s on s.class_id = c.id
      where c.start_date is not null group by c.id`);
  // Lịch chỉ có các buổi sau (vd buổi 6–8, 17–21) thì ngày đầu KHÔNG phải ngày khai giảng: không dời.
  for (const f of firsts) {
    if (f.first_no !== 1) continue;
    const delta = dayNum(f.start_date) - dayNum(f.first_date);
    if (!delta) continue;
    if (delta % 7 !== 0) { out.misaligned_classes++; continue; }
    await t.run('update teaching_schedule set session_date = session_date + $2::int, updated_at = now() where class_id = $1', [f.id, delta]);
    out.aligned_classes++;
  }
  const blanks = await t.all("select id, short_code, session_no from teaching_schedule where instructor is null or btrim(instructor) = ''");
  const ids = []; const names = [];
  for (const b of blanks) {
    const n = defaultInstructor(b.short_code, b.session_no);
    if (n) { ids.push(b.id); names.push(n); }
  }
  if (ids.length) {
    await t.run('update teaching_schedule s set instructor = v.n, updated_at = now() from unnest($1::bigint[], $2::text[]) as v(id, n) where s.id = v.id', [ids, names]);
  }
  out.instructors_filled = ids.length;
  return out;
}

module.exports = { normalizeSchedule, defaultInstructor, programOf, AN, SON };
