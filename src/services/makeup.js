// Học bù: người điểm danh ghi chú ở lớp gốc, vd "Bù EBA122" / "bù EBA 122" / "Bù lớp EBA122 buổi 1" / mã đầy đủ "P1.EBA.P122…".
// Lớp được nhắc tới (EBA122) hiện thông báo: học viên nào, từ lớp nào, bù buổi nào. Áp dụng cho mọi chương trình.
const { normalizeCourse } = require('./importPoints');

// Ghi chú → { short: 'EBA122', session: 1 | null } hoặc null nếu không phải ghi chú học bù có mã lớp.
const NOTE_RE = /(?<!\p{L})b[ùu](?!\p{L})[\s:,-]*(?:(?:học|hoc|lớp|lop|khóa|khoa|qua|sang|tại|tai|ở|o)\s+)*((?:[A-Za-z]\d*\.)?[A-Za-z]{2,5}(?:\.[A-Za-z]?)?[\s._-]*\d{1,4}(?:\.[A-Za-z0-9.]+)?)/iu;
function parseMakeupNote(note) {
  const s = String(note ?? '').normalize('NFC');
  const m = NOTE_RE.exec(s);
  if (!m) return null;
  const short = normalizeCourse(m[1]);
  if (!short || !/^[A-Z]{2,5}\d{3,4}$/.test(short)) return null;
  const rest = s.slice(m.index + m[0].length);
  const ses = /bu[ổo]i\s*(\d{1,2})/iu.exec(rest);
  return { short, session: ses ? Number(ses[1]) : null };
}

// Các học viên lớp khác ghi chú bù sang lớp `cls` (short_code). Gom theo học viên + lớp gốc.
async function makeupsFor(db, cls) {
  if (!cls.short_code) return [];
  const rows = await db.all(
    `select a.enrollment_id, a.session_id, a.status, a.note, a.updated_at, u.name as updated_by_name,
            s.session_no, s.session_date, c.id as from_class_id, c.short_code as from_short, c.code as from_code,
            st.student_code, st.full_name
       from attendance a
       join sessions s on s.id = a.session_id
       join classes c on c.id = s.class_id
       join enrollments e on e.id = a.enrollment_id
       join students st on st.id = e.student_id
       left join users u on u.id = a.updated_by
      where a.note ~* 'b(ù|u)' and c.id <> $1 and position(regexp_replace($2, '^[A-Za-z]+0*', '') in a.note) > 0
      order by a.updated_at desc`, [cls.id, cls.short_code]);
  const groups = new Map();
  for (const r of rows) {
    const p = parseMakeupNote(r.note);
    if (!p || p.short !== cls.short_code) continue;
    const key = `${r.enrollment_id}`;
    if (!groups.has(key)) {
      groups.set(key, { enrollment_id: r.enrollment_id, student_code: r.student_code, full_name: r.full_name,
        from_class_id: r.from_class_id, from_short: r.from_short, from_code: r.from_code, sessions: [], latest_at: null });
    }
    const g = groups.get(key);
    g.sessions.push({ session_id: r.session_id, session_no: r.session_no, session_date: r.session_date, target_session: p.session,
      status: r.status, note: r.note, by: r.updated_by_name ?? null, at: r.updated_at, key: `${r.enrollment_id}:${r.session_id}` });
    if (!g.latest_at || r.updated_at > g.latest_at) g.latest_at = r.updated_at;
  }
  const list = [...groups.values()];
  for (const g of list) g.sessions.sort((a, b) => a.session_no - b.session_no);
  return list.sort((a, b) => String(b.latest_at).localeCompare(String(a.latest_at)));
}

module.exports = { parseMakeupNote, makeupsFor };
