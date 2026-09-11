/* CS2 Tactical Playbook */
(function () {
  "use strict";

  const LS_KEY = "cs2-playbook-v1";
  const LOCK_KEY = "cs2-captain-lock-v1";
  const BASE = window.TACTICS_BASE;
  const COLORS = ["#e6a72e", "#ef5d5d", "#5da9ff", "#48cf8b", "#b984ff", "#f2f4f7"];
  const NADE_ICON = { smoke: "●", molly: "◆", flash: "✦" };
  const NADE_NAME = { smoke: "смоук", molly: "молик", flash: "флеш" };

  let data = load();
  let editMode = false;
  let svgSerial = 0;
  let toastTimer = null;
  let timerInt = null;
  let timerLeft = 40;
  let ui = {
    map: null,
    side: "T",
    tab: "board",
    player: null,
    nade: null,
    zone: null,
    drawTool: "select",
    drawColor: COLORS[0],
    selected: null,
  };

  /* ---------- data ---------- */
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeData(value) {
    const next = value && value.players && value.maps ? value : clone(BASE);
    next.version = BASE.version;
    next.meta = next.meta || clone(BASE.meta);
    next.players = next.players || clone(BASE.players);
    next.eco = next.eco || clone(BASE.eco);
    Object.keys(BASE.maps).forEach((mapId) => {
      if (!next.maps[mapId]) next.maps[mapId] = clone(BASE.maps[mapId]);
      const map = next.maps[mapId];
      map.image = BASE.maps[mapId].image;
      map.zones = map.zones || clone(BASE.maps[mapId].zones);
      map.links = map.links || clone(BASE.maps[mapId].links);
      map.sides = map.sides || clone(BASE.maps[mapId].sides);
      ["T", "CT"].forEach((side) => {
        if (!map.sides[side]) map.sides[side] = clone(BASE.maps[mapId].sides[side]);
        const sideData = map.sides[side];
        if (!Array.isArray(sideData.drawings)) sideData.drawings = [];
        if (!sideData.markerStyle) sideData.markerStyle = "number";
        sideData.defaults = sideData.defaults || [];
        sideData.nades = sideData.nades || [];
        sideData.plan = sideData.plan || [];
      });
    });
    const orderedMaps = {};
    Object.keys(BASE.maps).forEach((mapId) => { orderedMaps[mapId] = next.maps[mapId]; });
    Object.keys(next.maps).forEach((mapId) => { if (!orderedMaps[mapId]) orderedMaps[mapId] = next.maps[mapId]; });
    next.maps = orderedMaps;
    return next;
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return normalizeData(JSON.parse(raw));
    } catch (error) {}
    return normalizeData(clone(BASE));
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (error) {}
  }

  function resetData() {
    if (!editMode) return;
    if (!confirm("Сбросить все позиции, линии и тексты к базовой версии?")) return;
    localStorage.removeItem(LS_KEY);
    data = normalizeData(clone(BASE));
    ui.selected = null;
    render();
    toast("Данные плейбука сброшены");
  }

  /* ---------- helpers ---------- */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const attr = esc;
  const playerById = (id) => data.players.find((player) => player.id === id);
  const mapById = (id) => data.maps[id];
  const zoneById = (map, id) => map && map.zones.find((zone) => zone.id === id);
  const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
  const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : COLORS[0];
  const cleanId = (id) => String(id || "item").replace(/[^a-z0-9_-]/gi, "");

  function toast(message) {
    const element = $("#toast");
    if (!element) return;
    clearTimeout(toastTimer);
    element.textContent = message;
    element.hidden = false;
    toastTimer = setTimeout(() => { element.hidden = true; }, 2300);
  }

  function setPath(path, value) {
    const parts = path.split(".");
    let target = data;
    for (let index = 0; index < parts.length - 1; index++) target = target[parts[index]];
    target[parts[parts.length - 1]] = value;
  }

  function closeModal() {
    const modal = $("#modal");
    if (modal) modal.remove();
  }

  /* ---------- radar and overlays ---------- */
  function markersFor(mapId, side) {
    const map = mapById(mapId);
    const defaults = map.sides[side].defaults || [];
    return defaults.map((position, index) => {
      const zone = zoneById(map, position.zone) || { x: 50, y: 50 };
      return {
        player: position.player,
        x: zone.x + (position.dx || 0),
        y: zone.y + (position.dy || 0),
        defaultIndex: index,
      };
    });
  }

  function drawingsFor(mapId, side) {
    const sideData = mapById(mapId).sides[side];
    if (!Array.isArray(sideData.drawings)) sideData.drawings = [];
    return sideData.drawings;
  }

  function renderDrawing(drawing, arrowId, selected) {
    const color = safeColor(drawing.color);
    const classes = "draw-item" + (selected ? " selected" : "");
    const id = attr(drawing.id);

    if (drawing.type === "arrow" || drawing.type === "line") {
      const marker = drawing.type === "arrow" ? ' marker-end="url(#' + arrowId + ')"' : "";
      const coords = ' x1="' + drawing.x1 + '" y1="' + drawing.y1 + '" x2="' + drawing.x2 + '" y2="' + drawing.y2 + '"';
      return '<g class="' + classes + '" data-drawing-id="' + id + '" style="color:' + color + '">' +
        '<line class="move-line hit"' + coords + '/>' +
        '<line class="move-line visible" stroke="' + color + '"' + coords + marker + '/>' +
        '<line class="selection-ring"' + coords + '/></g>';
    }

    if (drawing.type === "pen" && Array.isArray(drawing.points)) {
      const points = drawing.points.map((point) => point[0] + "," + point[1]).join(" ");
      return '<g class="' + classes + '" data-drawing-id="' + id + '" style="color:' + color + '">' +
        '<polyline class="move-line hit" points="' + points + '"/>' +
        '<polyline class="move-line visible" stroke="' + color + '" points="' + points + '"/>' +
        '<polyline class="selection-ring" points="' + points + '"/></g>';
    }

    if (drawing.type === "number") {
      const text = esc(String(drawing.text || "1").slice(0, 3));
      return '<g class="' + classes + ' draw-marker" data-drawing-id="' + id + '" transform="translate(' + drawing.x + ',' + drawing.y + ')" style="color:' + color + '">' +
        '<circle class="tactic-number-bg" r="3.25" stroke="' + color + '"/>' +
        '<circle class="selection-ring" r="4.2"/>' +
        '<text class="tactic-number-text" y=".15" fill="' + color + '">' + text + '</text></g>';
    }

    const label = String(drawing.text || "МЕТКА").slice(0, 24);
    const width = clamp(label.length * 1.9 + 5, 12, 48);
    return '<g class="' + classes + ' draw-marker" data-drawing-id="' + id + '" transform="translate(' + drawing.x + ',' + drawing.y + ')" style="color:' + color + '">' +
      '<rect class="tactic-label-bg" x="' + (-width / 2) + '" y="-2.65" width="' + width + '" height="5.3" rx="1" stroke="' + color + '"/>' +
      '<rect class="selection-ring" x="' + (-width / 2 - 1) + '" y="-3.65" width="' + (width + 2) + '" height="7.3" rx="1"/>' +
      '<text class="tactic-label" y=".1" fill="' + color + '">' + esc(label) + '</text></g>';
  }

  function mapSVG(mapId, options) {
    const opts = options || {};
    const map = mapById(mapId);
    const serial = ++svgSerial;
    const nadeArrowId = "nade-arrow-" + serial;
    const drawings = opts.drawings || [];
    const selected = opts.selected || null;
    const arrowIds = {};

    let defs = '<marker id="' + nadeArrowId + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#dd5a5a"/></marker>';
    drawings.forEach((drawing, index) => {
      if (drawing.type !== "arrow") return;
      const markerId = "move-arrow-" + serial + "-" + cleanId(drawing.id) + "-" + index;
      arrowIds[drawing.id] = markerId;
      defs += '<marker id="' + markerId + '" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="' + safeColor(drawing.color) + '"/></marker>';
    });

    let svg = '<svg class="map tactical-map' + (opts.editor ? " editor-active" : "") + '" viewBox="0 0 100 100" data-map="' + attr(mapId) + '" data-side="' + attr(opts.side || "") + '" data-arrow-id="' + nadeArrowId + '" role="img" aria-label="Тактическая карта ' + attr(map.name) + '">';
    svg += '<defs>' + defs + '</defs>';
    svg += '<rect width="100" height="100" fill="#000"/>';
    svg += '<image class="map-image" href="' + attr(map.image) + '" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>';

    if (opts.zones) {
      map.zones.forEach((zone) => {
        const active = opts.highlightZone === zone.id ? " active" : "";
        svg += '<rect class="call-zone' + active + '" data-zone="' + attr(zone.id) + '" x="' + (zone.x - zone.w / 2) + '" y="' + (zone.y - zone.h / 2) + '" width="' + zone.w + '" height="' + zone.h + '" rx="1"/>';
        svg += '<text class="zlab" x="' + zone.x + '" y="' + (zone.y + zone.h / 2 + 2.7) + '">' + esc(zone.name) + '</text>';
      });
    }

    (opts.arrows || []).forEach((arrow) => {
      svg += '<line class="nade-arrow" x1="' + arrow.fx + '" y1="' + arrow.fy + '" x2="' + arrow.tx + '" y2="' + arrow.ty + '" marker-end="url(#' + nadeArrowId + ')"/>';
      svg += '<circle class="nade-from" cx="' + arrow.fx + '" cy="' + arrow.fy + '" r="2.5"/>';
      svg += '<text class="nade-from-ic" x="' + arrow.fx + '" y="' + (arrow.fy + 1.05) + '">' + (NADE_ICON[arrow.type] || "•") + '</text>';
      svg += '<g class="nade-to"><line x1="' + (arrow.tx - 1.8) + '" y1="' + (arrow.ty - 1.8) + '" x2="' + (arrow.tx + 1.8) + '" y2="' + (arrow.ty + 1.8) + '"/><line x1="' + (arrow.tx - 1.8) + '" y1="' + (arrow.ty + 1.8) + '" x2="' + (arrow.tx + 1.8) + '" y2="' + (arrow.ty - 1.8) + '"/></g>';
    });

    drawings.forEach((drawing) => {
      svg += renderDrawing(drawing, arrowIds[drawing.id], selected === drawing.id);
    });

    const labelStyle = opts.labelStyle || "number";
    (opts.markers || []).forEach((marker) => {
      const player = playerById(marker.player);
      if (!player) return;
      const playerIndex = data.players.indexOf(player);
      const color = safeColor(player.color);
      const classes = "pmk" + (opts.dimOthers && ui.player && marker.player !== ui.player ? " dim" : "") + (opts.focus === marker.player ? " foc" : "");
      svg += '<g class="' + classes + '" data-player="' + attr(marker.player) + '" data-default-index="' + marker.defaultIndex + '" transform="translate(' + marker.x + ',' + marker.y + ')">';
      if (labelStyle === "nick") {
        const nick = String(player.nick || "?").slice(0, 18);
        const width = clamp(nick.length * 1.75 + 5, 12, 36);
        svg += '<rect class="player-tag" x="' + (-width / 2) + '" y="-2.7" width="' + width + '" height="5.4" rx="1" stroke="' + color + '"/>';
        svg += '<text class="player-nick" y=".1" fill="' + color + '">' + esc(nick) + '</text>';
      } else {
        svg += '<circle r="3.25" stroke="' + color + '"/><text class="player-num" y=".1" fill="' + color + '">' + (playerIndex + 1) + '</text>';
      }
      svg += '</g>';
    });

    svg += '<rect class="map-vignette" x=".25" y=".25" width="99.5" height="99.5"/>';
    svg += '</svg>';
    return svg;
  }

  /* ---------- routing ---------- */
  function parseHash() {
    return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  }

  function route() {
    const parts = parseHash();
    ui.nade = null;
    ui.zone = null;
    ui.selected = null;

    if (parts[0] === "map" && parts[1]) {
      if (ui.map !== parts[1]) {
        ui.tab = "board";
        ui.side = "T";
      }
      ui.map = parts[1];
      ui.player = null;
      if (parts[2] === "T" || parts[2] === "CT") ui.side = parts[2];
      renderMapPage();
    } else if (parts[0] === "player" && parts[1]) {
      ui.map = null;
      ui.player = parts[1];
      renderPlayerPage();
    } else if (parts[0] === "bomb" || parts[0] === "timer") {
      ui.map = null;
      ui.player = null;
      renderBombPage();
    } else {
      ui.map = null;
      ui.player = null;
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  /* ---------- home ---------- */
  function renderHome() {
    const view = $("#view");
    let html = '<section class="hero"><p class="eyebrow">TEAM OPERATIONS / ACTIVE PLAYBOOK</p><div class="hero-row"><div><h1 class="ed" data-path="meta.title">' + esc(data.meta.title) + '</h1><p class="ed" data-path="meta.subtitle">' + esc(data.meta.subtitle) + '</p></div></div>' +
      '<div class="hero-meta"><span class="meta-chip">3 ACTIVE MAPS</span><span class="meta-chip">T / CT PLANS</span><span class="meta-chip">CAPTAIN LOCK</span></div></section>';

    html += '<section class="section"><div class="section-head"><h2>Карты / Tactical boards</h2><span class="section-index">01</span></div><div class="mapcards">';
    Object.keys(data.maps).forEach((mapId, index) => {
      const map = data.maps[mapId];
      html += '<a class="mapcard" href="#/map/' + mapId + '/T"><div class="mapcard-thumb"><img src="' + attr(map.image) + '" alt="Радар карты ' + attr(map.name) + '"><span class="mapcard-code">MAP · ' + String(index + 1).padStart(2, "0") + '</span></div><div class="mapcard-info"><span class="mapcard-name">' + esc(map.name) + '</span><span class="mapcard-open">ОТКРЫТЬ →</span></div></a>';
    });
    html += '</div></section>';

    html += '<section class="section"><div class="section-head"><h2>Состав / Roles</h2><span class="section-index">02</span></div><div class="roster">';
    data.players.forEach((player, index) => {
      html += '<a class="chip" style="--pc:' + safeColor(player.color) + '" href="#/player/' + attr(player.id) + '"><span class="chip-n">' + (index + 1) + '</span><span class="chip-t"><b>' + esc(player.nick) + '</b><small>' + esc(player.role) + '</small></span></a>';
    });
    html += '</div></section>';

    html += '<section class="section"><div class="section-head"><h2>Служебные инструменты</h2><span class="section-index">03</span></div><div class="command-grid"><div class="command-note"><b>Режим просмотра</b>Игроки видят карты, позиции и планы. Любые правки и рисование доступны только после входа капитана.</div><div class="utility-row"><a class="utility-btn" href="#/bomb">BOMB TIMER · 40S</a><button class="utility-btn" id="ecoBtn" type="button">ЭКОНОМИКА</button></div></div></section>';

    view.innerHTML = html;
    $("#ecoBtn").onclick = showEco;
    applyEdit();
  }

  function showEco() {
    let html = '<div class="modal" id="modal"><div class="modal-in"><p class="modal-kicker">Reference</p><h3>Экономика команды</h3><table class="eco"><tr><th>Режим</th><th>Когда</th><th>Закуп</th></tr>';
    data.eco.forEach((item) => {
      html += '<tr><td><b>' + esc(item.name) + '</b></td><td>' + esc(item.when) + '</td><td>' + esc(item.what) + '</td></tr>';
    });
    html += '</table><div class="row"><button class="btn ghost" id="mClose" type="button">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#mClose").onclick = closeModal;
    $("#modal").onclick = (event) => { if (event.target.id === "modal") closeModal(); };
  }

  /* ---------- player ---------- */
  function sideTab(side) {
    return '<button class="stab ' + (ui.side === side ? "on" : "") + '" data-side="' + side + '" type="button">' + (side === "T" ? "Атака · T" : "Защита · CT") + '</button>';
  }

  function bindSideTabs() {
    $$(".stab").forEach((button) => {
      button.onclick = () => {
        ui.side = button.dataset.side;
        ui.selected = null;
        if (ui.map) location.hash = "#/map/" + ui.map + "/" + ui.side;
        else renderPlayerPage();
      };
    });
  }

  function renderPlayerPage() {
    const player = playerById(ui.player);
    const view = $("#view");
    if (!player) { location.hash = "#/"; return; }
    const playerIndex = data.players.indexOf(player);
    let html = '<a class="back" href="#/">← Вернуться к штабу</a>';
    html += '<section class="hero phead" style="--pc:' + safeColor(player.color) + '"><span class="pnum">' + (playerIndex + 1) + '</span><div><p class="eyebrow">PLAYER FILE / ' + String(playerIndex + 1).padStart(2, "0") + '</p><h1 class="ed" data-path="players.' + playerIndex + '.nick">' + esc(player.nick) + '</h1><p class="ed" data-path="players.' + playerIndex + '.role">' + esc(player.role) + '</p></div></section>';
    html += '<div class="sidetabs">' + sideTab("T") + sideTab("CT") + '</div>';

    html += '<section class="card"><h2>Постоянные задачи</h2><ul class="tasklist">';
    player.tasks.forEach((task, index) => {
      html += '<li class="ed" data-path="players.' + playerIndex + '.tasks.' + index + '">' + esc(task) + '</li>';
    });
    html += '</ul></section>';

    html += '<section class="card"><h2>Позиции · ' + ui.side + '</h2>';
    Object.keys(data.maps).forEach((mapId) => {
      const map = mapById(mapId);
      const position = map.sides[ui.side].defaults.find((item) => item.player === player.id);
      if (!position) return;
      const positionIndex = map.sides[ui.side].defaults.indexOf(position);
      html += '<div class="minimap"><h3>' + esc(map.name) + '</h3>' + mapSVG(mapId, {
        markers: markersFor(mapId, ui.side),
        side: ui.side,
        focus: player.id,
        dimOthers: true,
        labelStyle: map.sides[ui.side].markerStyle,
      });
      html += '<p class="note"><b>Точка:</b> <span class="ed" data-path="maps.' + mapId + '.sides.' + ui.side + '.defaults.' + positionIndex + '.note">' + esc(position.note) + '</span></p></div>';
    });
    html += '</section>';

    const assigned = [];
    Object.keys(data.maps).forEach((mapId) => {
      ["T", "CT"].forEach((side) => {
        mapById(mapId).sides[side].nades.forEach((nade) => {
          if (nade.by === player.id) assigned.push({ mapId, side, nade });
        });
      });
    });

    html += '<section class="card"><h2>Назначенные гранаты</h2>';
    if (!assigned.length) html += '<p class="muted">Нет назначенных гранат.</p>';
    assigned.forEach((record) => {
      const map = mapById(record.mapId);
      const nadeIndex = map.sides[record.side].nades.indexOf(record.nade);
      const from = zoneById(map, record.nade.from);
      const to = zoneById(map, record.nade.to);
      if (!from || !to) return;
      html += '<details class="nade"><summary><span>' + (NADE_ICON[record.nade.type] || "•") + '</span><b>' + esc(record.nade.name) + '</b><span class="tag">' + esc(map.name) + ' · ' + record.side + '</span></summary>';
      html += mapSVG(record.mapId, { arrows: [{ fx: from.x, fy: from.y, tx: to.x, ty: to.y, type: record.nade.type }] });
      html += '<ol>' + record.nade.steps.map((step, index) => '<li class="ed" data-path="maps.' + record.mapId + '.sides.' + record.side + '.nades.' + nadeIndex + '.steps.' + index + '">' + esc(step) + '</li>').join("") + '</ol>';
      html += '<p class="note"><b>Задача:</b> <span class="ed" data-path="maps.' + record.mapId + '.sides.' + record.side + '.nades.' + nadeIndex + '.note">' + esc(record.nade.note) + '</span></p></details>';
    });
    html += '</section>';

    html += '<section class="card"><h2>Контрольный список</h2><ul class="tasklist tips">';
    player.tips.forEach((tip, index) => {
      html += '<li class="ed" data-path="players.' + playerIndex + '.tips.' + index + '">' + esc(tip) + '</li>';
    });
    html += '</ul></section>';

    view.innerHTML = html;
    bindSideTabs();
    applyEdit();
  }

  /* ---------- map page ---------- */
  function tabButton(tab, label) {
    return '<button class="tab ' + (ui.tab === tab ? "on" : "") + '" data-tab="' + tab + '" type="button">' + label + '</button>';
  }

  function boardToolbar(sideData) {
    const tools = [
      ["select", "Курсор"],
      ["arrow", "Стрелка"],
      ["line", "Линия"],
      ["pen", "Карандаш"],
      ["number", "Метка №"],
      ["text", "Текст / ник"],
    ];
    const selectedDrawing = drawingsFor(ui.map, ui.side).find((drawing) => drawing.id === ui.selected);
    const canEditText = selectedDrawing && (selectedDrawing.type === "text" || selectedDrawing.type === "number");
    let html = '<div class="board-tools"><div class="tool-row"><div class="tool-block"><span class="tool-label">Инструмент</span>';
    tools.forEach((tool) => {
      html += '<button class="tool-btn ' + (ui.drawTool === tool[0] ? "on" : "") + '" data-tool="' + tool[0] + '" type="button">' + tool[1] + '</button>';
    });
    html += '</div><div class="tool-block"><span class="tool-label">Цвет</span>';
    COLORS.forEach((color) => {
      html += '<button class="color-btn ' + (ui.drawColor === color ? "on" : "") + '" data-color="' + color + '" style="--swatch:' + color + '" title="Цвет линии" type="button"></button>';
    });
    html += '</div><div class="tool-block"><span class="tool-label">Объект</span>' +
      '<button class="tool-btn" data-action="marker-style" type="button">Игроки: ' + (sideData.markerStyle === "nick" ? "НИКИ" : "НОМЕРА") + '</button>' +
      '<button class="tool-btn" data-action="rename" type="button" ' + (canEditText ? "" : "disabled") + '>Изменить</button>' +
      '<button class="tool-btn" data-action="delete" type="button" ' + (ui.selected ? "" : "disabled") + '>Удалить</button>' +
      '<button class="tool-btn" data-action="undo" type="button" ' + (sideData.drawings.length ? "" : "disabled") + '>Отменить</button>' +
      '<button class="tool-btn" data-action="clear" type="button" ' + (sideData.drawings.length ? "" : "disabled") + '>Очистить</button></div></div>' +
      '<div class="tool-help">Рисуйте прямо поверх карты. Для перемещения объекта выберите «Курсор». Позиции игроков также перетаскиваются.</div></div>';
    return html;
  }

  function renderMapPage() {
    const map = mapById(ui.map);
    const view = $("#view");
    if (!map) { location.hash = "#/"; return; }
    const sideData = map.sides[ui.side];
    let html = '<a class="back" href="#/">← Все карты</a>';
    html += '<section class="map-page-head"><div><p class="eyebrow">MAP CONTROL / ' + ui.side + ' SIDE</p><h1>' + esc(map.name) + '</h1><p>Позиции · маршруты · исполнение</p></div><div class="map-status"><span>SIDE · ' + ui.side + '</span><span>' + sideData.drawings.length + ' OVERLAYS</span></div></section>';
    html += '<div class="sidetabs">' + sideTab("T") + sideTab("CT") + '</div>';
    html += '<div class="tabs">' + tabButton("board", "Тактическая доска") + tabButton("nades", "Гранаты") + tabButton("calls", "Колл-ауты") + tabButton("plan", "План") + '</div>';

    if (ui.tab === "board") {
      html += '<section class="card board-shell"><div class="board-bar"><span class="board-title">TACTICAL BOARD / ' + esc(map.name.toUpperCase()) + '</span><span class="board-mode">' + (editMode ? "EDIT ACCESS" : "VIEW ONLY") + '</span></div>';
      if (editMode) html += boardToolbar(sideData);
      html += '<div class="map-wrap">' + mapSVG(ui.map, {
        markers: markersFor(ui.map, ui.side),
        drawings: drawingsFor(ui.map, ui.side),
        selected: ui.selected,
        side: ui.side,
        labelStyle: sideData.markerStyle,
        editor: editMode,
      }) + '</div>';
      html += '<div class="board-footer"><p class="board-hint"><b>' + (editMode ? "РЕДАКТИРОВАНИЕ:" : "ПРОСМОТР:") + '</b> ' + (editMode ? "перемещайте игроков, добавляйте номера, ники, линии, стрелки и свободные пометки." : "тактические пометки капитана отображаются поверх официального радара карты.") + '</p><div class="position-grid">';
      sideData.defaults.forEach((position, index) => {
        const player = playerById(position.player);
        const zone = zoneById(map, position.zone);
        html += '<a class="posrow" href="#/player/' + attr(position.player) + '" style="--pc:' + safeColor(player ? player.color : "#888888") + '"><b>' + esc(player ? player.nick : "Не назначен") + '</b><small class="pos-zone">' + esc(zone ? zone.name : position.zone) + '</small><small class="ed" data-path="maps.' + ui.map + '.sides.' + ui.side + '.defaults.' + index + '.note">' + esc(position.note) + '</small></a>';
      });
      html += '</div></div></section>';
    }

    if (ui.tab === "nades") {
      html += '<section class="card"><h2>Гранаты · ' + ui.side + '</h2><p class="muted">Откройте гранату, чтобы увидеть направление броска на радаре.</p>';
      if (editMode) html += '<button class="btn tiny addNade" type="button">Добавить гранату</button>';
      sideData.nades.forEach((nade, index) => {
        const from = zoneById(map, nade.from);
        const to = zoneById(map, nade.to);
        if (!from || !to) return;
        html += '<details class="nade" data-nade="' + index + '" ' + (ui.nade === index ? "open" : "") + '><summary><span>' + (NADE_ICON[nade.type] || "•") + '</span><b class="ed" data-path="maps.' + ui.map + '.sides.' + ui.side + '.nades.' + index + '.name">' + esc(nade.name) + '</b><span class="tag">' + esc(NADE_NAME[nade.type] || nade.type) + (nade.by ? " · " + esc((playerById(nade.by) || {}).nick || "") : "") + '</span>' + (editMode ? '<button class="del" data-del-nade="' + index + '" type="button">Удалить</button>' : "") + '</summary>';
        html += mapSVG(ui.map, { arrows: [{ fx: from.x, fy: from.y, tx: to.x, ty: to.y, type: nade.type }] });
        html += '<ol>' + nade.steps.map((step, stepIndex) => '<li class="ed" data-path="maps.' + ui.map + '.sides.' + ui.side + '.nades.' + index + '.steps.' + stepIndex + '">' + esc(step) + '</li>').join("") + '</ol>';
        html += '<p class="note"><b>Задача:</b> <span class="ed" data-path="maps.' + ui.map + '.sides.' + ui.side + '.nades.' + index + '.note">' + esc(nade.note) + '</span></p></details>';
      });
      html += '</section>';
    }

    if (ui.tab === "calls") {
      html += '<section class="card"><h2>Колл-ауты</h2><p class="muted">Выберите обозначенную зону на радаре.</p>' + mapSVG(ui.map, { zones: true, highlightZone: ui.zone }) + '<div id="zoneInfo">' + (ui.zone ? zoneCard(zoneById(map, ui.zone)) : '<p class="muted">Зона не выбрана.</p>') + '</div></section>';
    }

    if (ui.tab === "plan") {
      html += '<section class="card"><h2>План стороны · ' + ui.side + '</h2><ol class="planlist">';
      sideData.plan.forEach((item, index) => {
        html += '<li class="ed" data-path="maps.' + ui.map + '.sides.' + ui.side + '.plan.' + index + '">' + esc(item) + '</li>';
      });
      html += '</ol></section>';
    }

    view.innerHTML = html;
    bindSideTabs();
    $$(".tabs .tab").forEach((button) => {
      button.onclick = () => {
        ui.tab = button.dataset.tab;
        ui.nade = null;
        ui.zone = null;
        ui.selected = null;
        renderMapPage();
      };
    });
    $$(".nade").forEach((details) => {
      details.addEventListener("toggle", () => { if (details.open) ui.nade = Number(details.dataset.nade); });
    });
    $$("[data-del-nade]").forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!editMode || !confirm("Удалить эту гранату?")) return;
        sideData.nades.splice(Number(button.dataset.delNade), 1);
        save();
        renderMapPage();
      };
    });
    const addButton = $(".addNade");
    if (addButton) addButton.onclick = () => addNade(ui.side);
    const radar = $(".card .tactical-map");
    if (radar && ui.tab === "calls") bindZoneTaps(radar);
    if (radar && ui.tab === "board" && editMode) {
      bindBoardToolbar();
      bindBoardEditor(radar);
    }
    applyEdit();
  }

  function zoneCard(zone) {
    if (!zone) return "";
    return '<div class="zcard"><h3>' + esc(zone.name) + '</h3><p>' + esc(zone.desc || "Нет описания.") + '</p></div>';
  }

  function bindZoneTaps(svg) {
    $$(".call-zone", svg).forEach((zone) => {
      zone.addEventListener("click", () => {
        ui.zone = zone.dataset.zone;
        renderMapPage();
      });
    });
  }

  function addNade(side) {
    if (!editMode) return;
    const map = mapById(ui.map);
    const nade = {
      id: "nade-" + Date.now(),
      type: "smoke",
      name: "Новая граната",
      by: data.players[0].id,
      from: map.zones[0].id,
      to: map.zones[1].id,
      steps: ["Опишите исходную позицию и ориентир"],
      note: "Опишите задачу гранаты",
    };
    map.sides[side].nades.push(nade);
    ui.nade = map.sides[side].nades.length - 1;
    save();
    renderMapPage();
  }

  /* ---------- tactical editor ---------- */
  function newDrawingId() {
    return "draw-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function bindBoardToolbar() {
    $$("[data-tool]").forEach((button) => {
      button.onclick = () => {
        ui.drawTool = button.dataset.tool;
        ui.selected = null;
        renderMapPage();
      };
    });

    $$("[data-color]").forEach((button) => {
      button.onclick = () => {
        ui.drawColor = button.dataset.color;
        const drawing = drawingsFor(ui.map, ui.side).find((item) => item.id === ui.selected);
        if (drawing) {
          drawing.color = ui.drawColor;
          save();
        }
        renderMapPage();
      };
    });

    $$("[data-action]").forEach((button) => {
      button.onclick = () => boardAction(button.dataset.action);
    });
  }

  function boardAction(action) {
    const sideData = mapById(ui.map).sides[ui.side];
    const drawings = drawingsFor(ui.map, ui.side);
    const index = drawings.findIndex((drawing) => drawing.id === ui.selected);

    if (action === "marker-style") {
      sideData.markerStyle = sideData.markerStyle === "nick" ? "number" : "nick";
      save();
      renderMapPage();
      return;
    }
    if (action === "delete" && index >= 0) {
      drawings.splice(index, 1);
      ui.selected = null;
      save();
      renderMapPage();
      return;
    }
    if (action === "rename" && index >= 0) {
      const drawing = drawings[index];
      const message = drawing.type === "number" ? "Введите номер метки (1–99)" : "Введите ник или подпись";
      const value = prompt(message, drawing.text || "");
      if (value == null || !value.trim()) return;
      drawing.text = drawing.type === "number" ? value.trim().slice(0, 3) : value.trim().slice(0, 24);
      save();
      renderMapPage();
      return;
    }
    if (action === "undo" && drawings.length) {
      drawings.pop();
      ui.selected = null;
      save();
      renderMapPage();
      return;
    }
    if (action === "clear" && drawings.length && confirm("Удалить все нарисованные линии и метки на этой стороне?")) {
      sideData.drawings = [];
      ui.selected = null;
      save();
      renderMapPage();
    }
  }

  function bindBoardEditor(svg) {
    svg.addEventListener("pointerdown", (event) => {
      if (!editMode || event.button > 0) return;
      const point = svgPoint(svg, event);
      const drawingElement = event.target.closest("[data-drawing-id]");
      const playerElement = event.target.closest(".pmk");

      if (ui.drawTool === "select") {
        event.preventDefault();
        if (playerElement) {
          ui.selected = null;
          startPlayerDrag(event, svg, playerElement);
        } else if (drawingElement) {
          ui.selected = drawingElement.dataset.drawingId;
          startDrawingDrag(event, svg, drawingElement);
        } else {
          ui.selected = null;
          renderMapPage();
        }
        return;
      }

      if (ui.drawTool === "number" || ui.drawTool === "text") {
        event.preventDefault();
        const question = ui.drawTool === "number" ? "Номер метки (1–99)" : "Ник или короткая подпись";
        const answer = prompt(question, ui.drawTool === "number" ? "1" : "");
        if (answer == null || !answer.trim()) return;
        const drawing = {
          id: newDrawingId(),
          type: ui.drawTool,
          x: Math.round(point.x * 10) / 10,
          y: Math.round(point.y * 10) / 10,
          text: ui.drawTool === "number" ? answer.trim().slice(0, 3) : answer.trim().slice(0, 24),
          color: ui.drawColor,
        };
        drawingsFor(ui.map, ui.side).push(drawing);
        ui.selected = drawing.id;
        save();
        renderMapPage();
        return;
      }

      if (ui.drawTool === "arrow" || ui.drawTool === "line") {
        event.preventDefault();
        startLineDraw(event, svg, point, ui.drawTool);
        return;
      }

      if (ui.drawTool === "pen") {
        event.preventDefault();
        startPenDraw(event, svg, point);
      }
    });
  }

  function startLineDraw(event, svg, start, type) {
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "line");
    preview.setAttribute("class", "preview-line");
    preview.setAttribute("stroke", ui.drawColor);
    preview.setAttribute("x1", start.x);
    preview.setAttribute("y1", start.y);
    preview.setAttribute("x2", start.x);
    preview.setAttribute("y2", start.y);
    svg.appendChild(preview);
    let end = start;

    const move = (moveEvent) => {
      end = svgPoint(svg, moveEvent);
      preview.setAttribute("x2", end.x);
      preview.setAttribute("y2", end.y);
    };
    const up = () => {
      removeWindowDrag(move, up);
      preview.remove();
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      if (distance < 2) return;
      const drawing = {
        id: newDrawingId(), type,
        x1: round1(start.x), y1: round1(start.y), x2: round1(end.x), y2: round1(end.y),
        color: ui.drawColor,
      };
      drawingsFor(ui.map, ui.side).push(drawing);
      ui.selected = drawing.id;
      save();
      renderMapPage();
    };
    addWindowDrag(move, up);
  }

  function startPenDraw(event, svg, start) {
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    preview.setAttribute("class", "preview-line");
    preview.setAttribute("stroke", ui.drawColor);
    svg.appendChild(preview);
    const points = [[round1(start.x), round1(start.y)]];
    preview.setAttribute("points", points[0].join(","));

    const move = (moveEvent) => {
      const point = svgPoint(svg, moveEvent);
      const last = points[points.length - 1];
      if (Math.hypot(point.x - last[0], point.y - last[1]) < .65) return;
      points.push([round1(point.x), round1(point.y)]);
      preview.setAttribute("points", points.map((item) => item.join(",")).join(" "));
    };
    const up = () => {
      removeWindowDrag(move, up);
      preview.remove();
      if (points.length < 2) return;
      const drawing = { id: newDrawingId(), type: "pen", points, color: ui.drawColor };
      drawingsFor(ui.map, ui.side).push(drawing);
      ui.selected = drawing.id;
      save();
      renderMapPage();
    };
    addWindowDrag(move, up);
  }

  function startPlayerDrag(event, svg, element) {
    const map = mapById(ui.map);
    const position = map.sides[ui.side].defaults[Number(element.dataset.defaultIndex)];
    if (!position) return;
    const zone = zoneById(map, position.zone) || { x: 50, y: 50 };
    let finalPoint = { x: zone.x + (position.dx || 0), y: zone.y + (position.dy || 0) };

    const move = (moveEvent) => {
      finalPoint = svgPoint(svg, moveEvent);
      element.setAttribute("transform", "translate(" + finalPoint.x + "," + finalPoint.y + ")");
    };
    const up = () => {
      removeWindowDrag(move, up);
      position.dx = round1(finalPoint.x - zone.x);
      position.dy = round1(finalPoint.y - zone.y);
      save();
      renderMapPage();
    };
    addWindowDrag(move, up);
  }

  function startDrawingDrag(event, svg, element) {
    const drawings = drawingsFor(ui.map, ui.side);
    const drawing = drawings.find((item) => item.id === element.dataset.drawingId);
    if (!drawing) return;
    element.classList.add("selected");
    const start = svgPoint(svg, event);
    const bounds = drawingBounds(drawing);
    let delta = { x: 0, y: 0 };

    const move = (moveEvent) => {
      const point = svgPoint(svg, moveEvent);
      delta.x = clamp(point.x - start.x, -bounds.minX, 100 - bounds.maxX);
      delta.y = clamp(point.y - start.y, -bounds.minY, 100 - bounds.maxY);
      element.setAttribute("transform", "translate(" + delta.x + "," + delta.y + ")");
    };
    const up = () => {
      removeWindowDrag(move, up);
      shiftDrawing(drawing, delta.x, delta.y);
      save();
      renderMapPage();
    };
    addWindowDrag(move, up);
  }

  function drawingBounds(drawing) {
    if (drawing.type === "arrow" || drawing.type === "line") {
      return { minX: Math.min(drawing.x1, drawing.x2), maxX: Math.max(drawing.x1, drawing.x2), minY: Math.min(drawing.y1, drawing.y2), maxY: Math.max(drawing.y1, drawing.y2) };
    }
    if (drawing.type === "pen" && drawing.points.length) {
      const xs = drawing.points.map((point) => point[0]);
      const ys = drawing.points.map((point) => point[1]);
      return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
    }
    return { minX: drawing.x, maxX: drawing.x, minY: drawing.y, maxY: drawing.y };
  }

  function shiftDrawing(drawing, dx, dy) {
    if (drawing.type === "arrow" || drawing.type === "line") {
      drawing.x1 = round1(drawing.x1 + dx); drawing.y1 = round1(drawing.y1 + dy);
      drawing.x2 = round1(drawing.x2 + dx); drawing.y2 = round1(drawing.y2 + dy);
    } else if (drawing.type === "pen") {
      drawing.points = drawing.points.map((point) => [round1(point[0] + dx), round1(point[1] + dy)]);
    } else {
      drawing.x = round1(drawing.x + dx); drawing.y = round1(drawing.y + dy);
    }
  }

  function addWindowDrag(move, up) {
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  }

  function removeWindowDrag(move, up) {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  }

  function svgPoint(svg, event) {
    const rect = svg.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  /* ---------- bomb timer ---------- */
  function renderBombPage() {
    const view = $("#view");
    view.innerHTML = '<a class="back" href="#/">← Вернуться к штабу</a><section class="hero"><p class="eyebrow">Utility / Optional</p><h1>Bomb timer</h1><p>Отдельный спокойный таймер после установки бомбы.</p></section>' +
      '<section class="card bomb-card"><div class="bomb-label">C4 · 40 SECONDS</div><div class="tdisp" id="tdisp">' + formatTime(timerLeft) + '</div><div class="tbtns"><button class="btn big" id="bombStart" type="button">Старт · 40 сек</button><button class="btn ghost big" id="bombStop" type="button">Сбросить</button></div><p class="timer-note">Последние пять секунд: короткий звук и вибрация. Таймер не запускается автоматически.</p></section>';
    $("#bombStart").onclick = () => startBomb(40);
    $("#bombStop").onclick = () => startBomb(0);
    paintTimer();
  }

  function startBomb(seconds) {
    clearInterval(timerInt);
    timerLeft = seconds || 40;
    paintTimer();
    if (!seconds) return;
    timerInt = setInterval(() => {
      timerLeft -= 1;
      paintTimer();
      if (timerLeft <= 0) {
        clearInterval(timerInt);
        buzzEnd();
      } else if (timerLeft <= 5) {
        buzzShort();
      }
    }, 1000);
  }

  function formatTime(seconds) {
    const value = Math.max(0, seconds);
    return "00:" + String(value).padStart(2, "0");
  }

  function paintTimer() {
    const display = $("#tdisp");
    if (!display) return;
    display.textContent = formatTime(timerLeft);
    display.classList.toggle("low", timerLeft <= 10 && timerLeft > 0);
  }

  function beep(frequency, duration) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = beep.context || (beep.context = new AudioContext());
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch (error) {}
  }

  function buzzShort() {
    beep(980, .1);
    if (navigator.vibrate) navigator.vibrate(55);
  }

  function buzzEnd() {
    beep(720, .45);
    if (navigator.vibrate) navigator.vibrate([250, 150, 350]);
  }

  /* ---------- captain password ---------- */
  function lockConfig() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); } catch (error) { return null; }
  }

  function randomSalt() {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  async function passwordHash(password, salt) {
    const value = salt + "::" + password;
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return "fallback-" + (hash >>> 0).toString(16);
  }

  function openCaptainGate(forceSetup) {
    const config = lockConfig();
    const setup = forceSetup || !config;
    closeModal();
    const html = '<div class="modal" id="modal"><div class="modal-in narrow"><p class="modal-kicker">Restricted access</p><h3>' + (setup ? (forceSetup ? "Новый пароль" : "Установить пароль капитана") : "Вход капитана") + '</h3><p class="muted">' + (setup ? "Пароль будет запрашиваться при каждом новом открытии режима правок на этом устройстве." : "Только после проверки пароля станут доступны изменения и рисование поверх карт.") + '</p><form id="captainForm"><label class="field"><span>Пароль</span><input id="captainPass" type="password" autocomplete="current-password" minlength="4" required></label>' + (setup ? '<label class="field"><span>Повторите пароль</span><input id="captainPass2" type="password" autocomplete="new-password" minlength="4" required></label>' : "") + '<div class="form-error" id="captainError"></div><div class="row"><button class="btn" type="submit">' + (setup ? "Сохранить пароль" : "Разблокировать") + '</button><button class="btn ghost" id="mClose" type="button">Отмена</button></div></form><p class="muted">Пароль хранится локально в виде хеша и не попадает в экспорт плейбука.</p></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#mClose").onclick = closeModal;
    $("#modal").onclick = (event) => { if (event.target.id === "modal") closeModal(); };
    $("#captainPass").focus();
    $("#captainForm").onsubmit = async (event) => {
      event.preventDefault();
      const password = $("#captainPass").value;
      const error = $("#captainError");
      if (password.length < 4) { error.textContent = "Минимум 4 символа."; return; }
      if (setup) {
        if (password !== $("#captainPass2").value) { error.textContent = "Пароли не совпадают."; return; }
        const salt = randomSalt();
        const hash = await passwordHash(password, salt);
        localStorage.setItem(LOCK_KEY, JSON.stringify({ salt, hash, version: 1 }));
        closeModal();
        setEdit(true);
        toast(forceSetup ? "Пароль капитана изменён" : "Пароль установлен. Режим капитана открыт");
      } else {
        const hash = await passwordHash(password, config.salt);
        if (hash !== config.hash) { error.textContent = "Неверный пароль."; $("#captainPass").select(); return; }
        closeModal();
        setEdit(true);
        toast("Режим капитана открыт");
      }
    };
  }

  function setEdit(on) {
    editMode = Boolean(on);
    ui.selected = null;
    ui.drawTool = "select";
    document.body.classList.toggle("editing", editMode);
    $("#editBtn").classList.toggle("on", editMode);
    $("#editBtn").textContent = editMode ? "ЗАВЕРШИТЬ" : "КАПИТАН · ВХОД";
    $("#editPanel").hidden = !editMode;
    render();
  }

  function applyEdit() {
    $$(".ed").forEach((element) => {
      element.classList.toggle("editable", editMode);
      element.contentEditable = editMode ? "true" : "false";
      if (!editMode || element.dataset.bound) return;
      element.dataset.bound = "1";
      element.addEventListener("click", (event) => {
        if (editMode) event.preventDefault();
      });
      element.addEventListener("blur", () => {
        setPath(element.dataset.path, element.textContent.trim());
        save();
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          element.blur();
        }
      });
    });
  }

  /* ---------- import/export ---------- */
  function exportJSON() {
    if (!editMode) return;
    const text = JSON.stringify(data, null, 2);
    const html = '<div class="modal" id="modal"><div class="modal-in"><p class="modal-kicker">Captain data</p><h3>Экспорт плейбука</h3><p class="muted">Скопируйте JSON. Пароль капитана в экспорт не включается.</p><textarea id="expTa" readonly>' + esc(text) + '</textarea><div class="row"><button class="btn" id="cpBtn" type="button">Скопировать</button><button class="btn ghost" id="mClose" type="button">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#cpBtn").onclick = async () => {
      const textarea = $("#expTa");
      try { await navigator.clipboard.writeText(textarea.value); } catch (error) { textarea.select(); document.execCommand("copy"); }
      $("#cpBtn").textContent = "Скопировано";
    };
    $("#mClose").onclick = closeModal;
  }

  function importJSON() {
    if (!editMode) return;
    const html = '<div class="modal" id="modal"><div class="modal-in"><p class="modal-kicker">Captain data</p><h3>Импорт плейбука</h3><p class="muted">Вставьте JSON плейбука. Текущие позиции и рисунки будут заменены.</p><textarea id="impTa" placeholder="{ ... }"></textarea><div class="form-error" id="importError"></div><div class="row"><button class="btn" id="doImp" type="button">Загрузить</button><button class="btn ghost" id="mClose" type="button">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#doImp").onclick = () => {
      try {
        const value = JSON.parse($("#impTa").value);
        if (!value.players || !value.maps) throw new Error("invalid");
        data = normalizeData(value);
        save();
        closeModal();
        render();
        toast("Плейбук импортирован");
      } catch (error) {
        $("#importError").textContent = "Файл не похож на экспорт этого плейбука.";
      }
    };
    $("#mClose").onclick = closeModal;
  }

  /* ---------- lifecycle ---------- */
  function render() {
    const parts = parseHash();
    if (parts[0] === "map") renderMapPage();
    else if (parts[0] === "player") renderPlayerPage();
    else if (parts[0] === "bomb" || parts[0] === "timer") renderBombPage();
    else renderHome();
  }

  function boot() {
    const editButton = $("#editBtn");
    const exportButton = $("#expBtn");
    const importButton = $("#impBtn");
    const passwordButton = $("#passBtn");
    const resetButton = $("#rstBtn");

    if (editButton) {
      editButton.onclick = () => {
        if (editMode) {
          setEdit(false);
          toast("Режим капитана закрыт");
        } else {
          openCaptainGate(false);
        }
      };
    }
    if (exportButton) exportButton.onclick = exportJSON;
    if (importButton) importButton.onclick = importJSON;
    if (passwordButton) passwordButton.onclick = () => { if (editMode) openCaptainGate(true); };
    if (resetButton) resetButton.onclick = resetData;
    window.addEventListener("hashchange", route);
    if ("serviceWorker" in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
      navigator.serviceWorker.register("sw.js?v=5").catch(() => {});
    }
    route();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
