/* ============================================================
   PlaybookSeed — стартовый набор новой команды.
   Переносит базовый контент (Mirage / Ancient / Dust 2, состав,
   позиции, гранаты, планы) из data.js в новую модель данных.
   ============================================================ */
(function () {
  "use strict";

  function uid(prefix) {
    return (prefix || "x") + Math.random().toString(36).slice(2, 10);
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

  async function seedTeam(teamId) {
    const DB = (typeof window !== "undefined" ? window.PlaybookDB : null) || global.PlaybookDB;
    const BASE = (typeof window !== "undefined" ? window.TACTICS_BASE : null) || global.TACTICS_BASE;
    if (!DB || !BASE) throw new Error("NO_SEED_SOURCE");

    // ---------- игроки (идемпотентно: не дублируем если уже 5 игроков есть) ----------
    const existingPlayers = await DB.adapter.list("players", teamId).catch(() => []);
    const existingMaps = await DB.adapter.list("maps", teamId).catch(() => []);
    const existingMapsByName = {};
    existingMaps.forEach((m) => { existingMapsByName[String(m.name).toLowerCase()] = m; });
    const playerIdMap = {};
    // Если в команде уже есть игроки — используем их, не создаём дубликаты
    if (existingPlayers.length >= 5) {
      // Сопоставляем по порядку (первый игрок базы -> первый игрок команды и т.д.)
      BASE.players.forEach((p, i) => {
        const found = existingPlayers[i];
        if (found) playerIdMap[p.id] = found.id;
      });
    } else {
      for (const p of BASE.players) {
        const positions = [];
        Object.keys(BASE.maps).forEach((mapId) => {
          const map = BASE.maps[mapId];
          ["T", "CT"].forEach((side) => {
            (map.sides[side].defaults || []).forEach((d) => {
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
      // Перечитаем игроков если создавали
      if (!existingPlayers.length) {
        const fresh = await DB.adapter.list("players", teamId).catch(() => []);
        // Если создавали частично — дополним мапу для недостающих
        fresh.forEach((fp, idx) => {
          // уже заполнено выше
        });
      }
    }

    // ---------- карты ----------
    const mapIdMap = {};
    const defaultPhoto = "assets/kabany-hero.jpg";
    for (const mapId of Object.keys(BASE.maps)) {
      const map = BASE.maps[mapId];
      const low = String(map.name).toLowerCase();
      if (existingMapsByName[low]) { mapIdMap[mapId] = existingMapsByName[low].id; continue; }
      let row;
      try { row = await DB.adapter.save("maps", teamId, { name: map.name, image: map.image, photo: defaultPhoto }); }
      catch (e) {
        const msg = String((e && e.message) || e);
        if (msg.indexOf("photo") >= 0) row = await DB.adapter.save("maps", teamId, { name: map.name, image: map.image });
        else throw e;
      }
      mapIdMap[mapId] = row.id;
    }

    // ---------- тактики: дефолт + раскидки на каждую сторону (идемпотентно) ----------
    const existingTactics = await DB.adapter.list("tactics", teamId).catch(() => []);
    const hasTactic = (mid, name) => existingTactics.some((t) => String(t.map_id) === String(mid) && String(t.name) === name);
    for (const mapId of Object.keys(BASE.maps)) {
      const map = BASE.maps[mapId];
      const mid = mapIdMap[mapId];
      for (const side of ["T", "CT"]) {
        const sideData = map.sides[side];
        const defaults = sideData.defaults || [];
        const blocks = [];

        // Состав: где каждый игрок начинает раунд
        blocks.push({
          id: uid("b"), type: "roster", title: "Состав",
          items: defaults.map((d) => ({
            id: uid("i"), playerId: playerIdMap[d.player] || null, note: zoneName(map, d.zone),
          })),
        });

        // Задачи игроков + что это за точка (описание зоны из базовой карты)
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

        // Схема: стартовые позиции (комментарий капитана = note маркера)
        blocks.push({
          id: uid("b"), type: "board", title: "Схема",
          markers: defaults.map((d) => {
            const z = zoneById(map, d.zone) || { x: 50, y: 50 };
            // note — короткая подпись на схеме; длинный текст задачи живёт в блоке «Задачи»
            return {
              id: uid("m"), kind: "player", playerId: playerIdMap[d.player] || null,
              label: "", color: "", x: z.x + (d.dx || 0), y: z.y + (d.dy || 0),
              note: "",
            };
          }),
          drawings: (sideData.drawings || []).map((dr) => Object.assign({ id: uid("d") }, dr)),
          markerStyle: sideData.markerStyle || "number",
          view: null,
        });

        // Видео: блок есть сразу, ссылки добавляет капитан
        blocks.push({ id: uid("b"), type: "video", title: "Видео", items: [] });

        if (!hasTactic(mid, side === "T" ? "Дефолт T" : "Дефолт CT")) await DB.adapter.save("tactics", teamId, {
          map_id: mid,
          name: side === "T" ? "Дефолт T" : "Дефолт CT",
          side, category: "Default",
          description: (sideData.plan || []).join("\n"),
          blocks,
        });

        // Раскидки стороны: список гранат + схема бросков
        const nades = sideData.nades || [];
        if (nades.length) {
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
          if (!hasTactic(mid, side === "T" ? "Раскидки T" : "Раскидки CT")) await DB.adapter.save("tactics", teamId, {
            map_id: mid,
            name: side === "T" ? "Раскидки T" : "Раскидки CT",
            side, category: "Utility",
            description: "",
            blocks: [
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
            ],
          });
        }
      }
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

  const api = { seedTeam };
  if (typeof window !== "undefined") window.PlaybookSeed = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
