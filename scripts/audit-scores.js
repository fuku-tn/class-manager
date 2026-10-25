// Rà soát ĐIỂM bài tập (CHỈ ĐỌC database, không ghi gì) — dùng cho agent score-coverage-auditor / score-calc-checker và chạy tay.
//   npm run audit-scores                              → độ phủ điểm theo lớp: học viên đang học chưa có điểm nào, bài đã tick nhưng chưa có điểm…
//   npm run audit-scores -- --class BIE101,EBA118     → chỉ các lớp đó (mã ngắn)
//   npm run audit-scores -- --file scores_STARTTRAIN.csv [--class …]
//                                                     → thêm đối chiếu danh sách file SharePoint với database (thiếu / lệch / do ưu tiên nguồn)
//   --verbose                                         → in thêm tên không ghép được (CHỈ trên máy bạn; agent không dùng)
// Báo cáo chỉ có mã lớp, mã học viên và số đếm — không có họ tên/email/SĐT.
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { resolveScoreFiles } = require('../src/services/importScoreFiles');
const { applyAlias } = require('../src/services/importPoints');
const { parseCsv } = require('../src/services/backup');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const onlyClasses = val('--class')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) ?? null;
const file = val('--file');
const LIMIT = 15;   // số mã học viên liệt kê tối đa cho mỗi mục

async function coverage(db) {
  const classes = await db.all(
    `select c.id, c.short_code, c.program,
            count(*) filter (where e.course_status = 'active')::int as active,
            count(*) filter (where e.course_status = 'active' and exists (select 1 from homework_scores h where h.enrollment_id = e.id))::int as with_score,
            count(*) filter (where e.course_status = 'active' and not exists (select 1 from homework_scores h where h.enrollment_id = e.id)
                               and exists (select 1 from submissions x where x.enrollment_id = e.id and x.status in ('submitted','resubmit')))::int as ticked_no_score,
            (select count(*)::int from homework_scores h join enrollments e2 on e2.id = h.enrollment_id where e2.class_id = c.id) as scores
       from classes c join enrollments e on e.class_id = c.id
      where c.short_code is not null
      group by c.id order by c.short_code`);
  const picked = classes.filter((c) => (!onlyClasses || onlyClasses.includes(c.short_code)) && (onlyClasses || c.scores > 0 || c.ticked_no_score > 0));
  console.log('## Độ phủ điểm theo lớp (học viên đang học)');
  console.log('lớp | đang học | có điểm | chưa điểm nhưng đã tick nộp | tổng điểm');
  for (const c of picked) console.log(`${c.short_code} | ${c.active} | ${c.with_score} | ${c.ticked_no_score} | ${c.scores}`);
  for (const c of picked.filter((x) => x.scores > 0)) {
    const none = await db.all(
      `select s.student_code from enrollments e join students s on s.id = e.student_id
        where e.class_id = $1 and e.course_status = 'active' and not exists (select 1 from homework_scores h where h.enrollment_id = e.id) order by 1`, [c.id]);
    const perAsg = await db.all(
      `select a.kind, a.seq,
              count(*) filter (where x.status in ('submitted','resubmit'))::int as submitted,
              count(*) filter (where x.status in ('submitted','resubmit') and not exists (select 1 from homework_scores h where h.enrollment_id = x.enrollment_id and h.assignment_id = a.id))::int as submitted_no_score,
              (select count(*)::int from homework_scores h where h.assignment_id = a.id) as scored
         from assignments a left join submissions x on x.assignment_id = a.id
        where a.class_id = $1 group by a.id order by case a.kind when 'hw' then 0 when 'mini' then 1 else 2 end, a.seq`, [c.id]);
    console.log(`\n### ${c.short_code}: ${none.length} học viên đang học chưa có điểm nào`);
    if (none.length) console.log('mã: ' + none.slice(0, LIMIT).map((r) => r.student_code).join(', ') + (none.length > LIMIT ? ` … (+${none.length - LIMIT})` : ''));
    const gaps = perAsg.filter((a) => a.scored > 0 && a.submitted_no_score > 0);
    for (const a of gaps) console.log(`bài ${a.kind === 'capstone' ? 'Capstone' : `${a.kind === 'mini' ? 'MP' : 'HW'}${a.seq}`}: đã có điểm ${a.scored} người nhưng còn ${a.submitted_no_score} người đã tick nộp mà chưa có điểm`);
  }
  const bySource = await db.all(`select case when manual then 'manual' else source end as src, count(*)::int n from homework_scores group by 1 order by 1`);
  console.log('\n## Nguồn điểm: ' + bySource.map((r) => `${r.src}=${r.n}`).join(', '));
  const odd = await db.one(`select count(*) filter (where score < 0 or score > 10)::int out_of_range,
                                   count(*) filter (where e.course_status <> 'active')::int inactive
                              from homework_scores h join enrollments e on e.id = h.enrollment_id`);
  console.log(`Bất thường: điểm ngoài 0–10 = ${odd.out_of_range}; điểm của học viên không còn đang học = ${odd.inactive}`);
}

async function compareFile(db) {
  const { columns, rows } = parseCsv(fs.readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, ''));
  const keep = columns.filter((c) => ['PATH', 'NAME', 'POINT', 'KEY'].includes(c.trim().toUpperCase()));
  const headers = keep.map((c) => (c.trim().toUpperCase() === 'KEY' ? 'PATH' : c.trim().toUpperCase()));
  const { summary, details } = await resolveScoreFiles(db, { headers, rows: rows.map((x) => keep.map((c) => x[c])) }, { verbose: flag('--verbose') });
  const useful = details.filter((d) => !onlyClasses || onlyClasses.includes(d.short));
  console.log('\n## Danh sách file SharePoint → ghép tên');
  console.log(`dòng ${summary.rows} · có điểm → ${summary.scores_found} bài · ghép được ${summary.matched} · không ghép tên ${summary.unmatched_students} · trùng tên ${summary.ambiguous_students} · không nhận ra bài ${summary.skipped_no_item} · đường dẫn lạ ${summary.skipped_bad_path} · bị chặn ở 10 điểm ${summary.capped_at_10}`);
  if (summary.examples.unmatched.length) console.log('tên không ghép được: ' + summary.examples.unmatched.join('; '));
  if (summary.examples.no_item.length) console.log('file không nhận ra bài (mẫu, đã ẩn tên): ' + summary.examples.no_item.join(' | '));
  if (summary.unmatched_names?.length) { console.log('tên không ghép được (chỉ trên máy bạn):'); for (const n of summary.unmatched_names) console.log('  ' + n); }

  const db_ = await db.all(
    `select c.short_code, s.student_code, a.kind, a.seq, h.score::float8 as score, h.manual, h.source
       from homework_scores h join enrollments e on e.id = h.enrollment_id join students s on s.id = e.student_id
       join classes c on c.id = e.class_id join assignments a on a.id = h.assignment_id`);
  const have = new Map(db_.map((r) => [`${r.short_code}|${r.student_code}|${r.kind}:${r.seq}`, r]));
  const asgs = await db.all('select c.short_code, a.kind, a.seq from assignments a join classes c on c.id = a.class_id');
  const hasAsg = new Set(asgs.map((a) => `${a.short_code}|${a.kind}:${a.seq}`));
  const tally = { equal: 0, missing: 0, no_assignment: 0, stale_sharepoint: 0, differs_excel: 0, differs_manual: 0 };
  const ex = { missing: [], no_assignment: [], stale_sharepoint: [], differs_excel: [], differs_manual: [] };
  const per = new Map();
  for (const d of useful) {
    const al = applyAlias(d.short, { kind: d.kind, seq: d.seq });   // BIH: Mini Project 3 = HW5
    const key = `${d.short}|${d.code}|${al.kind}:${al.seq}`;
    const r = have.get(key);
    let k;
    if (!hasAsg.has(`${d.short}|${al.kind}:${al.seq}`)) k = 'no_assignment';
    else if (!r) k = 'missing';
    else if (Math.abs(r.score - d.point) < 0.011) k = 'equal';
    else k = r.manual ? 'differs_manual' : r.source === 'sharepoint' ? 'stale_sharepoint' : 'differs_excel';
    tally[k]++;
    per.set(d.short, { ...(per.get(d.short) ?? { equal: 0, missing: 0, no_assignment: 0, stale_sharepoint: 0, differs_excel: 0, differs_manual: 0 }), [k]: ((per.get(d.short) ?? {})[k] ?? 0) + 1 });
    if (k !== 'equal' && ex[k].length < LIMIT) ex[k].push(`${d.short} ${d.code} ${al.kind === 'capstone' ? 'Capstone' : `${al.kind === 'mini' ? 'MP' : 'HW'}${al.seq}`}: file ${d.point} (${d.files} file${d.capped ? ', bị chặn 10' : ''})${r ? ` · app ${r.score} [${r.manual ? 'manual' : r.source}]` : ''}`);
  }
  console.log('\n## Đối chiếu file ↔ database (điểm theo bài)');
  console.log(`khớp ${tally.equal} · CHƯA có trong app ${tally.missing} · lớp chưa có cột bài ${tally.no_assignment} · app lệch điểm do nguồn SharePoint cũ ${tally.stale_sharepoint} · lệch vì ưu tiên Excel ${tally.differs_excel} · lệch vì gõ tay ${tally.differs_manual}`);
  console.log('lớp | khớp | chưa có | thiếu cột bài | SharePoint cũ | Excel lệch | gõ tay lệch');
  for (const [cls, t] of [...per].sort()) console.log(`${cls} | ${t.equal} | ${t.missing} | ${t.no_assignment} | ${t.stale_sharepoint} | ${t.differs_excel} | ${t.differs_manual}`);
  for (const [k, list] of Object.entries(ex)) if (list.length) { console.log(`\n### ${k} (tối đa ${LIMIT})`); for (const x of list) console.log('  ' + x); }
}

(async () => {
  const db = await openDb();
  try {
    await coverage(db);
    if (file) await compareFile(db);
  } finally { await db.close?.(); }
})().then(() => process.exit(0)).catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
