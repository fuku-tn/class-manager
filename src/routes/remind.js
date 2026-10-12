// Nhắc homework theo lớp. Mount tại /api/classes/:classId/remind.
//  - Mọi tài khoản có quyền vào lớp (trừ khách) xem được tiến độ TỪNG học viên.
//  - Tin nhắn, xưng hô/tên gọi, cấu hình, tổng quan gửi group, nạp bảng: chỉ admin + tài khoản được bật can_remind
//    (nội dung tin nhắn chỉ được sinh khi có quyền, nên không thể lấy qua API khi không có quyền).
// Tổng quan lớp KHÔNG có tên học viên (chỉ số tổng hợp).
const express = require('express');
const { requireClassAccess, requireRemind, canRemind } = require('../auth');
const { loadClassData, homeworkProgress, classHomeworkStats } = require('../services/stats');
const R = require('../services/remind');
const realtime = require('../services/realtime');

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, max) : null; };
const vnToday = () => {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

module.exports = (db) => {
  const router = express.Router({ mergeParams: true });
  router.use(requireClassAccess(db));
  router.use((req, res, next) => (req.user.role === 'guest' ? res.status(403).json({ error: 'Tài khoản khách không dùng được phần nhắc bài' }) : next()));

  // Cột bài của lớp = các bài ĐÃ THU (HW theo thứ tự, rồi Capstone nếu đã thu). Trạng thái "nộp lại" chưa tính hoàn thành.
  async function load(cls) {
    const data = await loadClassData(db, cls.id);
    const cfgRow = await db.one('select * from remind_config where class_id = $1', [cls.id]);
    const cfg = R.configFor(cls, cfgRow);
    const hw = data.assignments.filter((a) => a.kind === 'hw' && a.collected).sort((a, b) => a.seq - b.seq);
    const cap = data.assignments.find((a) => a.kind === 'capstone' && a.collected);
    const cols = [...hw.map((a) => ({ id: a.id, label: `HOMEWORK ${a.seq}` })), ...(cap ? [{ id: cap.id, label: 'CAPSTONE PROJECT' }] : [])];
    const sub = new Map(data.submissions.map((s) => [`${s.enrollment_id}:${s.assignment_id}`, s.status]));
    const people = data.enrollments
      .filter((e) => e.course_status === 'active' || e.course_status === 'completed')
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
    const rows = people.map((e) => ({ e, d: cols.map((c) => (sub.get(`${e.id}:${c.id}`) === 'submitted' ? 1 : 0)) }));
    return { data, cfg, cols, rows };
  }

  const defaultHonorific = (e) => e.honorific || (e.gender === 'Male' ? 'Anh' : 'Chị');

  router.get('/', async (req, res) => {
    const priv = canRemind(req.user);
    const { cfg, cols, rows } = await load(req.cls);
    const hdr = cols.map((c) => c.label);
    const names = new Map();
    const students = rows.map(({ e, d }) => {
      names.set(e.full_name, (names.get(e.full_name) ?? 0) + 1);
      const p = homeworkProgress(d.reduce((a, b) => a + b, 0), cols.length);
      const base = { enrollment_id: e.id, name: e.full_name, student_code: e.student_code, d, done: p.done, total: p.total, pct: p.pct, complete: p.complete };
      if (!priv) return base;
      const honorific = defaultHonorific(e);
      return {
        ...base, honorific, honorific_custom: !!e.honorific, call_name: e.call_name ?? null, call_name_default: R.callName(e.full_name),
        message: cols.length ? R.buildMessage({ name: e.full_name, d, honorific, call_name: e.call_name }, { hdr, cls: cfg.cls_label, scope: cfg.scope }) : '',
      };
    });
    const warnings = [...names].filter(([, n]) => n > 1).map(([n]) => `Trùng tên: "${n}" — 2 người cùng tên dễ lẫn thẻ, hãy kiểm tra trước khi gửi`);
    res.json({
      privileged: priv, hdr, students, warnings, no_homework: cols.length === 0,
      class: { id: req.cls.id, code: req.cls.code, short_code: req.cls.short_code, program: req.cls.program },
      snap_date: vnToday(), theme: cfg.theme,
      ...(priv ? { config: cfg, themes: R.THEME_KEYS } : {}),
    });
  });

  // Tổng quan gửi group: KHÔNG có tên. min_group lấy từ query nếu có (xem trước), không thì từ cấu hình lớp.
  router.get('/overview', requireRemind, async (req, res) => {
    const { cfg, cols, rows } = await load(req.cls);
    const min = Number.isInteger(Number(req.query.min_group)) && Number(req.query.min_group) >= 1 ? Number(req.query.min_group) : cfg.min_group;
    const st = classHomeworkStats(rows.map((r) => r.d), cols.map((c) => c.label), { minGroup: min });
    res.json({ title: str(req.query.title, 120) || cfg.overview_title, min_group: min, snap_date: vnToday(), ...st });
  });

  router.put('/config', requireRemind, async (req, res) => {
    const b = req.body;
    const cur = await db.one('select * from remind_config where class_id = $1', [req.cls.id]);
    const next = {
      cls_label: b.cls_label === undefined ? cur?.cls_label ?? null : str(b.cls_label, 40),
      scope: b.scope === undefined ? cur?.scope ?? null : str(b.scope, 80),
      overview_title: b.overview_title === undefined ? cur?.overview_title ?? null : str(b.overview_title, 120),
      min_group: b.min_group === undefined ? cur?.min_group ?? 1 : Number(b.min_group),
      theme: b.theme === undefined ? cur?.theme ?? null : (b.theme || null),
    };
    if (!Number.isInteger(next.min_group) || next.min_group < 1 || next.min_group > 50) throw httpError(400, 'Ngưỡng ẩn danh phải là số nguyên từ 1 đến 50');
    if (next.theme && !R.THEME_KEYS.includes(next.theme)) throw httpError(400, 'Theme không hợp lệ');
    await db.run(
      `insert into remind_config (class_id, cls_label, scope, overview_title, min_group, theme, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (class_id) do update set cls_label = excluded.cls_label, scope = excluded.scope, overview_title = excluded.overview_title,
         min_group = excluded.min_group, theme = excluded.theme, updated_by = excluded.updated_by, updated_at = now()`,
      [req.cls.id, next.cls_label, next.scope, next.overview_title, next.min_group, next.theme, req.user.id]);
    res.json({ ok: true, config: R.configFor(req.cls, next) });
  });

  // Xưng hô (Anh/Chị) và tên gọi lưu theo học viên; honorific = null để quay về mặc định theo giới tính.
  router.put('/students/:enrollmentId', requireRemind, async (req, res) => {
    const e = await db.one('select e.id, e.student_id from enrollments e where e.id = $1 and e.class_id = $2', [Number(req.params.enrollmentId) || 0, req.cls.id]);
    if (!e) throw httpError(404, 'Không tìm thấy học viên trong lớp');
    const b = req.body;
    if (b.honorific !== undefined && b.honorific !== null && !['Anh', 'Chị'].includes(b.honorific)) throw httpError(400, 'Xưng hô phải là Anh hoặc Chị');
    if (b.honorific !== undefined) await db.run('update students set honorific = $1 where id = $2', [b.honorific, e.student_id]);
    if (b.call_name !== undefined) await db.run('update students set call_name = $1 where id = $2', [str(b.call_name, 40), e.student_id]);
    res.json({ ok: true });
  });

  // Nạp bảng homework dán từ Excel/Google Sheets (cột đầu = họ tên): ghép theo họ tên (không phân biệt dấu) với học viên của lớp.
  // Chỉ GHI "đã hoàn thành" (X); không hạ trạng thái và không đè ô đã được người dùng sửa tay.
  router.post('/import', requireRemind, async (req, res) => {
    if (req.user.role === 'guest') throw httpError(403, 'Tài khoản khách không ghi được');
    const dry = req.query.dry_run === '1';
    const parsed = R.parseTable(req.body?.table);
    if (!parsed.columns.length || !parsed.students.length) throw httpError(422, 'Không đọc được bảng: dòng đầu cần "FULL NAME, HOMEWORK 1, HOMEWORK 2, ..."');
    const enr = await db.all(
      `select e.id, s.full_name from enrollments e join students s on s.id = e.student_id
       where e.class_id = $1 and e.course_status in ('active', 'completed')`, [req.cls.id]);
    const byName = new Map();
    for (const e of enr) (byName.get(norm(e.full_name)) ?? byName.set(norm(e.full_name), []).get(norm(e.full_name))).push(e.id);
    const matched = [];
    const unmatched = [];
    const ambiguous = [];
    for (const s of parsed.students) {
      const ids = byName.get(norm(s.name)) ?? [];
      if (ids.length === 1) matched.push({ id: ids[0], done: s.done });
      else if (ids.length > 1) ambiguous.push(s.name);
      else unmatched.push(s.name);
    }
    const existing = await db.all('select id, kind, seq, collected from assignments where class_id = $1', [req.cls.id]);
    const has = (c) => existing.some((a) => a.kind === c.kind && a.seq === c.seq);
    const result = {
      dry_run: dry, matched: matched.length, unmatched, ambiguous, columns: parsed.columns.map((c) => c.label),
      created_assignments: parsed.columns.filter((c) => !has(c)).length, cells_set: 0, already_done: 0, kept_manual: 0, warnings: parsed.warnings,
    };
    await db.tx(async (t) => {
      const ids = {};
      for (const c of parsed.columns) {
        const a = await t.one(
          `insert into assignments (class_id, kind, seq, title, collected) values ($1, $2, $3, $4, true)
           on conflict (class_id, kind, seq) do update set collected = true returning id`,
          [req.cls.id, c.kind, c.seq, c.kind === 'capstone' ? 'Capstone Project' : `HW ${c.seq}`]);
        ids[c.index] = a.id;
      }
      const cur = new Map((await t.all(
        `select b.enrollment_id, b.assignment_id, b.status, b.updated_by from submissions b join assignments a on a.id = b.assignment_id where a.class_id = $1`,
        [req.cls.id])).map((r) => [`${r.enrollment_id}:${r.assignment_id}`, r]));
      const e = []; const a = [];
      for (const m of matched) {
        parsed.columns.forEach((c, k) => {
          if (!m.done[k]) return;
          const old = cur.get(`${m.id}:${ids[c.index]}`);
          if (old?.status === 'submitted') { result.already_done++; return; }
          if (old && old.updated_by != null) { result.kept_manual++; return; }   // ô đã được người dùng sửa tay: giữ nguyên
          e.push(m.id); a.push(ids[c.index]);
        });
      }
      result.cells_set = e.length;
      if (e.length) {
        await t.run(
          `insert into submissions (enrollment_id, assignment_id, status, updated_by)
           select u.e, u.a, 'submitted', $3::bigint from unnest($1::bigint[], $2::bigint[]) as u(e, a)
           on conflict (enrollment_id, assignment_id) do update set status = 'submitted', updated_at = now(), updated_by = excluded.updated_by
             where submissions.updated_by is null`,
          [e, a, req.user.id]);
      }
      if (dry) throw Object.assign(new Error('dry-run'), { dry: true });
    }).catch((err) => { if (!err.dry) throw err; });
    if (!dry && (result.cells_set || result.created_assignments)) await realtime.publish(req.cls.id, { kind: 'submissions' });
    res.json(result);
  });

  return router;
};
