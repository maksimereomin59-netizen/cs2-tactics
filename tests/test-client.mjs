/* Проверка клиентского слоя db.js: облачный адаптер, порядок (pos),
   realtime-подписки, офлайн-поведение. Supabase-клиент подменён фейком,
   который ведёт себя как PostgREST + Realtime. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  ok ? pass++ : fail++;
};

/* ---------------- фейковый Supabase ---------------- */
function makeBackend() {
  return {
    teams: {},
    rows: { players: [], maps: [], tactics: [], materials: [], templates: [], activity: [] },
    calls: [],
    channels: [],
    nextId: 1,
  };
}

function makeClient(be) {
  const builder = (table, op) => {
    const st = { table, op, filters: {}, payload: null, orderCol: null, asc: true, limitN: null };
    const self = {
      select() { st.op = st.op || "select"; return self; },
      insert(row) { st.op = "insert"; st.payload = row; return self; },
      update(row) { st.op = "update"; st.payload = row; return self; },
      delete() { st.op = "delete"; return self; },
      eq(col, val) { st.filters[col] = val; return self; },
      order(col, o) { st.orderCol = col; st.asc = !o || o.ascending !== false; return self; },
      limit(n) { st.limitN = n; return self; },
      single() { return run().then((r) => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error })); },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      be.calls.push({ table, op: st.op, payload: st.payload, filters: { ...st.filters } });
      const rows = be.rows[table];
      if (be.brokenTable === table && st.op === "select") {
        return { data: null, error: { message: 'relation "public.' + table + '" does not exist' } };
      }
      if (st.op === "insert") {
        // Поведение Postgres: pos по умолчанию 0, если не задан; id из базы.
        const row = { id: table.slice(0, 3) + "-" + be.nextId++, pos: 0, ...st.payload };
        rows.push(row);
        return { data: row, error: null };
      }
      if (st.op === "update") {
        const row = rows.find((r) => r.id === st.filters.id);
        Object.assign(row, st.payload);
        return { data: row, error: null };
      }
      if (st.op === "delete") {
        const i = rows.findIndex((r) => r.id === st.filters.id);
        if (i >= 0) rows.splice(i, 1);
        return { data: null, error: null };
      }
      let out = rows.filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v));
      if (st.orderCol) out = out.slice().sort((a, b) => (a[st.orderCol] || 0) - (b[st.orderCol] || 0) * (st.asc ? 1 : 1));
      if (st.orderCol === "pos" && !st.asc) out.reverse();
      if (st.limitN) out = out.slice(0, st.limitN);
      return { data: out, error: null };
    }
    return self;
  };

  const client = {
    _anon: false,
    auth: {
      getSession: async () => ({ data: { session: client._anon ? { user: { id: "me" } } : null } }),
      signInAnonymously: async () => {
        if (globalThis.__anonDisabled) return { data: null, error: { message: "Anonymous sign-ins are disabled" } };
        client._anon = true; return { data: { user: { id: "me" } }, error: null };
      },
    },
    from: (t) => builder(t),
    rpc: async (name, args) => {
      be.calls.push({ rpc: name, args });
      if (name === "team_create") {
        be.teams[args.p_name] = { id: "team-1", name: args.p_name, captain_name: args.p_captain, settings: {}, created_at: new Date().toISOString() };
        return { data: { ...be.teams[args.p_name], role: "captain" }, error: null };
      }
      if (name === "team_login") {
        const t = be.teams[args.p_name];
        if (!t) return { data: null, error: { message: "NO_TEAM" } };
        return { data: { ...t, role: "player" }, error: null };
      }
      return { data: {}, error: null };
    },
    channel(name) {
      const ch = { name, handlers: [], subscribed: false,
        on(type, filter, cb) { this.handlers.push({ filter, cb }); return this; },
        subscribe(cb) { this.subscribed = true; be.channels.push(this); if (cb) setTimeout(() => cb("SUBSCRIBED"), 0); return this; } };
      return ch;
    },
    removeChannel() {},
    storage: { from: () => ({ upload: async () => ({ error: null }), list: async () => ({ data: [], error: null }), createSignedUrl: async () => ({ data: { signedUrl: "u" } }) }) },
  };
  return client;
}

/* ---------------- подмена окружения браузера ---------------- */
function installEnv(config) {
  const be = makeBackend();
  const client = makeClient(be);
  const ls = new Map();
  global.window = {
    SUPABASE_CONFIG: config,
    supabase: { createClient: () => client },
    crypto: globalThis.crypto,
    addEventListener() {},
    scrollTo() {},
  };
  global.localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: (k) => ls.delete(k),
  };
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  for (const k of ["PlaybookDB"]) delete global[k];
  const path = resolve(ROOT, "db.js");
  delete require.cache[require.resolve(path)];
  require(path);
  return { be, client, DB: global.window.PlaybookDB };
}

async function main() {
  /* 1. Конфигурация: плейсхолдер "xxxx" не считается подключением */
  {
    const { DB } = installEnv({ url: "https://xxxx.supabase.co", anonKey: "PASTE_ANON_KEY_HERE" });
    check("config: заглушка из примера не включает облако", DB.cloudConfig() === null);
    await DB.init();
    check("config: без ключей режим local", DB.mode() === "local");
  }

  /* 2. С реальными ключами — облако и анонимная сессия */
  const { be, client, DB } = installEnv({ url: "https://demo.supabase.co", anonKey: "anon-key" });
  await DB.init();
  check("cloud: адаптер переключился на облако", DB.mode() === "cloud");
  check("cloud: выполнен анонимный вход", client._anon === true);

  await DB.createTeam({ name: "Alpha", pin: "1234", captain: "Макс", captainPin: "9876" });
  check("cloud: команда создана, роль captain", DB.isCaptain() && DB.team.name === "Alpha");
  check("cloud: подписки realtime на 6 таблиц", be.channels.filter((c) => c.subscribed).length === 6,
    `каналов: ${be.channels.length}`);

  /* 3. Порядок новых строк: 1, 2, 3 (главный фикс) */
  const t1 = await DB.save("tactics", { name: "A", side: "T" });
  const t2 = await DB.save("tactics", { name: "B", side: "T" });
  const t3 = await DB.save("tactics", { name: "C", side: "T" });
  check("pos: новые тактики получают 1,2,3, а не 0,0,0",
    t1.pos === 1 && t2.pos === 2 && t3.pos === 3, `pos=${t1.pos},${t2.pos},${t3.pos}`);
  check("pos: список у игрока в том же порядке, что у капитана",
    DB.cache.tactics.map((t) => t.name).join("") === "ABC", DB.cache.tactics.map((t) => t.name).join(","));

  /* 4. Дубликат (в копии остался pos оригинала) уходит в конец, не ломая порядок */
  const dup = await DB.save("tactics", { name: "A 2", side: "T", pos: t1.pos });
  check("pos: дубликат встаёт в конец списка", dup.pos === 4, `pos=${dup.pos}`);

  /* 5. Обновление не трогает pos */
  const upd = await DB.save("tactics", { id: t2.id, name: "B-правка" });
  check("save: правка существующей тактики сохраняет pos", upd.pos === 2, `pos=${upd.pos}`);

  /* 6. reorder задаёт порядок явно */
  await DB.reorder("tactics", [t3.id, t1.id, t2.id]);
  check("reorder: заданный капитаном порядок сохранён",
    DB.cache.tactics.map((t) => t.name).slice(0, 3).join("|") === "C|A|B-правка",
    DB.cache.tactics.map((t) => t.name).join("|"));

  /* 7. Удаление */
  await DB.del("tactics", t1.id);
  check("del: тактика удалена и у игрока", DB.cache.tactics.length === 3 && !DB.cache.tactics.find((t) => t.id === t1.id));

  /* 8. Realtime: приходит событие -> кэш обновляется сам */
  const tacticsChannel = be.channels.find((c) => c.name.includes(":tactics"));
  check("realtime: канал тактик отфильтрован по команде",
    tacticsChannel.handlers[0].filter.filter === "team_id=eq." + DB.team.id,
    tacticsChannel.handlers[0].filter.filter);
  be.rows.tactics.push({ id: "from-player", team_id: DB.team.id, name: "Правка капитана", pos: 9, side: "T" });
  let remoteEvent = null;
  // как в app.js: realtime-событие -> DB.refresh(таблица)
  DB.on((e) => {
    if (e.origin !== "remote") return;
    remoteEvent = e;
    DB.refresh(e.table);
  });
  await tacticsChannel.handlers[0].cb({ eventType: "INSERT" });   // сервер прислал изменение
  await new Promise((r) => setTimeout(r, 20));
  check("realtime: событие от сервера доехало до UI", !!remoteEvent && remoteEvent.table === "tactics");
  check("realtime: капитанская правка уже в кэше игрока",
    !!DB.cache.tactics.find((t) => t.name === "Правка капитана"));

  /* 9. Офлайн: запись запрещена, чтение — из кэша */
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
  DB.online = false;
  let offlineErr = null;
  try { await DB.save("tactics", { name: "Офлайн", side: "T" }); }
  catch (e) { offlineErr = e.message; }
  check("offline: правка не уходит молча в никуда", offlineErr === "Нет соединения", String(offlineErr));
  const before = DB.cache.tactics.length;
  await DB.refresh("tactics");
  check("offline: у игрока остаётся последняя загруженная версия",
    DB.cache.tactics.length === before && before > 0, `было ${before}, стало ${DB.cache.tactics.length}`);
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  DB.online = true;

  /* 10. Выход и повторный вход игроком */
  DB.logout();
  check("logout: сессия очищена", DB.team === null);
  await DB.login({ name: "Alpha", pin: "1234" });
  check("login: игрок вошёл без прав капитана", DB.team.name === "Alpha" && !DB.isCaptain());
  await DB.refresh("tactics");
  check("login: игрок видит тот же список тактик", DB.cache.tactics.length === 4);
  let playerWrite = null;
  try {
    // RLS отклонит попытку игрока — клиент должен показать ошибку, а не «сохранилось»
    be.rows.tactics.push; // no-op
    const errBackend = makeClient(be);
    errBackend.from = () => {
      const b = { select: () => b, eq: () => b, order: () => b, limit: async () => ({ data: [], error: null }),
        insert: () => b, single: async () => ({ data: null, error: { message: "new row violates row-level security policy for table \"tactics\"" } }) };
      return b;
    };
    DB.adapter.client = errBackend;
    await DB.save("tactics", { name: "Игрок не должен", side: "T" });
  } catch (e) { playerWrite = e.message; }
  check("RLS-ошибка доходит до пользователя текстом", !!playerWrite && /row-level security/i.test(playerWrite), String(playerWrite));
  DB.adapter.client = client;

  /* 11. Самопроверка подключения */
  globalThis.__anonDisabled = false;
  be.brokenTable = null;
  const diag = await DB.diagnose();
  const badOnes = diag.filter((r) => !r.ok);
  check("diagnose: подключённая система проходит проверку целиком",
    badOnes.length === 0, badOnes.map((r) => r.name + ": " + r.detail).join(" | "));
  const playerRow = diag.find((r) => r.name === "Права на запись");
  check("diagnose: игроку объясняет, что писать не должен (и не пишет)",
    playerRow && playerRow.ok === true && !be.rows.activity.some((a) => /проверка связи/.test(a.text || "")));

  // капитан: диагностика делает настоящую запись через RLS
  await DB.loginCaptain("9876");
  check("diagnose: после PIN капитана роль повышенa", DB.isCaptain());
  const diagCap = await DB.diagnose();
  const writeRow = diagCap.find((r) => r.name === "Запись правок");
  check("diagnose: проверка записи реально ушла в журнал",
    writeRow && writeRow.ok === true && be.rows.activity.some((a) => /проверка связи/.test(a.text || "")),
    writeRow ? writeRow.detail : "нет пункта");

  be.brokenTable = "tactics";
  const diag2 = await DB.diagnose();
  const tables = diag2.find((r) => r.name === "Таблицы базы");
  check("diagnose: отсутствующая таблица названа по имени и с инструкцией",
    tables && tables.ok === false && /tactics/.test(tables.detail) && /supabase-schema\.sql/.test(tables.fix),
    tables ? tables.detail : "нет пункта");
  be.brokenTable = null;

  globalThis.__anonDisabled = true;
  const { DB: DB2 } = installEnv({ url: "https://demo2.supabase.co", anonKey: "anon-key" });
  await DB2.init();
  globalThis.__anonDisabled = false;
  const diag3 = await DB2.diagnose();
  const conn = diag3.find((r) => r.name === "Подключение к базе");
  check("diagnose: выключенный анонимный вход объяснён понятной подсказкой",
    conn && conn.ok === false && /Anonymous sign-ins/.test(conn.fix), conn ? conn.fix : "нет пункта");
  check("diagnose: при сбое облака приложение осталось работать локально", DB2.mode() === "local");

  const { DB: DB3 } = installEnv(null);
  await DB3.init();
  const diag4 = await DB3.diagnose();
  check("diagnose: без ключей подсказывает, что делать",
    diag4.length === 1 && diag4[0].ok === false && /supabase-config\.js/.test(diag4[0].fix), diag4[0].fix);

  /* 12. Защита от service_role key (секрет нельзя выкладывать в публичный сайт) */
  const jwt = (role) => "h." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".s";
  check("config: anon-ключ распознаётся как безопасный", (() => {
    const { DB: D } = installEnv({ url: "https://demo3.supabase.co", anonKey: jwt("anon") });
    return D.keyRole(jwt("anon")) === "anon" && D.cloudConfig().unsafe === undefined;
  })());

  /* Новый формат ключей Supabase (sb_publishable_… / sb_secret_…) */
  const { DB: DBpub } = installEnv({ url: "https://demo3.supabase.co", anonKey: "sb_publishable_abc123" });
  check("config: новый publishable-ключ принимается", DBpub.cloudConfig().unsafe === undefined);
  await DBpub.init();
  check("config: с publishable-ключом облако включается", DBpub.mode() === "cloud");

  const { be: beSalt, client: clientSalt, DB: DBsalt } = installEnv({ url: "https://demo5.supabase.co", anonKey: "sb_secret_xyz789" });
  check("config: новый секретный sb_secret_ распознан как service_role", DBsalt.cloudConfig().unsafe === true);
  await DBsalt.init();
  check("config: с sb_secret_ облако НЕ включается", DBsalt.mode() === "local" && clientSalt._anon === false);
  check("config: sb_secret_ не уходит в запросы", beSalt.calls.length === 0);
  const diagSec = await DBsalt.diagnose();
  check("config: про sb_secret_ есть понятная подсказка",
    diagSec[0].ok === false && /service_role/.test(diagSec[0].detail) && /publishable/i.test(diagSec[0].fix),
    diagSec[0].detail);

  /* Адрес проекта: адрес дашборда вместо https://проект.supabase.co */
  const { DB: DBbadUrl } = installEnv({ url: "https://supabase.com/dashboard/project/abc", anonKey: "sb_publishable_abc" });
  await DBbadUrl.init();
  const diagUrl = await DBbadUrl.diagnose();
  const urlRow = diagUrl.find((r) => r.name === "Адрес проекта");
  check("diagnose: адрес дашборда вместо Project URL распознан",
    urlRow && urlRow.ok === false && /supabase\.co/.test(urlRow.fix), urlRow ? urlRow.detail : "нет пункта");

  const { be: be4, client: client4, DB: DB4 } = installEnv({ url: "https://demo4.supabase.co", anonKey: jwt("service_role") });
  check("config: service_role key помечен как небезопасный", DB4.cloudConfig().unsafe === true);
  await DB4.init();
  check("service_role: приложение НЕ подключается к базе", DB4.mode() === "local" && client4._anon === false);
  const diag5 = await DB4.diagnose();
  check("service_role: диагностика объясняет, какой ключ нужен",
    diag5[0].ok === false && /service_role/.test(diag5[0].detail) &&
    /publishable/i.test(diag5[0].fix) && /anon public/i.test(diag5[0].fix),
    diag5[0].detail);
  check("service_role: ключ не попадает в запросы", be4.calls.length === 0);

  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });
