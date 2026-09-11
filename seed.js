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
  function zoneName(map, zoneId) {
    const z = (map.zones || []).find((x) => x.id === zoneId);
    return z ? z.name : "";
  }

  async function seedTeam(teamId) {
    const DB = (typeof window !== "undefined" ? window.PlaybookDB : null) || global.PlaybookDB;
    const BASE = (typeof window !== "undefined" ? window.TACTICS_BASE : null) || global.TACTICS_BASE;
    if (!DB || !BASE) throw new Error("NO_SEED_SOURCE");

    // ---------- игроки ----------
    const playerIdMap = {};
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
        color: p.color || "#e8a72f",
        notes: (p.tips || []).join("\n"),
      });
      playerIdMap[p.id] = row.id;
    }

    // ---------- карты ----------
    const mapIdMap = {};
    for (const mapId of Object.keys(BASE.maps)) {
      const map = BASE.maps[mapId];
      const row = await DB.adapter.save("maps", teamId, { name: map.name, image: map.image });
      mapIdMap[mapId] = row.id;
    }

    // ---------- тактики: Default + Раскидка на каждую сторону ----------
    for (const mapId of Object.keys(BASE.maps)) {
      const map = BASE.maps[mapId];
      for (const side of ["T", "CT"]) {
        const sideData = map.sides[side];
        const blocks = [];
        // Состав
        blocks.push({
          id: uid("b"), type: "roster", title: "Состав",
          items: (sideData.defaults || []).map((d) => ({
            id: uid("i"), playerId: playerIdMap[d.player] || null, note: zoneName(map, d.zone),
          })),
        });
        // Задачи = точки игроков
        blocks.push({
          id: uid("b"), type: "tasks", title: "Задачи",
          items: (sideData.defaults || []).map((d) => ({
            id: uid("i"), playerId: playerIdMap[d.player] || null, role: "", task: d.note || "", note: "",
          })),
        });
        // Схема: маркеры из стартовых позиций
        blocks.push({
          id: uid("b"), type: "board", title: "Схема",
          markers: (sideData.defaults || []).map((d) => {
            const z = (map.zones || []).find((x) => x.id === d.zone) || { x: 50, y: 50 };
            return { id: uid("m"), kind: "player", playerId: playerIdMap[d.player] || null, label: "", color: "", x: z.x + (d.dx || 0), y: z.y + (d.dy || 0), note: d.note || "" };
          }),
          drawings: (sideData.drawings || []).map((dr) => Object.assign({ id: uid("d") }, dr)),
          markerStyle: sideData.markerStyle || "number",
        });
        await DB.adapter.save("tactics", teamId, {
          map_id: mapIdMap[mapId],
          name: side === "T" ? "Default T" : "Default CT",
          side, category: "Default",
          description: (sideData.plan || []).join("\n"),
          blocks,
        });
        // Раскидки стороны
        if ((sideData.nades || []).length) {
          await DB.adapter.save("tactics", teamId, {
            map_id: mapIdMap[mapId],
            name: side === "T" ? "Раскидки T" : "Раскидки CT",
            side, category: "Utility",
            description: "",
            blocks: [{
              id: uid("b"), type: "grenades", title: "Гранаты",
              items: (sideData.nades || []).map((n) => ({
                id: uid("i"), kind: n.type, name: n.name,
                by: playerIdMap[n.by] || null,
                from: zoneName(map, n.from), to: zoneName(map, n.to),
                steps: (n.steps || []).slice(), note: n.note || "",
              })),
            }],
          });
        }
      }
    }

    // ---------- материал: экономика ----------
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
        { id: uid("b"), type: "board", title: "Схема", markers: [], drawings: [], markerStyle: "number" },
        { id: uid("b"), type: "note", title: "Заметки", items: [] },
      ],
    });

    await DB.adapter.log(teamId, "", "Команда создана, стартовый набор загружен", null);
  }

  const api = { seedTeam };
  if (typeof window !== "undefined") window.PlaybookSeed = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
