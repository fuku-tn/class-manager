// Quy tắc bổ sung cho lịch giảng dạy (bảng teaching_schedule), chạy trong cùng transaction với importSchedule:
//  1. Khớp lịch khai giảng: buổi đầu của lớp phải trùng classes.start_date; lệch thì dời CẢ lớp đúng số ngày lệch
//     (chỉ khi lịch bắt đầu từ buổi 1 và lệch là bội của 7 để không đổi thứ học; còn lại chỉ báo, không tự sửa).
//  1b. Lớp CHƯA có dòng nào trong Calendar (và chưa kết thúc quá 14 ngày) thì sinh lịch dự kiến từ tab COURSE:
//     từ start_date, đúng các thứ trong days_of_week (2–6 = Thứ 2–6, 7 = Thứ 7, 8 = Chủ nhật), đủ số buổi của lớp,
//     ca = classes.shift; buổi đầu ghi chú "Khai giảng", buổi cuối "Bế giảng". Lớp không có thứ học (vd B2B) thì bỏ qua.
//     Dòng tự sinh được XÓA VÀ SINH LẠI mỗi lần chạy nên luôn khớp ngày khai giảng/kết thúc/thứ học hiện tại của lớp; có dòng thật trong
//     Calendar thì lớp đó không còn bị sinh. Chạy sau mỗi lượt đồng bộ lịch, đồng bộ đăng ký (đổi lớp/ngày) và khi sửa lớp — xem refreshSchedule.
//  2. Giảng viên mặc định (chủ dự án chốt 25/10/2026) khi Sheet để trống: EBA và PBM buổi 9–10 → Phạm Hoài An;
//     BIE, SCA, BIH và PBM buổi 1–8 → Bùi Trường Sơn. Sheet có ghi giảng viên thì giữ nguyên.
const AN = 'Phạm Hoài An';
const SON = 'Bùi Trường Sơn';
const GENERATED = 'Lịch dự kiến (tự sinh từ ngày khai giảng)';   // nhận biết dòng tự sinh (xóa và sinh lại mỗi lần chạy)

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
  await t.run('delete from teaching_schedule where content = $1', [GENERATED]);
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
  out.generated_classes = 0; out.generated_rows = 0;
  const gen = await t.all(
    `select c.id, c.short_code, c.start_date::text as start_date, c.end_date::text as end_date, c.days_of_week, c.shift, c.delivery_mode,
            (left(split_part(c.code, '.', 3), 1) = 'B') as b2b, (select count(*)::int from sessions x where x.class_id = c.id) as n
       from classes c
      where c.short_code is not null and c.start_date is not null and c.days_of_week is not null
        and coalesce(c.end_date, c.start_date) >= current_date - 14
        and not exists (select 1 from teaching_schedule s where s.short_code = c.short_code)`);
  const rows = [];
  for (const c of gen) {
    const dows = new Set([...String(c.days_of_week).matchAll(/[2-8]/g)].map((m) => (m[0] === '8' ? 0 : Number(m[0]) - 1)));
    if (!dows.size) continue;
    const start = dayNum(c.start_date); const end = c.end_date ? dayNum(c.end_date) : null;
    const total = c.n > 0 ? c.n : null;
    if (!total && end == null) continue;
    const dates = [];
    for (let d = start; dates.length < (total ?? 99) && d <= (end ?? start + 366) + (total ? 60 : 0); d++) {
      if (dows.has(new Date(d * 864e5).getUTCDay())) dates.push(d);
      if (!total && d >= end) break;
    }
    dates.forEach((d, i) => rows.push({
      c, no: i + 1, date: new Date(d * 864e5).toISOString().slice(0, 10),
      note: i === 0 ? 'Khai giảng' : i === dates.length - 1 ? 'Bế giảng' : null,
    }));
    if (dates.length) out.generated_classes++;
  }
  if (rows.length) {
    const col = (f) => rows.map(f);
    await t.run(
      `insert into teaching_schedule (class_id, short_code, session_date, shift, session_no, content, mode, segment, note)
       select * from unnest($1::bigint[], $2::text[], $3::date[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[], $9::text[])`,
      [col((r) => r.c.id), col((r) => r.c.short_code), col((r) => r.date), col((r) => r.c.shift), col((r) => r.no),
        col(() => GENERATED), col((r) => r.c.delivery_mode), col((r) => (r.c.b2b ? 'B2B' : 'B2C')), col((r) => r.note)]);
  }
  out.generated_rows = rows.length;
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

// Gọi sau khi lớp/ngày thay đổi (không làm hỏng thao tác chính nếu lỗi). Trả số liệu hoặc null.
async function refreshSchedule(db) {
  try { return await db.tx((t) => normalizeSchedule(t)); } catch (e) { console.error('[lịch giảng] không làm mới được:', e.message); return null; }
}

module.exports = { GENERATED, refreshSchedule, normalizeSchedule, defaultInstructor, programOf, AN, SON };
