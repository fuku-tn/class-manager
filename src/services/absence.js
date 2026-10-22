// Đơn xin nghỉ học qua email: Apps Script (hộp thư academicaffairs.ste@gmail.com) gửi từng thư sang /api/sync/absences.
// Máy chủ chỉ giữ: học viên (khớp theo email người gửi), NGÀY nghỉ, mã thư, giờ nhận. Email người gửi/tiêu đề/nội dung không được lưu.

// Thư được chuyển tiếp qua Power Automate: người gửi thật nằm trong Reply-To hoặc dòng "From:/Từ:" của nội dung.
const FORWARDERS = new Set(['academicaffairs@starttrain.edu.vn', 'academicaffairs.ste@gmail.com']);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const SUBJECT_RE = /(xin\s*)?(ngh[ỉi]|v[ắa]ng)\s*(h[ọo]c|bu[ổo]i|l[ớo]p)|xin\s*ph[ée]p|absent|leave/i;
const MAX_DATES = 14;
const MAX_BODY = 1500;

const lowerEmail = (v) => { const m = EMAIL_RE.exec(String(v ?? '')); return m ? m[0].toLowerCase() : null; };

// Người gửi thật của đơn: Reply-To → From (nếu không phải hộp chuyển tiếp) → dòng "From:/Từ:" trong nội dung chuyển tiếp.
function originalSender({ from, replyTo, body }) {
  for (const v of [replyTo, from]) { const e = lowerEmail(v); if (e && !FORWARDERS.has(e)) return e; }
  const m = /(?:^|\n)\s*(?:from|từ|người gửi|de)\s*:[^\n]*?([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/i.exec(String(body ?? ''));
  const e = m ? m[1].toLowerCase() : null;
  return e && !FORWARDERS.has(e) ? e : null;
}

const pad = (n) => String(n).padStart(2, '0');
function realDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}
const iso = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

// Năm không ghi → lấy năm của ngày nhận thư; lệch quá xa (thư tháng 12 xin nghỉ 05/01…) thì sang năm kề.
function resolve(d, m, yRaw, received) {
  let y = yRaw ? Number(yRaw) : received.getUTCFullYear();
  if (yRaw && yRaw.length <= 2) y += 2000;
  let dt = realDate(y, m, d);
  if (dt && !yRaw) {
    const diff = (dt - received) / 86400000;
    if (diff < -60) dt = realDate(y + 1, m, d); else if (diff > 300) dt = realDate(y - 1, m, d);
  }
  return dt;
}

const D = '(\\d{1,2})\\s*[\\/.-]\\s*(\\d{1,2})(?:\\s*[\\/.-]\\s*(\\d{4}|\\d{2}))?';
const RANGE_RE = new RegExp(String.raw`${D}(?:\s*(?:đến|tới|->|→|–|—)\s*|\s+-\s+)(?:ngày\s*)?${D}`, 'giu');
const PAIR_RE = /(?<![\d/.-])(\d{1,2})(?![\d/.-])\s*(?:,|và|&)\s*(?:ngày\s*)?(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{4}|\d{2}))?/giu;
const ONE_RE = new RegExp(D, 'g');

function datesIn(text, received) {
  const out = new Set();
  let s = String(text ?? '').toLowerCase();
  s = s.replace(RANGE_RE, (_, d1, m1, y1, d2, m2, y2) => {
    const from = resolve(+d1, +m1, y1, received); const to = resolve(+d2, +m2, y2, received);
    if (from && to && to >= from && (to - from) / 86400000 < MAX_DATES) for (let t = from.getTime(); t <= to.getTime(); t += 86400000) out.add(iso(new Date(t)));
    return ' ';
  });
  s = s.replace(PAIR_RE, (_, d1, d2, m, y) => { for (const d of [d1, d2]) { const dt = resolve(+d, +m, y, received); if (dt) out.add(iso(dt)); } return ' '; });
  for (const m of s.matchAll(ONE_RE)) { const dt = resolve(+m[1], +m[2], m[3], received); if (dt) out.add(iso(dt)); }
  return [...out].sort().slice(0, MAX_DATES);
}

// Ngày xin nghỉ: ưu tiên tiêu đề; không có thì lấy phần nội dung (cắt trước đoạn thư trích dẫn/chuyển tiếp).
function parseAbsenceDates(subject, body, receivedAt) {
  const received = new Date(receivedAt ?? Date.now());
  if (Number.isNaN(received.getTime())) return [];
  const fromSubject = datesIn(subject, received);
  if (fromSubject.length) return fromSubject;
  const own = String(body ?? '').slice(0, MAX_BODY).split(/\n\s*(?:-{2,}|_{5,}|from\s*:|từ\s*:|sent\s*:|gửi\s*:|on .{0,80} wrote)/i)[0];
  return datesIn(own, received);
}

// messages: [{ id, from, replyTo, subject, body, received }]. Trả số liệu + classIds cần làm mới màn hình.
async function importAbsences(db, messages) {
  const brief = { received: messages.length, not_absence: 0, no_sender: 0, no_date: 0, unmatched: 0, matched: 0, added: 0, duplicates: 0, class_ids: [], unmatched_ids: [] };
  const classIds = new Set();
  await db.tx(async (t) => {
    for (const m of messages) {
      if (!SUBJECT_RE.test(String(m.subject ?? ''))) { brief.not_absence++; continue; }
      const sender = originalSender(m);
      if (!sender) { brief.no_sender++; brief.unmatched_ids.push(m.id); continue; }
      const dates = parseAbsenceDates(m.subject, m.body, m.received);
      if (!dates.length) { brief.no_date++; brief.unmatched_ids.push(m.id); continue; }
      // Một email có thể gắn với nhiều mã học viên (cùng một người, hoặc hai người dùng chung): lấy các mã đang học lớp nào đó.
      // Đơn chỉ hiện ở lớp mà học viên đang học và vẫn cần người xác nhận nên ghi cho tất cả là an toàn.
      const found = await t.all(
        `select id from students s where lower(s.email) = $1
            and exists (select 1 from enrollments e where e.student_id = s.id and e.course_status = 'active')`, [sender]);
      if (!found.length) { brief.unmatched++; brief.unmatched_ids.push(m.id); continue; }
      brief.matched++;
      for (const { id: studentId } of found) {
        const ins = await t.run(
          `insert into absence_requests (student_id, absence_date, message_key, received_at)
           select $1, d::date, $3, $4 from unnest($2::text[]) as d on conflict (student_id, absence_date) do nothing`,
          [studentId, dates, String(m.id ?? '').slice(0, 120) || null, new Date(m.received ?? Date.now())]);
        brief.added += ins; brief.duplicates += dates.length - ins;
        const classes = await t.all("select class_id from enrollments where student_id = $1 and course_status = 'active'", [studentId]);
        for (const c of classes) classIds.add(c.class_id);
      }
    }
  });
  brief.class_ids = [...classIds];
  return brief;
}

// Đơn còn hiệu lực của một lớp: ngày nghỉ rơi đúng một buổi của lớp (theo lịch giảng dạy hoặc ngày của buổi), học viên đang học.
async function absencesFor(db, classId) {
  return db.all(
    `select r.id, r.status, r.absence_date::text as absence_date, r.received_at, e.id as enrollment_id,
            st.student_code, st.full_name, se.id as session_id, se.session_no
       from absence_requests r
       join students st on st.id = r.student_id
       join enrollments e on e.student_id = st.id and e.class_id = $1 and e.course_status = 'active'
       join sessions se on se.class_id = $1 and (se.session_date = r.absence_date or se.session_no = (
              select ts.session_no from teaching_schedule ts where ts.class_id = $1 and ts.session_date = r.absence_date and ts.session_no is not null limit 1))
      where r.status <> 'dismissed'
      order by r.absence_date, st.full_name`, [classId]);
}

module.exports = { parseAbsenceDates, originalSender, importAbsences, absencesFor, SUBJECT_RE };
