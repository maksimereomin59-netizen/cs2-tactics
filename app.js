/* ============================================================
   CS2 TEAM PLAYBOOK — приложение.
   Вход по названию команды + PIN, роли капитан/игрок,
   облачная синхронизация через PlaybookDB, realtime-обновления.
   ============================================================ */
(function () {
  "use strict";

  const DB = window.PlaybookDB;
  const Seed = window.PlaybookSeed;

  /* ---------- helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const uid = (p) => (p || "x") + Math.random().toString(36).slice(2, 10);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const debounce = (fn, ms) => {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };
  function fmtRel(ts) {
    if (!ts) return "";
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return "только что";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " мин назад";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " ч назад";
    const d = Math.floor(h / 24);
    if (d === 1) return "вчера";
    if (d < 7) return d + " дн назад";
    return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }
  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  function parseHash() {
    return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  }

  /* ---------- ui state ---------- */
  const S = {
    tfilter: { map: "", side: "", cat: "" },
    mfilter: { type: "", map: "" },
    pendingMaterial: null,
    boardTool: "select",
    boardColor: "#e8a72f",
    boardSel: null,
    sheetOpen: false,
    bootDone: false,
  };
  const isCap = () => DB.isCaptain();

  const playerById = (id) => DB.cache.players.find((p) => p.id === id) || null;
  const mapById = (id) => DB.cache.maps.find((m) => m.id === id) || null;
  const tacticById = (id) => DB.cache.tactics.find((t) => t.id === id) || null;
  const materialById = (id) => DB.cache.materials.find((m) => m.id === id) || null;

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    const root = $("#toastRoot");
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.remove(); }, 2200);
  }

  /* ---------- save indicator ---------- */
  let saveTimer = null;
  function saveState(state) {
    const el = $("#saveState");
    if (!el) return;
    clearTimeout(saveTimer);
    if (!state) { el.hidden = true; return; }
    el.hidden = false;
    if (state === "saving") { el.classList.remove("ok"); el.textContent = "Сохраняем…"; }
    else if (state === "saved") {
      el.classList.add("ok"); el.textContent = "✓ Сохранено";
      saveTimer = setTimeout(() => { el.hidden = true; }, 2000);
    } else if (state === "offline") {
      el.classList.remove("ok"); el.textContent = "Нет соединения";
    }
  }

  /* ---------- sheet (bottom sheet / dialog) ---------- */
  function openSheet(title, bodyHTML, footHTML) {
    closeMenus();
    S.sheetOpen = true;
    const root = $("#sheetRoot");
    root.innerHTML = '<div class="sheet" role="dialog"><div class="sheet-head"><h3>' + esc(title) +
      '</h3><button class="iconbtn" data-close type="button">✕</button></div><div class="sheet-body">' +
      bodyHTML + "</div>" + (footHTML ? '<div class="sheet-foot">' + footHTML + "</div>" : "") + "</div>";
    root.hidden = false;
    root.onclick = (e) => { if (e.target === root) closeSheet(); };
    $("[data-close]", root).onclick = closeSheet;
    return root;
  }
  function closeSheet() {
    $("#sheetRoot").hidden = true;
    $("#sheetRoot").innerHTML = "";
    S.sheetOpen = false;
  }
  function sheetOpen() { return S.sheetOpen; }

  /* ---------- modal (compact confirm) ---------- */
  function openModal(title, textHTML, buttons) {
    const root = $("#modalRoot");
    let btns = "";
    (buttons || [{ id: "ok", label: "Закрыть", primary: true }]).forEach((b) => {
      btns += '<button class="btn ' + (b.primary ? "" : b.danger ? "danger" : "ghost") + '" data-mbtn="' + b.id + '" type="button">' + esc(b.label) + "</button>";
    });
    root.innerHTML = '<div class="modal" role="alertdialog"><h3>' + esc(title) + "</h3><p>" + textHTML +
      '</p><div class="btnrow">' + btns + "</div></div>";
    root.hidden = false;
    root.onclick = (e) => { if (e.target === root) closeModal(); };
    $$("[data-mbtn]", root).forEach((btn) => {
      btn.onclick = () => {
        const b = (buttons || []).find((x) => x.id === btn.dataset.mbtn);
        closeModal();
        if (b && b.onClick) b.onClick();
      };
    });
  }
  function closeModal() {
    $("#modalRoot").hidden = true;
    $("#modalRoot").innerHTML = "";
  }
  function modalOpen() { return !$("#modalRoot").hidden; }
  function confirmDlg(title, onYes) {
    openModal(title, "Действие нельзя отменить.", [
      { id: "no", label: "Отмена" },
      { id: "yes", label: "Удалить", danger: true, onClick: onYes },
    ]);
  }

  /* ---------- popup menu (⋮) ---------- */
  function closeMenus() {
    $$(".menu").forEach((m) => m.remove());
    document.removeEventListener("click", closeMenus);
  }
  function openMenu(anchor, items) {
    closeMenus();
    const menu = document.createElement("div");
    menu.className = "menu";
    items.forEach((it) => {
      if (it.sep) { menu.insertAdjacentHTML("beforeend", '<div class="menu-sep"></div>'); return; }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item" + (it.danger ? " danger" : "");
      b.textContent = it.label;
      b.onclick = (e) => { e.stopPropagation(); closeMenus(); it.onClick && it.onClick(); };
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const mw = 210, mh = Math.min(window.innerHeight - 20, items.length * 38 + 12);
    let x = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw));
    let y = r.bottom + 4;
    if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 4);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    setTimeout(() => document.addEventListener("click", closeMenus), 0);
  }
  function menuOpen() { return !!document.querySelector(".menu"); }

  /* ---------- fullscreen viewer ---------- */
  function openViewer(imgSrc, caption) {
    const root = $("#viewerRoot");
    root.innerHTML = '<button class="iconbtn viewer-x" type="button">✕</button><div><img class="viewer-img" src="' +
      esc(imgSrc) + '" alt="' + esc(caption || "") + '">' + (caption ? '<div class="viewer-cap">' + esc(caption) + "</div>" : "") + "</div>";
    root.hidden = false;
    root.onclick = closeViewer;
  }
  function closeViewer() {
    $("#viewerRoot").hidden = true;
    $("#viewerRoot").innerHTML = "";
  }

  /* ---------- write helper with autosave indicator ---------- */
  async function commit(activityText, activityRef, fn) {
    if (!isCap()) { toast("Только капитан может изменять"); return null; }
    saveState("saving");
    try {
      const res = await fn();
      if (activityText) await DB.log(activityText, activityRef || null);
      saveState("saved");
      render();
      return res;
    } catch (e) {
      saveState("");
      toast((e && e.message) || "Не сохранилось", "warn");
      return null;
    }
  }

  /* ---------- shell ---------- */
  const NAV = [
    { id: "overview", label: "Обзор", hash: "#/overview" },
    { id: "maps", label: "Карты", hash: "#/maps" },
    { id: "tactics", label: "Тактики", hash: "#/tactics" },
    { id: "players", label: "Игроки", hash: "#/players" },
    { id: "materials", label: "Материалы", hash: "#/materials" },
    { id: "me", label: "Мой профиль", hash: "#/me" },
  ];
  const BOTTOM_NAV = ["overview", "maps", "tactics", "players"];

  function currentNavId() {
    const p = parseHash()[0] || "";
    if (p === "map") return "maps";
    if (p === "tactic") return "tactics";
    if (p === "player") return "players";
    if (p === "who") return "me";
    if (p === "manage") return "manage";
    return p || "overview";
  }

  function paintShell() {
    const logged = !!DB.team;
    $("#topbar").hidden = !logged;
    $("#sidebar").hidden = !logged;
    $("#bottomNav").hidden = !logged;
    document.body.classList.toggle("captain", logged && isCap());
    if (!logged) return;
    $("#brandTeam").textContent = DB.team.name;
    const badge = $("#roleBadge");
    badge.textContent = isCap() ? "Капитан" : "Игрок";
    badge.classList.toggle("cap", isCap());
    paintNet();
    const cur = currentNavId();
    $("#sideNav").innerHTML = NAV.map((n) =>
      '<a class="snlink' + (cur === n.id ? " on" : "") + '" href="' + n.hash + '">' + esc(n.label) + "</a>"
    ).join("") + '<a class="snlink' + (cur === "manage" ? " on" : "") + '" href="#/manage">⚙ Управление</a>';
    $("#sideFoot").innerHTML = esc(DB.mode() === "cloud" ? "Облако: синхронизация включена" : "Локальный режим: облако не подключено") +
      '<br><a href="#/manage" style="color:var(--muted)">Настройки →</a>';
    $("#bottomNav").innerHTML = BOTTOM_NAV.map((id) => {
      const n = NAV.find((x) => x.id === id);
      return '<a class="bnbtn' + (cur === id ? " on" : "") + '" href="' + n.hash + '">' + esc(n.label) + "</a>";
    }).join("") + '<button class="bnbtn' + ((cur === "materials" || cur === "me" || cur === "manage") ? " on" : "") + '" data-more type="button">Ещё</button>';
    $("[data-more]").onclick = openMore;
  }

  function paintNet() {
    const dot = $("#netDot");
    if (!dot) return;
    const cloud = DB.mode() === "cloud";
    dot.classList.toggle("off", cloud && !DB.online);
    dot.classList.toggle("local", !cloud);
    dot.title = cloud ? (DB.online ? "Облако: подключено" : "Нет соединения") : "Локальный режим";
    if (cloud && !DB.online) saveState("offline");
    else if ($("#saveState").textContent === "Нет соединения") saveState("");
  }

  function openMore() {
    openSheet("Ещё", '<div class="sec" style="margin-top:10px"><div class="sec-body">' +
      rowHTML("#/materials", "Материалы", DB.cache.materials.length + " шт.") +
      rowHTML("#/me", "Мой профиль", myName() || "Выбрать себя") +
      rowHTML("#/manage", "⚙ Управление", isCap() ? "Панель капитана" : "Вход для капитана") +
      "</div></div>" +
      '<div class="btnrow"><button class="btn ghost block" data-logout type="button">Выйти из команды</button></div>', "");
    $$("[data-goto]").forEach((a) => { a.onclick = closeSheet; });
    $("[data-logout]").onclick = () => { closeSheet(); doLogout(); };
  }
  function rowHTML(hash, title, sub) {
    return '<a class="row" data-goto href="' + hash + '"><span class="row-main"><b>' + esc(title) + "</b>" +
      (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span class="row-arrow">›</span></a>';
  }
  function myName() {
    const me = playerById(DB.myPlayerId());
    return me ? me.name : "";
  }
  function doLogout() {
    DB.logout();
    closeSheet();
    go("#/login");
  }

  /* ---------- global search ---------- */
  function openSearch() {
    closeMenus();
    const ov = document.createElement("div");
    ov.className = "searchov";
    ov.innerHTML = '<div class="searchbox"><input id="gSearch" placeholder="Поиск: smoke, Mirage, A Execute…" autocomplete="off">' +
      '<button class="btn ghost" type="button" data-x>Закрыть</button></div><div class="searchres" id="gRes"></div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.onclick = (e) => { if (e.target === ov) close(); };
    $("[data-x]", ov).onclick = close;
    const input = $("#gSearch", ov);
    const res = $("#gRes", ov);
    const run = () => {
      const list = DB.search(input.value);
      if (!list.length) {
        res.innerHTML = '<div class="empty">' + (input.value.trim().length < 2 ? "Введите минимум 2 символа" : "Ничего не найдено") + "</div>";
        return;
      }
      res.innerHTML = list.map((r) =>
        '<button class="row" data-kind="' + r.kind + '" data-id="' + esc(r.id) + '" type="button"><span class="row-main"><b>' +
        esc(r.title) + "</b><small>" + esc(r.sub || "") + "</small></span><span class=\"row-arrow\">›</span></button>"
      ).join("");
      $$(".row", res).forEach((b) => {
        b.onclick = () => { close(); openRef(b.dataset.kind, b.dataset.id); };
      });
    };
    input.oninput = debounce(run, 120);
    run();
    setTimeout(() => input.focus(), 30);
  }
  function openRef(kind, id) {
    if (kind === "tactic") go("#/tactic/" + id);
    else if (kind === "player") go("#/player/" + id);
    else if (kind === "map") go("#/map/" + id);
    else if (kind === "material") { S.pendingMaterial = id; go("#/materials"); }
  }

  /* ---------- router ---------- */
  function route() {
    closeSheet(); closeModal(); closeMenus(); closeViewer();
    S.boardSel = null;
    const logged = !!DB.team;
    const p = parseHash();
    if (!logged) {
      paintShell();
      if (p[0] === "create") viewCreate();
      else viewLogin();
      window.scrollTo(0, 0);
      return;
    }
    paintShell();
    render(false);
    window.scrollTo(0, 0);
  }

  function render(preserveScroll) {
    const y = preserveScroll === false ? 0 : window.scrollY;
    const p = parseHash();
    const id = p[0] || "overview";
    paintShell();
    if (id === "overview" || id === "") viewOverview();
    else if (id === "maps") viewMaps();
    else if (id === "map") viewMap(p[1]);
    else if (id === "tactics") viewTactics();
    else if (id === "tactic") viewTactic(p[1]);
    else if (id === "players") viewPlayers();
    else if (id === "player") viewPlayer(p[1]);
    else if (id === "me" || id === "who") viewMe();
    else if (id === "materials") viewMaterials();
    else if (id === "manage") viewManage();
    else if (id === "login" || id === "create") viewOverview();
    else viewOverview();
    if (preserveScroll !== false) window.scrollTo(0, y);
  }

  /* ---------- auth: login ---------- */
  let authMode = "player";
  function viewLogin() {
    const view = $("#view");
    view.innerHTML =
      '<div class="authwrap"><div class="authcard"><p class="autheye">CS2 TEAM PLAYBOOK</p><h1>Вход команды</h1>' +
      '<p class="sub">Название команды и PIN — больше ничего не нужно.</p>' +
      '<div class="authtabs"><button class="authtab' + (authMode === "player" ? " on" : "") + '" data-m="player" type="button">Игрок</button>' +
      '<button class="authtab' + (authMode === "captain" ? " on" : "") + '" data-m="captain" type="button">Капитан</button></div>' +
      '<form id="loginForm"><label class="field"><span>Название команды</span>' +
      '<input id="liName" maxlength="40" autocomplete="off" placeholder="Например, БРАТЫ" required></label>' +
      '<label class="field"><span>' + (authMode === "player" ? "PIN команды" : "PIN капитана") + "</span>" +
      '<input id="liPin" type="password" inputmode="numeric" maxlength="32" autocomplete="off" placeholder="••••••" required></label>' +
      '<div class="form-error" id="liErr"></div>' +
      '<div class="btnrow"><button class="btn block" type="submit">Войти</button></div></form>' +
      '<div class="authlinks"><button class="linklike" id="goCreate" type="button">Нет команды? Создать команду</button></div>' +
      "</div></div>";
    $$(".authtab").forEach((b) => { b.onclick = () => { authMode = b.dataset.m; viewLogin(); }; });
    $("#goCreate").onclick = () => go("#/create");
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("#liName").value, pin = $("#liPin").value;
      const errBox = $("#liErr");
      errBox.textContent = "";
      try {
        if (authMode === "player") {
          await DB.login({ name, pin });
        } else {
          // Капитан: сначала вход по командному PIN невозможен — ищем команду и проверяем PIN капитана.
          // Упрощение: пробуем login как игрок тем же PIN (если совпал — дальше claim не нужен),
          // иначе ищем команду и вызываем claimCaptain после временного входа.
          await captainDirectLogin(name, pin);
        }
        afterEnter();
      } catch (err) {
        errBox.textContent = (err && err.code === "ASK_TEAM_PIN")
          ? "С нового устройства сначала войдите как игрок (PIN команды), затем введите PIN капитана"
          : ((err && err.message) || "Не получилось войти");
      }
    };
    setTimeout(() => { const i = $("#liName"); if (i) i.focus(); }, 50);
  }

  async function captainDirectLogin(name, pin) {
    // Пробуем командный PIN (вдруг капитан ввёл его) — затем повышаем права PIN капитана.
    try {
      await DB.login({ name, pin });
      try { await DB.loginCaptain(pin); } catch (e) { /* остался игроком, ниже разберёмся */ }
      if (DB.isCaptain()) return;
      // Вошли как игрок, но капитанский PIN другой — нужен именно он.
      DB.logout();
      throw err2("NEED_CAP_PIN");
    } catch (e) {
      if (e && e.code === "NEED_CAP_PIN") {
        // Вход игроком удался, а PIN капитана другой: пускаем как игрока и сразу просим PIN капитана.
        await DB.login({ name, pin });
        S.askCaptainPin = true;
        return;
      }
      // Командный PIN не подошёл: может, это PIN капитана. Ищем команду локально/в облаке.
      const found = await findTeamForCaptain(name, pin);
      if (!found) throw e;
    }
  }
  function err2(code) { const er = new Error(code); er.code = code; return er; }

  async function findTeamForCaptain(name, pin) {
    // Local: сверяем captainPinHash напрямую через временный доступ адаптера.
    if (DB.mode() === "local") {
      const team = DB.adapter.findTeam(name);
      if (!team) return false;
      try {
        await DB.adapter.claimCaptain(team.id, pin);
      } catch (e) { return false; }
      DB.team = DB.adapter.publicTeam(team);
      DB.role = "captain";
      DB.persistSession();
      await DB.refresh();
      return true;
    }
    // Cloud: вступаем через RPC claim только для участников; для капитана с нового
    // устройства просим сначала командный PIN — показываем подсказку.
    throw err2("ASK_TEAM_PIN");
  }

  function afterEnter() {
    if (!DB.myPlayerId() && DB.cache.players.length) go("#/who");
    else go("#/overview");
    if (S.askCaptainPin) {
      S.askCaptainPin = false;
      setTimeout(() => askCaptainPin("Вы вошли как игрок. Введите PIN капитана для правок."), 400);
    }
  }

  function askCaptainPin(sub, onOk) {
    openSheet("PIN капитана",
      (sub ? '<p class="muted tiny">' + esc(sub) + "</p>" : "") +
      '<form id="capPinForm"><label class="field"><span>PIN капитана</span>' +
      '<input id="capPin" type="password" inputmode="numeric" maxlength="32" autocomplete="off" required></label>' +
      '<div class="form-error" id="capPinErr"></div></form>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Подтвердить</button>');
    $("[data-x]").onclick = closeSheet;
    const submit = async () => {
      try {
        await DB.loginCaptain($("#capPin").value);
        closeSheet();
        toast("Режим капитана включён", "ok");
        render();
        if (onOk) onOk();
      } catch (e) { $("#capPinErr").textContent = (e && e.message) || "Неверный PIN"; }
    };
    $("[data-ok]").onclick = submit;
    $("#capPinForm").onsubmit = (e) => { e.preventDefault(); submit(); };
    setTimeout(() => $("#capPin").focus(), 50);
  }

  /* ---------- auth: create team ---------- */
  function viewCreate() {
    const view = $("#view");
    view.innerHTML =
      '<div class="authwrap"><div class="authcard"><p class="autheye">CS2 TEAM PLAYBOOK</p><h1>Новая команда</h1>' +
      '<p class="sub">Капитан создаёт команду один раз и отправляет игрокам PIN.</p>' +
      '<form id="crForm"><label class="field"><span>Название команды</span>' +
      '<input id="crName" maxlength="40" autocomplete="off" placeholder="Например, БРАТЫ" required></label>' +
      '<div class="field-row"><label class="field"><span>PIN команды</span>' +
      '<input id="crPin" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off" placeholder="Для игроков" required></label>' +
      '<label class="field"><span>PIN капитана</span>' +
      '<input id="crCapPin" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off" placeholder="Только вам" required></label></div>' +
      '<label class="field"><span>Имя капитана</span>' +
      '<input id="crCap" maxlength="24" autocomplete="off" placeholder="Например, Max" required></label>' +
      '<div class="form-error" id="crErr"></div>' +
      '<div class="btnrow"><button class="btn block" type="submit">Создать команду</button></div></form>' +
      '<div class="authlinks"><button class="linklike" id="goLogin" type="button">Уже есть команда? Войти</button></div>' +
      "</div></div>";
    $("#goLogin").onclick = () => go("#/login");
    $("#crForm").onsubmit = async (e) => {
      e.preventDefault();
      const errBox = $("#crErr");
      errBox.textContent = "";
      const pin = $("#crPin").value, capPin = $("#crCapPin").value;
      if (pin === capPin) { errBox.textContent = "PIN команды и PIN капитана должны различаться"; return; }
      try {
        await DB.createTeam(
          { name: $("#crName").value, pin, captain: $("#crCap").value, captainPin: capPin },
          (teamId) => Seed.seedTeam(teamId)
        );
        viewCreated(pin);
      } catch (err) { errBox.textContent = (err && err.message) || "Не получилось создать"; }
    };
  }

  function viewCreated(pin) {
    const view = $("#view");
    paintShell();
    view.innerHTML =
      '<div class="authwrap"><div class="authcard"><p class="autheye">ГОТОВО</p><h1>Команда создана</h1>' +
      '<p class="sub">Отправьте игрокам название команды и этот код. Стартовый набор (карты, состав, тактики) уже загружен — меняйте всё под себя.</p>' +
      '<div class="pinview"><small>Код команды для игроков</small><b>' + esc(pin) + "</b></div>" +
      '<div class="btnrow"><button class="btn block" id="openPb" type="button">Открыть плейбук</button></div>' +
      "</div></div>";
    $("#openPb").onclick = () => afterEnter();
  }

  /* ---------- overview ---------- */
  function sideBadge(side) {
    if (side === "CT") return '<span class="badge side-ct">CT</span>';
    if (side === "ANY") return '<span class="badge">T/CT</span>';
    return '<span class="badge side-t">T</span>';
  }
  function tacticsOfMap(mapId, side) {
    return DB.cache.tactics.filter((t) => (!mapId || t.map_id === mapId) && (!side || t.side === side));
  }
  function involvement(playerId) {
    const tactics = [];
    const tasks = [];
    const nades = [];
    DB.cache.tactics.forEach((t) => {
      let hit = false;
      (t.blocks || []).forEach((b) => {
        (b.items || []).forEach((it) => {
          if (it.playerId === playerId || it.by === playerId) {
            hit = true;
            if (b.type === "tasks") tasks.push({ tactic: t, item: it });
            if (b.type === "grenades") nades.push({ tactic: t, item: it });
          }
        });
        (b.markers || []).forEach((m) => { if (m.playerId === playerId) hit = true; });
      });
      if (hit) tactics.push(t);
    });
    return { tactics, tasks, nades };
  }

  function viewOverview() {
    const view = $("#view");
    const me = playerById(DB.myPlayerId());
    const maps = DB.cache.maps.slice(0, 6);
    const recentTactics = DB.cache.tactics.slice().sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)).slice(0, 5);
    const favs = DB.favs().slice(0, 8);
    const feed = DB.cache.activity.slice(0, 8);

    let html = '<div class="pagehead"><div><h1>' + esc(DB.team.name) + "</h1>" +
      '<p class="sub">' + (me ? "Привет, " + esc(me.name) : "Обзор команды") + " · " + DB.cache.players.length + " игр. · " +
      DB.cache.maps.length + " карт · " + DB.cache.tactics.length + " такт.</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-newtactic type="button">+ Тактика</button></div>' : "") + "</div>";

    html += '<div class="ovgrid two">';
    // Состав
    html += '<div class="sec"><div class="sec-head"><h2>Состав</h2><button class="more" data-go="#/players" type="button">Все ›</button></div><div class="rosterchips">';
    if (!DB.cache.players.length) html += '<div class="empty">Пока пусто.</div>';
    DB.cache.players.forEach((p) => {
      html += '<a class="rchip" style="--pc:' + esc(p.color || "#e8a72f") + '" href="#/player/' + p.id + '">' + esc(p.name) +
        (p.role ? " <small>" + esc(p.role) + "</small>" : "") + (me && me.id === p.id ? " <small>· вы</small>" : "") + "</a>";
    });
    html += "</div></div>";

    // Мой профиль / выбор себя
    if (me) {
      const inv = involvement(me.id);
      html += '<div class="sec"><div class="sec-head"><h2>Твой профиль</h2><button class="more" data-go="#/me" type="button">Открыть ›</button></div><div class="sec-pad">' +
        "<div><b>" + esc(me.name) + "</b>" + (me.role ? ' · <span class="muted">' + esc(me.role) + "</span>" : "") + "</div>" +
        '<div class="tiny muted">Тактики: ' + inv.tactics.length + " · Задачи: " + inv.tasks.length + " · Гранаты: " + inv.nades.length + "</div></div></div>";
    } else if (DB.cache.players.length) {
      html += '<div class="sec"><div class="sec-head"><h2>Кто ты?</h2></div><div class="sec-pad"><div class="btnrow" style="margin-top:0">';
      DB.cache.players.forEach((p) => {
        html += '<button class="btn ghost tiny" data-pick="' + p.id + '" type="button">' + esc(p.name) + "</button>";
      });
      html += "</div></div></div>";
    }

    // Быстрый доступ к картам
    html += '<div class="sec"><div class="sec-head"><h2>Карты</h2><button class="more" data-go="#/maps" type="button">Все ›</button></div><div class="sec-body">';
    if (!DB.cache.maps.length) html += '<div class="empty">Карт пока нет.</div>';
    maps.forEach((m) => {
      html += '<a class="row" href="#/map/' + m.id + '">' + mapThumb(m, 52) + '<span class="row-main"><b>' + esc(m.name) +
        "</b><small>" + tacticsOfMap(m.id).length + " такт.</small></span><span class=\"row-arrow\">›</span></a>";
    });
    html += "</div></div>";

    // Активные тактики (недавно обновлённые)
    html += '<div class="sec"><div class="sec-head"><h2>Активные тактики</h2><button class="more" data-go="#/tactics" type="button">Все ›</button></div><div class="sec-body">';
    if (!recentTactics.length) html += '<div class="empty">Тактик пока нет.</div>';
    recentTactics.forEach((t) => {
      const m = mapById(t.map_id);
      html += tacticRowHTML(t, m);
    });
    html += "</div></div>";

    // Избранное
    if (favs.length) {
      html += '<div class="sec"><div class="sec-head"><h2>★ Избранное</h2></div><div class="sec-body">';
      favs.forEach((f) => {
        html += '<button class="row" data-favgo="' + f.kind + ":" + esc(f.id) + '" type="button"><span class="row-main"><b>' + esc(f.title) +
          "</b><small>" + esc(favKindName(f.kind)) + "</small></span><span class=\"row-arrow\">›</span></button>";
      });
      html += "</div></div>";
    }

    // Последние изменения
    html += '<div class="sec"><div class="sec-head"><h2>Последние изменения</h2></div><div class="sec-body">';
    if (!feed.length) html += '<div class="empty">Пока тихо.</div>';
    feed.forEach((a) => { html += activityRowHTML(a); });
    html += "</div></div>";
    html += "</div>";

    view.innerHTML = html;
    bindOverview(view);
  }

  function bindOverview(view) {
    $$("[data-go]", view).forEach((b) => { b.onclick = () => go(b.dataset.go); });
    $$("[data-pick]", view).forEach((b) => {
      b.onclick = () => {
        DB.setMyPlayer(b.dataset.pick);
        toast("Привет, " + (myName() || ""), "ok");
        render();
      };
    });
    $$("[data-favgo]", view).forEach((b) => {
      b.onclick = () => { const [k, id] = b.dataset.favgo.split(":"); openRef(k, id); };
    });
    $$("[data-act]", view).forEach((b) => {
      b.onclick = () => { const [k, id] = b.dataset.act.split(":"); if (k && id) openRef(k, id); };
    });
    const nt = $("[data-newtactic]", view);
    if (nt) nt.onclick = () => sheetNewTactic(null);
  }

  function tacticRowHTML(t, m) {
    return '<a class="row" href="#/tactic/' + t.id + '"><span class="row-main"><b>' + esc(t.name) + "</b><small>" +
      esc((m ? m.name + " · " : "") + (t.category || "Тактика")) + "</small></span>" +
      '<span class="row-side">' + sideBadge(t.side) + '<span class="row-arrow">›</span></span></a>';
  }
  function activityRowHTML(a) {
    const clickable = a.ref_kind && a.ref_id;
    const inner = "<time>" + fmtTime(a.ts) + "</time><span>" + (a.actor ? "<b>" + esc(a.actor) + "</b> — " : "") + esc(a.text) +
      ' <span class="tiny muted">' + fmtRel(a.ts) + "</span></span>";
    if (clickable) return '<div class="actrow"><button data-act="' + a.ref_kind + ":" + esc(a.ref_id) + '" type="button">' + inner + "</button></div>";
    return '<div class="actrow">' + inner + "</div>";
  }
  function favKindName(kind) {
    return kind === "tactic" ? "Тактика" : kind === "player" ? "Игрок" : kind === "map" ? "Карта" : "Материал";
  }
  function mapThumb(m, w) {
    if (m && m.image) return '<img class="mapthumb" src="' + esc(m.image) + '" alt="" loading="lazy">';
    return '<span class="mapthumb" style="display:inline-block"></span>';
  }

  /* ---------- maps ---------- */
  function viewMaps() {
    const view = $("#view");
    let html = '<div class="pagehead"><div><h1>Карты</h1><p class="sub">' + DB.cache.maps.length + " шт. · откройте карту, затем тактику</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-addmap type="button">+ Карта</button></div>' : "") + "</div>";
    html += '<div class="sec"><div class="sec-body">';
    if (!DB.cache.maps.length) html += '<div class="empty">Карт пока нет.' + (isCap() ? " Добавьте первую." : "") + "</div>";
    DB.cache.maps.forEach((m) => {
      const n = tacticsOfMap(m.id).length;
      html += '<div class="row" style="cursor:default"><a class="row-main" style="display:flex;gap:10px;align-items:center;text-decoration:none;flex:1;min-width:0" href="#/map/' + m.id + '">' +
        mapThumb(m, 52) + '<span style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.name) +
        "</b><small class=\"muted\">" + n + " такт.</small></span></a>" +
        '<span class="row-side"><button class="starbtn' + (DB.isFav("map", m.id) ? " on" : "") + '" data-fav="map:' + m.id + '" type="button">★</button>' +
        (isCap() ? '<button class="menubtn" data-mapmenu="' + m.id + '" type="button">⋮</button>' : '<a class="row-arrow" href="#/map/' + m.id + '" style="text-decoration:none">›</a>') + "</span></div>";
    });
    html += "</div></div>";
    view.innerHTML = html;
    const add = $("[data-addmap]", view);
    if (add) add.onclick = () => sheetMap(null);
    $$("[data-fav]", view).forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        const [kind, id] = b.dataset.fav.split(":");
        const m = mapById(id);
        DB.toggleFav(kind, id, m ? m.name : "");
        render();
      };
    });
    $$("[data-mapmenu]", view).forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); mapMenu(b, b.dataset.mapmenu); };
    });
  }

  function mapMenu(anchor, id) {
    const m = mapById(id);
    if (!m) return;
    const items = [
      { label: "Открыть", onClick: () => go("#/map/" + id) },
      { label: "Изменить", onClick: () => sheetMap(m) },
      { label: "＋ Тактика на этой карте", onClick: () => sheetNewTactic(id) },
      { sep: true },
      { label: "Выше", onClick: () => moveRow("maps", id, -1) },
      { label: "Ниже", onClick: () => moveRow("maps", id, 1) },
      { sep: true },
      { label: "Удалить", danger: true, onClick: () => confirmDlg('Удалить карту «' + m.name + "»?", () => commit('удалил карту «' + m.name + "»", null, () => DB.del("maps", id))) },
    ];
    openMenu(anchor, items);
  }

  async function moveRow(table, id, dir) {
    const rows = DB.cache[table].slice();
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
    await commit(null, null, () => DB.reorder(table, rows.map((r) => r.id)));
  }

  function viewMap(id) {
    const m = mapById(id);
    const view = $("#view");
    if (!m) { go("#/maps"); return; }
    const tT = tacticsOfMap(id, "T"), tCT = tacticsOfMap(id, "CT"), tAny = tacticsOfMap(id, "ANY");
    const mats = DB.cache.materials.filter((x) => x.map_id === id);
    let html = '<a class="backlink" href="#/maps">← Карты</a><div class="pagehead"><div><h1>' + esc(m.name) + "</h1>" +
      '<p class="sub">' + (tT.length + tCT.length + tAny.length) + " такт. · " + mats.length + " матер.</p></div>" +
      '<div class="actions"><button class="starbtn' + (DB.isFav("map", m.id) ? " on" : "") + '" data-fav type="button" style="font-size:20px">★</button>' +
      (isCap() ? '<button class="btn tiny" data-addt type="button">+ Тактика</button><button class="menubtn" data-mm type="button">⋮</button>' : "") + "</div></div>";
    if (m.image) html += '<div class="sec"><div class="thumbs" style="padding:12px"><button class="thumb" data-full type="button"><img src="' + esc(m.image) + '" alt=""><span>Открыть карту</span></button></div></div>';
    html += sideSection("Сторона T", tT, m);
    html += sideSection("Сторона CT", tCT, m);
    if (tAny.length) html += sideSection("Обе стороны", tAny, m);
    if (mats.length) {
      html += '<div class="sec"><div class="sec-head"><h2>Материалы карты</h2></div><div class="sec-body">';
      mats.forEach((x) => { html += materialRowHTML(x, true); });
      html += "</div></div>";
    }
    view.innerHTML = html;
    $("[data-fav]", view).onclick = () => { DB.toggleFav("map", m.id, m.name); render(); };
    const full = $("[data-full]", view);
    if (full) full.onclick = () => openViewer(m.image, m.name);
    const addt = $("[data-addt]", view);
    if (addt) addt.onclick = () => sheetNewTactic(m.id);
    const mm = $("[data-mm]", view);
    if (mm) mm.onclick = (e) => { e.stopPropagation(); mapMenu(mm, m.id); };
    bindMaterialRows(view);
  }

  function sideSection(title, list, m) {
    let html = '<div class="sec"><div class="sec-head"><h2>' + esc(title) + " · " + list.length + "</h2></div><div class=\"sec-body\">";
    if (!list.length) html += '<div class="empty">Пусто.</div>';
    list.forEach((t) => { html += tacticRowHTML(t, m); });
    return html + "</div></div>";
  }

  /* ---------- tactics list + filters ---------- */
  const CATEGORIES = ["Execute", "Default", "Retake", "Split", "Control", "Utility", "Pistol", "Eco", "Force"];
  function viewTactics() {
    const view = $("#view");
    const f = S.tfilter;
    const cats = [];
    DB.cache.tactics.forEach((t) => { if (t.category && cats.indexOf(t.category) < 0) cats.push(t.category); });
    let html = '<div class="pagehead"><div><h1>Тактики</h1><p class="sub">' + DB.cache.tactics.length + " шт.</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-newt type="button">+ Тактика</button></div>' : "") + "</div>";
    // Фильтры: карта
    html += '<div class="chiprow"><button class="chip' + (!f.map ? " on" : "") + '" data-f="map:" type="button">Все карты</button>';
    DB.cache.maps.forEach((m) => {
      html += '<button class="chip' + (f.map === m.id ? " on" : "") + '" data-f="map:' + m.id + '" type="button">' + esc(m.name) + "</button>";
    });
    html += "</div>";
    // Фильтры: сторона + категория
    html += '<div class="chiprow"><button class="chip' + (!f.side ? " on" : "") + '" data-f="side:" type="button">T/CT</button>' +
      '<button class="chip' + (f.side === "T" ? " on" : "") + '" data-f="side:T" type="button">T</button>' +
      '<button class="chip' + (f.side === "CT" ? " on" : "") + '" data-f="side:CT" type="button">CT</button></div>';
    if (cats.length) {
      html += '<div class="chiprow"><button class="chip' + (!f.cat ? " on" : "") + '" data-f="cat:" type="button">Все типы</button>';
      cats.forEach((c) => {
        html += '<button class="chip' + (f.cat === c ? " on" : "") + '" data-f="cat:' + esc(c) + '" type="button">' + esc(c) + "</button>";
      });
      html += "</div>";
    }
    const list = DB.cache.tactics.filter((t) =>
      (!f.map || t.map_id === f.map) && (!f.side || t.side === f.side || t.side === "ANY") && (!f.cat || t.category === f.cat));
    html += '<div class="sec"><div class="sec-body">';
    if (!list.length) html += '<div class="empty">Ничего не найдено. Попробуйте смягчить фильтры.</div>';
    // Группируем по картам для читаемости.
    const groups = {};
    list.forEach((t) => {
      const key = t.map_id || "none";
      (groups[key] = groups[key] || []).push(t);
    });
    Object.keys(groups).forEach((key) => {
      const m = mapById(key);
      if (!f.map) html += '<div class="sec-head"><h2>' + esc(m ? m.name : "Без карты") + "</h2></div>";
      groups[key].forEach((t) => { html += tacticRowHTML(t, m); });
    });
    html += "</div></div>";
    view.innerHTML = html;
    $$("[data-f]", view).forEach((b) => {
      b.onclick = () => {
        const [k, v] = b.dataset.f.split(/:(.+)/);
        S.tfilter[k] = v || "";
        render();
      };
    });
    const nt = $("[data-newt]", view);
    if (nt) nt.onclick = () => sheetNewTactic(f.map || null);
  }

  /* ---------- new / edit tactic ---------- */
  function sheetNewTactic(presetMapId) {
    if (!isCap()) return;
    const maps = DB.cache.maps;
    const templates = DB.cache.templates;
    openSheet("Новая тактика",
      '<form id="ntForm">' +
      '<label class="field"><span>Название</span><input id="ntName" maxlength="60" placeholder="A Execute" required></label>' +
      '<div class="field-row"><label class="field"><span>Карта</span><select id="ntMap">' +
      '<option value="">— Без карты —</option>' + maps.map((m) => '<option value="' + m.id + '"' + (presetMapId === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>Сторона</span><select id="ntSide"><option value="T">T</option><option value="CT">CT</option><option value="ANY">Обе</option></select></label></div>' +
      '<div class="field-row"><label class="field"><span>Категория</span><input id="ntCat" list="catList" maxlength="24" placeholder="Execute"></label>' +
      '<label class="field"><span>Шаблон блоков</span><select id="ntTpl"><option value="">Пустая</option>' +
      templates.map((t) => '<option value="' + t.id + '">' + esc(t.name) + "</option>").join("") + "</select></label></div>" +
      '<datalist id="catList">' + CATEGORIES.map((c) => "<option>" + c + "</option>").join("") + "</datalist>" +
      '<label class="field"><span>Описание</span><textarea id="ntDesc" placeholder="Замысел тактики…"></textarea></label>' +
      '<div class="form-error" id="ntErr"></div></form>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Создать</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#ntName").value.trim();
      if (!name) { $("#ntErr").textContent = "Введите название"; return; }
      const tpl = templates.find((t) => t.id === $("#ntTpl").value);
      const blocks = tpl ? reIdBlocks(clone(tpl.blocks)) : [];
      const created = await commit('создал тактику «' + name + "»", null, () => DB.save("tactics", {
        map_id: $("#ntMap").value || null,
        name, side: $("#ntSide").value, category: $("#ntCat").value.trim(),
        description: $("#ntDesc").value.trim(), blocks,
      }));
      if (created) { closeSheet(); go("#/tactic/" + created.id); }
    };
  }
  function reIdBlocks(blocks) {
    (blocks || []).forEach((b) => {
      b.id = uid("b");
      (b.items || []).forEach((it) => { it.id = uid("i"); });
      (b.markers || []).forEach((m) => { m.id = uid("m"); });
      (b.drawings || []).forEach((d) => { d.id = uid("d"); });
    });
    return blocks;
  }

  function sheetEditTactic(t) {
    if (!isCap()) return;
    openSheet("Изменить тактику",
      '<form id="etForm"><label class="field"><span>Название</span><input id="etName" maxlength="60" value="' + esc(t.name) + '" required></label>' +
      '<div class="field-row"><label class="field"><span>Карта</span><select id="etMap"><option value="">— Без карты —</option>' +
      DB.cache.maps.map((m) => '<option value="' + m.id + '"' + (t.map_id === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>Сторона</span><select id="etSide">' +
      ["T", "CT", "ANY"].map((s) => '<option value="' + s + '"' + (t.side === s ? " selected" : "") + ">" + (s === "ANY" ? "Обе" : s) + "</option>").join("") + "</select></label></div>" +
      '<label class="field"><span>Категория</span><input id="etCat" list="catList" maxlength="24" value="' + esc(t.category || "") + '"></label>' +
      '<datalist id="catList">' + CATEGORIES.map((c) => "<option>" + c + "</option>").join("") + "</datalist></form>",
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#etName").value.trim();
      if (!name) return;
      const ok = await commit('изменил тактику «' + name + "»", { kind: "tactic", id: t.id }, () => DB.save("tactics", {
        id: t.id, name, map_id: $("#etMap").value || null, side: $("#etSide").value, category: $("#etCat").value.trim(),
      }));
      if (ok) closeSheet();
    };
  }

  async function duplicateTactic(id) {
    const t = tacticById(id);
    if (!t || !isCap()) return;
    const copy = clone(t);
    delete copy.id;
    copy.name = t.name + " 2";
    reIdBlocks(copy.blocks);
    const created = await commit('дублировал тактику «' + t.name + "»", null, () => DB.save("tactics", copy));
    if (created) go("#/tactic/" + created.id);
  }

  function sheetSaveTemplate(t) {
    if (!isCap()) return;
    openSheet("Сохранить как шаблон",
      '<label class="field"><span>Название шаблона</span><input id="tplName" maxlength="60" value="' + esc(t.name) + '"></label>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#tplName").value.trim() || t.name;
      const ok = await commit('создал шаблон «' + name + "»", null, () => DB.save("templates", { name, blocks: reIdBlocks(clone(t.blocks || [])) }));
      if (ok) closeSheet();
    };
  }

  /* ---------- map sheet ---------- */
  function sheetMap(m) {
    if (!isCap()) return;
    const isNew = !m;
    m = m || { name: "", image: "" };
    const presets = [
      ["", "Без изображения"],
      ["assets/maps/mirage.png", "Mirage (встроенный радар)"],
      ["assets/maps/ancient.png", "Ancient (встроенный радар)"],
      ["assets/maps/dust2.png", "Dust 2 (встроенный радар)"],
    ];
    openSheet(isNew ? "Новая карта" : "Изменить карту",
      '<label class="field"><span>Название</span><input id="mpName" maxlength="40" value="' + esc(m.name) + '" placeholder="Mirage"></label>' +
      '<label class="field"><span>Изображение радара</span><select id="mpPreset">' +
      presets.map((p) => '<option value="' + p[0] + '"' + (m.image === p[0] ? " selected" : "") + ">" + p[1] + "</option>").join("") +
      '<option value="__custom">Своя ссылка…</option></select></label>' +
      '<label class="field" id="mpCustomWrap" hidden><span>Ссылка на изображение</span><input id="mpCustom" maxlength="500" value="' + esc(m.image || "") + '" placeholder="https://…"></label>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    const preset = $("#mpPreset");
    const syncCustom = () => { $("#mpCustomWrap").hidden = preset.value !== "__custom"; };
    preset.onchange = syncCustom;
    if (m.image && !presets.some((p) => p[0] === m.image)) { preset.value = "__custom"; syncCustom(); }
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#mpName").value.trim();
      if (!name) return;
      const image = preset.value === "__custom" ? $("#mpCustom").value.trim() : preset.value;
      const payload = { name, image };
      if (!isNew) payload.id = m.id;
      const saved = await commit(isNew ? 'добавил карту «' + name + "»" : 'изменил карту «' + name + "»", isNew ? null : { kind: "map", id: m.id }, () => DB.save("maps", payload));
      if (saved) { closeSheet(); if (isNew) go("#/map/" + saved.id); }
    };
  }

  /* ---------- tactic detail ---------- */
  const BLOCK_NAMES = { roster: "Состав", tasks: "Задачи", grenades: "Гранаты", board: "Схема", image: "Изображения", video: "Видео", note: "Заметки" };
  const NADE_ICON = { smoke: "💨", molly: "🔥", flash: "⚡" };
  const NADE_NAME = { smoke: "Смouk", molly: "Молотов", flash: "Флешка" };
  function nadeName(k) { return k === "smoke" ? "Смоук" : k === "molly" ? "Молотов" : k === "flash" ? "Флешка" : "Граната"; }

  function viewTactic(id) {
    const t = tacticById(id);
    const view = $("#view");
    if (!t) { go("#/tactics"); return; }
    const m = mapById(t.map_id);
    let html = '<a class="backlink" href="' + (m ? "#/map/" + m.id : "#/tactics") + '">← ' + esc(m ? m.name : "Тактики") + "</a>";
    html += '<div class="pagehead"><div><h1>' + esc(t.name) + "</h1>" +
      '<p class="sub">' + esc([m ? m.name : null, t.side === "ANY" ? "T/CT" : t.side, t.category || null].filter(Boolean).join(" / ")) +
      (t.updated_at ? " · обновлено " + fmtRel(t.updated_at) : "") + "</p></div>" +
      '<div class="actions"><button class="starbtn' + (DB.isFav("tactic", t.id) ? " on" : "") + '" data-fav type="button" style="font-size:20px">★</button>' +
      (isCap() ? '<button class="menubtn" data-tmenu type="button">⋮</button>' : "") + "</div></div>";

    if (t.description || isCap()) {
      html += '<div class="sec"><div class="sec-head"><h2>Описание</h2>' +
        (isCap() ? '<button class="more" data-editdesc type="button">Изменить</button>' : "") + "</div>" +
        (t.description ? '<div class="desc">' + esc(t.description) + "</div>" : '<div class="empty">Описания нет.</div>') + "</div>";
    }

    html += '<div class="sec" id="blocksSec"><div class="sec-head"><h2>Блоки · ' + (t.blocks || []).length + "</h2></div><div>";
    const blocks = (t.blocks || []).filter((b) => !b.hidden || isCap());
    if (!blocks.length) html += '<div class="empty">Блоков пока нет.' + (isCap() ? " Добавьте первый ниже." : "") + "</div>";
    blocks.forEach((b) => { html += blockHTML(t, b); });
    html += "</div>";
    if (isCap()) {
      html += '<div class="addbar"><button class="addbtn" data-add="roster" type="button">+ Состав</button>' +
        '<button class="addbtn" data-add="tasks" type="button">+ Задачи</button>' +
        '<button class="addbtn" data-add="grenades" type="button">+ Гранаты</button>' +
        '<button class="addbtn" data-add="board" type="button">+ Схема</button>' +
        '<button class="addbtn" data-add="image" type="button">+ Изображение</button>' +
        '<button class="addbtn" data-add="video" type="button">+ Видео</button>' +
        '<button class="addbtn" data-add="note" type="button">+ Заметка</button></div>';
    }
    html += "</div>";
    view.innerHTML = html;

    $("[data-fav]", view).onclick = () => { DB.toggleFav("tactic", t.id, t.name); render(); };
    const tm = $("[data-tmenu]", view);
    if (tm) tm.onclick = (e) => { e.stopPropagation(); tacticMenu(tm, t); };
    const ed = $("[data-editdesc]", view);
    if (ed) ed.onclick = () => sheetEditDesc(t);
    $$("[data-add]", view).forEach((b) => { b.onclick = () => addBlock(t, b.dataset.add); });
    $$("[data-bmenu]", view).forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); blockMenu(b, t, b.dataset.bmenu); };
    });
    $$("[data-bedit]", view).forEach((b) => {
      b.onclick = () => openBlockEditor(t, blockById(t, b.dataset.bedit));
    });
    $$("[data-full]", view).forEach((b) => {
      b.onclick = () => openViewer(b.dataset.full, b.dataset.cap || "");
    });
    if (isCap()) wireBlockDnD(view, t);
    wireBoards(view, t);
  }

  function blockById(t, bid) {
    return (t.blocks || []).find((b) => b.id === bid) || null;
  }
  function tacticMenu(anchor, t) {
    openMenu(anchor, [
      { label: "Изменить название / сторону", onClick: () => sheetEditTactic(t) },
      { label: "Изменить описание", onClick: () => sheetEditDesc(t) },
      { label: "Дублировать", onClick: () => duplicateTactic(t.id) },
      { label: "Сохранить как шаблон", onClick: () => sheetSaveTemplate(t) },
      { sep: true },
      { label: "Удалить", danger: true, onClick: () => confirmDlg('Удалить тактику «' + t.name + "»?", async () => {
        const ok = await commit('удалил тактику «' + t.name + "»", null, () => DB.del("tactics", t.id));
        if (ok !== null) go(t.map_id ? "#/map/" + t.map_id : "#/tactics");
      }) },
    ]);
  }
  function sheetEditDesc(t) {
    openSheet("Описание тактики",
      '<label class="field"><span>Замысел, тайминги, условия</span><textarea id="dDesc" style="min-height:140px">' + esc(t.description || "") + "</textarea></label>",
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const ok = await commit('изменил описание «' + t.name + "»", { kind: "tactic", id: t.id },
        () => DB.save("tactics", { id: t.id, description: $("#dDesc").value.trim() }));
      if (ok !== null) closeSheet();
    };
  }

  /* ---------- blocks render ---------- */
  function blockHTML(t, b) {
    const title = b.title || BLOCK_NAMES[b.type] || "Блок";
    let inner = "";
    if (b.type === "roster") inner = rosterHTML(b);
    else if (b.type === "tasks") inner = tasksHTML(b);
    else if (b.type === "grenades") inner = nadesHTML(b);
    else if (b.type === "board") inner = boardHTML(t, b);
    else if (b.type === "image") inner = imagesHTML(b);
    else if (b.type === "video") inner = videosHTML(b);
    else if (b.type === "note") inner = notesHTML(b);
    else inner = '<div class="empty">Неизвестный блок.</div>';
    return '<div class="block' + (b.hidden ? " hiddenblock" : "") + '" data-block="' + b.id + '">' +
      '<div class="block-head">' + (isCap() ? '<span class="grip" data-grip title="Тяните, чтобы переместить">⠿</span>' : "") +
      "<h3>" + esc(title) + (b.hidden ? " · скрыт" : "") + "</h3>" +
      (isCap() ? '<button class="menubtn" data-bmenu="' + b.id + '" type="button">⋮</button>' : "") + "</div>" +
      '<div class="block-body">' + inner + "</div></div>";
  }
  function playerChip(pid) {
    const p = playerById(pid);
    if (!p) return '<span class="muted">—</span>';
    return '<span class="who" style="color:' + esc(p.color || "#e8a72f") + '">' + esc(p.name) + "</span>";
  }
  function rosterHTML(b) {
    if (!(b.items || []).length) return '<div class="empty">Состав не задан.</div>';
    return (b.items || []).map((it) =>
      '<div class="task">' + playerChip(it.playerId) + (it.note ? ' <span class="note">— ' + esc(it.note) + "</span>" : "") + "</div>"
    ).join("");
  }
  function tasksHTML(b) {
    if (!(b.items || []).length) return '<div class="empty">Задач нет.</div>';
    return (b.items || []).map((it) =>
      '<div class="task">' + playerChip(it.playerId) +
      (it.role ? ' <span class="role">' + esc(it.role) + "</span>" : "") +
      (it.task ? "<div>" + esc(it.task) + "</div>" : "") +
      (it.note ? '<div class="note">' + esc(it.note) + "</div>" : "") + "</div>"
    ).join("");
  }
  function nadesHTML(b) {
    if (!(b.items || []).length) return '<div class="empty">Гранаты не добавлены.</div>';
    return (b.items || []).map((it) =>
      '<div class="nade"><div>' + (NADE_ICON[it.kind] || "•") + " <b>" + esc(it.name || nadeName(it.kind)) + "</b> " +
      '<span class="meta">' + esc(nadeName(it.kind)) + (it.by ? " · " + esc((playerById(it.by) || {}).name || "") : "") +
      (it.from || it.to ? " · " + esc([it.from, it.to].filter(Boolean).join(" → ")) : "") + "</span></div>" +
      ((it.steps || []).length ? '<ol class="steps">' + it.steps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol>" : "") +
      (it.note ? '<div class="note">' + esc(it.note) + "</div>" : "") + "</div>"
    ).join("");
  }
  function imagesHTML(b) {
    if (!(b.items || []).length) return '<div class="empty">Изображений нет.</div>';
    return '<div class="thumbs">' + (b.items || []).map((it) =>
      '<button class="thumb" data-full="' + esc(it.url) + '" data-cap="' + esc(it.caption || "") + '" type="button"><img src="' + esc(it.url) + '" alt="" loading="lazy">' +
      (it.caption ? "<span>" + esc(it.caption) + "</span>" : "") + "</button>"
    ).join("") + "</div>";
  }
  function videosHTML(b) {
    if (!(b.items || []).length) return '<div class="empty">Видео нет.</div>';
    return (b.items || []).map((it) =>
      '<div class="task">🎥 <a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.caption || it.url) + "</a></div>"
    ).join("");
  }
  function notesHTML(b) {
    if (!(b.items || []).length) return '<div class="empty">Заметок нет.</div>';
    return (b.items || []).map((it) =>
      '<div class="note-text">' + (it.title ? "<h4>" + esc(it.title) + "</h4>" : "") + esc(it.text || "") + "</div>"
    ).join("");
  }

  /* ---------- block CRUD ---------- */
  function saveBlocks(t, blocks, activityText) {
    return commit(activityText, { kind: "tactic", id: t.id }, () => DB.save("tactics", { id: t.id, blocks }));
  }
  function addBlock(t, type) {
    const base = { id: uid("b"), type, title: BLOCK_NAMES[type] || "Блок", hidden: false };
    if (type === "board") { base.markers = []; base.drawings = []; base.markerStyle = "number"; }
    else base.items = [];
    openBlockEditor(t, base, true);
  }
  function blockMenu(anchor, t, bid) {
    const b = blockById(t, bid);
    if (!b) return;
    openMenu(anchor, [
      { label: "Изменить", onClick: () => openBlockEditor(t, b, false) },
      { label: "Выше", onClick: () => moveBlock(t, bid, -1) },
      { label: "Ниже", onClick: () => moveBlock(t, bid, 1) },
      { label: "Дублировать", onClick: () => dupBlock(t, bid) },
      { label: b.hidden ? "Показать" : "Скрыть", onClick: () => toggleBlock(t, bid) },
      { sep: true },
      { label: "Удалить блок", danger: true, onClick: () => confirmDlg('Удалить блок «' + (b.title || BLOCK_NAMES[b.type]) + "»?", () => {
        const blocks = (t.blocks || []).filter((x) => x.id !== bid);
        saveBlocks(t, blocks, 'удалил блок в «' + t.name + "»");
      }) },
    ]);
  }
  async function moveBlock(t, bid, dir) {
    const blocks = (t.blocks || []).slice();
    const i = blocks.findIndex((x) => x.id === bid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const tmp = blocks[i]; blocks[i] = blocks[j]; blocks[j] = tmp;
    await saveBlocks(t, blocks, null);
  }
  async function dupBlock(t, bid) {
    const blocks = clone(t.blocks || []);
    const i = blocks.findIndex((x) => x.id === bid);
    if (i < 0) return;
    const copy = clone(blocks[i]);
    copy.id = uid("b");
    (copy.items || []).forEach((it) => { it.id = uid("i"); });
    (copy.markers || []).forEach((mk) => { mk.id = uid("m"); });
    (copy.drawings || []).forEach((d) => { d.id = uid("d"); });
    blocks.splice(i + 1, 0, copy);
    await saveBlocks(t, blocks, 'дублировал блок в «' + t.name + "»");
  }
  async function toggleBlock(t, bid) {
    const blocks = clone(t.blocks || []);
    const b = blocks.find((x) => x.id === bid);
    if (!b) return;
    b.hidden = !b.hidden;
    await saveBlocks(t, blocks, null);
  }

  function wireBlockDnD(view, t) {
    const blocks = $$("[data-block]", view);
    let dragId = null;
    blocks.forEach((el) => {
      el.draggable = false;
      const grip = $("[data-grip]", el);
      if (!grip) return;
      grip.addEventListener("mousedown", () => { el.draggable = true; });
      grip.addEventListener("mouseup", () => { el.draggable = false; });
      el.addEventListener("dragstart", (e) => {
        dragId = el.dataset.block;
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {}
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => {
        dragId = null;
        el.classList.remove("dragging");
        blocks.forEach((x) => x.classList.remove("dragover"));
      });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("dragover"); });
      el.addEventListener("dragleave", () => el.classList.remove("dragover"));
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        const targetId = el.dataset.block;
        if (!dragId || dragId === targetId) return;
        const order = (t.blocks || []).map((b) => b.id).filter((id) => id !== dragId);
        order.splice(order.indexOf(targetId), 0, dragId);
        const map = {};
        (t.blocks || []).forEach((b) => { map[b.id] = b; });
        await saveBlocks(t, order.map((id) => map[id]).filter(Boolean), null);
      });
    });
  }

  /* ---------- block editors ---------- */
  function playerOptions(selected) {
    return '<option value="">—</option>' + DB.cache.players.map((p) =>
      '<option value="' + p.id + '"' + (selected === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>").join("");
  }
  function fld(label, inner) {
    return '<label class="field"><span>' + esc(label) + "</span>" + inner + "</label>";
  }
  function itemEditorHTML(b, it) {
    const d = 'data-i="' + it.id + '"';
    let h = '<div class="sec" style="margin:8px 0" data-item="' + it.id + '"><div class="sec-pad">';
    if (b.type === "roster") {
      h += fld("Игрок", '<select ' + d + ' data-k="playerId">' + playerOptions(it.playerId) + "</select>");
      h += fld("Пометка", '<input ' + d + ' data-k="note" maxlength="80" value="' + esc(it.note || "") + '" placeholder="Точка / роль">');
    } else if (b.type === "tasks") {
      h += fld("Игрок", '<select ' + d + ' data-k="playerId">' + playerOptions(it.playerId) + "</select>");
      h += '<div class="field-row">' + fld("Роль", '<input ' + d + ' data-k="role" maxlength="24" value="' + esc(it.role || "") + '" placeholder="Smoke">') +
        fld("Задача", '<input ' + d + ' data-k="task" maxlength="120" value="' + esc(it.task || "") + '" placeholder="Smoke CT">') + "</div>";
      h += fld("Примечание", '<input ' + d + ' data-k="note" maxlength="140" value="' + esc(it.note || "") + '">');
    } else if (b.type === "grenades") {
      h += '<div class="field-row">' +
        fld("Тип", '<select ' + d + ' data-k="kind">' + ["smoke", "molly", "flash"].map((k) => '<option value="' + k + '"' + (it.kind === k ? " selected" : "") + ">" + nadeName(k) + "</option>").join("") + "</select>") +
        fld("Название", '<input ' + d + ' data-k="name" maxlength="60" value="' + esc(it.name || "") + '" placeholder="Smoke CT">') + "</div>";
      h += fld("Кидает", '<select ' + d + ' data-k="by">' + playerOptions(it.by) + "</select>");
      h += '<div class="field-row">' + fld("Откуда", '<input ' + d + ' data-k="from" maxlength="40" value="' + esc(it.from || "") + '">') +
        fld("Куда", '<input ' + d + ' data-k="to" maxlength="40" value="' + esc(it.to || "") + '">') + "</div>";
      h += fld("Шаги (каждый с новой строки)", '<textarea ' + d + ' data-k="steps" style="min-height:64px">' + esc((it.steps || []).join("\n")) + "</textarea>");
      h += fld("Заметка", '<input ' + d + ' data-k="note" maxlength="140" value="' + esc(it.note || "") + '">');
    } else if (b.type === "image") {
      h += fld("Ссылка", '<input ' + d + ' data-k="url" maxlength="500" value="' + esc(it.url || "") + '" placeholder="https://…">');
      h += fld("Подпись", '<input ' + d + ' data-k="caption" maxlength="80" value="' + esc(it.caption || "") + '">');
      h += '<div class="btnrow"><button class="btn ghost tiny" data-upload="' + it.id + '" type="button">Загрузить файл</button><input type="file" data-file="' + it.id + '" accept="image/*" hidden></div>';
    } else if (b.type === "video") {
      h += fld("Ссылка на видео", '<input ' + d + ' data-k="url" maxlength="500" value="' + esc(it.url || "") + '" placeholder="https://…">');
      h += fld("Подпись", '<input ' + d + ' data-k="caption" maxlength="80" value="' + esc(it.caption || "") + '">');
    } else if (b.type === "note") {
      h += fld("Заголовок", '<input ' + d + ' data-k="title" maxlength="80" value="' + esc(it.title || "") + '">');
      h += fld("Текст", '<textarea ' + d + ' data-k="text">' + esc(it.text || "") + "</textarea>");
    }
    h += '<div class="btnrow"><button class="btn danger tiny" data-delitem="' + it.id + '" type="button">Убрать пункт</button></div>';
    return h + "</div></div>";
  }
  function blankItem(type) {
    if (type === "roster") return { id: uid("i"), playerId: "", note: "" };
    if (type === "tasks") return { id: uid("i"), playerId: "", role: "", task: "", note: "" };
    if (type === "grenades") return { id: uid("i"), kind: "smoke", name: "", by: "", from: "", to: "", steps: [], note: "" };
    if (type === "image") return { id: uid("i"), url: "", caption: "" };
    if (type === "video") return { id: uid("i"), url: "", caption: "" };
    if (type === "note") return { id: uid("i"), title: "", text: "" };
    return { id: uid("i") };
  }

  function openBlockEditor(t, b, isNew) {
    if (b.type === "board") { sheetBoardEdit(t, b, isNew); return; }
    let items = clone(b.items || []);
    if (isNew && !items.length) items = [blankItem(b.type)];
    const paint = () => {
      openSheet((isNew ? "Новый блок · " : "") + (BLOCK_NAMES[b.type] || "Блок"),
        fld("Заголовок блока", '<input id="beTitle" maxlength="60" value="' + esc(b.title || BLOCK_NAMES[b.type] || "") + '">') +
        '<div id="beItems">' + items.map((it) => itemEditorHTML(b, it)).join("") + "</div>" +
        '<div class="btnrow"><button class="btn ghost tiny" id="beAdd" type="button">+ Добавить пункт</button></div>',
        '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
      $("[data-x]").onclick = closeSheet;
      $("#beAdd").onclick = () => { collectItems(); items.push(blankItem(b.type)); paint(); };
      $$("[data-delitem]").forEach((btn) => {
        btn.onclick = () => { collectItems(); items = items.filter((x) => x.id !== btn.dataset.delitem); paint(); };
      });
      $$("[data-upload]").forEach((btn) => {
        btn.onclick = () => { const f = document.querySelector('[data-file="' + btn.dataset.upload + '"]'); if (f) f.click(); };
      });
      $$("[data-file]").forEach((inp) => {
        inp.onchange = async () => {
          const file = inp.files && inp.files[0];
          if (!file) return;
          saveState("saving");
          try {
            const up = await DB.adapter.uploadImage(DB.team.id, file);
            const target = document.querySelector('[data-i="' + inp.dataset.file + '"][data-k="url"]');
            if (target) target.value = up.url;
            saveState("saved");
            toast("Файл загружен", "ok");
          } catch (e) { saveState(""); toast((e && e.message) || "Не загрузилось", "warn"); }
        };
      });
      $("[data-ok]").onclick = async () => {
        collectItems();
        const nb = clone(b);
        nb.title = $("#beTitle").value.trim() || nb.title;
        nb.items = items.filter((it) => !isBlankItem(b.type, it));
        const blocks = clone(t.blocks || []);
        const i = blocks.findIndex((x) => x.id === nb.id);
        if (i >= 0) blocks[i] = nb; else blocks.push(nb);
        const ok = await saveBlocks(t, blocks, (isNew ? "добавил блок в «" : "изменил блок в «") + t.name + "»");
        if (ok !== null) closeSheet();
      };
    };
    const collectItems = () => {
      items.forEach((it) => {
        $$('[data-i="' + it.id + '"]').forEach((inp) => {
          const k = inp.dataset.k;
          if (!k || inp.type === "file") return;
          it[k] = k === "steps" ? inp.value.split("\n").map((s) => s.trim()).filter(Boolean) : inp.value;
        });
      });
    };
    paint();
  }
  function isBlankItem(type, it) {
    if (type === "roster") return !it.playerId && !it.note;
    if (type === "tasks") return !it.playerId && !it.task && !it.role;
    if (type === "grenades") return !it.name && !(it.steps || []).length;
    if (type === "image" || type === "video") return !it.url;
    if (type === "note") return !it.title && !it.text;
    return false;
  }

  /* ---------- board block (схема) ---------- */
  const BOARD_COLORS = ["#e8a72f", "#ef5d5d", "#5da9ff", "#48cf8b", "#b984ff", "#f2f4f7"];
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : BOARD_COLORS[0]);

  function boardBg(t, b) {
    if (b.bg) return b.bg;
    const m = mapById(t.map_id);
    return m ? m.image : "";
  }
  function boardHTML(t, b) {
    const bg = boardBg(t, b);
    let h = '<div class="boardwrap" data-board="' + b.id + '"><div class="map-canvas">';
    if (bg) h += '<img class="map-photo" src="' + esc(bg) + '" alt="" draggable="false">';
    else h += '<div class="empty">Нет фона карты.</div>';
    h += boardSVG(b, isCap()) + "</div>";
    if (isCap()) {
      h += '<div class="boardbar">' + boardToolsHTML(b) + "</div>";
    } else {
      h += '<div class="boardbar"><button class="toolbtn" data-bzoom type="button">⤢ Развернуть</button></div>';
    }
    return h + "</div>";
  }
  function boardToolsHTML(b) {
    const tools = [["select", "Выбор"], ["arrow", "→"], ["line", "—"], ["pen", "✎"], ["number", "①"], ["text", "T"]];
    let h = tools.map((x) => '<button class="toolbtn' + (S.boardTool === x[0] ? " on" : "") + '" data-tool="' + x[0] + '" type="button">' + x[1] + "</button>").join("");
    h += BOARD_COLORS.map((c) => '<button class="swatch' + (S.boardColor === c ? " on" : "") + '" data-color="' + c + '" style="--sw:' + c + '" type="button"></button>').join("");
    h += '<button class="toolbtn" data-addmarker type="button">+ Маркер</button>';
    h += '<button class="toolbtn" data-mstyle type="button">' + (b.markerStyle === "nick" ? "Ники" : "Номера") + "</button>";
    h += '<button class="toolbtn" data-bundo type="button">↩</button>';
    h += '<button class="toolbtn" data-bdel type="button">🗑</button>';
    h += '<button class="toolbtn" data-bzoom type="button">⤢</button>';
    return h;
  }
  function boardSVG(b, editable) {
    const sel = S.boardSel;
    let defs = "", body = "";
    (b.drawings || []).forEach((d, i) => {
      if (d.type !== "arrow") return;
      defs += '<marker id="ba-' + b.id + "-" + i + '" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="' + safeColor(d.color) + '"/></marker>';
    });
    body += '<rect class="map-hit-area" width="100" height="100" fill="transparent"/>';
    (b.drawings || []).forEach((d, i) => {
      const c = safeColor(d.color);
      const selected = sel && sel.id === d.id ? " selected" : "";
      if (d.type === "arrow" || d.type === "line") {
        const mk = d.type === "arrow" ? ' marker-end="url(#ba-' + b.id + "-" + i + ')"' : "";
        const co = ' x1="' + d.x1 + '" y1="' + d.y1 + '" x2="' + d.x2 + '" y2="' + d.y2 + '"';
        body += '<g class="draw-item' + selected + '" data-draw="' + d.id + '"><line class="move-line hit"' + co + '/><line class="move-line visible" stroke="' + c + '"' + co + mk + '/><line class="selection-ring"' + co + "/></g>";
      } else if (d.type === "pen") {
        const pts = (d.points || []).map((p) => p[0] + "," + p[1]).join(" ");
        body += '<g class="draw-item' + selected + '" data-draw="' + d.id + '"><polyline class="move-line hit" points="' + pts + '"/><polyline class="move-line visible" stroke="' + c + '" points="' + pts + '"/><polyline class="selection-ring" points="' + pts + '"/></g>';
      } else if (d.type === "number") {
        body += '<g class="draw-item draw-marker' + selected + '" data-draw="' + d.id + '" transform="translate(' + d.x + "," + d.y + ')"><circle class="tactic-number-bg" r="3.25" stroke="' + c + '"/><circle class="selection-ring" r="4.2"/><text class="tactic-number-text" y=".15" fill="' + c + '">' + esc(String(d.text || "1").slice(0, 3)) + "</text></g>";
      } else {
        const label = String(d.text || "?").slice(0, 24);
        const w = Math.min(48, Math.max(12, label.length * 1.9 + 5));
        body += '<g class="draw-item draw-marker' + selected + '" data-draw="' + d.id + '" transform="translate(' + d.x + "," + d.y + ')"><rect class="tactic-label-bg" x="' + (-w / 2) + '" y="-2.65" width="' + w + '" height="5.3" rx="1" stroke="' + c + '"/><rect class="selection-ring" x="' + (-w / 2 - 1) + '" y="-3.65" width="' + (w + 2) + '" height="7.3" rx="1"/><text class="tactic-label" y=".1" fill="' + c + '">' + esc(label) + "</text></g>";
      }
    });
    (b.markers || []).forEach((mk) => {
      body += markerSVG(b, mk, sel && sel.id === mk.id);
    });
    return '<svg class="tactical-map' + (editable ? " editing" : "") + '" viewBox="0 0 100 100" data-svg="' + b.id + '"><defs>' + defs + "</defs>" + body + "</svg>";
  }
  function markerSVG(b, mk, selected) {
    const sel = selected ? " selected" : "";
    if (mk.kind === "player") {
      const p = playerById(mk.playerId);
      const color = safeColor((p && p.color) || mk.color);
      const idx = p ? DB.cache.players.indexOf(p) + 1 : "?";
      let inner = "";
      if ((b.markerStyle || "number") === "nick" && p) {
        const nick = String(p.name).slice(0, 14);
        const w = Math.min(34, Math.max(12, nick.length * 1.75 + 5));
        inner = '<rect class="player-tag" x="' + (-w / 2) + '" y="-2.7" width="' + w + '" height="5.4" rx="1" stroke="' + color + '"/><text class="player-nick" y=".1" fill="' + color + '">' + esc(nick) + "</text>";
      } else {
        inner = '<circle r="3.25" stroke="' + color + '"/><text class="player-num" y=".1" fill="' + color + '">' + idx + "</text>";
      }
      return '<g class="pmk draw-item' + sel + '" data-marker="' + mk.id + '" transform="translate(' + mk.x + "," + mk.y + ')">' + inner + '<circle class="selection-ring" r="4.4"/></g>';
    }
    if (mk.kind === "smoke" || mk.kind === "molly" || mk.kind === "flash") {
      const c = mk.kind === "smoke" ? "#9aa4b0" : mk.kind === "molly" ? "#ef5d5d" : "#e8c56a";
      const icon = NADE_ICON[mk.kind] || "?";
      return '<g class="draw-item draw-marker' + sel + '" data-marker="' + mk.id + '" transform="translate(' + mk.x + "," + mk.y + ')"><circle class="tactic-number-bg" r="3.1" stroke="' + c + '"/><circle class="selection-ring" r="4.1"/><text class="tactic-number-text" y=".15" fill="' + c + '" style="font-size:3.4px">' + icon + "</text></g>";
    }
    const label = String(mk.label || "?").slice(0, 18);
    const w = Math.min(40, Math.max(10, label.length * 1.8 + 5));
    const c = safeColor(mk.color);
    return '<g class="draw-item draw-marker' + sel + '" data-marker="' + mk.id + '" transform="translate(' + mk.x + "," + mk.y + ')"><rect class="tactic-label-bg" x="' + (-w / 2) + '" y="-2.5" width="' + w + '" height="5" rx="1" stroke="' + c + '"/><rect class="selection-ring" x="' + (-w / 2 - 1) + '" y="-3.5" width="' + (w + 2) + '" height="7" rx="1"/><text class="tactic-label" y=".1" fill="' + c + '">' + esc(label) + "</text></g>";
  }

  function wireBoards(view, t) {
    $$("[data-board]", view).forEach((wrap) => {
      const b = blockById(t, wrap.dataset.board);
      if (!b) return;
      $$("[data-bzoom]", wrap).forEach((x) => { x.onclick = () => wrap.classList.toggle("big"); });
      if (!isCap()) return;
      $$("[data-tool]", wrap).forEach((btn) => {
        btn.onclick = () => { S.boardTool = btn.dataset.tool; S.boardSel = null; S.boardPending = null; render(); };
      });
      $$("[data-color]", wrap).forEach((btn) => {
        btn.onclick = () => {
          S.boardColor = btn.dataset.color;
          recolorSelection(t, b);
        };
      });
      $("[data-addmarker]", wrap).onclick = () => sheetAddMarker(t, b);
      $("[data-mstyle]", wrap).onclick = async () => {
        b.markerStyle = (b.markerStyle || "number") === "nick" ? "number" : "nick";
        await silentBoardSave(t, b);
      };
      $("[data-bundo]", wrap).onclick = () => boardUndo(t, b);
      $("[data-bdel]", wrap).onclick = () => boardDeleteSel(t, b);
      const svg = $("[data-svg]", wrap);
      if (svg) bindBoardSVG(svg, t, b);
    });
  }

  async function silentBoardSave(t, b) {
    saveState("saving");
    try {
      const blocks = clone(t.blocks || []);
      const i = blocks.findIndex((x) => x.id === b.id);
      if (i >= 0) blocks[i] = clone(b);
      await DB.save("tactics", { id: t.id, blocks });
      saveState("saved");
      render();
    } catch (e) { saveState(""); toast((e && e.message) || "Не сохранилось", "warn"); }
  }
  function recolorSelection(t, b) {
    const sel = S.boardSel;
    if (!sel) { render(); return; }
    const d = (b.drawings || []).find((x) => x.id === sel.id);
    if (d) { d.color = S.boardColor; silentBoardSave(t, b); return; }
    const mk = (b.markers || []).find((x) => x.id === sel.id);
    if (mk && mk.kind === "point") { mk.color = S.boardColor; silentBoardSave(t, b); return; }
    render();
  }
  function boardUndo(t, b) {
    if ((b.drawings || []).length) { b.drawings.pop(); silentBoardSave(t, b); }
    else if ((b.markers || []).length) { b.markers.pop(); silentBoardSave(t, b); }
  }
  function boardDeleteSel(t, b) {
    const sel = S.boardSel;
    if (!sel) { toast("Сначала выберите пометку"); return; }
    b.drawings = (b.drawings || []).filter((x) => x.id !== sel.id);
    b.markers = (b.markers || []).filter((x) => x.id !== sel.id);
    S.boardSel = null;
    silentBoardSave(t, b);
  }

  function sheetAddMarker(t, b) {
    const usedPlayers = (b.markers || []).filter((m) => m.kind === "player").map((m) => m.playerId);
    openSheet("Новый маркер",
      fld("Тип", '<select id="mkKind"><option value="player">Игрок</option><option value="smoke">💨 Смоук</option><option value="molly">🔥 Молотов</option><option value="flash">⚡ Флешка</option><option value="point">Точка с подписью</option></select>') +
      '<div id="mkPlayerWrap">' + fld("Игрок", '<select id="mkPlayer">' + DB.cache.players.filter((p) => usedPlayers.indexOf(p.id) < 0).map((p) => '<option value="' + p.id + '">' + esc(p.name) + "</option>").join("") + "</select>") + "</div>" +
      '<div id="mkPointWrap" hidden>' + fld("Подпись", '<input id="mkLabel" maxlength="18" placeholder="CT">') + "</div>" +
      fld("Заметка (необязательно)", '<input id="mkNote" maxlength="120">'),
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Поставить на схему</button>');
    $("[data-x]").onclick = closeSheet;
    $("#mkKind").onchange = (e) => {
      $("#mkPlayerWrap").hidden = e.target.value !== "player";
      $("#mkPointWrap").hidden = e.target.value !== "point";
    };
    $("[data-ok]").onclick = () => {
      const kind = $("#mkKind").value;
      const marker = { id: uid("m"), kind, x: 50, y: 50, note: $("#mkNote").value.trim() };
      if (kind === "player") {
        marker.playerId = $("#mkPlayer").value || null;
        if (!marker.playerId) { toast("Нет свободных игроков", "warn"); return; }
      }
      if (kind === "point") {
        marker.label = $("#mkLabel").value.trim() || "?";
        marker.color = S.boardColor;
      }
      closeSheet();
      S.boardPending = { blockId: b.id, marker };
      S.boardTool = "select";
      toast("Тапните по схеме, куда поставить");
    };
  }

  function sheetBoardEdit(t, b, isNew) {
    openSheet("Схема",
      fld("Заголовок", '<input id="bdTitle" maxlength="60" value="' + esc(b.title || "Схема") + '">') +
      fld("Свой фон (ссылка, пусто = радар карты)", '<input id="bdBg" maxlength="500" value="' + esc(b.bg || "") + '" placeholder="https://…">'),
      '<button class="btn ghost" data-x type="button">Отмена</button>' +
      (isNew ? "" : '<button class="btn danger" data-clear type="button">Очистить</button>') +
      '<button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    const clr = $("[data-clear]");
    if (clr) clr.onclick = () => confirmDlg("Очистить схему?", () => {
      b.markers = []; b.drawings = [];
      const blocks = clone(t.blocks || []);
      const i = blocks.findIndex((x) => x.id === b.id);
      if (i >= 0) { blocks[i] = clone(b); saveBlocks(t, blocks, null).then(() => closeSheet()); }
    });
    $("[data-ok]").onclick = async () => {
      b.title = $("#bdTitle").value.trim() || "Схема";
      b.bg = $("#bdBg").value.trim();
      const blocks = clone(t.blocks || []);
      const i = blocks.findIndex((x) => x.id === b.id);
      if (i >= 0) blocks[i] = clone(b); else blocks.push(clone(b));
      const ok = await saveBlocks(t, blocks, (isNew ? "добавил схему в «" : "изменил схему в «") + t.name + "»");
      if (ok !== null) closeSheet();
    };
  }

  /* --- board pointer interactions --- */
  function svgPoint(svg, e) {
    const r = svg.getBoundingClientRect();
    const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
    return {
      x: Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((cy - r.top) / r.height) * 100)),
    };
  }
  const r1 = (v) => Math.round(v * 10) / 10;

  function bindBoardSVG(svg, t, b) {
    svg.addEventListener("pointerdown", (e) => {
      if (!isCap() || (e.button != null && e.button > 0)) return;
      const pt = svgPoint(svg, e);
      // Постановка отложенного маркера.
      if (S.boardPending && S.boardPending.blockId === b.id) {
        e.preventDefault();
        const mk = S.boardPending.marker;
        mk.x = r1(pt.x); mk.y = r1(pt.y);
        S.boardPending = null;
        b.markers = b.markers || [];
        b.markers.push(mk);
        silentBoardSave(t, b);
        return;
      }
      const drawEl = e.target.closest ? e.target.closest("[data-draw]") : null;
      const markEl = e.target.closest ? e.target.closest("[data-marker]") : null;
      if (S.boardTool === "select") {
        e.preventDefault();
        if (markEl) {
          S.boardSel = { id: markEl.dataset.marker };
          startMarkerDrag(e, svg, t, b, markEl);
        } else if (drawEl) {
          S.boardSel = { id: drawEl.dataset.draw };
          startDrawDrag(e, svg, t, b, drawEl);
        } else {
          S.boardSel = null;
          render();
        }
        return;
      }
      if (S.boardTool === "number" || S.boardTool === "text") {
        e.preventDefault();
        askBoardText(S.boardTool, (val) => {
          b.drawings = b.drawings || [];
          const d = { id: uid("d"), type: S.boardTool, x: r1(pt.x), y: r1(pt.y), text: val, color: S.boardColor };
          b.drawings.push(d);
          S.boardSel = { id: d.id };
          silentBoardSave(t, b);
        });
        return;
      }
      if (S.boardTool === "arrow" || S.boardTool === "line" || S.boardTool === "pen") {
        e.preventDefault();
        startStroke(e, svg, t, b, pt, S.boardTool);
      }
    });
  }
  function askBoardText(type, cb) {
    openSheet(type === "number" ? "Номер" : "Подпись",
      fld(type === "number" ? "Число 1–99" : "Текст", '<input id="btVal" maxlength="' + (type === "number" ? 2 : 24) + '" ' + (type === "number" ? 'inputmode="numeric"' : "") + ">"),
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Поставить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = () => {
      let v = $("#btVal").value.trim();
      if (type === "number") {
        v = v.replace(/\D/g, "").slice(0, 2);
        if (!v || +v < 1) return;
      } else if (!v) return;
      else v = v.slice(0, 24);
      closeSheet();
      cb(v);
    };
    setTimeout(() => $("#btVal").focus(), 50);
  }
  function dragLoop(move, up) {
    window.addEventListener("pointermove", move, { passive: false });
    const end = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      up(e);
    };
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }
  function startMarkerDrag(e, svg, t, b, el) {
    const mk = (b.markers || []).find((x) => x.id === el.dataset.marker);
    if (!mk) return;
    el.classList.add("selected");
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const p = svgPoint(svg, ev);
      el.setAttribute("transform", "translate(" + p.x + "," + p.y + ")");
      mk._px = p.x; mk._py = p.y;
    };
    dragLoop(move, () => {
      if (mk._px != null) { mk.x = r1(mk._px); mk.y = r1(mk._py); delete mk._px; delete mk._py; }
      silentBoardSave(t, b);
    });
  }
  function startDrawDrag(e, svg, t, b, el) {
    const d = (b.drawings || []).find((x) => x.id === el.dataset.draw);
    if (!d) return;
    el.classList.add("selected");
    const start = svgPoint(svg, e);
    let dx = 0, dy = 0;
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const p = svgPoint(svg, ev);
      dx = p.x - start.x; dy = p.y - start.y;
      el.setAttribute("transform", "translate(" + dx + "," + dy + ")");
    };
    dragLoop(move, () => {
      dx = r1(dx); dy = r1(dy);
      if (d.type === "arrow" || d.type === "line") { d.x1 = r1(d.x1 + dx); d.y1 = r1(d.y1 + dy); d.x2 = r1(d.x2 + dx); d.y2 = r1(d.y2 + dy); }
      else if (d.type === "pen") d.points = (d.points || []).map((p) => [r1(p[0] + dx), r1(p[1] + dy)]);
      else { d.x = r1(d.x + dx); d.y = r1(d.y + dy); }
      silentBoardSave(t, b);
    });
  }
  function startStroke(e, svg, t, b, start, type) {
    const NS = "http://www.w3.org/2000/svg";
    let preview, pts = [[r1(start.x), r1(start.y)]], end = start;
    if (type === "pen") {
      preview = document.createElementNS(NS, "polyline");
      preview.setAttribute("points", pts[0].join(","));
    } else {
      preview = document.createElementNS(NS, "line");
      preview.setAttribute("x1", start.x); preview.setAttribute("y1", start.y);
      preview.setAttribute("x2", start.x); preview.setAttribute("y2", start.y);
    }
    preview.setAttribute("class", "preview-line");
    preview.setAttribute("stroke", S.boardColor);
    svg.appendChild(preview);
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const p = svgPoint(svg, ev);
      if (type === "pen") {
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) < 0.7) return;
        pts.push([r1(p.x), r1(p.y)]);
        preview.setAttribute("points", pts.map((q) => q.join(",")).join(" "));
      } else {
        end = p;
        preview.setAttribute("x2", p.x); preview.setAttribute("y2", p.y);
      }
    };
    dragLoop(move, () => {
      preview.remove();
      b.drawings = b.drawings || [];
      if (type === "pen") {
        if (pts.length < 2) return;
        b.drawings.push({ id: uid("d"), type: "pen", points: pts, color: S.boardColor });
      } else {
        if (Math.hypot(end.x - start.x, end.y - start.y) < 2) return;
        b.drawings.push({ id: uid("d"), type, x1: r1(start.x), y1: r1(start.y), x2: r1(end.x), y2: r1(end.y), color: S.boardColor });
      }
      silentBoardSave(t, b);
    });
  }

  /* ---------- players ---------- */
  function viewPlayers() {
    const view = $("#view");
    let html = '<div class="pagehead"><div><h1>Игроки</h1><p class="sub">' + DB.cache.players.length + " чел.</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-addp type="button">+ Игрок</button></div>' : "") + "</div>";
    html += '<div class="sec"><div class="sec-pad" style="padding:0;overflow-x:auto"><table class="ptable"><thead><tr><th>Игрок</th><th>Роль</th><th>Позиции</th>' +
      (isCap() ? "<th></th>" : "") + "</tr></thead><tbody>";
    if (!DB.cache.players.length) html += '<tr><td colspan="4" class="muted">Состав пуст.</td></tr>';
    DB.cache.players.forEach((p, i) => {
      html += '<tr data-prow="' + p.id + '"><td><span style="display:inline-flex;align-items:center;gap:8px"><span class="pnum" style="--pc:' +
        esc(p.color || "#e8a72f") + '">' + (i + 1) + "</span><b>" + esc(p.name) + "</b>" +
        (p.id === DB.myPlayerId() ? ' <span class="badge acc">вы</span>' : "") + "</span></td><td>" + esc(p.role || "—") + "</td><td class=\"muted\">" +
        esc((p.positions || []).join(" · ") || "—") + "</td>" + (isCap() ? '<td><button class="menubtn" data-pmenu="' + p.id + '" type="button">⋮</button></td>' : "") + "</tr>";
    });
    html += "</tbody></table></div></div>";
    view.innerHTML = html;
    $$("[data-prow]", view).forEach((tr) => {
      tr.onclick = (e) => { if (e.target.closest("[data-pmenu]")) return; go("#/player/" + tr.dataset.prow); };
    });
    $$("[data-pmenu]", view).forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); playerMenu(b, b.dataset.pmenu); };
    });
    const add = $("[data-addp]", view);
    if (add) add.onclick = () => sheetPlayer(null);
  }

  function playerMenu(anchor, id) {
    const p = playerById(id);
    if (!p) return;
    openMenu(anchor, [
      { label: "Открыть", onClick: () => go("#/player/" + id) },
      { label: "Изменить", onClick: () => sheetPlayer(p) },
      { sep: true },
      { label: "Выше", onClick: () => moveRow("players", id, -1) },
      { label: "Ниже", onClick: () => moveRow("players", id, 1) },
      { sep: true },
      { label: "Удалить", danger: true, onClick: () => confirmDlg('Удалить игрока «' + p.name + "»?", () => commit('удалил игрока «' + p.name + "»", null, () => DB.del("players", id))) },
    ]);
  }

  function sheetPlayer(p) {
    if (!isCap()) return;
    const isNew = !p;
    p = p || { name: "", role: "", positions: [], color: "#e8a72f", notes: "" };
    const colors = ["#e8a72f", "#5da9ff", "#48cf8b", "#ef5d5d", "#b984ff", "#f2f4f7", "#f786b8", "#4cc9f0"];
    openSheet(isNew ? "Новый игрок" : "Изменить игрока",
      '<label class="field"><span>Ник</span><input id="plName" maxlength="24" value="' + esc(p.name) + '" placeholder="MAX"></label>' +
      '<div class="field-row"><label class="field"><span>Роль</span><input id="plRole" list="roleList" maxlength="24" value="' + esc(p.role || "") + '" placeholder="IGL"></label>' +
      '<label class="field"><span>Цвет</span><select id="plColor">' + colors.map((c) => '<option value="' + c + '"' + (p.color === c ? " selected" : "") + ">" + c + "</option>").join("") + "</select></label></div>" +
      '<datalist id="roleList"><option>IGL</option><option>AWP</option><option>Entry</option><option>Support</option><option>Lurker</option><option>Anchor</option><option>Rifler</option></datalist>' +
      '<label class="field"><span>Позиции (через запятую)</span><input id="plPos" maxlength="80" value="' + esc((p.positions || []).join(", ")) + '" placeholder="A, Ramp"></label>' +
      '<label class="field"><span>Заметки</span><textarea id="plNotes">' + esc(p.notes || "") + "</textarea></label>",
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#plName").value.trim();
      if (!name) return;
      const payload = {
        name, role: $("#plRole").value.trim(), color: $("#plColor").value,
        positions: $("#plPos").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
        notes: $("#plNotes").value.trim(),
      };
      if (!isNew) payload.id = p.id;
      const saved = await commit((isNew ? "добавил игрока «" : "изменил игрока «") + name + "»", isNew ? null : { kind: "player", id: p.id }, () => DB.save("players", payload));
      if (saved !== null) { closeSheet(); if (isNew) go("#/player/" + saved.id); }
    };
  }

  function viewPlayer(id) {
    const p = playerById(id);
    const view = $("#view");
    if (!p) { go("#/players"); return; }
    const inv = involvement(p.id);
    const isMe = p.id === DB.myPlayerId();
    let html = '<a class="backlink" href="#/players">← Игроки</a><div class="pagehead"><div><h1>' + esc(p.name) +
      (isMe ? ' <span class="badge acc">это вы</span>' : "") + "</h1>" +
      '<p class="sub">' + esc([p.role || null, (p.positions || []).join(" / ") || null].filter(Boolean).join(" · ") || "Игрок") + "</p></div>" +
      '<div class="actions"><button class="starbtn' + (DB.isFav("player", p.id) ? " on" : "") + '" data-fav type="button" style="font-size:20px">★</button>' +
      (isCap() ? '<button class="menubtn" data-pm type="button">⋮</button>' : "") + "</div></div>";
    html += '<div class="sec"><div class="sec-pad"><dl class="kv" style="padding:0">' +
      "<dt>Роль</dt><dd>" + esc(p.role || "—") + "</dd>" +
      "<dt>Позиции</dt><dd>" + esc((p.positions || []).join(" · ") || "—") + "</dd></dl>" +
      (p.notes ? '<div class="divider"></div><div class="tiny muted">Заметки</div><div class="note-text" style="padding:4px 0">' + esc(p.notes) + "</div>" : "") + "</div></div>";
    html += involvedSection("Тактики игрока", inv.tactics);
    // Задачи
    html += '<div class="sec"><div class="sec-head"><h2>Задачи · ' + inv.tasks.length + "</h2></div><div class=\"sec-body\">";
    if (!inv.tasks.length) html += '<div class="empty">Задач нет.</div>';
    inv.tasks.forEach((r) => {
      const m = mapById(r.tactic.map_id);
      html += '<a class="row" href="#/tactic/' + r.tactic.id + '"><span class="row-main"><b>' + esc(r.item.task || r.item.role || "Задача") + "</b><small>" +
        esc(r.tactic.name + (m ? " · " + m.name : "")) + "</small></span><span class=\"row-arrow\">›</span></a>";
    });
    html += "</div></div>";
    // Гранаты
    html += '<div class="sec"><div class="sec-head"><h2>Гранаты · ' + inv.nades.length + "</h2></div><div class=\"sec-body\">";
    if (!inv.nades.length) html += '<div class="empty">Гранаты не назначены.</div>';
    inv.nades.forEach((r) => {
      html += '<a class="row" href="#/tactic/' + r.tactic.id + '"><span class="row-main"><b>' + (NADE_ICON[r.item.kind] || "") + " " + esc(r.item.name || nadeName(r.item.kind)) +
        "</b><small>" + esc(r.tactic.name) + "</small></span><span class=\"row-arrow\">›</span></a>";
    });
    html += "</div></div>";
    if (!isMe && (DB.team.settings.allowSwitchPlayer !== false || isCap())) {
      html += '<div class="btnrow"><button class="btn ghost block" data-makeme type="button">Это я — выбрать профиль</button></div>';
    }
    view.innerHTML = html;
    $("[data-fav]", view).onclick = () => { DB.toggleFav("player", p.id, p.name); render(); };
    const pm = $("[data-pm]", view);
    if (pm) pm.onclick = (e) => { e.stopPropagation(); playerMenu(pm, p.id); };
    const mk = $("[data-makeme]", view);
    if (mk) mk.onclick = () => { DB.setMyPlayer(p.id); toast("Привет, " + p.name, "ok"); go("#/me"); };
  }
  function involvedSection(title, tactics) {
    let html = '<div class="sec"><div class="sec-head"><h2>' + esc(title) + " · " + tactics.length + "</h2></div><div class=\"sec-body\">";
    if (!tactics.length) html += '<div class="empty">Нет.</div>';
    tactics.forEach((t) => { html += tacticRowHTML(t, mapById(t.map_id)); });
    return html + "</div></div>";
  }

  /* ---------- my profile ---------- */
  function viewMe() {
    const p = playerById(DB.myPlayerId());
    const view = $("#view");
    if (!p) {
      // Кто ты?
      let html = '<div class="pagehead"><div><h1>Кто ты?</h1><p class="sub">Выберите себя один раз — дальше профиль откроется сам</p></div></div>';
      html += '<div class="sec"><div class="sec-body">';
      if (!DB.cache.players.length) html += '<div class="empty">Состав пуст — капитан ещё не добавил игроков.</div>';
      DB.cache.players.forEach((x) => {
        html += '<button class="row" data-pick="' + x.id + '" type="button"><span class="pnum" style="--pc:' + esc(x.color || "#e8a72f") + '">' +
          (DB.cache.players.indexOf(x) + 1) + '</span><span class="row-main"><b>' + esc(x.name) + "</b>" + (x.role ? "<small>" + esc(x.role) + "</small>" : "") + "</span></button>";
      });
      html += "</div></div>";
      html += '<div class="btnrow"><button class="btn ghost block" data-skip type="button">Пропустить</button></div>';
      view.innerHTML = html;
      $$("[data-pick]", view).forEach((b) => {
        b.onclick = () => { DB.setMyPlayer(b.dataset.pick); toast("Привет, " + myName(), "ok"); go("#/overview"); };
      });
      $("[data-skip]", view).onclick = () => go("#/overview");
      return;
    }
    const inv = involvement(p.id);
    let html = '<div class="pagehead"><div><p class="autheye" style="margin:0 0 2px">ТВОЙ ПРОФИЛЬ</p><h1>' + esc(p.name) + "</h1>" +
      '<p class="sub">' + esc([p.role || null, (p.positions || []).join(" / ") || null].filter(Boolean).join(" · ") || "Игрок") + "</p></div></div>";
    html += '<div class="sec"><div class="sec-head"><h2>Мои тактики · ' + inv.tactics.length + "</h2></div><div class=\"sec-body\">";
    if (!inv.tactics.length) html += '<div class="empty">Пока нет.</div>';
    inv.tactics.slice(0, 10).forEach((t) => { html += tacticRowHTML(t, mapById(t.map_id)); });
    html += "</div></div>";
    html += '<div class="sec"><div class="sec-head"><h2>Мои задачи · ' + inv.tasks.length + "</h2></div><div class=\"sec-body\">";
    if (!inv.tasks.length) html += '<div class="empty">Пока нет.</div>';
    inv.tasks.slice(0, 20).forEach((r) => {
      html += '<a class="row" href="#/tactic/' + r.tactic.id + '"><span class="row-main"><b>' + esc(r.item.task || r.item.role || "Задача") + "</b><small>" +
        esc(r.tactic.name) + (r.item.note ? " · " + r.item.note : "") + "</small></span><span class=\"row-arrow\">›</span></a>";
    });
    html += "</div></div>";
    html += '<div class="sec"><div class="sec-head"><h2>Мои гранаты · ' + inv.nades.length + "</h2></div><div class=\"sec-body\">";
    if (!inv.nades.length) html += '<div class="empty">Пока нет.</div>';
    inv.nades.slice(0, 20).forEach((r) => {
      html += '<a class="row" href="#/tactic/' + r.tactic.id + '"><span class="row-main"><b>' + (NADE_ICON[r.item.kind] || "") + " " + esc(r.item.name || nadeName(r.item.kind)) +
        "</b><small>" + esc(r.tactic.name + (((r.item.steps || []).length) ? " · " + r.item.steps.length + " шаг." : "")) + "</small></span><span class=\"row-arrow\">›</span></a>";
    });
    html += "</div></div>";
    if (DB.team.settings.allowSwitchPlayer !== false || isCap()) {
      html += '<div class="btnrow"><button class="btn ghost block" data-switch type="button">Сменить профиль</button></div>';
    }
    view.innerHTML = html;
    const sw = $("[data-switch]", view);
    if (sw) sw.onclick = () => { DB.setMyPlayer(null); render(); };
  }

  /* ---------- materials ---------- */
  const MAT_ICON = { image: "🖼", video: "🎥", gif: "🎞", link: "🔗", note: "📝", pdf: "📄", demo: "💾" };
  function viewMaterials() {
    const view = $("#view");
    const f = S.mfilter;
    const types = ["image", "video", "gif", "link", "note", "pdf", "demo"].filter((tp) => DB.cache.materials.some((m) => m.type === tp));
    let html = '<div class="pagehead"><div><h1>Материалы</h1><p class="sub">' + DB.cache.materials.length + " шт.</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-addm type="button">+ Материал</button></div>' : "") + "</div>";
    if (types.length > 1) {
      html += '<div class="chiprow"><button class="chip' + (!f.type ? " on" : "") + '" data-f="type:" type="button">Все</button>';
      types.forEach((tp) => {
        html += '<button class="chip' + (f.type === tp ? " on" : "") + '" data-f="type:' + tp + '" type="button">' + (MAT_ICON[tp] || "") + " " + esc(matTypeName(tp)) + "</button>";
      });
      html += "</div>";
    }
    if (DB.cache.maps.length > 1) {
      html += '<div class="chiprow"><button class="chip' + (!f.map ? " on" : "") + '" data-f="map:" type="button">Все карты</button>';
      DB.cache.maps.forEach((m) => {
        html += '<button class="chip' + (f.map === m.id ? " on" : "") + '" data-f="map:' + m.id + '" type="button">' + esc(m.name) + "</button>";
      });
      html += "</div>";
    }
    const list = DB.cache.materials.filter((m) => (!f.type || m.type === f.type) && (!f.map || m.map_id === f.map));
    html += '<div class="sec"><div class="sec-body">';
    if (!list.length) html += '<div class="empty">Материалов нет.</div>';
    list.forEach((m) => { html += materialRowHTML(m, false); });
    html += "</div></div>";
    view.innerHTML = html;
    $$("[data-f]", view).forEach((b) => {
      b.onclick = () => { const [k, v] = b.dataset.f.split(/:(.+)/); S.mfilter[k] = v || ""; render(); };
    });
    const add = $("[data-addm]", view);
    if (add) add.onclick = () => sheetMaterial(null);
    bindMaterialRows(view);
    if (S.pendingMaterial) {
      const pm = materialById(S.pendingMaterial);
      S.pendingMaterial = null;
      if (pm) setTimeout(() => openMaterial(pm), 60);
    }
  }
  function matTypeName(tp) {
    return { image: "Фото", video: "Видео", gif: "GIF", link: "Ссылка", note: "Заметка", pdf: "PDF", demo: "Демо" }[tp] || tp;
  }
  function materialRowHTML(m, inMap) {
    const map = mapById(m.map_id);
    return '<div class="row" style="cursor:default"><button class="row-main" data-mopen="' + m.id + '" style="display:flex;gap:10px;align-items:center;background:none;border:0;padding:0;text-align:left;flex:1;min-width:0;cursor:pointer">' +
      '<span class="matic">' + (MAT_ICON[m.type] || "📎") + '</span><span style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.title) +
      "</b>" + (map || m.description ? "<small class=\"muted\" style=\"display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">" + esc([map ? map.name : null, m.description || null].filter(Boolean).join(" · ")) + "</small>" : "") + "</span></button>" +
      '<span class="row-side"><button class="starbtn' + (DB.isFav("material", m.id) ? " on" : "") + '" data-mfav="' + m.id + '" type="button">★</button>' +
      (isCap() ? '<button class="menubtn" data-mmenu="' + m.id + '" type="button">⋮</button>' : "") + "</span></div>";
  }
  function bindMaterialRows(view) {
    $$("[data-mopen]", view).forEach((b) => {
      b.onclick = () => { const m = materialById(b.dataset.mopen); if (m) openMaterial(m); };
    });
    $$("[data-mfav]", view).forEach((b) => {
      b.onclick = () => { const m = materialById(b.dataset.mfav); if (m) { DB.toggleFav("material", m.id, m.title); render(); } };
    });
    $$("[data-mmenu]", view).forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); materialMenu(b, b.dataset.mmenu); };
    });
  }
  function openMaterial(m) {
    if (m.type === "image" || m.type === "gif") {
      if (m.url) openViewer(m.url, m.title);
      else toast("Нет файла", "warn");
    } else if (m.type === "note") {
      openSheet(m.title, '<div class="note-text" style="padding:8px 0">' + esc(m.description || m.url || "") + "</div>",
        '<button class="btn ghost" data-x type="button">Закрыть</button>' + (isCap() ? '<button class="btn" data-ed type="button">Изменить</button>' : ""));
      $("[data-x]").onclick = closeSheet;
      const ed = $("[data-ed]");
      if (ed) ed.onclick = () => sheetMaterial(m);
    } else if (m.url) {
      window.open(m.url, "_blank", "noopener");
    } else toast("Нет ссылки", "warn");
  }
  function materialMenu(anchor, id) {
    const m = materialById(id);
    if (!m) return;
    openMenu(anchor, [
      { label: "Открыть", onClick: () => openMaterial(m) },
      { label: "Изменить", onClick: () => sheetMaterial(m) },
      { sep: true },
      { label: "Выше", onClick: () => moveRow("materials", id, -1) },
      { label: "Ниже", onClick: () => moveRow("materials", id, 1) },
      { sep: true },
      { label: "Удалить", danger: true, onClick: () => confirmDlg('Удалить «' + m.title + "»?", () => commit('удалил материал «' + m.title + "»", null, () => DB.del("materials", id))) },
    ]);
  }
  function sheetMaterial(m) {
    if (!isCap()) return;
    const isNew = !m;
    m = m || { type: "link", title: "", url: "", description: "", map_id: null };
    openSheet(isNew ? "Новый материал" : "Изменить материал",
      '<div class="field-row"><label class="field"><span>Тип</span><select id="mtType">' +
      ["link", "image", "video", "gif", "note", "pdf", "demo"].map((tp) => '<option value="' + tp + '"' + (m.type === tp ? " selected" : "") + ">" + (MAT_ICON[tp] || "") + " " + matTypeName(tp) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>Карта</span><select id="mtMap"><option value="">— Общая —</option>' +
      DB.cache.maps.map((x) => '<option value="' + x.id + '"' + (m.map_id === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select></label></div>" +
      '<label class="field"><span>Название</span><input id="mtTitle" maxlength="80" value="' + esc(m.title) + '"></label>' +
      '<label class="field"><span>Ссылка / файл</span><input id="mtUrl" maxlength="500" value="' + esc(m.url || "") + '" placeholder="https://…"></label>' +
      '<div class="btnrow"><button class="btn ghost tiny" id="mtUpload" type="button">Загрузить файл</button><input type="file" id="mtFile" hidden></div>' +
      '<label class="field"><span>Описание / текст заметки</span><textarea id="mtDesc">' + esc(m.description || "") + "</textarea></label>",
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("#mtUpload").onclick = () => $("#mtFile").click();
    $("#mtFile").onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      saveState("saving");
      try {
        const up = await DB.adapter.uploadImage(DB.team.id, file);
        $("#mtUrl").value = up.url;
        saveState("saved");
        toast("Файл загружен", "ok");
      } catch (err) { saveState(""); toast((err && err.message) || "Не загрузилось", "warn"); }
    };
    $("[data-ok]").onclick = async () => {
      const title = $("#mtTitle").value.trim();
      if (!title) return;
      const payload = {
        type: $("#mtType").value, title, url: $("#mtUrl").value.trim(),
        description: $("#mtDesc").value.trim(), map_id: $("#mtMap").value || null,
      };
      if (!isNew) payload.id = m.id;
      const ok = await commit((isNew ? "добавил материал «" : "изменил материал «") + title + "»", null, () => DB.save("materials", payload));
      if (ok !== null) closeSheet();
    };
  }

  /* ---------- manage (капитанская панель) ---------- */
  function viewManage() {
    const view = $("#view");
    if (!isCap()) {
      view.innerHTML = '<div class="pagehead"><div><h1>Управление</h1><p class="sub">Раздел капитана</p></div></div>' +
        '<div class="sec"><div class="sec-pad"><p class="muted">Здесь капитан меняет состав, карты, тактики и настройки команды.</p>' +
        '<div class="btnrow"><button class="btn block" data-capin type="button">Ввести PIN капитана</button></div></div></div>';
      $("[data-capin]", view).onclick = () => askCaptainPin("");
      return;
    }
    const cloud = DB.mode() === "cloud";
    let html = '<div class="pagehead"><div><h1>Управление</h1><p class="sub">' + esc(DB.team.name) + "</p></div></div>";

    // Команда
    html += '<div class="sec"><div class="sec-head"><h2>Команда</h2><button class="more" data-teamedit type="button">Изменить</button></div>' +
      '<div class="sec-pad"><dl class="kv" style="padding:0"><dt>Название</dt><dd>' + esc(DB.team.name) + "</dd>" +
      "<dt>Капитан</dt><dd>" + esc(DB.team.captainName || "—") + "</dd>" +
      "<dt>Смена профиля</dt><dd>" + (DB.team.settings.allowSwitchPlayer !== false ? "игрокам разрешена" : "запрещена") + "</dd></dl>" +
      '<div class="btnrow"><button class="btn ghost tiny" data-pinteam type="button">Сменить PIN команды</button>' +
      '<button class="btn ghost tiny" data-pincap type="button">Сменить PIN капитана</button></div></div></div>';

    // Быстрые действия
    html += '<div class="sec"><div class="sec-head"><h2>Быстрое создание</h2></div><div class="sec-pad"><div class="btnrow" style="margin-top:0">' +
      '<button class="btn ghost tiny" data-q="player" type="button">+ Игрок</button>' +
      '<button class="btn ghost tiny" data-q="map" type="button">+ Карта</button>' +
      '<button class="btn ghost tiny" data-q="tactic" type="button">+ Тактика</button>' +
      '<button class="btn ghost tiny" data-q="material" type="button">+ Материал</button></div></div></div>';

    // Шаблоны
    html += '<div class="sec"><div class="sec-head"><h2>Шаблоны тактик · ' + DB.cache.templates.length + "</h2></div><div class=\"sec-body\">";
    if (!DB.cache.templates.length) html += '<div class="empty">Шаблонов нет. Сохраните тактику как шаблон из её меню ⋮.</div>';
    DB.cache.templates.forEach((tp) => {
      html += '<div class="row" style="cursor:default"><span class="row-main"><b>' + esc(tp.name) + "</b><small>" + (tp.blocks || []).length + " бл.</small></span>" +
        '<span class="row-side"><button class="menubtn" data-tplmenu="' + tp.id + '" type="button">⋮</button></span></div>';
    });
    html += "</div></div>";

    // Облако
    html += '<div class="sec"><div class="sec-head"><h2>Облако</h2></div><div class="sec-pad">' +
      (cloud
        ? '<p class="muted tiny">Синхронизация включена. Правки капитана прилетают игрокам сами.</p>'
        : '<p class="muted tiny">Облако не подключено: каждый видит только своё устройство. Подключите Supabase по инструкции SETUP.md ' +
          "(файл supabase-config.js), либо введите ключи ниже для проверки на этом устройстве.</p>") +
      '<div class="btnrow"><button class="btn ghost tiny" data-cloud type="button">' + (cloud ? "Проверить / сменить ключи" : "Подключить облако") + "</button></div></div></div>";

    // Журнал
    html += '<div class="sec"><div class="sec-head"><h2>Журнал изменений</h2></div><div class="sec-body">';
    const feed = DB.cache.activity.slice(0, 30);
    if (!feed.length) html += '<div class="empty">Пока тихо.</div>';
    feed.forEach((a) => { html += activityRowHTML(a); });
    html += "</div></div>";

    // Опасная зона
    html += '<div class="sec"><div class="sec-head"><h2>Опасная зона</h2></div><div class="sec-pad"><div class="btnrow" style="margin-top:0">' +
      '<button class="btn ghost tiny" data-logout type="button">Выйти из команды</button>' +
      '<button class="btn danger tiny" data-delteam type="button">Удалить команду</button></div></div></div>';

    view.innerHTML = html;
    $$("[data-act]", view).forEach((b) => {
      b.onclick = () => { const [k, id] = b.dataset.act.split(":"); if (k && id) openRef(k, id); };
    });
    $("[data-teamedit]", view).onclick = sheetTeamEdit;
    $("[data-pinteam]", view).onclick = () => sheetChangePin("team");
    $("[data-pincap]", view).onclick = () => sheetChangePin("captain");
    $$("[data-q]", view).forEach((b) => {
      b.onclick = () => {
        const q = b.dataset.q;
        if (q === "player") sheetPlayer(null);
        else if (q === "map") sheetMap(null);
        else if (q === "tactic") sheetNewTactic(null);
        else if (q === "material") sheetMaterial(null);
      };
    });
    $$("[data-tplmenu]", view).forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); templateMenu(b, b.dataset.tplmenu); };
    });
    $("[data-cloud]", view).onclick = sheetCloud;
    $("[data-export]", view).onclick = exportTeam;
    $("[data-import]", view).onclick = () => $("[data-impfile]", view).click();
    $("[data-impfile]", view).onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importTeam(f);
    };
    $("[data-logout]", view).onclick = doLogout;
    $("[data-delteam]", view).onclick = () => confirmDlg('Удалить команду «' + DB.team.name + "» со всеми данными?", async () => {
      saveState("saving");
      try {
        await DB.adapter.deleteTeam(DB.team.id);
        saveState("");
        doLogout();
        toast("Команда удалена");
      } catch (e) { saveState(""); toast((e && e.message) || "Не удалилось", "warn"); }
    });
  }

  function templateMenu(anchor, id) {
    const tp = DB.cache.templates.find((t) => t.id === id);
    if (!tp) return;
    openMenu(anchor, [
      { label: "Переименовать", onClick: () => {
        openSheet("Переименовать шаблон", fld("Название", '<input id="tpName" maxlength="60" value="' + esc(tp.name) + '">'),
          '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
        $("[data-x]").onclick = closeSheet;
        $("[data-ok]").onclick = async () => {
          const ok = await commit(null, null, () => DB.save("templates", { id: tp.id, name: $("#tpName").value.trim() || tp.name }));
          if (ok !== null) closeSheet();
        };
      } },
      { label: "Новая тактика из шаблона", onClick: () => {
        openSheet("Тактика из шаблона «" + tp.name + "»",
          fld("Название", '<input id="ttName" maxlength="60" placeholder="A Execute">') +
          fld("Карта", '<select id="ttMap"><option value="">— Без карты —</option>' + DB.cache.maps.map((m) => '<option value="' + m.id + '">' + esc(m.name) + "</option>").join("") + "</select>"),
          '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Создать</button>');
        $("[data-x]").onclick = closeSheet;
        $("[data-ok]").onclick = async () => {
          const name = $("#ttName").value.trim();
          if (!name) return;
          const created = await commit('создал тактику «' + name + "» из шаблона", null, () => DB.save("tactics", {
            name, map_id: $("#ttMap").value || null, side: "T", category: "", description: "", blocks: reIdBlocks(clone(tp.blocks || [])),
          }));
          if (created) { closeSheet(); go("#/tactic/" + created.id); }
        };
      } },
      { sep: true },
      { label: "Удалить", danger: true, onClick: () => confirmDlg('Удалить шаблон «' + tp.name + "»?", () => commit(null, null, () => DB.del("templates", id))) },
    ]);
  }

  function sheetTeamEdit() {
    const st = DB.team.settings || {};
    openSheet("Команда",
      fld("Название", '<input id="teName" maxlength="40" value="' + esc(DB.team.name) + '">') +
      fld("Имя капитана", '<input id="teCap" maxlength="24" value="' + esc(DB.team.captainName || "") + '">') +
      '<label class="field" style="display:flex;gap:8px;align-items:center"><input id="teSwitch" type="checkbox" style="width:18px;height:18px"' + (st.allowSwitchPlayer !== false ? " checked" : "") + '><span style="margin:0">Игроки могут менять профиль</span></label>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      saveState("saving");
      try {
        DB.team = await DB.adapter.updateTeam(DB.team.id, {
          name: $("#teName").value.trim(),
          captainName: $("#teCap").value.trim(),
          settings: { allowSwitchPlayer: $("#teSwitch").checked },
        });
        DB.persistSession();
        await DB.log("изменил настройки команды", null);
        saveState("saved");
        closeSheet();
        render();
      } catch (e) { saveState(""); toast((e && e.message) || "Не сохранилось", "warn"); }
    };
  }

  function sheetChangePin(kind) {
    const isTeam = kind === "team";
    openSheet(isTeam ? "Новый PIN команды" : "Новый PIN капитана",
      (isTeam ? '<p class="muted tiny">Сообщите новый PIN всем игрокам.</p>' : "") +
      fld("Новый PIN", '<input id="pin1" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off">') +
      fld("Повторите", '<input id="pin2" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off">') +
      '<div class="form-error" id="pinErr"></div>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const a = $("#pin1").value, b = $("#pin2").value;
      if (a.length < 4) { $("#pinErr").textContent = "Минимум 4 символа"; return; }
      if (a !== b) { $("#pinErr").textContent = "PIN не совпадают"; return; }
      saveState("saving");
      try {
        await DB.adapter.setPin(DB.team.id, kind, a);
        await DB.log(isTeam ? "сменил PIN команды" : "сменил PIN капитана", null);
        saveState("saved");
        closeSheet();
        render();
        toast("PIN изменён", "ok");
      } catch (e) { saveState(""); $("#pinErr").textContent = (e && e.message) || "Не сохранилось"; }
    };
  }

  function sheetCloud() {
    const cfg = DB.cloudConfig();
    openSheet("Облако Supabase",
      '<p class="muted tiny">Постоянное подключение — файл supabase-config.js в репозитории (см. SETUP.md). ' +
      "Здесь можно ввести ключи временно, для проверки на этом устройстве.</p>" +
      fld("Project URL", '<input id="clUrl" maxlength="120" value="' + esc((cfg && cfg.url) || "") + '" placeholder="https://xxxx.supabase.co">') +
      fld("Anon key", '<input id="clKey" maxlength="500" value="' + esc((cfg && cfg.anonKey) || "") + '" placeholder="eyJ…">'),
      '<button class="btn ghost" data-x type="button">Отмена</button>' +
      (cfg ? '<button class="btn danger" data-clr type="button">Сбросить</button>' : "") +
      '<button class="btn" data-ok type="button">Подключить</button>');
    $("[data-x]").onclick = closeSheet;
    const clr = $("[data-clr]");
    if (clr) clr.onclick = () => { DB.clearCloudOverride(); location.reload(); };
    $("[data-ok]").onclick = () => {
      const url = $("#clUrl").value.trim(), anonKey = $("#clKey").value.trim();
      if (!url || !anonKey) return;
      DB.setCloudOverride({ url, anonKey });
      location.reload();
    };
  }

  /* ---------- export / import ---------- */
  function exportTeam() {
    const snap = { app: "cs2-team-playbook", v: 1, exportedAt: new Date().toISOString(), team: DB.team, data: {} };
    DB.TABLES.forEach((t) => { snap.data[t] = DB.cache[t]; });
    const blob = new Blob([JSON.stringify(snap)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "playbook-" + DB.team.name.replace(/[^\wа-яё-]+/gi, "-").toLowerCase() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast("Копия скачана", "ok");
  }
  function importTeam(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const snap = JSON.parse(reader.result);
        if (!snap || snap.app !== "cs2-team-playbook" || !snap.data) throw new Error("bad");
        openModal("Заменить данные команды?", "Текущий плейбук будет перезаписан из файла.", [
          { id: "no", label: "Отмена" },
          { id: "yes", label: "Заменить", danger: true, onClick: async () => {
            saveState("saving");
            try {
              for (const table of ["players", "maps", "tactics", "materials", "templates"]) {
                const rows = DB.cache[table].slice();
                for (const r of rows) await DB.adapter.del(table, DB.team.id, r.id);
                for (const r of (snap.data[table] || []).slice().sort((a, b) => (a.pos || 0) - (b.pos || 0))) {
                  const copy = clone(r);
                  delete copy.id;
                  await DB.adapter.save(table, DB.team.id, copy);
                }
              }
              await DB.adapter.log(DB.team.id, DB.actorName(), "загрузил плейбук из файла", null);
              await DB.refresh("*");
              saveState("saved");
              render();
              toast("Плейбук загружен", "ok");
            } catch (e) { saveState(""); toast((e && e.message) || "Не загрузилось", "warn"); }
          } },
        ]);
      } catch (e) { toast("Файл не похож на выгрузку плейбука", "warn"); }
    };
    reader.readAsText(file);
  }

  /* ---------- realtime + boot ---------- */
  function onDbEvent(evt) {
    if (!evt) return;
    if (evt.type === "status") {
      paintNet();
      if (evt.cloudError) toast("Облако недоступно, включён локальный режим", "warn");
      else if (DB.mode() === "cloud") toast(DB.online ? "Соединение восстановлено" : "Нет соединения", DB.online ? "ok" : "warn");
      return;
    }
    if (evt.type === "team") { render(false); return; }
    if (evt.type === "favs") { render(); return; }
    if (evt.type === "data") {
      DB.refresh(evt.table === "*" ? "*" : evt.table).then(() => {
        if (!DB.team) return;
        if (sheetOpen() || modalOpen() || menuOpen()) {
          S.dirtyRemote = true;
          if (evt.origin === "remote") toast("Обновлено");
          return;
        }
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        if (evt.origin === "remote") toast("Обновлено");
      });
      return;
    }
  }

  function boot() {
    $("#searchBtn").onclick = () => { if (DB.team) openSearch(); };
    window.addEventListener("hashchange", route);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeMenus(); if (modalOpen()) closeModal(); else if (sheetOpen()) closeSheet(); else closeViewer(); }
    });
    DB.on(onDbEvent);
    DB.init().then(() => {
      S.bootDone = true;
      route();
    }).catch(() => {
      $("#view").innerHTML = '<div class="empty">Не получилось запуститься. Обновите страницу.</div>';
    });
    // Чистим кэш старых версий.
    try {
      if (window.caches && caches.keys) {
        caches.keys().then((keys) => keys.forEach((k) => { if (k.indexOf("cs2-playbook-") === 0) caches.delete(k); }));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      }
    } catch (e) {}
  }

  // После закрытия шторки подтягиваем изменения, прилетевшие по realtime.
  const _closeSheet = closeSheet;
  closeSheet = function () {
    _closeSheet();
    if (S.dirtyRemote && DB.team && !modalOpen() && !menuOpen()) {
      S.dirtyRemote = false;
      render();
    }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
