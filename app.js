/* CS2 Tactical Playbook — командный доступ, профили игроков, таймер бомбы */
(function () {
  "use strict";

  const STORE_KEY = "cs2-teams-v2";
  const LEGACY_KEY = "cs2-playbook-v1";
  const BASE = window.TACTICS_BASE;
  const COLORS = ["#e6a72e", "#ef5d5d", "#5da9ff", "#48cf8b", "#b984ff", "#f2f4f7"];
  const NADE_ICON = { smoke: "\u25CF", molly: "\u25C6", flash: "\u2726" };
  const NADE_NAME = { smoke: "\u0441\u043C\u043E\u0443\u043A", molly: "\u043C\u043E\u043B\u0438\u043A", flash: "\u0444\u043B\u0435\u0448" };
  const CAPTAIN_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
  const BOMB_SECONDS = 40;

  let store = loadStore();
  let data = null; // плейбук активной команды (ссылка на team.playbook)
  let editMode = false;
  let svgSerial = 0;
  let toastTimer = null;
  let bombInt = null;
  let bomb = { state: "idle", left: BOMB_SECONDS, endAt: 0 }; // idle | run | pause | done
  let gateTeamId = null;
  let ui = {
    map: null,
    side: "T",
    tab: "board",
    player: null,
    nade: null,
    drawTool: "select",
    drawColor: COLORS[0],
    selected: null,
  };

  /* ================= данные и хранилище команд ================= */
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
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

  function blankStore() {
    return { teams: [], activeId: null, unlocked: {}, players: {} };
  }

  function loadStore() {
    let next = blankStore();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.teams)) {
          next = parsed;
          next.unlocked = next.unlocked || {};
          next.players = next.players || {};
        }
      }
    } catch (error) {}
    // Миграция старого одиночного плейбука в команду по умолчанию.
    if (!next.teams.length) {
      try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const team = makeTeam("Моя команда", normalizeData(JSON.parse(legacy)));
          next.teams.push(team);
          next.activeId = team.id;
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch (error) {}
    }
    next.teams.forEach((team) => {
      team.playbook = normalizeData(team.playbook);
      team.settings = team.settings || { start: "tasks" };
      if (team.settings.start !== "maps") team.settings.start = "tasks";
    });
    persistStore(next);
    return next;
  }

  function persistStore(target) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(target || store)); } catch (error) {}
  }

  function save() {
    persistStore();
  }

  function makeTeam(name, playbook) {
    return {
      id: uid("team"),
      name: String(name || "Моя команда").slice(0, 40),
      pass: null, // { salt, hash } — командный пароль
      pin: null,  // { salt, hash } — PIN капитана
      captainUntil: 0,
      settings: { start: "tasks" },
      playbook: playbook || normalizeData(clone(BASE)),
    };
  }

  function teamById(id) {
    return store.teams.find((team) => team.id === id) || null;
  }

  function activeTeam() {
    return teamById(store.activeId);
  }

  function teamNeedsSetup(team) {
    return !team || !team.pass || !team.pin;
  }

  function isUnlocked(team) {
    return Boolean(team && team.pass && store.unlocked[team.id] === team.pass.hash);
  }

  function isLocked() {
    const team = activeTeam();
    return !team || teamNeedsSetup(team) || !isUnlocked(team);
  }

  function myPlayerId() {
    const team = activeTeam();
    return team ? (store.players[team.id] || null) : null;
  }

  function captainRemembered(team) {
    return Boolean(team && team.pin && team.captainUntil && Date.now() < team.captainUntil);
  }

  /* ================= helpers ================= */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const attr = esc;
  const playerById = (id) => (data ? data.players.find((player) => player.id === id) : null);
  const mapById = (id) => (data ? data.maps[id] : null);
  const zoneById = (map, id) => map && (map.zones || []).find((zone) => zone.id === id);
  const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
  const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : COLORS[0];
  const cleanId = (id) => String(id || "item").replace(/[^a-z0-9_-]/gi, "");

  function toast(message) {
    const element = $("#toast");
    if (!element) return;
    clearTimeout(toastTimer);
    element.textContent = message;
    element.hidden = false;
    toastTimer = setTimeout(() => { element.hidden = true; }, 2400);
  }

  function bindMapImages() {
    $$(".map-photo, .map-card-photo").forEach((image) => {
      const showError = () => {
        if (image.dataset.failed) return;
        image.dataset.failed = "1";
        image.classList.add("failed");
        const holder = image.parentElement;
        if (!holder || holder.querySelector(".map-load-error, .map-error")) return;
        const message = document.createElement("div");
        message.className = image.classList.contains("map-photo") ? "map-load-error" : "map-error";
        message.textContent = "Изображение карты не загрузилось. Обновите страницу.";
        holder.appendChild(message);
      };
      image.addEventListener("error", showError, { once: true });
      if (image.complete && !image.naturalWidth) showError();
    });
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

  function syncStickyTop() {
    const header = $("#topbar");
    if (!header) return;
    document.documentElement.style.setProperty("--sticky-top", header.offsetHeight + "px");
  }

  /* ================= радар и пометки ================= */
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
        '<text class="tactic-number-text" y=".15" fill="' + color + '">' + text + "</text></g>";
    }

    const label = String(drawing.text || "МЕТКА").slice(0, 24);
    const width = clamp(label.length * 1.9 + 5, 12, 48);
    return '<g class="' + classes + ' draw-marker" data-drawing-id="' + id + '" transform="translate(' + drawing.x + ',' + drawing.y + ')" style="color:' + color + '">' +
      '<rect class="tactic-label-bg" x="' + (-width / 2) + '" y="-2.65" width="' + width + '" height="5.3" rx="1" stroke="' + color + '"/>' +
      '<rect class="selection-ring" x="' + (-width / 2 - 1) + '" y="-3.65" width="' + (width + 2) + '" height="7.3" rx="1"/>' +
      '<text class="tactic-label" y=".1" fill="' + color + '">' + esc(label) + "</text></g>";
  }

  function mapFrame(mapId, options) {
    const map = mapById(mapId);
    return '<div class="map-canvas" data-map-frame="' + attr(mapId) + '">' +
      '<img class="map-photo" src="' + attr(map.image) + '?v=7" alt="Карта ' + attr(map.name) + '" draggable="false">' +
      mapSVG(mapId, options) +
      "</div>";
  }

  // Только ручные пометки капитана: автоматических зон и обводок нет.
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

    let svg = '<svg class="map tactical-map' + (opts.editor ? " editor-active" : "") + '" viewBox="0 0 100 100" data-map="' + attr(mapId) + '" data-side="' + attr(opts.side || "") + '" data-arrow-id="' + nadeArrowId + '" role="img" aria-label="Тактические пометки карты ' + attr(map.name) + '">';
    svg += "<defs>" + defs + "</defs>";
    svg += '<rect class="map-hit-area" width="100" height="100" fill="transparent"/>';

    (opts.arrows || []).forEach((arrow) => {
      svg += '<line class="nade-arrow" x1="' + arrow.fx + '" y1="' + arrow.fy + '" x2="' + arrow.tx + '" y2="' + arrow.ty + '" marker-end="url(#' + nadeArrowId + ')"/>';
      svg += '<circle class="nade-from" cx="' + arrow.fx + '" cy="' + arrow.fy + '" r="2.5"/>';
      svg += '<text class="nade-from-ic" x="' + arrow.fx + '" y="' + (arrow.fy + 1.05) + '">' + (NADE_ICON[arrow.type] || "\u2022") + "</text>";
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
      svg += '<g class="' + classes + '" data-player="' + attr(marker.player) + '" data-default-index="' + marker.defaultIndex + '" transform="translate(' + marker.x + "," + marker.y + ')">';
      if (labelStyle === "nick") {
        const nick = String(player.nick || "?").slice(0, 18);
        const width = clamp(nick.length * 1.75 + 5, 12, 36);
        svg += '<rect class="player-tag" x="' + (-width / 2) + '" y="-2.7" width="' + width + '" height="5.4" rx="1" stroke="' + color + '"/>';
        svg += '<text class="player-nick" y=".1" fill="' + color + '">' + esc(nick) + "</text>";
      } else {
        svg += '<circle r="3.25" stroke="' + color + '"/><text class="player-num" y=".1" fill="' + color + '">' + (playerIndex + 1) + "</text>";
      }
      svg += "</g>";
    });

    svg += "</svg>";
    return svg;
  }

  /* ================= роутер ================= */
  function parseHash() {
    return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  }

  function startRoute() {
    const team = activeTeam();
    const start = team && team.settings && team.settings.start === "maps" ? "#/maps" : "#/me";
    if (!myPlayerId()) return "#/profile";
    return start;
  }

  function route() {
    ui.nade = null;
    ui.selected = null;
    paintChrome();

    if (isLocked()) {
      const team = activeTeam();
      if (!team || teamNeedsSetup(team)) renderSetupGate();
      else renderGate();
      window.scrollTo(0, 0);
      return;
    }

    const team = activeTeam();
    data = team.playbook;
    const parts = parseHash();

    if (parts[0] === "map" && parts[1] && mapById(parts[1])) {
      if (ui.map !== parts[1]) ui.tab = "board";
      ui.map = parts[1];
      ui.player = null;
      if (parts[2] === "T" || parts[2] === "CT") ui.side = parts[2];
      renderMapPage();
    } else if (parts[0] === "player" && parts[1] && playerById(parts[1])) {
      ui.map = null;
      ui.player = parts[1];
      renderPlayerPage();
    } else if (parts[0] === "maps") {
      ui.map = null;
      ui.player = null;
      renderMapsPage();
    } else if (parts[0] === "team") {
      ui.map = null;
      ui.player = null;
      renderTeamPage();
    } else if (parts[0] === "profile") {
      ui.map = null;
      ui.player = null;
      renderProfilePage();
    } else if (parts[0] === "bomb" || parts[0] === "timer") {
      startBomb(); // старая ссылка: сразу запускаем таймер
      location.hash = startRoute();
      return;
    } else if (parts[0] === "me") {
      if (!myPlayerId()) { location.hash = "#/profile"; return; }
      ui.map = null;
      ui.player = myPlayerId();
      renderPlayerPage();
    } else {
      location.hash = startRoute();
      return;
    }
    paintNav(parts[0]);
    window.scrollTo(0, 0);
  }

  function paintChrome() {
    const locked = isLocked();
    const team = activeTeam();
    document.body.classList.toggle("locked", locked);
    $("#topActions").hidden = locked;
    $("#bottomNav").hidden = locked;
    $("#editPanel").hidden = locked || !editMode;
    $("#teamTitle").textContent = team && !teamNeedsSetup(team) ? team.name : "Плейбук команды";
    $("#footTeam").textContent = team && !teamNeedsSetup(team) ? team.name + " · CS2" : "CS2 Плейбук команды";
    const editBtn = $("#editBtn");
    editBtn.classList.toggle("on", editMode);
    editBtn.textContent = editMode ? "Капитан ✓" : "Капитан";
    if (editMode) paintCaptainBar();
    requestAnimationFrame(syncStickyTop);
  }

  function paintNav(first) {
    const map = { me: "me", maps: "maps", map: "maps", team: "team", player: "team", profile: "me" };
    let key = map[first] || "me";
    if (first === "player" && ui.player === myPlayerId()) key = "me";
    if (!first) {
      const team = activeTeam();
      key = team && team.settings.start === "maps" ? "maps" : "me";
    }
    $$("#bottomNav .bnav-btn").forEach((button) => {
      button.classList.toggle("on", button.dataset.nav === key);
    });
  }

  function paintCaptainBar() {
    const team = activeTeam();
    const holder = $("#editPanelInner");
    if (!holder || !team) return;
    const startLabel = team.settings.start === "maps" ? "Карты" : "Задачи";
    holder.innerHTML =
      '<div class="captain-state"><span class="status-dot"></span><b>' + esc(team.name) + "</b><span>Первый экран: " + startLabel + "</span></div>" +
      '<div class="panel-actions">' +
      '<button class="panel-btn" id="setBtn" type="button">Настройки</button>' +
      '<button class="panel-btn" id="expBtn" type="button">Экспорт</button>' +
      '<button class="panel-btn" id="impBtn" type="button">Импорт</button>' +
      '<button class="panel-btn danger" id="capOffBtn" type="button">Закрыть</button>' +
      "</div>";
    $("#setBtn").onclick = openCaptainSettings;
    $("#expBtn").onclick = exportTeam;
    $("#impBtn").onclick = importModal;
    $("#capOffBtn").onclick = () => { setEdit(false); toast("Режим капитана закрыт"); };
  }

  /* ================= вход: пароль команды ================= */
  function renderSetupGate() {
    const view = $("#view");
    const hasTeams = store.teams.length > 0;
    view.innerHTML =
      '<section class="gate"><div class="gate-hero"><span class="gate-badge">CS2</span>' +
      "<h1>Плейбук команды</h1><p>Закрытый доступ. Первый вход настраивает капитан.</p></div>" +
      '<div class="card"><h2>Настройка капитана</h2>' +
      '<p class="muted">Придумайте название команды, общий пароль для игроков и отдельный PIN капитана. Игроки увидят тактики только после ввода пароля.</p>' +
      '<form id="setupForm">' +
      '<label class="field"><span>Название команды</span><input id="setupName" maxlength="40" value="' + attr(hasTeams && activeTeam() ? activeTeam().name : "") + '" placeholder="Например, NAVI Junior" required></label>' +
      '<label class="field"><span>Командный пароль (для игроков)</span><input id="setupPass" type="password" minlength="4" autocomplete="new-password" placeholder="Минимум 4 символа" required></label>' +
      '<label class="field"><span>PIN капитана (только для вас)</span><input id="setupPin" type="password" inputmode="numeric" minlength="4" autocomplete="new-password" placeholder="Минимум 4 символа" required></label>' +
      '<div class="field"><span>Что игроки видят первым</span><div class="radio-row">' +
      '<label class="radio-card"><input type="radio" name="setupStart" value="tasks" checked> Мои задачи</label>' +
      '<label class="radio-card"><input type="radio" name="setupStart" value="maps"> Карты</label>' +
      "</div></div>" +
      '<div class="form-error" id="setupError"></div>' +
      '<div class="row"><button class="btn big block" type="submit">Создать доступ команды</button></div>' +
      "</form>" +
      (hasTeams ? '<div class="gate-links"><button class="link-btn" id="gateBack" type="button">← К выбору команды</button></div>' : '<div class="gate-links"><button class="link-btn" id="gateImport" type="button">Импортировать файл от капитана</button></div>') +
      "</div></section>";
    $("#setupForm").onsubmit = (event) => { event.preventDefault(); doSetup(); };
    const back = $("#gateBack");
    if (back) back.onclick = () => { renderGate(); };
    const imp = $("#gateImport");
    if (imp) imp.onclick = importModal;
    syncStickyTop();
  }

  async function doSetup() {
    const name = $("#setupName").value.trim().slice(0, 40);
    const pass = $("#setupPass").value;
    const pin = $("#setupPin").value;
    const start = ($('input[name="setupStart"]:checked') || {}).value === "maps" ? "maps" : "tasks";
    const error = $("#setupError");
    if (!name) { error.textContent = "Введите название команды."; return; }
    if (pass.length < 4) { error.textContent = "Пароль: минимум 4 символа."; return; }
    if (pin.length < 4) { error.textContent = "PIN: минимум 4 символа."; return; }
    if (pass === pin) { error.textContent = "Пароль и PIN должны различаться."; return; }
    let team = activeTeam();
    if (!team || !teamNeedsSetup(team)) {
      team = makeTeam(name);
      store.teams.push(team);
      store.activeId = team.id;
    }
    team.name = name;
    team.pass = { salt: randomSalt(), hash: "" };
    team.pass.hash = await passwordHash(pass, team.pass.salt);
    team.pin = { salt: randomSalt(), hash: "" };
    team.pin.hash = await passwordHash(pin, team.pin.salt);
    team.settings.start = start;
    team.captainUntil = Date.now() + CAPTAIN_REMEMBER_MS;
    store.unlocked[team.id] = team.pass.hash;
    data = team.playbook;
    save();
    setEdit(true);
    toast("Доступ создан. Устройство капитана запомнено на 30 дней");
    location.hash = "#/profile";
    route();
  }

  function renderGate() {
    const view = $("#view");
    if (!gateTeamId || !teamById(gateTeamId)) gateTeamId = store.activeId;
    const team = teamById(gateTeamId) || store.teams[0];
    gateTeamId = team ? team.id : null;
    let teamsHtml = '<div class="team-pick">';
    store.teams.forEach((item) => {
      if (teamNeedsSetup(item)) return;
      teamsHtml += '<button class="team-pick-btn' + (item.id === gateTeamId ? " on" : "") + '" data-team="' + attr(item.id) + '" type="button"><span>' + esc(item.name) + "<small>" + (isUnlocked(item) ? "Разблокирована на этом устройстве" : "Нужен командный пароль") + "</small></span><span>→</span></button>";
    });
    teamsHtml += "</div>";
    const quickOpen = team && isUnlocked(team);
    const accessHtml = quickOpen
      ? '<div class="row"><button class="btn big block" id="gateOpen" type="button">Открыть ' + esc(team.name) + "</button></div>" +
        '<p class="muted" style="margin-bottom:0">Это устройство уже разблокировано для команды.</p>'
      : '<form id="gateForm">' +
        '<label class="field"><span>Командный пароль · ' + esc(team ? team.name : "") + '</span><input id="gatePass" type="password" autocomplete="current-password" placeholder="Пароль от капитана" required></label>' +
        '<div class="form-error" id="gateError"></div>' +
        '<div class="row"><button class="btn big block" type="submit">Войти</button></div>' +
        "</form>";
    view.innerHTML =
      '<section class="gate"><div class="gate-hero"><span class="gate-badge">CS2</span>' +
      "<h1>Вход команды</h1><p>Введите командный пароль — откроются тактики вашей команды.</p></div>" +
      '<div class="card"><h2>Выберите команду</h2>' + teamsHtml + accessHtml +
      '<div class="gate-links"><button class="link-btn" id="gateImport" type="button">Импорт от капитана</button><button class="link-btn" id="gateNew" type="button">Новая команда (капитан)</button></div>' +
      "</div></section>";
    $$("[data-team]").forEach((button) => {
      button.onclick = () => { gateTeamId = button.dataset.team; store.activeId = gateTeamId; save(); renderGate(); };
    });
    const gateForm = $("#gateForm");
    if (gateForm) gateForm.onsubmit = (event) => { event.preventDefault(); doUnlock(); };
    const gateOpen = $("#gateOpen");
    if (gateOpen) gateOpen.onclick = () => { enterTeam(team); };
    $("#gateImport").onclick = importModal;
    $("#gateNew").onclick = () => { store.activeId = null; save(); paintChrome(); renderSetupGate(); };
    syncStickyTop();
  }

  async function doUnlock() {
    const team = teamById(gateTeamId);
    const error = $("#gateError");
    if (!team || teamNeedsSetup(team)) { error.textContent = "Выберите команду."; return; }
    const pass = $("#gatePass").value;
    const hash = await passwordHash(pass, team.pass.salt);
    if (hash !== team.pass.hash) {
      error.textContent = "Неверный пароль. Спросите пароль у капитана.";
      $("#gatePass").select();
      return;
    }
    store.activeId = team.id;
    store.unlocked[team.id] = team.pass.hash;
    save();
    enterTeam(team, "Добро пожаловать в " + team.name);
  }

  function enterTeam(team, greeting) {
    store.activeId = team.id;
    data = team.playbook;
    save();
    // Устройство капитана помним 30 дней — правки включаются сами.
    if (captainRemembered(team)) {
      setEdit(true);
      toast("С возвращением, капитан");
    } else {
      setEdit(false);
      if (greeting) toast(greeting);
    }
    location.hash = startRoute();
    route();
  }

  function lockTeam(full) {
    const team = activeTeam();
    setEdit(false);
    stopBomb(true);
    if (team && full) delete store.unlocked[team.id];
    if (team) gateTeamId = team.id;
    save();
    paintChrome();
    renderGate();
    window.scrollTo(0, 0);
  }

  /* ================= выбор профиля ================= */
  function renderProfilePage() {
    const team = activeTeam();
    const view = $("#view");
    let cards = '<div class="profile-pick">';
    data.players.forEach((player, index) => {
      cards += '<button class="chip" style="--pc:' + safeColor(player.color) + '" data-profile="' + attr(player.id) + '" type="button"><span class="chip-n">' + (index + 1) + '</span><span class="chip-t"><b>' + esc(player.nick) + "</b><small>" + esc(player.role) + "</small></span></button>";
    });
    cards += "</div>";
    view.innerHTML =
      '<section class="hero"><p class="eyebrow">' + esc(team.name) + '</p><h1>Кто вы?</h1><p>Выберите свой профиль один раз — дальше сразу откроются личные задачи и позиции.</p></section>' +
      '<section class="card"><h2>Состав</h2>' + cards + "</section>";
    $$("[data-profile]").forEach((button) => {
      button.onclick = () => {
        store.players[team.id] = button.dataset.profile;
        save();
        toast("Профиль сохранён");
        location.hash = team.settings.start === "maps" ? "#/maps" : "#/me";
        route();
      };
    });
    paintNav("profile");
    bindMapImages();
    applyEdit();
  }

  /* ================= страницы: задачи / карты / команда ================= */
  function mateChips(currentId, linkPrefix) {
    let html = '<div class="mate-row">';
    data.players.forEach((player) => {
      html += '<a class="mate-btn' + (player.id === currentId ? " on" : "") + '" style="--pc:' + safeColor(player.color) + '" href="' + linkPrefix + attr(player.id) + '">' + esc(player.nick) + (player.id === myPlayerId() ? " · вы" : "") + "</a>";
    });
    return html + "</div>";
  }

  function sideTab(side) {
    return '<button class="stab ' + (ui.side === side ? "on" : "") + '" data-side="' + side + '" type="button">' + (side === "T" ? "Атака · T" : "Защита · CT") + "</button>";
  }

  function bindSideTabs(onMap) {
    $$(".stab").forEach((button) => {
      button.onclick = () => {
        ui.side = button.dataset.side;
        ui.selected = null;
        if (onMap) location.hash = "#/map/" + ui.map + "/" + ui.side;
        else renderPlayerPage();
      };
    });
  }

  function renderPlayerPage() {
    const team = activeTeam();
    const player = playerById(ui.player) || playerById(myPlayerId());
    const view = $("#view");
    if (!player) { location.hash = "#/profile"; return; }
    ui.player = player.id;
    const playerIndex = data.players.indexOf(player);
    const isMe = player.id === myPlayerId();

    let html = '<div class="sticky-sub"><a class="back" href="' + (isMe ? "#/maps" : "#/team") + '">← ' + (isMe ? "К картам" : "К команде") + "</a></div>";
    html += mateChips(player.id, "#/player/");
    html += '<section class="hero phead" style="--pc:' + safeColor(player.color) + '"><span class="pnum">' + (playerIndex + 1) + '</span><div><p class="eyebrow">' + (isMe ? "Мои задачи" : "Сокомандник") + (isMe ? '<span class="me-badge">ЭТО ВЫ</span>' : "") + '</p><h1 class="ed" data-path="players.' + playerIndex + '.nick">' + esc(player.nick) + '</h1><p class="ed" data-path="players.' + playerIndex + '.role">' + esc(player.role) + "</p></div></section>";
    html += '<div class="sidetabs">' + sideTab("T") + sideTab("CT") + "</div>";

    html += '<section class="card"><h2>' + (isMe ? "Мои задачи" : "Задачи игрока") + "</h2><ul class=\"tasklist\">";
    player.tasks.forEach((task, index) => {
      html += '<li class="ed" data-path="players.' + playerIndex + ".tasks." + index + '">' + esc(task) + "</li>";
    });
    html += "</ul></section>";

    html += '<section class="card"><h2>Позиции · ' + ui.side + "</h2>";
    Object.keys(data.maps).forEach((mapId) => {
      const map = mapById(mapId);
      const position = (map.sides[ui.side].defaults || []).find((item) => item.player === player.id);
      if (!position) return;
      const positionIndex = map.sides[ui.side].defaults.indexOf(position);
      const zone = zoneById(map, position.zone);
      html += '<div class="minimap"><h3>' + esc(map.name) + (zone ? ' <span class="muted">· ' + esc(zone.name) + "</span>" : "") + "</h3>" + mapFrame(mapId, {
        markers: markersFor(mapId, ui.side),
        drawings: drawingsFor(mapId, ui.side),
        side: ui.side,
        focus: player.id,
        dimOthers: true,
        labelStyle: map.sides[ui.side].markerStyle,
      });
      html += '<p class="note"><b>' + (isMe ? "Моя точка:" : "Точка:") + '</b> <span class="ed" data-path="maps.' + mapId + ".sides." + ui.side + ".defaults." + positionIndex + '.note">' + esc(position.note) + '</span></p><p class="note"><a class="back" href="#/map/' + mapId + "/" + ui.side + '">Открыть доску ' + esc(map.name) + " →</a></p></div>";
    });
    html += "</section>";

    const assigned = [];
    Object.keys(data.maps).forEach((mapId) => {
      ["T", "CT"].forEach((side) => {
        (mapById(mapId).sides[side].nades || []).forEach((nade) => {
          if (nade.by === player.id) assigned.push({ mapId, side, nade });
        });
      });
    });

    html += '<section class="card"><h2>' + (isMe ? "Мои гранаты" : "Гранаты игрока") + "</h2>";
    if (!assigned.length) html += '<p class="muted">Нет назначенных гранат.</p>';
    assigned.forEach((record) => {
      const map = mapById(record.mapId);
      const nadeIndex = map.sides[record.side].nades.indexOf(record.nade);
      const from = zoneById(map, record.nade.from);
      const to = zoneById(map, record.nade.to);
      if (!from || !to) return;
      html += '<details class="nade"><summary><span>' + (NADE_ICON[record.nade.type] || "•") + "</span><b>" + esc(record.nade.name) + '</b><span class="tag">' + esc(map.name) + " · " + record.side + "</span></summary>";
      html += mapFrame(record.mapId, { arrows: [{ fx: from.x, fy: from.y, tx: to.x, ty: to.y, type: record.nade.type }] });
      html += "<ol>" + record.nade.steps.map((step, index) => '<li class="ed" data-path="maps.' + record.mapId + ".sides." + record.side + ".nades." + nadeIndex + ".steps." + index + '">' + esc(step) + "</li>").join("") + "</ol>";
      html += '<p class="note"><b>Задача:</b> <span class="ed" data-path="maps.' + record.mapId + ".sides." + record.side + ".nades." + nadeIndex + '.note">' + esc(record.nade.note) + "</span></p></details>";
    });
    html += "</section>";

    html += '<section class="card"><h2>Контрольный список</h2><ul class="tasklist tips">';
    player.tips.forEach((tip, index) => {
      html += '<li class="ed" data-path="players.' + playerIndex + ".tips." + index + '">' + esc(tip) + "</li>";
    });
    html += "</ul>";
    html += '<details class="nade eco-details"><summary><b>Эко-шпаргалка</b></summary><table class="eco"><tr><th>Режим</th><th>Когда</th><th>Закуп</th></tr>';
    (data.eco || []).forEach((item) => {
      html += "<tr><td><b>" + esc(item.name) + "</b></td><td>" + esc(item.when) + "</td><td>" + esc(item.what) + "</td></tr>";
    });
    html += "</table></details></section>";

    if (isMe) {
      html += '<div class="row"><button class="btn ghost tiny" id="changeProfile" type="button">Сменить мой профиль</button></div>';
    } else {
      html += '<div class="row"><button class="btn ghost tiny" id="makeMe" type="button">Это я — сделать моим профилем</button></div>';
    }

    view.innerHTML = html;
    bindSideTabs(false);
    bindMapImages();
    applyEdit();
    const changeBtn = $("#changeProfile");
    if (changeBtn) changeBtn.onclick = () => {
      if (confirm("Выбрать другой профиль?")) location.hash = "#/profile";
    };
    const makeMe = $("#makeMe");
    if (makeMe) makeMe.onclick = () => {
      store.players[team.id] = player.id;
      save();
      toast("Теперь это ваш профиль");
      location.hash = "#/me";
      route();
    };
    paintNav("player");
    syncStickyTop();
  }

  function renderMapsPage() {
    const team = activeTeam();
    const view = $("#view");
    const me = playerById(myPlayerId());
    let html = '<section class="hero"><p class="eyebrow">' + esc(team.name) + (me ? " · вы: " + esc(me.nick) : "") + '</p><h1 class="ed" data-path="meta.title">' + esc(data.meta.title) + '</h1><p class="ed" data-path="meta.subtitle">' + esc(data.meta.subtitle) + "</p></section>";

    html += '<section class="section"><div class="section-head"><div><h2>Карты</h2><p>Сторона ' + ui.side + ": позиции и пометки капитана поверх радара.</p></div></div>";
    html += '<div class="sidetabs">' + sideTab("T") + sideTab("CT") + "</div>";
    html += '<div class="mapcards">';
    Object.keys(data.maps).forEach((mapId, index) => {
      const map = data.maps[mapId];
      html += '<a class="mapcard" href="#/map/' + mapId + "/" + ui.side + '"><div class="mapcard-thumb"><img class="map-card-photo" src="' + attr(map.image) + '?v=7" alt="Карта ' + attr(map.name) + '" loading="eager" decoding="async"><span class="mapcard-code">Карта ' + (index + 1) + '</span></div><div class="mapcard-info"><span class="mapcard-name">' + esc(map.name) + '</span><span class="mapcard-open">Открыть →</span></div></a>';
    });
    html += "</div></section>";

    view.innerHTML = html;
    $$(".stab").forEach((button) => {
      button.onclick = () => { ui.side = button.dataset.side; renderMapsPage(); };
    });
    bindMapImages();
    applyEdit();
    paintNav("maps");
    syncStickyTop();
  }

  function renderTeamPage() {
    const team = activeTeam();
    const view = $("#view");
    const me = playerById(myPlayerId());
    let html = '<section class="hero"><p class="eyebrow">' + esc(team.name) + '</p><h1>Команда</h1><p>' + (me ? "Вы: <b>" + esc(me.nick) + "</b>. Нажмите на сокомандника, чтобы посмотреть его задачи и позиции." : "Выберите себя, чтобы открыть личные задачи.") + "</p></section>";
    html += '<section class="card"><h2>Состав</h2><div class="profile-pick">';
    data.players.forEach((player, index) => {
      html += '<a class="chip' + (player.id === myPlayerId() ? " on" : "") + '" style="--pc:' + safeColor(player.color) + '" href="#/player/' + attr(player.id) + '"><span class="chip-n">' + (index + 1) + '</span><span class="chip-t"><b>' + esc(player.nick) + (player.id === myPlayerId() ? " · вы" : "") + "</b><small>" + esc(player.role) + "</small></span></a>";
    });
    html += '</div><div class="row"><a class="btn ghost tiny" href="#/profile" style="text-decoration:none;display:inline-flex;align-items:center">Сменить мой профиль</a><button class="btn ghost tiny" id="lockApp" type="button">Выйти из команды</button></div><p class="muted">«Выйти» блокирует приложение: следующий вход — только по командному паролю.</p></section>';
    view.innerHTML = html;
    $("#lockApp").onclick = () => {
      if (confirm("Заблокировать приложение на этом устройстве?")) lockTeam(true);
    };
    bindMapImages();
    applyEdit();
    paintNav("team");
    syncStickyTop();
  }

  /* ================= страница карты ================= */
  function tabButton(tab, label) {
    return '<button class="tab ' + (ui.tab === tab ? "on" : "") + '" data-tab="' + tab + '" type="button">' + label + "</button>";
  }

  // Компактная панель: переносы вместо горизонтального скролла.
  // «Шаг назад» и «Удалить» закреплены в липкой панели и всегда на виду.
  function boardToolbar(sideData) {
    const tools = [
      ["select", "Выбор"],
      ["arrow", "→ Стрелка"],
      ["line", "— Линия"],
      ["pen", "✎ От руки"],
      ["number", "① Номер"],
      ["text", "Текст"],
    ];
    const selectedDrawing = drawingsFor(ui.map, ui.side).find((drawing) => drawing.id === ui.selected);
    const canEditText = selectedDrawing && (selectedDrawing.type === "text" || selectedDrawing.type === "number");
    let html = '<div class="board-tools"><div class="tool-row"><div class="tool-block"><span class="tool-label">Рисование</span>';
    tools.forEach((tool) => {
      html += '<button class="tool-btn ' + (ui.drawTool === tool[0] ? "on" : "") + '" data-tool="' + tool[0] + '" type="button">' + tool[1] + "</button>";
    });
    html += '</div><div class="tool-block"><span class="tool-label">Цвет</span>';
    COLORS.forEach((color) => {
      html += '<button class="color-btn ' + (ui.drawColor === color ? "on" : "") + '" data-color="' + color + '" style="--swatch:' + color + '" title="Цвет линии" type="button"></button>';
    });
    html += '</div><div class="tool-block"><span class="tool-label">Управление</span>' +
      '<button class="tool-btn keep" data-action="undo" type="button" ' + (sideData.drawings.length ? "" : "disabled") + ">Шаг назад</button>" +
      '<button class="tool-btn keep" data-action="delete" type="button" ' + (ui.selected ? "" : "disabled") + ">Удалить</button>" +
      '<button class="tool-btn" data-action="marker-style" type="button">Игроки: ' + (sideData.markerStyle === "nick" ? "ники" : "номера") + "</button>" +
      '<button class="tool-btn" data-action="rename" type="button" ' + (canEditText ? "" : "disabled") + ">Переименовать</button>" +
      '<button class="tool-btn" data-action="clear" type="button" ' + (sideData.drawings.length ? "" : "disabled") + ">Очистить</button></div></div>" +
      '<div class="tool-help">Инструмент → проведите по карте. В режиме «Выбор» двигайте игроков и пометки. Колл-ауты ставьте вручную: текст, номера, линии и стрелки.</div></div>';
    return html;
  }

  function renderMapPage() {
    const map = mapById(ui.map);
    const view = $("#view");
    if (!map) { location.hash = "#/maps"; return; }
    if (ui.tab !== "board" && ui.tab !== "nades" && ui.tab !== "plan") ui.tab = "board";
    const sideData = map.sides[ui.side];
    let html = '<div class="sticky-sub"><a class="back" href="#/maps">← К картам · ' + esc(map.name) + "</a></div>";
    html += '<section class="map-page-head"><div><p class="eyebrow">Тактическая карта</p><h1>' + esc(map.name) + "</h1><p>" + (ui.side === "T" ? "Атака: позиции, маршруты и план выхода" : "Защита: позиции, ротации и план удержания") + '</p></div><div class="map-status"><span>Сторона ' + ui.side + "</span><span>Пометок: " + sideData.drawings.length + "</span></div></section>";
    html += '<div class="sidetabs">' + sideTab("T") + sideTab("CT") + "</div>";
    html += '<div class="tabs">' + tabButton("board", "Доска") + tabButton("nades", "Гранаты") + tabButton("plan", "План") + "</div>";

    if (ui.tab === "board") {
      html += '<section class="card board-shell"><div class="board-bar"><span class="board-title">Схема команды · ' + esc(map.name) + '</span><span class="board-mode">' + (editMode ? "Можно редактировать" : "Только просмотр") + "</span></div>";
      if (editMode) html += boardToolbar(sideData);
      html += '<div class="map-wrap">' + mapFrame(ui.map, {
        markers: markersFor(ui.map, ui.side),
        drawings: drawingsFor(ui.map, ui.side),
        selected: ui.selected,
        side: ui.side,
        labelStyle: sideData.markerStyle,
        editor: editMode,
      }) + "</div>";
      html += '<div class="board-footer"><p class="board-hint"><b>' + (editMode ? "Режим капитана:" : "Режим просмотра:") + "</b> " + (editMode ? "двигайте игроков, ставьте номера, подписи, линии и стрелки вручную." : "позиции и ручные пометки капитана поверх радара.") + '</p><div class="position-grid">';
      sideData.defaults.forEach((position, index) => {
        const player = playerById(position.player);
        const zone = zoneById(map, position.zone);
        html += '<a class="posrow" href="#/player/' + attr(position.player) + '" style="--pc:' + safeColor(player ? player.color : "#888888") + '"><b>' + esc(player ? player.nick : "Не назначен") + '</b><small class="pos-zone">' + esc(zone ? zone.name : position.zone) + '</small><small class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".defaults." + index + '.note">' + esc(position.note) + "</small></a>";
      });
      html += "</div></div></section>";
    }

    if (ui.tab === "nades") {
      html += '<section class="card"><h2>Гранаты · ' + ui.side + "</h2><p class=\"muted\">Откройте гранату: направление броска показано на радаре.</p>";
      if (editMode) html += '<button class="btn tiny addNade" type="button">Добавить гранату</button>';
      sideData.nades.forEach((nade, index) => {
        const from = zoneById(map, nade.from);
        const to = zoneById(map, nade.to);
        if (!from || !to) return;
        html += '<details class="nade" data-nade="' + index + '" ' + (ui.nade === index ? "open" : "") + '><summary><span>' + (NADE_ICON[nade.type] || "•") + '</span><b class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".nades." + index + '.name">' + esc(nade.name) + '</b><span class="tag">' + esc(NADE_NAME[nade.type] || nade.type) + (nade.by ? " · " + esc((playerById(nade.by) || {}).nick || "") : "") + "</span>" + (editMode ? '<button class="del" data-del-nade="' + index + '" type="button">Удалить</button>' : "") + "</summary>";
        html += mapFrame(ui.map, { arrows: [{ fx: from.x, fy: from.y, tx: to.x, ty: to.y, type: nade.type }] });
        html += "<ol>" + nade.steps.map((step, stepIndex) => '<li class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".nades." + index + ".steps." + stepIndex + '">' + esc(step) + "</li>").join("") + "</ol>";
        html += '<p class="note"><b>Задача:</b> <span class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".nades." + index + '.note">' + esc(nade.note) + "</span></p></details>";
      });
      html += "</section>";
    }

    if (ui.tab === "plan") {
      html += '<section class="card"><h2>План стороны · ' + ui.side + '</h2><ol class="planlist">';
      sideData.plan.forEach((item, index) => {
        html += '<li class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".plan." + index + '">' + esc(item) + "</li>";
      });
      html += "</ol></section>";
    }

    view.innerHTML = html;
    bindSideTabs(true);
    $$(".tabs .tab").forEach((button) => {
      button.onclick = () => {
        ui.tab = button.dataset.tab;
        ui.nade = null;
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
    if (radar && ui.tab === "board" && editMode) {
      bindBoardToolbar();
      bindBoardEditor(radar);
    }
    bindMapImages();
    applyEdit();
    paintNav("map");
    syncStickyTop();
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

  /* ================= редактор доски ================= */
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
      requestBoardText(drawing.type, drawing.text || "", (value) => {
        drawing.text = value;
        save();
        renderMapPage();
      });
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

  function requestBoardText(type, initialValue, onSave) {
    const isNumber = type === "number";
    closeModal();
    const html = '<div class="modal" id="modal"><div class="modal-in narrow"><p class="modal-kicker">Пометка на карте</p><h3>' + (isNumber ? "Номер в обводке" : "Текст или ник") + '</h3><p class="muted">' + (isNumber ? "Введите число от 1 до 99." : "Короткая подпись поверх карты: колл-аут, ник, указание.") + '</p><form id="boardTextForm"><label class="field"><span>' + (isNumber ? "Номер" : "Подпись") + '</span><input id="boardTextInput" ' + (isNumber ? 'inputmode="numeric" maxlength="2"' : 'maxlength="24"') + ' value="' + attr(initialValue) + '" required></label><div class="form-error" id="boardTextError"></div><div class="row"><button class="btn" type="submit">Сохранить</button><button class="btn ghost" id="mClose" type="button">Отмена</button></div></form></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    const input = $("#boardTextInput");
    input.focus();
    input.select();
    $("#mClose").onclick = closeModal;
    $("#modal").onclick = (event) => { if (event.target.id === "modal") closeModal(); };
    $("#boardTextForm").onsubmit = (event) => {
      event.preventDefault();
      let value = input.value.trim();
      if (isNumber) value = value.replace(/\D/g, "").slice(0, 2);
      else value = value.slice(0, 24);
      if (!value || (isNumber && (Number(value) < 1 || Number(value) > 99))) {
        $("#boardTextError").textContent = isNumber ? "Нужно число от 1 до 99." : "Введите подпись.";
        return;
      }
      closeModal();
      onSave(value);
    };
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
        const drawingType = ui.drawTool;
        requestBoardText(drawingType, drawingType === "number" ? "1" : "", (value) => {
          const drawing = {
            id: newDrawingId(),
            type: drawingType,
            x: round1(point.x),
            y: round1(point.y),
            text: value,
            color: ui.drawColor,
          };
          drawingsFor(ui.map, ui.side).push(drawing);
          ui.selected = drawing.id;
          save();
          renderMapPage();
        });
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
      if (Math.hypot(point.x - last[0], point.y - last[1]) < 0.65) return;
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

  /* ================= таймер бомбы в шапке ================= */
  // Кнопка «Бомба 40» сразу запускает отсчёт. Рядом: время, Стоп/Продолжить, Скрыть.
  function bombTick() {
    if (bomb.state !== "run") return;
    bomb.left = Math.max(0, (bomb.endAt - Date.now()) / 1000);
    if (bomb.left <= 0) {
      bomb.left = 0;
      bomb.state = "done";
      clearInterval(bombInt);
      bombInt = null;
      buzzEnd();
    } else if (bomb.left <= 5.05 && !bomb.warned) {
      bomb.warned = true;
    }
    if (bomb.state === "run" && bomb.left <= 5.05 && bomb.left > 0) {
      const whole = Math.ceil(bomb.left);
      if (whole !== bomb.lastWhole) { bomb.lastWhole = whole; buzzShort(); }
    }
    paintBomb();
  }

  function startBomb() {
    clearInterval(bombInt);
    bomb = { state: "run", left: BOMB_SECONDS, endAt: Date.now() + BOMB_SECONDS * 1000, lastWhole: BOMB_SECONDS + 1 };
    bombInt = setInterval(bombTick, 120);
    paintBomb();
  }

  function toggleBomb() {
    if (bomb.state === "run") {
      bomb.state = "pause";
      bomb.left = Math.max(0, (bomb.endAt - Date.now()) / 1000);
      clearInterval(bombInt);
      bombInt = null;
    } else if (bomb.state === "pause") {
      bomb.state = "run";
      bomb.endAt = Date.now() + bomb.left * 1000;
      bombInt = setInterval(bombTick, 120);
    } else {
      startBomb();
      return;
    }
    paintBomb();
  }

  function stopBomb(silent) {
    clearInterval(bombInt);
    bombInt = null;
    bomb = { state: "idle", left: BOMB_SECONDS, endAt: 0 };
    if (!silent) paintBomb();
    else { $("#bombBar").hidden = true; paintBombButton(); }
  }

  function formatBomb(seconds) {
    const total = Math.max(0, seconds);
    const whole = Math.ceil(total - 1e-4);
    return "00:" + String(whole).padStart(2, "0");
  }

  function paintBombButton() {
    const button = $("#bombBtn");
    if (!button) return;
    if (bomb.state === "run") {
      button.classList.add("running");
      button.textContent = "\u25CF " + formatBomb(bomb.left);
    } else if (bomb.state === "pause") {
      button.classList.remove("running");
      button.textContent = "\u275A\u275A " + formatBomb(bomb.left);
    } else if (bomb.state === "done") {
      button.classList.remove("running");
      button.textContent = "Бомба 40";
    } else {
      button.classList.remove("running");
      button.textContent = "Бомба 40";
    }
  }

  function paintBomb() {
    const bar = $("#bombBar");
    const time = $("#bombTime");
    const toggle = $("#bombToggle");
    if (!bar || !time || !toggle) return;
    paintBombButton();
    if (bomb.state === "idle") {
      bar.hidden = true;
    } else {
      bar.hidden = bomb.hidden === true;
      if (bomb.state === "done") {
        time.textContent = "ВЗРЫВ";
        time.classList.remove("low");
        time.classList.add("done");
        toggle.textContent = "Заново";
      } else {
        time.textContent = formatBomb(bomb.left);
        time.classList.toggle("low", bomb.left <= 10);
        time.classList.remove("done");
        toggle.textContent = bomb.state === "run" ? "Стоп" : "Продолжить";
      }
    }
    syncStickyTop();
  }

  function beep(frequency, duration) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = beep.context || (beep.context = new AudioContext());
      if (context.state === "suspended") context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch (error) {}
  }

  function buzzShort() {
    beep(980, 0.1);
    if (navigator.vibrate) navigator.vibrate(55);
  }

  function buzzEnd() {
    beep(720, 0.45);
    if (navigator.vibrate) navigator.vibrate([250, 150, 350]);
  }

  /* ================= капитан: PIN, настройки, обмен ================= */
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

  function openCaptainGate() {
    const team = activeTeam();
    if (!team) return;
    if (captainRemembered(team)) {
      setEdit(true);
      toast("Режим капитана открыт");
      return;
    }
    closeModal();
    const html = '<div class="modal" id="modal"><div class="modal-in narrow"><p class="modal-kicker">Только для капитана</p><h3>PIN капитана</h3><p class="muted">После верного PIN это устройство запомнится на 30 дней, и правки будут открываться сразу.</p><form id="pinForm"><label class="field"><span>PIN</span><input id="pinInput" type="password" inputmode="numeric" autocomplete="current-password" minlength="4" required></label><div class="form-error" id="pinError"></div><div class="row"><button class="btn" type="submit">Открыть правки</button><button class="btn ghost" id="mClose" type="button">Отмена</button></div></form></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#mClose").onclick = closeModal;
    $("#modal").onclick = (event) => { if (event.target.id === "modal") closeModal(); };
    $("#pinInput").focus();
    $("#pinForm").onsubmit = async (event) => {
      event.preventDefault();
      const pin = $("#pinInput").value;
      const hash = await passwordHash(pin, team.pin.salt);
      if (hash !== team.pin.hash) {
        $("#pinError").textContent = "Неверный PIN.";
        $("#pinInput").select();
        return;
      }
      team.captainUntil = Date.now() + CAPTAIN_REMEMBER_MS;
      save();
      closeModal();
      setEdit(true);
      toast("Устройство капитана запомнено на 30 дней");
    };
  }

  function setEdit(on) {
    editMode = Boolean(on);
    ui.selected = null;
    ui.drawTool = "select";
    document.body.classList.toggle("editing", editMode);
    paintChrome();
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

  function openCaptainSettings() {
    const team = activeTeam();
    if (!team || !editMode) return;
    closeModal();
    const html = '<div class="modal" id="modal"><div class="modal-in"><p class="modal-kicker">Капитан · ' + esc(team.name) + '</p><h3>Настройки команды</h3>' +
      '<div class="settings-group"><h4>Название и первый экран игроков</h4><form id="teamNameForm"><label class="field"><span>Название команды</span><input id="teamNameInput" maxlength="40" value="' + attr(team.name) + '" required></label><div class="radio-row" style="margin-top:10px"><label class="radio-card"><input type="radio" name="startScreen" value="tasks"' + (team.settings.start !== "maps" ? " checked" : "") + '> Сначала задачи</label><label class="radio-card"><input type="radio" name="startScreen" value="maps"' + (team.settings.start === "maps" ? " checked" : "") + '> Сначала карты</label></div><div class="row"><button class="btn tiny" type="submit">Сохранить</button></div></form></div>' +
      '<div class="settings-group"><h4>Доступ</h4><p class="muted">Командный пароль — для игроков. PIN — только для капитана.</p><div class="row"><button class="btn ghost tiny" id="changePass" type="button">Сменить пароль</button><button class="btn ghost tiny" id="changePin" type="button">Сменить PIN</button></div><div class="row"><button class="btn ghost tiny" id="forgetDevice" type="button">Забыть это устройство</button><button class="btn ghost tiny" id="switchTeam" type="button">Сменить команду</button></div></div>' +
      '<div class="settings-group"><h4>Опасная зона</h4><div class="row"><button class="btn warn tiny" id="resetTeam" type="button">Сбросить тактики</button><button class="btn warn tiny" id="deleteTeam" type="button">Удалить команду</button></div></div>' +
      '<div class="row"><button class="btn ghost" id="mClose" type="button">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#mClose").onclick = closeModal;
    $("#modal").onclick = (event) => { if (event.target.id === "modal") closeModal(); };
    $("#teamNameForm").onsubmit = (event) => {
      event.preventDefault();
      team.name = $("#teamNameInput").value.trim().slice(0, 40) || team.name;
      team.settings.start = ($('input[name="startScreen"]:checked') || {}).value === "maps" ? "maps" : "tasks";
      save();
      closeModal();
      paintChrome();
      render();
      toast("Настройки сохранены");
    };
    $("#changePass").onclick = () => changeSecret("pass");
    $("#changePin").onclick = () => changeSecret("pin");
    $("#forgetDevice").onclick = () => {
      team.captainUntil = 0;
      save();
      closeModal();
      setEdit(false);
      toast("Устройство забыто. В следующий раз понадобится PIN");
    };
    $("#switchTeam").onclick = () => { closeModal(); lockTeam(false); };
    $("#resetTeam").onclick = () => {
      if (!confirm("Сбросить все позиции, линии и тексты команды к базовой версии?")) return;
      team.playbook = normalizeData(clone(BASE));
      data = team.playbook;
      save();
      closeModal();
      render();
      toast("Тактики команды сброшены");
    };
    $("#deleteTeam").onclick = () => {
      if (!confirm('Удалить команду "' + team.name + '" с этого устройства? Экспортируйте её заранее, если она нужна.')) return;
      store.teams = store.teams.filter((item) => item.id !== team.id);
      delete store.unlocked[team.id];
      delete store.players[team.id];
      if (store.activeId === team.id) store.activeId = store.teams.length ? store.teams[0].id : null;
      editMode = false;
      document.body.classList.remove("editing");
      save();
      closeModal();
      stopBomb(true);
      route();
    };
  }

  function changeSecret(kind) {
    const team = activeTeam();
    if (!team || !editMode) return;
    const isPass = kind === "pass";
    closeModal();
    const html = '<div class="modal" id="modal"><div class="modal-in narrow"><p class="modal-kicker">Капитан · ' + esc(team.name) + '</p><h3>' + (isPass ? "Новый командный пароль" : "Новый PIN капитана") + '</h3><p class="muted">' + (isPass ? "После смены сообщите новый пароль всем игрокам." : "Старое запоминание устройства будет обновлено.") + '</p><form id="secretForm"><label class="field"><span>Новое значение</span><input id="secret1" type="password" ' + (isPass ? "" : 'inputmode="numeric" ') + 'minlength="4" autocomplete="new-password" required></label><label class="field"><span>Повторите</span><input id="secret2" type="password" ' + (isPass ? "" : 'inputmode="numeric" ') + 'minlength="4" autocomplete="new-password" required></label><div class="form-error" id="secretError"></div><div class="row"><button class="btn" type="submit">Сохранить</button><button class="btn ghost" id="mClose" type="button">Отмена</button></div></form></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#mClose").onclick = openCaptainSettings;
    $("#modal").onclick = (event) => { if (event.target.id === "modal") openCaptainSettings(); };
    $("#secretForm").onsubmit = async (event) => {
      event.preventDefault();
      const first = $("#secret1").value;
      const second = $("#secret2").value;
      const error = $("#secretError");
      if (first.length < 4) { error.textContent = "Минимум 4 символа."; return; }
      if (first !== second) { error.textContent = "Значения не совпадают."; return; }
      if (isPass && team.pin) {
        const pinCheck = await passwordHash(first, team.pin.salt);
        if (pinCheck === team.pin.hash) { error.textContent = "Пароль и PIN должны различаться."; return; }
      }
      if (!isPass && team.pass) {
        const passCheck = await passwordHash(first, team.pass.salt);
        if (passCheck === team.pass.hash) { error.textContent = "Пароль и PIN должны различаться."; return; }
      }
      const salt = randomSalt();
      const hash = await passwordHash(first, salt);
      if (isPass) {
        team.pass = { salt, hash };
        store.unlocked[team.id] = hash;
      } else {
        team.pin = { salt, hash };
        team.captainUntil = Date.now() + CAPTAIN_REMEMBER_MS;
      }
      save();
      openCaptainSettings();
      toast(isPass ? "Пароль команды изменён" : "PIN капитана изменён");
    };
  }

  /* ---------- экспорт / импорт ---------- */
  function exportTeam() {
    const team = activeTeam();
    if (!team || !editMode) return;
    const payload = { app: "cs2-playbook-team", exportedAt: new Date().toISOString(), team };
    const text = JSON.stringify(payload);
    closeModal();
    const html = '<div class="modal" id="modal"><div class="modal-in"><p class="modal-kicker">Капитан · ' + esc(team.name) + '</p><h3>Экспорт команды</h3><p class="muted">Отправьте файл игрокам: после импорта они войдут по командному паролю и увидят ваши тактики. Сами пароли в файл не входят — только их проверочные хеши.</p><textarea id="expTa" readonly>' + esc(text) + '</textarea><div class="row"><button class="btn" id="cpBtn" type="button">Скопировать</button><button class="btn ghost" id="dlBtn" type="button">Скачать файл</button><button class="btn ghost" id="mClose" type="button">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#cpBtn").onclick = async () => {
      const textarea = $("#expTa");
      try { await navigator.clipboard.writeText(textarea.value); } catch (error) { textarea.select(); document.execCommand("copy"); }
      $("#cpBtn").textContent = "Скопировано";
    };
    $("#dlBtn").onclick = () => {
      try {
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "cs2-" + team.name.replace(/[^\wа-яё-]+/gi, "-").toLowerCase() + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (error) {
        toast("Не получилось скачать — скопируйте текст");
      }
    };
    $("#mClose").onclick = closeModal;
  }

  function importModal() {
    closeModal();
    const html = '<div class="modal" id="modal"><div class="modal-in"><p class="modal-kicker">Файл от капитана</p><h3>Импорт команды</h3><p class="muted">Вставьте JSON команды. После импорта вход — по командному паролю.</p><textarea id="impTa" placeholder="{ ... }"></textarea><div class="form-error" id="importError"></div><div class="row"><button class="btn" id="doImp" type="button">Загрузить</button><button class="btn ghost" id="mClose" type="button">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    $("#doImp").onclick = () => {
      try {
        const value = JSON.parse($("#impTa").value);
        // Новый формат: целая команда.
        if (value && value.app === "cs2-playbook-team" && value.team && value.team.pass && value.team.playbook) {
          const incoming = value.team;
          incoming.playbook = normalizeData(incoming.playbook);
          incoming.settings = incoming.settings || { start: "tasks" };
          incoming.captainUntil = 0;
          const existing = teamById(incoming.id);
          if (existing) {
            if (!confirm('Команда "' + existing.name + '" уже есть на устройстве. Заменить её данными из файла?')) return;
            const index = store.teams.indexOf(existing);
            store.teams[index] = incoming;
          } else {
            store.teams.push(incoming);
          }
          delete store.unlocked[incoming.id];
          store.activeId = incoming.id;
          gateTeamId = incoming.id;
          save();
          closeModal();
          setEdit(false);
          stopBomb(true);
          route();
          toast('Команда "' + incoming.name + '" загружена. Введите пароль');
          return;
        }
        // Старый формат: только плейбук — кладём в активную команду (нужен режим капитана).
        if (value && value.players && value.maps) {
          const team = activeTeam();
          if (!team || !editMode) throw new Error("need-captain");
          team.playbook = normalizeData(value);
          data = team.playbook;
          save();
          closeModal();
          render();
          toast("Плейбук импортирован");
          return;
        }
        throw new Error("invalid");
      } catch (error) {
        $("#importError").textContent = error && error.message === "need-captain"
          ? "Старый формат: сначала войдите в команду и откройте режим капитана."
          : "Файл не похож на экспорт этого плейбука.";
      }
    };
    $("#mClose").onclick = closeModal;
  }

  /* ================= жизненный цикл ================= */
  function render() {
    if (isLocked()) {
      const team = activeTeam();
      if (!team || teamNeedsSetup(team)) renderSetupGate();
      else renderGate();
      return;
    }
    const team = activeTeam();
    data = team.playbook;
    const parts = parseHash();
    if (parts[0] === "map" && mapById(parts[1])) renderMapPage();
    else if ((parts[0] === "player" && playerById(parts[1])) || parts[0] === "me") {
      if (parts[0] === "me") ui.player = myPlayerId();
      renderPlayerPage();
    }
    else if (parts[0] === "maps") renderMapsPage();
    else if (parts[0] === "team") renderTeamPage();
    else if (parts[0] === "profile") renderProfilePage();
    else { location.hash = startRoute(); route(); }
  }

  function boot() {
    const editButton = $("#editBtn");
    const bombButton = $("#bombBtn");
    const bombToggle = $("#bombToggle");
    const bombHide = $("#bombHide");

    if (editButton) {
      editButton.onclick = () => {
        if (isLocked()) return;
        if (editMode) {
          setEdit(false);
          toast("Режим капитана закрыт");
        } else {
          openCaptainGate();
        }
      };
    }
    if (bombButton) {
      bombButton.onclick = () => {
        if (isLocked()) return;
        if (bomb.state === "idle" || bomb.state === "done") startBomb();
        else {
          bomb.hidden = !$("#bombBar").hidden;
          $("#bombBar").hidden = bomb.hidden;
        }
        syncStickyTop();
      };
    }
    if (bombToggle) {
      bombToggle.onclick = () => {
        if (bomb.state === "done") startBomb();
        else toggleBomb();
      };
    }
    if (bombHide) {
      bombHide.onclick = () => {
        // «Скрыть»: панель прячется, при простое таймер сбрасывается.
        if (bomb.state === "done" || bomb.state === "idle") stopBomb(true);
        else $("#bombBar").hidden = true;
        paintBombButton();
        syncStickyTop();
      };
    }

    window.addEventListener("hashchange", route);
    window.addEventListener("resize", syncStickyTop);
    // Старые версии сайта использовали агрессивный offline-кэш. Удаляем его,
    // чтобы HTML, скрипты и изображения всегда загружались одной версии.
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then((keys) => {
        keys.filter((key) => key.indexOf("cs2-playbook-") === 0).forEach((key) => caches.delete(key));
      }).catch(() => {});
    }
    paintBomb();
    route();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
