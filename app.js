/* CS2 Team Playbook — приложение */
(function () {
  "use strict";

  const LS_KEY = "cs2-playbook-v1";
  const BASE = window.TACTICS_BASE;

  /* ---------- состояние ---------- */
  let data = load();
  let editMode = false;
  let ui = { map: null, side: "T", tab: "pos", player: null, nade: null, zone: null };

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.version === BASE.version) return saved;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(BASE));
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function resetData() {
    if (!confirm("Сбросить все правки к базовой версии?")) return;
    localStorage.removeItem(LS_KEY);
    data = JSON.parse(JSON.stringify(BASE));
    render();
  }

  /* ---------- утилиты ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const playerById = (id) => data.players.find((p) => p.id === id);
  const mapById = (id) => data.maps[id];
  const zoneById = (m, id) => m.zones.find((z) => z.id === id);
  const NADE_ICON = { smoke: "💨", molly: "🔥", flash: "⚡" };
  const NADE_NAME = { smoke: "смоук", molly: "молик", flash: "флеш" };

  /* ---------- схема карты (SVG) ---------- */
  function mapSVG(mapId, opts) {
    opts = opts || {};
    const m = mapById(mapId);
    const showLabels = opts.labels !== false;
    let s = '<svg class="map" viewBox="0 0 100 100" data-map="' + mapId + '" role="img" aria-label="' + esc(m.name) + '">';
    s += '<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ff5c5c"/></marker></defs>';
    // связи
    m.links.forEach((l) => {
      const a = zoneById(m, l[0]), b = zoneById(m, l[1]);
      if (!a || !b) return;
      s += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" class="lnk"/>';
    });
    // зоны
    m.zones.forEach((z) => {
      const cls = "zone z-" + (z.kind || "route") + (opts.highlightZone === z.id ? " z-hl" : "");
      s += '<rect class="' + cls + '" x="' + (z.x - z.w / 2) + '" y="' + (z.y - z.h / 2) + '" width="' + z.w + '" height="' + z.h + '" rx="2.4" data-zone="' + z.id + '"/>';
      if (showLabels) s += '<text class="zlab" x="' + z.x + '" y="' + (z.y + z.h / 2 + 3.4) + '" text-anchor="middle">' + esc(z.name) + "</text>";
    });
    // стрелки гранат
    (opts.arrows || []).forEach((a) => {
      s += '<line class="nade-arrow" x1="' + a.fx + '" y1="' + a.fy + '" x2="' + a.tx + '" y2="' + a.ty + '" marker-end="url(#arr)"/>';
      s += '<circle class="nade-from" cx="' + a.fx + '" cy="' + a.fy + '" r="2.6"/>';
      s += '<text class="nade-from-ic" x="' + a.fx + '" y="' + (a.fy + 1.15) + '" text-anchor="middle">' + (NADE_ICON[a.type] || "•") + "</text>";
      s += '<g class="nade-to"><line x1="' + (a.tx - 2) + '" y1="' + (a.ty - 2) + '" x2="' + (a.tx + 2) + '" y2="' + (a.ty + 2) + '"/><line x1="' + (a.tx - 2) + '" y1="' + (a.ty + 2) + '" x2="' + (a.tx + 2) + '" y2="' + (a.ty - 2) + '"/></g>';
    });
    // маркеры игроков
    (opts.markers || []).forEach((mk) => {
      const p = playerById(mk.player);
      if (!p) return;
      const idx = data.players.indexOf(p);
      s += '<g class="pmk' + (opts.dimOthers && ui.player && mk.player !== ui.player ? " dim" : "") + (opts.focus === mk.player ? " foc" : "") + '" data-player="' + mk.player + '" data-map="' + mapId + '" data-side="' + (opts.side || "") + '" transform="translate(' + mk.x + "," + mk.y + ')">';
      s += '<circle r="3.6" fill="' + p.color + '"/>';
      s += '<text y="1.35" text-anchor="middle">' + (idx + 1) + "</text>";
      s += "</g>";
    });
    s += "</svg>";
    return s;
  }

  function markersFor(mapId, side) {
    const sd = mapById(mapId).sides[side];
    return (sd.defaults || []).map((d) => {
      const z = zoneById(mapById(mapId), d.zone);
      return { player: d.player, x: z.x + (d.dx || 0), y: z.y + (d.dy || 0), zone: d.zone, note: d.note };
    });
  }

  /* ---------- роутер ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean);
    return parts;
  }

  function route() {
    const parts = parseHash();
    ui.nade = null; ui.zone = null;
    if (parts[0] === "map" && parts[1]) {
      if (ui.map !== parts[1]) { ui.tab = "pos"; ui.side = "T"; }
      ui.map = parts[1];
      if (parts[2] === "CT" || parts[2] === "T") ui.side = parts[2];
      renderMapPage();
    } else if (parts[0] === "player" && parts[1]) {
      ui.map = null;
      ui.player = parts[1];
      renderPlayerPage();
    } else if (parts[0] === "timer") {
      ui.map = null;
      renderTimerPage();
    } else {
      ui.player = null;
      ui.map = null;
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  /* ---------- главная ---------- */
  function renderHome() {
    const v = $("#view");
    let h = "";
    h += '<section class="hero"><h1>' + esc(data.meta.title) + '</h1><p>' + esc(data.meta.subtitle) + "</p></section>";

    h += '<section class="card"><h2>1 · Кто ты?</h2><p class="muted">Нажми на себя — увидишь свои позиции, задачи и гранаты.</p><div class="chips">';
    data.players.forEach((p, i) => {
      h += '<a class="chip" style="--pc:' + p.color + '" href="#/player/' + p.id + '"><span class="chip-n">' + (i + 1) + '</span><span class="chip-t"><b>' + esc(p.nick) + "</b><small>" + esc(p.role) + "</small></span></a>";
    });
    h += "</div></section>";

    h += '<section class="card"><h2>2 · Карта</h2><div class="mapcards">';
    Object.keys(data.maps).forEach((mid) => {
      h += '<a class="mapcard" href="#/map/' + mid + '/T">' + mapSVG(mid, { labels: true, markers: [] }) + '<span class="mapcard-name">' + esc(data.maps[mid].name) + "</span></a>";
    });
    h += "</div><p class='muted'>На карте: позиции по сторонам (T/CT), гранаты со стрелками «откуда → куда» и колл-ауты.</p></section>";

    h += '<section class="card"><h2>3 · Утилити</h2><div class="utilrow">';
    h += '<a class="ubtn" href="#/timer">⏱ Таймер раунда</a>';
    h += '<button class="ubtn" id="ecoBtn">💰 Эко-шпаргалка</button>';
    h += "</div></section>";

    h += '<section class="card"><h2>Как это работает</h2><ul class="howto">' +
      "<li>Перед матчем кап открывает сайт, жмёт ✏️ и правит ники, позиции и гранаты под вашу игру.</li>" +
      "<li>В игре каждый открывает свою карточку: сторона T/CT → твоя точка на схеме и 3–4 правила.</li>" +
      "<li>Раздел «Гранаты»: стрелка на схеме = откуда кидать и куда прилетит. Линии докручиваете на праке.</li>" +
      "<li>Всё хранится у тебя в телефоне; кнопка «Экспорт» отдаёт JSON, чтобы расшарить команде.</li>" +
      "</ul></section>";

    v.innerHTML = h;
    $("#ecoBtn").onclick = showEco;
  }

  function showEco() {
    let h = '<div class="modal" id="modal"><div class="modal-in"><h3>Эко-шпаргалка</h3><table class="eco">';
    h += "<tr><th>Режим</th><th>Когда</th><th>Что берём</th></tr>";
    data.eco.forEach((e) => { h += "<tr><td><b>" + esc(e.name) + "</b></td><td>" + esc(e.when) + "</td><td>" + esc(e.what) + "</td></tr>"; });
    h += '</table><p class="muted">Правило большого пальца: после двух поражений подряд — эко или форс по решению капа. Спорим с капом — после матча, не в раунде.</p><button class="btn" id="mClose">Понятно</button></div></div>';
    document.body.insertAdjacentHTML("beforeend", h);
    $("#mClose").onclick = closeModal;
    $("#modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
  }
  function closeModal() { const m = $("#modal"); if (m) m.remove(); }

  /* ---------- страница игрока ---------- */
  function renderPlayerPage() {
    const p = playerById(ui.player);
    const v = $("#view");
    if (!p) { location.hash = "#/"; return; }
    const idx = data.players.indexOf(p);
    let h = '<a class="back" href="#/">← команда</a>';
    h += '<section class="hero phead" style="--pc:' + p.color + '"><span class="pnum">' + (idx + 1) + '</span><div><h1 class="ed" data-path="players.' + idx + '.nick">' + esc(p.nick) + '</h1><p class="ed" data-path="players.' + idx + '.role">' + esc(p.role) + "</p></div></section>";

    h += '<div class="sidetabs">' + sideTab("T") + sideTab("CT") + "</div>";

    // задачи
    h += '<section class="card"><h2>Твои задачи (всегда)</h2><ul class="tasklist">';
    p.tasks.forEach((t, i) => { h += '<li class="ed" data-path="players.' + idx + ".tasks." + i + '">' + esc(t) + "</li>"; });
    h += "</ul></section>";

    // позиции на картах
    h += '<section class="card"><h2>Твоя позиция · ' + (ui.side === "T" ? "атака (T)" : "защита (CT)") + "</h2>";
    Object.keys(data.maps).forEach((mid) => {
      const d = (mapById(mid).sides[ui.side].defaults || []).find((x) => x.player === p.id);
      if (!d) return;
      const mk = markersFor(mid, ui.side);
      h += '<div class="minimap"><h3>' + esc(mapById(mid).name) + "</h3>" + mapSVG(mid, { markers: mk, side: ui.side, focus: p.id, dimOthers: true, highlightZone: d.zone });
      h += '<p class="note ed" data-path="maps.' + mid + ".sides." + ui.side + ".defaults." + (mapById(mid).sides[ui.side].defaults.indexOf(d)) + '.note"><b>Куда:</b> ' + esc(d.note) + "</p></div>";
    });
    h += "</section>";

    // гранаты игрока
    const my = [];
    Object.keys(data.maps).forEach((mid) => {
      ["T", "CT"].forEach((sd) => {
        (mapById(mid).sides[sd].nades || []).forEach((n) => { if (n.by === p.id) my.push({ mid, sd, n }); });
      });
    });
    h += '<section class="card"><h2>Твои гранаты</h2>';
    if (!my.length) h += '<p class="muted">Пока не назначено. Кап может назначить в разделе карты → гранаты.</p>';
    my.forEach((r) => {
      const m = mapById(r.mid);
      const zf = zoneById(m, r.n.from), zt = zoneById(m, r.n.to);
      h += '<details class="nade"><summary>' + NADE_ICON[r.n.type] + " <b>" + esc(r.n.name) + '</b> <span class="tag">' + m.name + " · " + r.sd + "</span></summary>";
      h += mapSVG(r.mid, { arrows: [{ fx: zf.x, fy: zf.y, tx: zt.x, ty: zt.y, type: r.n.type }], labels: true });
      h += "<ol>" + r.n.steps.map((st, i) => '<li class="ed" data-path="maps.' + r.mid + ".sides." + r.sd + ".nades." + m.sides[r.sd].nades.indexOf(r.n) + ".steps." + i + '">' + esc(st) + "</li>").join("") + "</ol>";
      h += '<p class="note"><b>Зачем:</b> <span class="ed" data-path="maps.' + r.mid + ".sides." + r.sd + ".nades." + m.sides[r.sd].nades.indexOf(r.n) + '.note">' + esc(r.n.note) + "</span></p></details>";
    });
    h += "</section>";

    h += '<section class="card"><h2>Памятки</h2><ul class="tasklist tips">';
    p.tips.forEach((t, i) => { h += '<li class="ed" data-path="players.' + idx + ".tips." + i + '">' + esc(t) + "</li>"; });
    h += "</ul></section>";

    v.innerHTML = h;
    bindSideTabs();
    applyEdit();
  }

  function sideTab(sd) {
    return '<button class="stab ' + (ui.side === sd ? "on" : "") + '" data-side="' + sd + '">' + (sd === "T" ? "⚔ Атака (T)" : "🛡 Защита (CT)") + "</button>";
  }
  function bindSideTabs() {
    $$(".stab").forEach((b) => {
      b.onclick = () => {
        ui.side = b.dataset.side;
        if (ui.map) location.hash = "#/map/" + ui.map + "/" + ui.side;
        else renderPlayerPage();
      };
    });
  }

  /* ---------- страница карты ---------- */
  function renderMapPage() {
    const m = mapById(ui.map);
    const v = $("#view");
    if (!m) { location.hash = "#/"; return; }
    const sd = m.sides[ui.side];
    let h = '<a class="back" href="#/">← команда</a>';
    h += '<section class="hero"><h1>' + esc(m.name) + '</h1><p>' + (ui.side === "T" ? "Атака: план, позиции, гранаты" : "Защита: план, позиции, гранаты") + "</p></section>";
    h += '<div class="sidetabs">' + sideTab("T") + sideTab("CT") + "</div>";
    h += '<div class="tabs">' +
      tabBtn("pos", "Позиции") + tabBtn("nades", "Гранаты") + tabBtn("calls", "Колл-ауты") + tabBtn("plan", "План") +
      "</div>";

    if (ui.tab === "pos") {
      h += '<section class="card"><h2>Кто где стоит</h2>' + mapSVG(ui.map, { markers: markersFor(ui.map, ui.side), side: ui.side });
      h += '<ul class="poslist">';
      sd.defaults.forEach((d, i) => {
        const p = playerById(d.player); const z = zoneById(m, d.zone);
        h += '<li><a class="posrow" href="#/player/' + d.player + '" style="--pc:' + (p ? p.color : "#888") + '"><span class="chip-n">' + (data.players.indexOf(p) + 1) + '</span><span><b>' + esc(p ? p.nick : "?") + "</b> → " + esc(z ? z.name : d.zone) + '<small class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".defaults." + i + '.note">' + esc(d.note) + "</small></span></a></li>";
      });
      h += "</ul></section>";
    }

    if (ui.tab === "nades") {
      h += '<section class="card"><h2>Гранаты стороны ' + ui.side + '</h2><p class="muted">Нажми на гранату — на схеме появится стрелка «откуда → куда прилетит».</p>';
      if (editMode) h += '<button class="btn addNade" data-side="' + ui.side + '">+ добавить гранату</button>';
      (sd.nades || []).forEach((n, i) => {
        const zf = zoneById(m, n.from), zt = zoneById(m, n.to);
        const open = ui.nade === i;
        h += '<details class="nade" ' + (open ? "open" : "") + ' data-nade="' + i + '"><summary>' + NADE_ICON[n.type] + " <b>" + esc(n.name) + "</b> <span class=\"tag\">" + NADE_NAME[n.type] + (n.by ? " · " + esc((playerById(n.by) || {}).nick || "") : "") + "</span>" + (editMode ? ' <button class="del" data-del-nade="' + i + '">✕</button>' : "") + "</summary>";
        h += mapSVG(ui.map, { arrows: [{ fx: zf.x, fy: zf.y, tx: zt.x, ty: zt.y, type: n.type }] });
        h += "<ol>" + n.steps.map((st, si) => '<li class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".nades." + i + ".steps." + si + '">' + esc(st) + "</li>").join("") + "</ol>";
        h += '<p class="note"><b>Зачем:</b> <span class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".nades." + i + '.note">' + esc(n.note) + "</span></p></details>";
      });
      h += "</section>";
    }

    if (ui.tab === "calls") {
      h += '<section class="card"><h2>Колл-ауты</h2><p class="muted">Нажми на зону на схеме — подскажет, что это и зачем.</p>' +
        mapSVG(ui.map, { labels: true, highlightZone: ui.zone }) +
        '<div id="zoneInfo">' + (ui.zone ? zoneCard(m, zoneById(m, ui.zone)) : '<p class="muted">Выбери зону…</p>') + "</div></section>";
    }

    if (ui.tab === "plan") {
      h += '<section class="card"><h2>План на сторону ' + ui.side + "</h2><ol class=\"planlist\">";
      sd.plan.forEach((t, i) => { h += '<li class="ed" data-path="maps.' + ui.map + ".sides." + ui.side + ".plan." + i + '">' + esc(t) + "</li>"; });
      h += "</ol></section>";
    }

    v.innerHTML = h;
    bindSideTabs();
    $$(".tabs .tab").forEach((b) => { b.onclick = () => { ui.tab = b.dataset.tab; ui.nade = null; ui.zone = null; renderMapPage(); }; });
    $$(".nade").forEach((d) => { d.addEventListener("toggle", () => { if (d.open) { ui.nade = +d.dataset.nade; } }); });
    $$("[data-del-nade]").forEach((b) => { b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (confirm("Удалить гранату?")) { mapById(ui.map).sides[ui.side].nades.splice(+b.dataset.delNade, 1); save(); renderMapPage(); } }; });
    const addB = $(".addNade");
    if (addB) addB.onclick = () => addNade(ui.side);
    const svg = $(".card .map");
    if (svg && ui.tab === "calls") bindZoneTaps(svg);
    if (editMode) bindMapDrag(svg);
    applyEdit();
  }

  function tabBtn(t, label) {
    return '<button class="tab ' + (ui.tab === t ? "on" : "") + '" data-tab="' + t + '">' + label + "</button>";
  }
  function zoneCard(m, z) {
    if (!z) return "";
    return '<div class="zcard"><h3>' + esc(z.name) + "</h3><p>" + esc(z.desc || "") + "</p></div>";
  }
  function bindZoneTaps(svg) {
    $$(".zone", svg).forEach((r) => {
      r.classList.add("tap");
      r.addEventListener("click", () => { ui.zone = r.dataset.zone; renderMapPage(); });
    });
  }

  /* ---------- таймер ---------- */
  let timerInt = null, timerLeft = 0;
  function renderTimerPage() {
    const v = $("#view");
    v.innerHTML = '<a class="back" href="#/">← команда</a>' +
      '<section class="hero"><h1>Таймер</h1><p>Раунд 1:55 · бомба 40 сек</p></section>' +
      '<section class="card timer"><div class="tdisp" id="tdisp">1:55</div>' +
      '<div class="tbtns"><button class="btn big" data-t="115">Раунд 1:55</button>' +
      '<button class="btn big" data-t="40">Бомба 0:40</button>' +
      '<button class="btn big warn" data-t="0">Стоп</button></div>' +
      '<p class="muted">На конце: вибрация + звук. Телефон можно положить в карман.</p></section>';
    $$(".tbtns .btn").forEach((b) => { b.onclick = () => startTimer(+b.dataset.t); });
  }
  function startTimer(sec) {
    clearInterval(timerInt);
    timerLeft = sec;
    paintTimer();
    if (!sec) return;
    timerInt = setInterval(() => {
      timerLeft--;
      paintTimer();
      if (timerLeft <= 0) { clearInterval(timerInt); buzz(); }
      else if (timerLeft <= 5) buzzShort();
    }, 1000);
  }
  function paintTimer() {
    const d = $("#tdisp"); if (!d) return;
    const mm = Math.floor(timerLeft / 60), ss = timerLeft % 60;
    d.textContent = mm + ":" + String(ss).padStart(2, "0");
    d.classList.toggle("low", timerLeft <= 10 && timerLeft > 0);
  }
  function beep(freq, dur) {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) {}
  }
  function buzz() { beep(880, 0.6); beep(660, 0.9); if (navigator.vibrate) navigator.vibrate([400, 200, 400]); }
  function buzzShort() { beep(1200, 0.12); if (navigator.vibrate) navigator.vibrate(80); }

  /* ---------- режим редактирования ---------- */
  function setEdit(on) {
    editMode = on;
    document.body.classList.toggle("editing", on);
    $("#editBtn").classList.toggle("on", on);
    $("#editPanel").hidden = !on;
    render();
  }
  function applyEdit() {
    $$(".ed").forEach((el) => {
      el.classList.toggle("editable", editMode);
      el.contentEditable = editMode ? "true" : "false";
      if (editMode && !el.dataset.bound) {
        el.dataset.bound = "1";
        el.addEventListener("blur", () => {
          setPath(el.dataset.path, el.textContent.trim());
          save();
        });
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
      }
    });
  }
  function setPath(path, value) {
    const parts = path.split(".");
    let o = data;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  function getPath(path) {
    const parts = path.split(".");
    let o = data;
    for (const p of parts) { o = o[p]; if (o == null) return null; }
    return o;
  }

  function addNade(side) {
    const m = mapById(ui.map);
    const n = { id: "n" + Date.now(), type: "smoke", name: "Новая граната", by: data.players[0].id, from: m.zones[0].id, to: m.zones[1].id, steps: ["Откуда кидаем (опиши позицию)"], note: "Зачем кидаем" };
    m.sides[side].nades.push(n);
    save();
    ui.tab = "nades"; ui.nade = m.sides[side].nades.length - 1;
    renderMapPage();
  }

  /* перетаскивание маркеров/гранат в режиме редактирования */
  function bindMapDrag(svg) {
    if (!svg) return;
    svg.querySelectorAll(".pmk").forEach((g) => {
      g.classList.add("drag");
      g.addEventListener("pointerdown", (e) => startDrag(e, svg, g, "player"));
    });
  }
  function startDrag(e, svg, g, kind) {
    e.preventDefault();
    const pid = g.dataset.player, side = g.dataset.side, mid = g.dataset.map;
    const move = (ev) => {
      const pt = svgPoint(svg, ev);
      const d = mapById(mid).sides[side].defaults.find((x) => x.player === pid);
      if (!d) return;
      const z = zoneById(mapById(mid), d.zone);
      d.dx = Math.round((pt.x - z.x) * 10) / 10;
      d.dy = Math.round((pt.y - z.y) * 10) / 10;
      g.setAttribute("transform", "translate(" + pt.x + "," + pt.y + ")");
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function svgPoint(svg, ev) {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * vb.width)),
      y: Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * vb.height)),
    };
  }

  /* ---------- экспорт / импорт ---------- */
  function exportJSON() {
    const txt = JSON.stringify(data, null, 2);
    let h = '<div class="modal" id="modal"><div class="modal-in"><h3>Экспорт настроек</h3><p class="muted">Скопируй и отправь команде — они вставят через «Импорт». Или сохрани как файл data-backup.json.</p><textarea id="expTa" readonly>' + esc(txt) + '</textarea><div class="row"><button class="btn" id="cpBtn">Скопировать</button><button class="btn ghost" id="mClose">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", h);
    $("#cpBtn").onclick = () => { const ta = $("#expTa"); ta.select(); ta.setSelectionRange(0, 1e6); try { navigator.clipboard.writeText(ta.value); } catch (e) { document.execCommand("copy"); } $("#cpBtn").textContent = "Скопировано ✓"; };
    $("#mClose").onclick = closeModal;
  }
  function importJSON() {
    let h = '<div class="modal" id="modal"><div class="modal-in"><h3>Импорт настроек</h3><p class="muted">Вставь JSON от капа и нажми «Загрузить».</p><textarea id="impTa" placeholder="{...}"></textarea><div class="row"><button class="btn" id="doImp">Загрузить</button><button class="btn ghost" id="mClose">Закрыть</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", h);
    $("#doImp").onclick = () => {
      try {
        const obj = JSON.parse($("#impTa").value);
        if (!obj.players || !obj.maps) throw new Error("bad");
        obj.version = BASE.version;
        data = obj; save(); closeModal(); render();
      } catch (e) { alert("Не похоже на JSON плейбука :("); }
    };
    $("#mClose").onclick = closeModal;
  }

  /* ---------- рендер ---------- */
  function render() { route(); }

  function boot() {
    document.getElementById("editBtn").onclick = () => setEdit(!editMode);
    document.getElementById("expBtn").onclick = exportJSON;
    document.getElementById("impBtn").onclick = importJSON;
    document.getElementById("rstBtn").onclick = resetData;
    window.addEventListener("hashchange", route);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    render();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
