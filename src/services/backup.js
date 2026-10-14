// Sao lưu / khôi phục toàn bộ dữ liệu (mọi bảng trong schema public).
// - exportAll: đọc trong MỘT transaction "repeatable read, read only" → ảnh chụp nhất quán, không khóa ai.
// - importAll: chỉ ghi vào database TRỐNG (tránh đè dữ liệu thật); giữ nguyên id, rồi chỉnh lại bộ đếm id.
// Không sao lưu auth_sessions (phiên đăng nhập tạm thời; khôi phục xong mọi người đăng nhập lại).
// Bản sao lưu chứa dữ liệu cá nhân + mã băm mật khẩu: chỉ lưu ở private-data/ (git-ignore), không gửi đi đâu.

const SKIP = new Set(['auth_sessions']);
const CHUNK = 2000;
const FORMAT = 1;

// Thứ tự bảng theo khóa ngoại (bảng được tham chiếu đứng trước) — đọc từ catalog nên tự theo kịp bảng mới.
async function tableOrder(q) {
  const tables = (await q.all(
    "select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"))
    .map((r) => r.t).filter((t) => !SKIP.has(t));
  const deps = await q.all(
    `select cl.relname as child, pr.relname as parent from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid join pg_class pr on pr.oid = c.confrelid
       join pg_namespace n on n.oid = cl.relnamespace
      where c.contype = 'f' and n.nspname = 'public'`);
  const need = new Map(tables.map((t) => [t, new Set()]));
  for (const d of deps) if (need.has(d.child) && need.has(d.parent) && d.child !== d.parent) need.get(d.child).add(d.parent);
  const out = [];
  const done = new Set();
  while (out.length < tables.length) {
    const ready = tables.filter((t) => !done.has(t) && [...need.get(t)].every((p) => done.has(p)));
    if (!ready.length) throw new Error('Không xác định được thứ tự bảng (vòng khóa ngoại)');
    for (const t of ready) { done.add(t); out.push(t); }
  }
  return out;
}

const ident = (t) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`Tên bảng không hợp lệ: ${t}`);
  return `"${t}"`;
};

async function exportAll(db) {
  return db.tx(async (t) => {
    await t.run('set transaction isolation level repeatable read, read only');
    const order = await tableOrder(t);
    const tables = {};
    const columns = {};
    for (const name of order) {
      columns[name] = (await t.all(
        "select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position", [name])).map((r) => r.c);
      const hasId = await t.one("select 1 as x from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'id'", [name]);
      tables[name] = await t.all(`select * from ${ident(name)}${hasId ? ' order by id' : ''}`);
    }
    const meta = await t.one("select now() as at, current_setting('server_version') as server_version");
    return {
      manifest: {
        format: FORMAT, app: 'class-manager', created_at: meta.at, server_version: meta.server_version,
        order, counts: Object.fromEntries(order.map((n) => [n, tables[n].length])), skipped: [...SKIP],
      },
      columns,
      tables,
    };
  });
}

// Nạp các bảng (theo thứ tự khóa ngoại) vào transaction t; chỉnh bộ đếm id. Dùng chung cho restore và mirror.
async function loadRows(t, manifest, tables, report) {
  for (const n of manifest.order) {
    let rows = tables[n] ?? [];
    // Từ CSV mọi giá trị là chuỗi: cột json/jsonb phải phân tích lại; kiểu khác Postgres tự đổi khi nạp
    const jsonCols = (await t.all(
      "select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1 and data_type in ('json', 'jsonb')", [n])).map((r) => r.c);
    if (jsonCols.length) rows = rows.map((r) => {
      const o = { ...r };
      for (const c of jsonCols) if (typeof o[c] === 'string') o[c] = JSON.parse(o[c]);
      return o;
    });
    for (let i = 0; i < rows.length; i += CHUNK) {
      await t.run(`insert into ${ident(n)} select * from json_populate_recordset(null::${ident(n)}, $1::json)`, [JSON.stringify(rows.slice(i, i + CHUNK))]);
    }
    report.restored[n] = rows.length;
    // bộ đếm id (identity) tiếp tục sau id lớn nhất, để bản ghi mới không trùng
    const hasId = await t.one("select 1 as x from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'id'", [n]);
    const seq = hasId ? await t.one("select pg_get_serial_sequence($1, 'id') as s", [`public.${n}`]) : null;
    if (seq?.s && rows.length) await t.run(`select setval($1::regclass, (select max(id) from ${ident(n)}))`, [seq.s]);
  }
}

// Khôi phục vào database đã có schema. Từ chối nếu bất kỳ bảng nào đã có dữ liệu (trừ khi allowNonEmpty).
async function importAll(db, backup, { dryRun = false, allowNonEmpty = false } = {}) {
  const { manifest, tables } = backup;
  if (!manifest || manifest.app !== 'class-manager' || manifest.format !== FORMAT) throw new Error('Không phải bản sao lưu Class Manager hợp lệ');
  const ROLLBACK = Symbol('rollback');
  const report = { restored: {}, dry_run: dryRun };
  try {
    await db.tx(async (t) => {
      const existing = new Set((await t.all(
        "select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).map((r) => r.t));
      const missing = manifest.order.filter((n) => !existing.has(n));
      if (missing.length) throw new Error(`Database đích thiếu bảng: ${missing.join(', ')} — chạy schema trước`);
      if (!allowNonEmpty) {
        const busy = [];
        for (const n of manifest.order) if ((await t.one(`select count(*)::int as n from ${ident(n)}`)).n > 0) busy.push(n);
        if (busy.length) throw new Error(`Database đích đã có dữ liệu (${busy.join(', ')}). Chỉ khôi phục vào database trống.`);
      }
      await loadRows(t, manifest, tables, report);
      // đối chiếu số dòng với bản sao lưu
      for (const n of manifest.order) {
        const got = (await t.one(`select count(*)::int as n from ${ident(n)}`)).n;
        if (!allowNonEmpty && got !== manifest.counts[n]) throw new Error(`Bảng ${n}: khôi phục ${got} dòng, bản sao lưu có ${manifest.counts[n]}`);
      }
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return report;
}

// ---------- CSV ----------
// Quy ước (giống COPY ... CSV của Postgres): ô trống KHÔNG có ngoặc = NULL; chuỗi luôn đặt trong ngoặc kép (kể cả chuỗi rỗng "");
// số/true/false để trần; jsonb ghi dạng chuỗi JSON. Có BOM UTF-8 để Excel mở đúng tiếng Việt.
const BOM = '\ufeff';
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}
function toCsv(columns, rows) {
  const head = columns.map((c) => `"${c}"`).join(',');
  return BOM + [head, ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
// Trả về { columns, rows } — rows là object, giá trị chuỗi hoặc null.
function parseCsv(text) {
  if (text.startsWith(BOM)) text = text.slice(1);
  const records = [];
  let row = []; let val = ''; let quoted = false; let inQ = false; let i = 0;
  const pushCell = () => { row.push(quoted ? val : (val === '' ? null : val)); val = ''; quoted = false; };
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { val += '"'; i += 2; continue; } inQ = false; i++; continue; }
      val += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; quoted = true; i++; continue; }
    if (ch === ',') { pushCell(); i++; continue; }
    if (ch === '\r' || ch === '\n') {
      pushCell(); records.push(row); row = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      if (i >= text.length) break;
      continue;
    }
    val += ch; i++;
  }
  if (val !== '' || quoted || row.length) { pushCell(); records.push(row); }
  const [columns = [], ...data] = records;
  return { columns, rows: data.map((r) => Object.fromEntries(columns.map((c, k) => [c, r[k] ?? null]))) };
}

// Bản sao lưu dạng CSV: _manifest.csv (khóa, giá trị) + <bảng>.csv
function manifestToCsv(m) {
  const rows = [['app', m.app], ['format', m.format], ['created_at', m.created_at], ['server_version', m.server_version],
    ['skipped', (m.skipped ?? []).join(' ')], ...m.order.map((n) => [`table:${n}`, m.counts[n]])];
  return toCsv(['key', 'value'], rows.map(([key, value]) => ({ key, value })));
}
function manifestFromCsv(text) {
  const { rows } = parseCsv(text);
  const get = (k) => rows.find((r) => r.key === k)?.value ?? null;
  const tables = rows.filter((r) => r.key.startsWith('table:'));
  return {
    app: get('app'), format: Number(get('format')), created_at: get('created_at'), server_version: get('server_version'),
    skipped: (get('skipped') ?? '').split(' ').filter(Boolean),
    order: tables.map((r) => r.key.slice(6)), counts: Object.fromEntries(tables.map((r) => [r.key.slice(6), Number(r.value)])),
  };
}

// Chép toàn bộ sang database DỰ PHÒNG (project Supabase riêng): trong MỘT transaction xóa sạch rồi nạp lại, đối chiếu số dòng;
// lỗi giữa chừng → hoàn tác, bản dự phòng cũ giữ nguyên. Chốt chặn: không bao giờ chạy nếu đích trùng database chính.
const projectKey = (url) => {
  const u = new URL(String(url).trim().replace(/^["']+|["']+$/g, ''));
  const ref = /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(u.username))?.[1] ?? /^db\.([a-z0-9]+)\.supabase\.co$/.exec(u.hostname)?.[1];
  return ref ? `supabase:${ref}` : `${u.hostname}:${u.port || 5432}${u.pathname}`;
};
function assertDifferentTarget(mainUrl, backupUrl) {
  if (!backupUrl) throw new Error('Thiếu BACKUP_DATABASE_URL');
  if (!mainUrl) throw new Error('Thiếu DATABASE_URL');
  if (projectKey(mainUrl) === projectKey(backupUrl)) throw new Error('BACKUP_DATABASE_URL trỏ vào CHÍNH database đang chạy — từ chối để không ghi đè dữ liệu thật');
}
async function mirrorAll(target, backup) {
  const { manifest, tables } = backup;
  const report = { restored: {} };
  await target.tx(async (t) => {
    const existing = new Set((await t.all(
      "select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).map((r) => r.t));
    const missing = manifest.order.filter((n) => !existing.has(n));
    if (missing.length) throw new Error(`Database dự phòng thiếu bảng: ${missing.join(', ')} — tạo schema trước`);
    const all = [...new Set([...manifest.order, ...(existing.has('auth_sessions') ? ['auth_sessions'] : [])])];
    await t.run(`truncate ${all.map(ident).join(', ')} restart identity cascade`);
    await loadRows(t, manifest, tables, report);
    for (const n of manifest.order) {
      const got = (await t.one(`select count(*)::int as n from ${ident(n)}`)).n;
      if (got !== manifest.counts[n]) throw new Error(`Dự phòng bảng ${n}: ${got} dòng, bản chính ${manifest.counts[n]}`);
    }
  });
  return report;
}

module.exports = { exportAll, importAll, mirrorAll, assertDifferentTarget, projectKey, tableOrder, SKIP, toCsv, parseCsv, manifestToCsv, manifestFromCsv };
