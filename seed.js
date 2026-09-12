/* ============================================================
   PlaybookSeed — стартовый набор команды.
   Переносит базовый контент (карты, состав, позиции, гранаты,
   планы) из data.js в модель данных приложения. Идемпотентно:
   повторный вызов не дублирует тактики и карты.
   Отдельно отдаёт «дефолтную схему» карты/стороны — её можно
   вернуть в редакторе, если схему перерисовали или потеряли.
   ============================================================ */
(function () {
  "use strict";

  function uid(prefix) {
    return (prefix || "x") + Math.random().toString(36).slice(2, 10);
  }
  function base() {
    return (typeof window !== "undefined" ? window.TACTICS_BASE : null) || global.TACTICS_BASE;
  }
  function db() {
    return (typeof window !== "undefined" ? window.PlaybookDB : null) || global.PlaybookDB;
  }
  function zoneById(map, zoneId) {
    return (map.zones || []).filter((z) => z.id === zoneId)[0] || null;
  }
  function zoneName(map, zoneId) {
    const z = zoneById(map, zoneId);
    return z ? z.name : "";
  }
  /** Цвет гранаты на схеме — совпадает с палитрой доски. */
  const NADE_COLOR = { smoke: "#9fb0c0", molly: "#ff7a59", flash: "#ffd166", he: "#c3ced9", bomb: "#f0b429" };
  /** Точки одного происхождения чуть разносим, чтобы гранаты не слипались в одну. */
  function scatter(index) {
    const ring = Math.floor(index / 4);
    if (!ring) return { dx: 0, dy: 0 };
    const a = ((index % 4) / 4) * Math.PI * 2 + ring * 0.6;
    return { dx: Math.cos(a) * 3.4 * ring, dy: Math.sin(a) * 3.4 * ring };
  }
  function mapKeyByName(name) {
    const BASE = base();
    if (!BASE) return null;
    const keys = Object.keys(BASE.maps);
    for (let i = 0; i < keys.length; i++) {
      if (String(BASE.maps[keys[i]].name).toLowerCase() === String(name || "").toLowerCase()) return keys[i];
    }
    return null;
  }
  /** Сопоставление базовых p1…p5 игрокам команды по порядку состава. */
  function playerMap(teamPlayers) {
    const BASE = base();
    const m = {};
    if (!BASE) return m;
    BASE.players.forEach((p, i) => { if (teamPlayers[i]) m[p.id] = teamPlayers[i].id; });
    return m;
  }

  /** Дефолтная схема стороны: стартовые токены + рисунки из базовой карты. */
  function boardFor(mapKey, side, playerIdMap) {
    const BASE = base();
    const map = BASE && BASE.maps[mapKey];
    const sd = map && map.sides[side];
    if (!sd) return null;
    return {
      markers: (sd.defaults || []).map((d) => {
        const z = zoneById(map, d.zone) || { x: 50, y: 50 };
        return {
          id: uid("m"), kind: "player", playerId: playerIdMap[d.player] || null,
          label: "", color: "", x: z.x + (d.dx || 0), y: z.y + (d.dy || 0), note: "",
        };
      }),
      drawings: (sd.drawings || []).map((dr) => Object.assign({ id: uid("d") }, dr)),
      markerStyle: sd.markerStyle || "number",
      view: null,
    };
  }

  /* ---------- блоки тактики стороны (состав, задачи, схема, видео) ---------- */
  function sideTacticBlocks(mapKey, side, playerIdMap, withBoard) {
    const map = base().maps[mapKey];
    const sideData = map.sides[side];
    const defaults = sideData.defaults || [];
    const blocks = [];
    blocks.push({
      id: uid("b"), type: "roster", title: "Состав",
      items: defaults.map((d) => ({
        id: uid("i"), playerId: playerIdMap[d.player] || null, note: zoneName(map, d.zone),
      })),
    });
    blocks.push({
      id: uid("b"), type: "tasks", title: "Задачи",
      items: defaults.map((d) => {
        const z = zoneById(map, d.zone);
        return {
          id: uid("i"), playerId: playerIdMap[d.player] || null, role: "",
          task: d.note || "", note: (z && z.desc) || "",
        };
      }),
    });
    if (withBoard) {
      const b = boardFor(mapKey, side, playerIdMap);
      blocks.push(Object.assign({ id: uid("b"), type: "board", title: "Схема" }, b));
    }
    blocks.push({ id: uid("b"), type: "video", title: "Видео", items: [] });
    return blocks;
  }

  /* ---------- раскидки стороны: список гранат + схема бросков ---------- */
  function nadeTacticBlocks(map, side, playerIdMap) {
    const sideData = map.sides[side];
    const nades = sideData.nades || [];
    if (!nades.length) return null;
    const usedFrom = {};
    const nadeMarkers = [];
    const nadeDrawings = [];
    nades.forEach((n) => {
      const from = zoneById(map, n.from);
      const to = zoneById(map, n.to);
      if (!from) return;
      const idx = usedFrom[from.id] = (usedFrom[from.id] || 0);
      usedFrom[from.id] += 1;
      const off = scatter(idx);
      const x = from.x + off.dx + (n.dx || 0);
      const y = from.y + off.dy + (n.dy || 0);
      const color = NADE_COLOR[n.type] || NADE_COLOR.bomb;
      nadeMarkers.push({
        id: uid("m"), kind: n.type || "smoke", playerId: playerIdMap[n.by] || null,
        label: "", color, x, y, note: "",
      });
      if (to) {
        nadeDrawings.push({
          id: uid("d"), type: "arrow", playerId: playerIdMap[n.by] || null,
          x1: x, y1: y, x2: to.x, y2: to.y, color, w: 2, dash: true, label: "",
        });
      }
    });
    return [
      {
        id: uid("b"), type: "grenades", title: "Гранаты",
        items: nades.map((n) => ({
          id: uid("i"), kind: n.type, name: n.name,
          by: playerIdMap[n.by] || null,
          from: zoneName(map, n.from), to: zoneName(map, n.to),
          steps: (n.steps || []).slice(), note: n.note || "",
        })),
      },
      {
        id: uid("b"), type: "board", title: "Схема",
        markers: nadeMarkers, drawings: nadeDrawings,
        markerStyle: sideData.markerStyle || "number", view: null,
      },
      { id: uid("b"), type: "video", title: "Видео", items: [] },
    ];
  }

  /* ---------- игроки: создать пятёрку, если состав пуст/неполон ---------- */
  async function ensurePlayers(teamId) {
    const DB = db(), BASE = base();
    const existing = await DB.adapter.list("players", teamId).catch(() => []);
    const playerIdMap = {};
    if (existing.length >= BASE.players.length) {
      BASE.players.forEach((p, i) => { if (existing[i]) playerIdMap[p.id] = existing[i].id; });
      return { players: existing, playerIdMap, created: false };
    }
    if (existing.length) {
      // состав есть, но меньше базового — не плодим дубли, маппим что есть
      BASE.players.forEach((p, i) => { if (existing[i]) playerIdMap[p.id] = existing[i].id; });
      return { players: existing, playerIdMap, created: false };
    }
    for (const p of BASE.players) {
      const positions = [];
      Object.keys(BASE.maps).forEach((mapId) => {
        const map = BASE.maps[mapId];
        ["T", "CT"].forEach((side) => {
          ((map.sides[side] || {}).defaults || []).forEach((d) => {
            if (d.player === p.id) {
              const zn = zoneName(map, d.zone);
              if (zn && positions.indexOf(zn) < 0 && positions.length < 5) positions.push(zn);
            }
          });
        });
      });
      const row = await DB.adapter.save("players", teamId, {
        name: p.nick, role: p.role || "", positions,
        color: p.color || "#f0b429",
        notes: (p.tips || []).join("\n"),
      });
      playerIdMap[p.id] = row.id;
    }
    const fresh = await DB.adapter.list("players", teamId).catch(() => []);
    return { players: fresh, playerIdMap, created: true };
  }

  /* ---------- карта: создать строку, если такой карты ещё нет ---------- */
  async function ensureMap(teamId, mapKey, defaultPhoto) {
    const DB = db(), BASE = base();
    const map = BASE.maps[mapKey];
    const existing = await DB.adapter.list("maps", teamId).catch(() => []);
    const found = existing.filter((m) => String(m.name).toLowerCase() === String(map.name).toLowerCase())[0];
    if (found) return found;
    try {
      return await DB.adapter.save("maps", teamId, { name: map.name, image: map.image, photo: defaultPhoto || "assets/kabany-hero.jpg" });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (msg.indexOf("photo") >= 0) return await DB.adapter.save("maps", teamId, { name: map.name, image: map.image });
      throw e;
    }
  }

  /** Дефолтные тактики одной карты (идемпотентно по имени тактики). */
  async function seedMapTactics(teamId, mapKey, playerIdMap) {
    const DB = db(), BASE = base();
    const map = BASE.maps[mapKey];
    const mid = (await ensureMap(teamId, mapKey)).id;
    const existing = await DB.adapter.list("tactics", teamId).catch(() => []);
    const hasTactic = (name) => existing.some((t) => String(t.map_id) === String(mid) && String(t.name) === name);
    let added = 0;
    for (const side of ["T", "CT"]) {
      const sd = map.sides[side];
      if (!sd) continue;
      const nameDef = side === "T" ? "Дефолт T" : "Дефолт CT";
      if (!hasTactic(nameDef)) {
        await DB.adapter.save("tactics", teamId, {
          map_id: mid, name: nameDef, side, category: "Default",
          description: (sd.plan || []).join("\n"),
          blocks: sideTacticBlocks(mapKey, side, playerIdMap, true),
        });
        added++;
      }
      const nameNade = side === "T" ? "Раскидки T" : "Раскидки CT";
      const nadeBlocks = nadeTacticBlocks(map, side, playerIdMap);
      if (nadeBlocks && !hasTactic(nameNade)) {
        await DB.adapter.save("tactics", teamId, {
          map_id: mid, name: nameNade, side, category: "Utility",
          description: "", blocks: nadeBlocks,
        });
        added++;
      }
    }
    return { mapId: mid, added };
  }

  /** Дефолты одной карты по имени или ключу; вернёт {added, mapKey}. */
  async function seedMap(teamId, mapKeyOrName) {
    const BASE = base();
    let key = BASE.maps[mapKeyOrName] ? mapKeyOrName : mapKeyByName(mapKeyOrName);
    if (!key) return { added: 0, mapKey: null };
    const { playerIdMap } = await ensurePlayers(teamId);
    const res = await seedMapTactics(teamId, key, playerIdMap);
    return { added: res.added, mapKey: key, mapId: res.mapId };
  }

  async function seedTeam(teamId) {
    const DB = db(), BASE = base();
    if (!DB || !BASE) throw new Error("NO_SEED_SOURCE");

    const { playerIdMap } = await ensurePlayers(teamId);

    // ---------- карты + тактики: дефолт + раскидки на каждую сторону ----------
    for (const mapKey of Object.keys(BASE.maps)) {
      await seedMapTactics(teamId, mapKey, playerIdMap);
    }

    // ---------- материалы: экономика ----------
    if ((BASE.eco || []).length) {
      await DB.adapter.save("materials", teamId, {
        map_id: null, type: "note", title: "Экономика команды", url: "",
        description: BASE.eco.map((e) => e.name + " — " + e.when + ": " + e.what).join("\n"),
      });
    }

    // ---------- шаблон тактики ----------
    await DB.adapter.save("templates", teamId, {
      name: "Стандартная тактика",
      blocks: [
        { id: uid("b"), type: "roster", title: "Состав", items: [] },
        { id: uid("b"), type: "tasks", title: "Задачи", items: [] },
        { id: uid("b"), type: "grenades", title: "Гранаты", items: [] },
        { id: uid("b"), type: "board", title: "Схема", markers: [], drawings: [], markerStyle: "number", view: null },
        { id: uid("b"), type: "video", title: "Видео", items: [] },
        { id: uid("b"), type: "note", title: "Заметки", items: [] },
      ],
    });

    await DB.adapter.log(teamId, "", "Команда создана, стартовый набор загружен", null);
  }

  const api = { seedTeam, seedMap, boardFor, playerMap, mapKeyByName };
  if (typeof window !== "undefined") window.PlaybookSeed = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
