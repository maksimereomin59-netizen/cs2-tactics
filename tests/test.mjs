/* Прогон supabase-schema.sql на настоящем Postgres (PGlite):
   схема, RLS, RPC, cross-team изоляция, realtime-публикация. */
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const db = new PGlite({ extensions: { pgcrypto } });
const schema = readFileSync(resolve(ROOT, "supabase-schema.sql"), "utf8");
const stubs = readFileSync(resolve(HERE, "stubs.sql"), "utf8");

let pass = 0, fail = 0;
const results = [];
function check(name, ok, extra = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  ok ? pass++ : fail++;
}

// Выполнить блок от имени конкретного пользователя (как anon/authenticated в Supabase).
async function asUser(uid, role, fn) {
  await db.exec(`set role ${role};`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(uid ? { sub: uid, role } : { role }),
  ]);
  return fn();
}
async function reset() {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claims', '', false)");
}

// Ожидаем ошибку с определённым текстом.
async function expectErr(label, needle, fn) {
  try {
    await fn();
    check(label, false, "ошибки не было");
  } catch (e) {
    const msg = String((e && e.message) || e);
    check(label, msg.includes(needle), msg.slice(0, 120));
  }
}

async function main() {
  // ---------------------------------------------------------------- 0. схема
  try {
    await db.exec(stubs);
    await db.exec(schema);
    check("schema: применяется без ошибок", true);
  } catch (e) {
    check("schema: применяется без ошибок", false, String(e.message).slice(0, 300));
    console.log(results.join("\n"));
    process.exit(1);
  }

  // Supabase выдаёт anon/authenticated полные права на public по умолчанию.
  await db.exec(`
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
    grant all on all tables in schema storage to anon, authenticated;
    grant execute on all functions in schema public to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
    grant execute on all functions in schema storage to anon, authenticated;
  `);

  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";
  const C = "33333333-3333-3333-3333-333333333333";

  // ---------------------------------------------------------------- 1. создание команды
  await db.exec("begin"); // RLS bypass для сидинга ролей не нужен, но держим транзакцию чистой
  await db.exec("commit");

  await asUser(A, "authenticated", async () => {
    const r = await db.query(
      `select team_create('Alpha','1234','Макс','9876') as t`
    );
    const t = r.rows[0].t;
    check("team_create: возвращает команду и роль captain", t && t.role === "captain" && t.name === "Alpha");
    globalThis.teamA = t.id;
  });
  await reset();

  await expectErr("team_create: дубль имени отклонён", "NAME_TAKEN", async () => {
    await asUser(C, "authenticated", () =>
      db.query(`select team_create('alpha','1234','Кто-то','9876')`)
    );
    await reset();
  });
  await reset();

  await expectErr("team_create: короткий PIN отклонён", "BAD_INPUT", async () => {
    await asUser(C, "authenticated", () => db.query(`select team_create('Beta','12','x','9876')`));
    await reset();
  });
  await reset();

  const teamA = globalThis.teamA;

  // ---------------------------------------------------------------- 2. вход игрока
  await asUser(B, "authenticated", async () => {
    const r = await db.query(`select team_login('Alpha','1234') as t`);
    check("team_login: игрок входит и получает role=player", r.rows[0].t.role === "player");
  });
  await reset();

  await expectErr("team_login: неверный PIN", "BAD_PIN", async () => {
    await asUser(C, "authenticated", () => db.query(`select team_login('Alpha','0000')`));
  });
  await reset();

  await expectErr("team_login: нет команды", "NO_TEAM", async () => {
    await asUser(C, "authenticated", () => db.query(`select team_login('Nope','1234')`));
  });
  await reset();

  // ---------------------------------------------------------------- 2.1 пригласительная ссылка: team_info
  await asUser(C, "authenticated", async () => {
    const r = await db.query(`select team_info('${teamA}') as t`);
    check("team_info: посторонний находит команду по uuid для входа по ссылке",
      r.rows[0].t.name === "Alpha" && r.rows[0].t.captain_name === "Макс",
      JSON.stringify(r.rows[0].t));
  });
  await reset();
  await expectErr("team_info: несуществующая команда", "NO_TEAM", async () => {
    await asUser(C, "authenticated", () => db.query(`select team_info('${C}')`));
  });
  await reset();

  // ---------------------------------------------------------------- 3. RLS: чтение игроком
  await db.exec(`insert into players(team_id, name) values ('${teamA}','s1mple')`);
  await asUser(B, "authenticated", async () => {
    const r = await db.query(`select count(*)::int as n from players where team_id = '${teamA}'`);
    check("RLS: игрок читает контент своей команды", r.rows[0].n === 1);
  });
  await reset();

  // ---------------------------------------------------------------- 4. RLS: игрок не пишет
  await asUser(B, "authenticated", async () => {
    await expectErr("RLS: игрок НЕ может создать тактику", "row-level security", () =>
      db.query(`insert into tactics(team_id, name) values ('${teamA}','Игрок не должен')`)
    );
  });
  await reset();

  // ---------------------------------------------------------------- 5. RLS: капитан пишет
  // Тот же алгоритм, что в db.js SupabaseAdapter.save: max(pos)+1 -> insert.
  async function insertLikeClient(name) {
    const last = await db.query(
      `select pos from tactics where team_id = '${teamA}' order by pos desc limit 1`
    );
    const next = (((last.rows[0] || {}).pos) || 0) + 1;
    const r = await db.query(
      `insert into tactics(team_id, name, side, pos) values ('${teamA}','${name}','T',${next}) returning id, pos`
    );
    return r.rows[0];
  }
  await asUser(A, "authenticated", async () => {
    const first = await insertLikeClient("Дефолт");
    check("RLS: капитан создаёт тактику", !!first.id);
    const second = await insertLikeClient("Вторая");
    check("pos: клиентский алгоритм даёт 1, затем 2 (порядок одинаков у всех)",
      first.pos === 1 && second.pos === 2, `pos=${first.pos},${second.pos}`);
    const ordered = await db.query(
      `select name from tactics where team_id = '${teamA}' order by pos asc limit 2`
    );
    check("pos: порядок выборки повторяемый", ordered.rows[0].name === "Дефолт" && ordered.rows[1].name === "Вторая",
      ordered.rows.map((r) => r.name).join(","));
    globalThis.tacticA = first.id;
  });
  await reset();

  // ---------------------------------------------------------------- 6. claim_captain
  await expectErr("claim_captain: неверный PIN капитана", "BAD_PIN", async () => {
    await asUser(B, "authenticated", () => db.query(`select claim_captain('${teamA}','1111')`));
  });
  await reset();

  await asUser(B, "authenticated", async () => {
    const r = await db.query(`select claim_captain('${teamA}','9876') as t`);
    check("claim_captain: повышает до капитана", r.rows[0].t.role === "captain");
    const w = await db.query(
      `insert into tactics(team_id, name, side) values ('${teamA}','Уже капитан','CT') returning id`
    );
    check("RLS: бывший игрок пишет после claim_captain", !!w.rows[0].id);
  });
  await reset();

  // ---------------------------------------------------------------- 7. claim_captain для чужой команды
  await expectErr("claim_captain: чужак не может стать капитаном", "NOT_MEMBER", async () => {
    await asUser(C, "authenticated", () => db.query(`select claim_captain('${teamA}','9876')`));
  });
  await reset();

  // ---------------------------------------------------------------- 8. смена PIN
  await asUser(B, "authenticated", async () => {
    await db.query(`select team_set_pin('${teamA}','team','5555')`);
    check("team_set_pin: капитан меняет PIN команды (guard-триггер не блокирует)", true);
  });
  await reset();

  await asUser(B, "authenticated", async () => {
    const r = await db.query(`select team_login('Alpha','5555') as t`);
    check("team_set_pin: новый PIN работает, старый — нет", r.rows[0].t.role === "captain");
  });
  await reset();

  await expectErr("team_set_pin: новый PIN не принят — старый отклонён", "BAD_PIN", async () => {
    await asUser(C, "authenticated", () => db.query(`select team_login('Alpha','1234')`));
  });
  await reset();

  await expectErr("team_set_pin: игрок менять PIN не может", "DENIED", async () => {
    await asUser(C, "authenticated", async () => {
      await db.query(`select team_create('Gamma','1111','Г','2222')`);
      await db.query(`select team_login('Alpha','5555')`); // станет игроком
      await db.query(`select team_set_pin('${teamA}','team','9999')`);
    });
  });
  await reset();

  // ---------------------------------------------------------------- 9. изоляция команд
  const D = "44444444-4444-4444-4444-444444444444";
  await asUser(D, "authenticated", async () => {
    await db.query(`select team_create('Delta','7777','Дэн','8888')`);
  });
  await reset();

  await asUser(D, "authenticated", async () => {
    const r = await db.query(`select count(*)::int as n from tactics where team_id = '${teamA}'`);
    check("RLS: чужая команда не видит тактики", r.rows[0].n === 0, `видит строк: ${r.rows[0].n}`);
    const p = await db.query(`select count(*)::int as n from players where team_id = '${teamA}'`);
    check("RLS: чужая команда не видит игроков", p.rows[0].n === 0);
    const t = await db.query(`select count(*)::int as n from teams`);
    check("RLS: чужая команда видит только свою команду", t.rows[0].n === 1, `видно команд: ${t.rows[0].n}`);
    const m = await db.query(`select count(*)::int as n from memberships`);
    check("RLS: чужой состав не читается", m.rows[0].n === 1, `видно членств: ${m.rows[0].n}`);
  });
  await reset();

  // ---------------------------------------------------------------- 10. activity + trim
  let activityErr = null;
  try {
    await asUser(A, "authenticated", async () => {
      for (let i = 0; i < 65; i++) {
        await db.query(`insert into activity(team_id, actor, text) values ('${teamA}','Макс','правка ${i}')`);
      }
    });
  } catch (e) { activityErr = String(e.message); }
  await reset();

  const cnt = await db.query(`select count(*)::int as n from activity where team_id='${teamA}'`);
  check("activity: журнал обрезается до 60 записей (триггер trim_activity работает)",
    cnt.rows[0].n === 60,
    activityErr ? `ошибка вставки: ${activityErr.slice(0, 140)}` : `записей: ${cnt.rows[0].n}`);

  // ---------------------------------------------------------------- 11. realtime
  const pub = await db.query(
    `select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename`
  );
  const names = pub.rows.map((r) => r.tablename);
  check("realtime: все 6 таблиц в публикации",
    ["players", "maps", "tactics", "materials", "templates", "activity"].every((t) => names.includes(t)),
    names.join(","));

  // ---------------------------------------------------------------- 12. storage-политики
  const pol = await db.query(
    `select policyname from pg_policies where schemaname='storage' order by policyname`
  );
  check("storage: политики для team-files созданы", pol.rows.length === 3, pol.rows.map((r) => r.policyname).join(","));

  // ---------------------------------------------------------------- 13. membership role игрока не подделывается
  await asUser(B, "authenticated", async () => {
    const r = await db.query(`select role from memberships where team_id='${teamA}'`);
    check("min: членство доступно для чтения своему пользователю", r.rows.length === 1);
  });
  await reset();

  // ---------------------------------------------------------------- 14. pgcrypto в схеме extensions — раскладка Supabase
  // Регрессия: раньше RPC искали crypt() только в public, и живой Supabase
  // отвечал «function crypt(text, text) does not exist» на входе в команду.
  {
    const db2 = new PGlite({ extensions: { pgcrypto } });
    let ok = true, detail = "";
    try {
      await db2.exec(stubs);
      await db2.exec(`
        create extension if not exists pgcrypto;
        create schema if not exists extensions;
        alter function public.crypt(text, text) set schema extensions;
        alter function public.gen_salt(text) set schema extensions;
      `);
      await db2.exec(schema);
      await db2.exec(`
        grant all on all tables in schema public to anon, authenticated;
        grant execute on all functions in schema public to anon, authenticated;
      `);
      await db2.exec(`select set_config('request.jwt.claims', '{"sub":"${A}","role":"authenticated"}', false);`);
      await db2.exec(`set role authenticated;`);
      const r1 = await db2.query(`select team_create('Cloud','1234','Кап','9876') as t`);
      const t = r1.rows[0].t;
      const r2 = await db2.query(`select team_login('Cloud','1234') as t`);
      await db2.query(`select team_set_pin('${t.id}','team','4321')`);
      const r4 = await db2.query(`select team_login('Cloud','4321') as t`);
      ok = t.role === "captain" && r2.rows[0].t.role === "captain" && r4.rows[0].t.role === "captain";
      if (!ok) detail = "роли/PIN не сошлись";
    } catch (e) {
      ok = false;
      detail = String(e.message).slice(0, 200);
    }
    check("schema: crypt/gen_salt работают, когда pgcrypto в схеме extensions (как в Supabase)", ok, detail);
  }

  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });
