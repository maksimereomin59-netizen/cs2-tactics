/* ============================================================
   CS2 TEAM PLAYBOOK — приложение капитана команды.
   Разделы: Обзор · Тактики · Игроки · Чат · Настройки.
   Данные: PlaybookDB (локально или Supabase), доска: PBBoard,
   интерфейс-примитивы: PBUI.

   Права: капитан создаёт, изменяет и удаляет; игрок смотрит,
   выполняет, пишет в чат и смотрит видео.
   ============================================================ */
(function () {
  "use strict";

  const DB = window.PlaybookDB;
  const Seed = window.PlaybookSeed;
  const Board = window.PBBoard;
  const UI = window.PBUI;

  const $ = UI.$, $$ = UI.$$;
  const esc = UI.esc, attr = UI.attr, ic = UI.ic;
  const uid = UI.uid, clone = UI.clone, clamp = UI.clamp;
  const fmtRel = UI.fmtRel, fmtTime = UI.fmtTime;
  const toast = UI.toast, saveState = UI.saveState;
  const openSheet = UI.openSheet, sheetOpen = UI.sheetOpen;
  const openModal = UI.openModal, modalOpen = UI.modalOpen;
  const confirmDlg = UI.confirmDlg;
  const openMenu = UI.openMenu, closeMenus = UI.closeMenus, menuOpen = UI.menuOpen;
  const openViewer = UI.openViewer, closeViewer = UI.closeViewer, viewerOpen = UI.viewerOpen;
  const field = UI.field, emptyState = UI.emptyState;

  /** Закрытие шторки/окна: если во время них пришли данные — дорисовываем экран,
      чтобы не осталось устаревших карточек. */
  function closeSheet() { UI.closeSheet(); flushPendingRender(); }
  function closeModal() { UI.closeModal(); flushPendingRender(); }
  function flushPendingRender() {
    if (!S.needRender || !DB.team) return;
    S.needRender = false;
    render();
  }

  /* ============================================================
     Термины: русский интерфейс, переключаемая терминология CS2
     (Настройки → Язык). Никакой смеси: словарь полный.
     ============================================================ */
  const TERMS = {
    ru: {
      smoke: "Смоук", molly: "Молотов", flash: "Флешка", he: "ХЕ", decoy: "Обманка", bomb: "Бомба",
      Execute: "Экзекьют", Default: "Дефолт", Retake: "Ретейк", Split: "Сплит", Control: "Контроль",
      Utility: "Раскидка", Pistol: "Пистолетка", Eco: "Эко", Force: "Форс",
      IGL: "Капитан (IGL)", AWP: "Снайпер (AWP)", Entry: "Энтри", Support: "Саппорт",
      Lurker: "Люркер", Anchor: "Анкер", Rifler: "Стрелок",
      position: "Позиция", movement: "Движение", other: "Другое",
    },
    en: {
      smoke: "Smoke", molly: "Molotov", flash: "Flash", he: "HE", decoy: "Decoy", bomb: "Bomb",
      Execute: "Execute", Default: "Default", Retake: "Retake", Split: "Split", Control: "Control",
      Utility: "Utility", Pistol: "Pistol", Eco: "Eco", Force: "Force",
      IGL: "IGL", AWP: "AWP", Entry: "Entry", Support: "Support",
      Lurker: "Lurker", Anchor: "Anchor", Rifler: "Rifler",
      position: "Position", movement: "Movement", other: "Other",
    },
  };
  const CATEGORIES = ["Execute", "Default", "Retake", "Split", "Control", "Utility", "Pistol", "Eco", "Force"];
  const ROLES_DEFAULT = ["IGL", "AWP", "Entry", "Support", "Lurker"];
  const VIDEO_KINDS = ["smoke", "flash", "molly", "he", "position", "movement", "other"];
  const VIDEO_KIND_LABEL = {
    smoke: "Смоук", flash: "Флешка", molly: "Молотов", he: "ХЕ",
    position: "Позиция", movement: "Движение", other: "Другое",
  };
  const termsLang = () => (DB.settings().terms === "en" ? "en" : "ru");
  /** Термин из словаря: granata/категория/роль. Неизвестное слово возвращается как есть. */
  function T(key) {
    if (!key) return "";
    const dict = TERMS[termsLang()];
    return dict[key] != null ? dict[key] : String(key);
  }
  const nadeT = (kind) => T(kind) || "Граната";
  const catT = (cat) => (cat ? T(cat) : "");
  function rolePresets() {
    const custom = DB.settings().roles;
    const list = Array.isArray(custom) && custom.length ? custom : ROLES_DEFAULT;
    return list.map((r) => ({ value: r, label: T(r) === r ? r : T(r) }));
  }

  /* ============================================================
     Состояние интерфейса
     ============================================================ */
  const S = {
    filter: { side: "", cat: "", q: "" },
    board: null,          // активный экземпляр PBBoard
    boardTacticId: null,
    tab: "element",       // вкладка панели свойств тактики
    focusPlayer: null,    // игрок, выбранный в тактике
    chatDraft: "",
    chatPending: [],      // сообщения в полёте / с ошибкой
    chatNotice: false,
    dirtyRemote: false,
    needRender: false,    // данные изменились, пока экран перерисовывать было нельзя
    booted: false,
  };
  const isCap = () => DB.isCaptain();
  const view = () => $("#view");

  const playerById = (id) => DB.cache.players.find((p) => p.id === id) || null;
  const mapById = (id) => DB.cache.maps.find((m) => m.id === id) || null;
  const tacticById = (id) => DB.cache.tactics.find((t) => t.id === id) || null;
  const materialById = (id) => DB.cache.materials.find((m) => m.id === id) || null;
  const myPlayer = () => playerById(DB.myPlayerId());
  const playerNumber = (p) => DB.cache.players.indexOf(p) + 1;

  /* ---------- обложки карт ---------- */
  const MAP_ART = {
    mirage: "assets/maps/cards/mirage.jpg",
    ancient: "assets/maps/cards/ancient.jpg",
    dust2: "assets/maps/cards/dust2.jpg",
  };
  const KABANY_HERO = "assets/kabany-hero.jpg";
  function mapSlug(name) {
    const s = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (s.indexOf("mirage") >= 0) return "mirage";
    if (s.indexOf("ancient") >= 0) return "ancient";
    if (s.indexOf("dust") >= 0) return "dust2";
    return "";
  }
  const mapArt = (m) => (m && (m.photo || MAP_ART[mapSlug(m.name)] || KABANY_HERO)) || KABANY_HERO;
  const mapRadar = (m) => (m && m.image) || "";

  /* ---------- зоны карты (для «где я стою») ---------- */
  function baseMap(m) {
    const base = window.TACTICS_BASE && window.TACTICS_BASE.maps;
    if (!m || !base) return null;
    const keys = Object.keys(base);
    for (let i = 0; i < keys.length; i++) if (base[keys[i]].name === m.name) return base[keys[i]];
    return null;
  }
  function zoneAt(m, x, y) {
    const bm = baseMap(m);
    if (!bm || !bm.zones) return "";
    let best = null, bd = 14;
    bm.zones.forEach((z) => {
      const d = Math.sqrt((z.x - x) * (z.x - x) + (z.y - y) * (z.y - y));
      if (d < bd) { bd = d; best = z; }
    });
    return best ? best.name : "";
  }
  function spawnZone(t) {
    const bm = baseMap(mapById(t.map_id));
    if (!bm || !bm.zones) return null;
    const kind = t.side === "CT" ? "ctspawn" : "tspawn";
    return bm.zones.find((z) => z.kind === kind) || null;
  }

  /* ============================================================
     Блоки тактики и видео
     ============================================================ */
  const BLOCK_NAMES = {
    roster: "Состав", tasks: "Задачи", grenades: "Гранаты", board: "Схема",
    image: "Изображения", video: "Видео", note: "Заметки",
  };
  const blocksOf = (t) => (t && t.blocks) || [];
  const blockById = (t, id) => blocksOf(t).find((b) => b.id === id) || null;
  function blocksOfType(t, type) { return blocksOf(t).filter((b) => b.type === type); }
  function firstBlock(t, type) { return blocksOfType(t, type)[0] || null; }
  function boardBlockOf(t) { return firstBlock(t, "board"); }

  function normVideo(it) {
    return {
      id: it.id, url: it.url || "", title: it.title || it.caption || "",
      kind: it.kind || "", playerId: it.playerId || "", objectId: it.objectId || "",
      objectTitle: it.objectTitle || "", note: it.note || "",
    };
  }
  function videosOf(t) {
    const out = [];
    blocksOfType(t, "video").forEach((b) => (b.items || []).forEach((it) => out.push(normVideo(it))));
    return out;
  }
  function videosForPlayer(t, pid) {
    if (!pid) return [];
    const own = videosOf(t).filter((v) => v.playerId === pid);
    const byObject = videosOf(t).filter((v) => !v.playerId && v.objectId && objectBelongsToPlayer(t, v.objectId, pid));
    return own.concat(byObject);
  }
  function videosForObject(t, objId) {
    return videosOf(t).filter((v) => v.objectId === objId);
  }
  function objectBelongsToPlayer(t, objId, pid) {
    const b = boardBlockOf(t);
    if (!b) return false;
    const el = (b.markers || []).concat(b.drawings || []).find((x) => x.id === objId);
    if (!el) return false;
    if (el.playerId === pid) return true;
    if (el.a1) { const a = (b.markers || []).find((m) => m.id === el.a1); if (a && a.playerId === pid) return true; }
    return false;
  }
  function ensureBlock(t, type) {
    const blocks = clone(blocksOf(t));
    let b = blocks.find((x) => x.type === type);
    if (!b) {
      b = { id: uid("b"), type, title: BLOCK_NAMES[type] || "Блок" };
      if (type === "board") { b.markers = []; b.drawings = []; b.markerStyle = "number"; }
      else b.items = [];
      blocks.push(b);
    }
    if (!b.items && type !== "board") b.items = [];
    return { blocks, block: b };
  }
  function saveBlocks(t, blocks, activityText) {
    return commit(activityText, { kind: "tactic", id: t.id }, () => DB.save("tactics", { id: t.id, blocks }));
  }

  /* ============================================================
     Запись с понятными ошибками
     ============================================================ */
  let committing = false;
  async function commit(activityText, activityRef, fn) {
    if (!isCap()) { toast("Это может сделать только капитан", "warn"); return null; }
    if (committing) return null;                 // защита от повторного нажатия «Сохранить»
    committing = true;
    const busyBtn = sheetOpen() ? $("#sheetRoot [data-ok]") : null;
    if (busyBtn) { busyBtn.classList.add("is-busy"); busyBtn.disabled = true; }
    await flushBoard();
    saveState("saving");
    try {
      const res = await fn();
      if (activityText) await DB.log(activityText, activityRef || null);
      saveState("saved");
      render();
      return res;
    } catch (e) {
      saveState("");
      toast(UI.friendlyError(e, "Не удалось сохранить. Попробуйте ещё раз."), "err");
      return null;
    } finally {
      committing = false;
      if (busyBtn) { busyBtn.classList.remove("is-busy"); busyBtn.disabled = false; }
    }
  }

  /* ============================================================
     Оболочка: шапка, навигация
     ============================================================ */
  const NAV = [
    { id: "overview", label: "Обзор", hash: "#/overview", icon: "home" },
    { id: "tactics", label: "Тактики", hash: "#/tactics", icon: "target" },
    { id: "players", label: "Игроки", hash: "#/players", icon: "users" },
    { id: "chat", label: "Чат", hash: "#/chat", icon: "chat" },
    { id: "settings", label: "Настройки", hash: "#/settings", icon: "settings" },
  ];
  function currentNav() {
    const p = parseHash()[0] || "";
    if (p === "tactic" || p === "map" || p === "maps") return "tactics";
    if (p === "player") return "players";
    if (p === "manage" || p === "materials" || p === "me") return "settings";
    return NAV.some((n) => n.id === p) ? p : "overview";
  }
  function paintShell() {
    const logged = !!DB.team;
    document.body.classList.toggle("auth-mode", !logged);
    document.body.classList.toggle("is-captain", logged && isCap());
    $("#topbar").hidden = !logged;
    $("#sidebar").hidden = !logged;
    $("#bottomNav").hidden = !logged;
    if (!logged) return;
    $("#brandTeam").textContent = DB.team.name;
    const badge = $("#roleBadge");
    badge.textContent = isCap() ? "Капитан" : "Игрок";
    badge.className = "rolebadge" + (isCap() ? " cap" : "");
    paintNet();
    const cur = currentNav();
    $("#sideNav").innerHTML = NAV.map((n) =>
      '<a class="navlink' + (cur === n.id ? " on" : "") + '" href="' + n.hash + '">' + ic(n.icon) +
      "<span>" + esc(n.label) + "</span></a>").join("");
    const me = myPlayer();
    $("#sideFoot").innerHTML =
      '<button class="whoami" type="button" data-profile>' +
      '<span class="who-dot" style="--pc:' + attr(me ? me.color || "#f0b429" : "#5b6875") + '"></span>' +
      "<span>" + esc(me ? me.name : (isCap() ? DB.team.captainName || "Капитан" : "Выбрать профиль")) + "</span>" +
      "<small>" + esc(isCap() ? "Капитан" : (me && me.role ? me.role : "Игрок")) + "</small></button>";
    const wb = $("[data-profile]", $("#sideFoot"));
    if (wb) wb.onclick = (e) => profileMenu(e.currentTarget);
    $("#bottomNav").innerHTML = NAV.map((n) =>
      '<a class="bnav' + (cur === n.id ? " on" : "") + '" href="' + n.hash + '">' + ic(n.icon) +
      "<span>" + esc(n.label) + "</span></a>").join("");
    const tb = $("#topProfile");
    if (tb) {
      tb.innerHTML = '<span class="who-dot" style="--pc:' + attr(me ? me.color || "#f0b429" : "#5b6875") + '"></span>' +
        esc(me ? me.name : (isCap() ? "Капитан" : "Профиль"));
      tb.onclick = (e) => profileMenu(e.currentTarget);
    }
  }
  function profileMenu(anchor) {
    const me = myPlayer();
    openMenu(anchor, [
      me ? { label: "Моя карточка", icon: "user", onClick: () => go("#/player/" + me.id) }
         : { label: "Выбрать свой профиль", icon: "user", onClick: () => openProfilePicker() },
      { label: "Настройки", icon: "settings", onClick: () => go("#/settings") },
      { sep: true },
      { label: "Выйти из команды", icon: "logout", danger: true, onClick: doLogout },
    ]);
  }
  function paintNet() {
    const dot = $("#netDot");
    if (!dot) return;
    const cloud = DB.mode() === "cloud";
    dot.className = "netdot" + (cloud ? (DB.online ? "" : " off") : " local");
    dot.title = cloud ? (DB.online ? "Облако подключено" : "Нет соединения") : "Локальный режим";
    if (cloud && !DB.online) saveState("offline");
  }
  function doLogout() {
    closeSheet(); closeMenus();
    flushBoard();
    DB.logout();
    go("#/login");
  }

  /* ============================================================
     Роутер
     ============================================================ */
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
  const parseHash = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);

  function route() {
    closeSheet(); closeModal(); closeMenus(); closeViewer();
    const p = parseHash();
    /* старые адреса продолжают работать */
    if (p[0] === "maps") return go(p[1] ? "#/tactics/" + p[1] : "#/tactics");
    if (p[0] === "map") return go(p[1] ? "#/tactics/" + p[1] : "#/tactics");
    if (p[0] === "manage" || p[0] === "materials") return go("#/settings");
    if (p[0] === "me" || p[0] === "who") {
      const me = myPlayer();
      return go(me ? "#/player/" + me.id : "#/settings");
    }
    flushBoard();
    if (!DB.team) {
      paintShell();
      if (p[0] === "create") viewCreate();
      else viewLogin();
      window.scrollTo(0, 0);
      return;
    }
    render(false);
    window.scrollTo(0, 0);
  }

  function render(preserveScroll) {
    const y = preserveScroll === false ? 0 : window.scrollY;
    const p = parseHash();
    const id = p[0] || "overview";
    paintShell();
    /* доска живёт только на экране тактики: перед другим экраном освобождаем её */
    if (id !== "tactic" && S.board) destroyBoard();
    if (id === "overview" || id === "" || id === "login" || id === "create") viewOverview();
    else if (id === "tactics") viewTactics(p[1]);
    else if (id === "tactic") viewTactic(p[1]);
    else if (id === "players") viewPlayers();
    else if (id === "player") viewPlayer(p[1]);
    else if (id === "chat") viewChat();
    else if (id === "settings") viewSettings();
    else viewOverview();
    if (preserveScroll !== false) window.scrollTo(0, y);
  }

  /* ============================================================
     Вход и создание команды
     ============================================================ */
  const LS_LAST_TEAM = "cs2pb.lastTeam";
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) {} };

  function viewLogin() {
    const last = lsGet(LS_LAST_TEAM) || "";
    view().innerHTML =
      '<div class="auth">' +
      '<div class="auth-mark"><span>CS2</span></div>' +
      '<h1>Вход команды</h1>' +
      '<p class="auth-sub">Название команды и PIN выдаёт капитан.</p>' +
      '<form id="loginForm" class="auth-form" novalidate>' +
      field("Название команды", '<input id="liName" maxlength="40" autocomplete="off" value="' + attr(last) + '" placeholder="Например, БРАТЫ" required>') +
      field("PIN", '<input id="liPin" type="password" inputmode="numeric" maxlength="32" autocomplete="current-password" placeholder="Код команды" required>') +
      '<p class="form-error" id="liErr" role="alert"></p>' +
      '<button class="btn btn-primary btn-block" type="submit">Войти</button>' +
      "</form>" +
      '<div class="auth-links"><a href="#/create">Создать команду</a></div>' +
      "</div>";
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const errBox = $("#liErr");
      errBox.textContent = "";
      const name = $("#liName").value.trim();
      const pin = $("#liPin").value;
      const btn = $('[type="submit"]', e.target);
      if (!name || !pin) { errBox.textContent = "Введите название команды и PIN"; return; }
      btn.disabled = true;
      btn.classList.add("is-busy");
      try {
        await loginTeam(name, pin);
        lsSet(LS_LAST_TEAM, name);
        afterEnter();
      } catch (err) {
        errBox.textContent = UI.friendlyError(err, "Не удалось войти. Проверьте название и PIN.");
      } finally {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
    };
    setTimeout(() => { const el = $("#liPin"); if (el && !lsGet(LS_LAST_TEAM)) $("#liName").focus(); else if (el) el.focus(); }, 60);
  }

  /** Вход: пробуем как капитан (командный PIN + PIN капитана), иначе как игрок. */
  async function loginTeam(name, pin) {
    try {
      const res = await DB.login({ name, pin });
      S.askCaptainPin = res.role !== "captain";
      return res;
    } catch (e) {
      if (DB.mode() === "local") {
        const team = DB.adapter.findTeam(name);
        if (team) {
          try {
            await DB.adapter.claimCaptain(team.id, pin);
            DB.team = DB.adapter.publicTeam(team);
            DB.role = "captain";
            DB.persistSession();
            await DB.refresh();
            S.askCaptainPin = false;
            return { team: DB.team, role: "captain" };
          } catch (e2) { /* PIN не капитанский — ошибка ниже */ }
        }
      }
      throw e;
    }
  }

  function afterEnter() {
    if (!DB.myPlayerId() && DB.cache.players.length && !isCap()) go("#/settings");
    else go("#/overview");
    if (S.askCaptainPin) {
      S.askCaptainPin = false;
      setTimeout(() => askCaptainPin("Вы вошли как игрок. Чтобы править тактики, введите PIN капитана."), 350);
    }
  }

  function askCaptainPin(sub, onOk) {
    openSheet("PIN капитана",
      (sub ? '<p class="hint">' + esc(sub) + "</p>" : "") +
      '<form id="capPinForm">' + field("PIN капитана",
        '<input id="capPin" type="password" inputmode="numeric" maxlength="32" autocomplete="off" required>') +
      '<p class="form-error" id="capPinErr" role="alert"></p></form>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Подтвердить</button>');
    const submit = async () => {
      const errBox = $("#capPinErr");
      try {
        await DB.loginCaptain($("#capPin").value);
        closeSheet();
        toast("Режим капитана включён", "ok");
        render();
        if (onOk) onOk();
      } catch (e) { errBox.textContent = UI.friendlyError(e, "Неверный PIN капитана"); }
    };
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = submit;
    $("#capPinForm").onsubmit = (e) => { e.preventDefault(); submit(); };
  }

  function viewCreate() {
    view().innerHTML =
      '<div class="auth">' +
      '<div class="auth-mark"><span>CS2</span></div>' +
      '<h1>Новая команда</h1>' +
      '<p class="auth-sub">Капитан создаёт команду один раз и передаёт игрокам название и PIN.</p>' +
      '<form id="crForm" class="auth-form" novalidate>' +
      field("Название команды", '<input id="crName" maxlength="40" autocomplete="off" placeholder="Например, БРАТЫ" required>') +
      '<div class="field-row">' +
      field("PIN команды", '<input id="crPin" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off" placeholder="Для игроков" required>', "Минимум 4 символа") +
      field("PIN капитана", '<input id="crCapPin" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off" placeholder="Только вам" required>', "Отдельный код для правок") +
      "</div>" +
      field("Имя капитана", '<input id="crCap" maxlength="24" autocomplete="off" placeholder="Например, Макс" required>') +
      '<p class="form-error" id="crErr" role="alert"></p>' +
      '<button class="btn btn-primary btn-block" type="submit">Создать команду</button>' +
      "</form>" +
      '<div class="auth-links"><a href="#/login">Уже есть команда? Войти</a></div>' +
      "</div>";
    $("#crForm").onsubmit = async (e) => {
      e.preventDefault();
      const errBox = $("#crErr");
      errBox.textContent = "";
      const name = $("#crName").value.trim();
      const pin = $("#crPin").value;
      const capPin = $("#crCapPin").value;
      const cap = $("#crCap").value.trim();
      if (!name || !pin || !capPin || !cap) { errBox.textContent = "Заполните все поля"; return; }
      if (pin.length < 4 || capPin.length < 4) { errBox.textContent = "PIN — минимум 4 символа"; return; }
      if (pin === capPin) { errBox.textContent = "PIN команды и PIN капитана должны различаться"; return; }
      const btn = $('[type="submit"]', e.target);
      btn.disabled = true;
      btn.classList.add("is-busy");
      try {
        await DB.createTeam({ name, pin, captain: cap, captainPin: capPin }, (teamId) => Seed.seedTeam(teamId));
        lsSet(LS_LAST_TEAM, name);
        viewCreated(pin);
      } catch (err) {
        errBox.textContent = UI.friendlyError(err, "Не удалось создать команду");
      } finally {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
    };
  }

  function viewCreated(pin) {
    paintShell();
    view().innerHTML =
      '<div class="auth">' +
      '<div class="auth-mark ok"><span>' + ic("check") + "</span></div>" +
      "<h1>Команда создана</h1>" +
      '<p class="auth-sub">Стартовый набор загружен: карты, состав, тактики и раскидки. Меняйте всё под свою команду.</p>' +
      '<div class="pinview"><small>Код команды для игроков</small><b>' + esc(pin) + "</b></div>" +
      '<button class="btn btn-primary btn-block" id="openPb" type="button">Открыть плейбук</button>' +
      "</div>";
    $("#openPb").onclick = () => afterEnter();
  }

  function openProfilePicker() {
    const list = DB.cache.players;
    if (!list.length) { toast("Состав пуст — капитан ещё не добавил игроков", "warn"); return; }
    openSheet("Кто вы?", '<p class="hint">Выберите себя один раз — дальше приложение будет показывать ваши задачи и видео.</p>' +
      '<div class="picklist">' + list.map((p) =>
        '<button class="pick" type="button" data-pick="' + attr(p.id) + '">' +
        '<span class="pnum" style="--pc:' + attr(p.color || "#f0b429") + '">' + playerNumber(p) + "</span>" +
        "<span><b>" + esc(p.name) + "</b><small>" + esc(p.role ? T(p.role) : "Игрок") + "</small></span></button>").join("") + "</div>",
      '<button class="btn btn-ghost" type="button" data-x>Позже</button>');
    $("[data-x]").onclick = closeSheet;
    $$("[data-pick]").forEach((btn) => {
      btn.onclick = () => {
        DB.setMyPlayer(btn.dataset.pick);
        closeSheet();
        toast("Привет, " + (myPlayer() || {}).name, "ok");
        render();
      };
    });
  }

  /* ============================================================
     Обзор: команда, капитан, карты, что сделать сейчас
     ============================================================ */
  function viewOverview() {
    const me = myPlayer();
    const cap = DB.team.captainName || "—";
    let h = '<header class="page-head with-art" style="--art:url(\'' + KABANY_HERO + '\')">' +
      "<div><h1>" + esc(DB.team.name) + "</h1>" +
      '<p class="sub">Капитан: <b>' + esc(cap) + "</b>" + (me ? " · вы: <b>" + esc(me.name) + "</b>" : "") + " · <span style='opacity:.85'>Реальные кабаны</span></p></div>" +
      (isCap() ? '<div class="head-actions"><button class="btn btn-primary" type="button" data-newtactic>' + ic("plus") + " Тактика</button></div>" : "") +
      "</header>";

    /* 1. Что сделать сейчас */
    h += '<section class="card">';
    h += '<div class="card-head"><h2>' + ic("flag") + "Что сделать сейчас</h2></div>";
    h += '<div class="card-body">';
    if (!me) {
      h += '<div class="todo">' + ic("user") + "<div><b>Выберите свой профиль</b>" +
        "<span>Тогда здесь появятся ваши задачи, гранаты и видео.</span></div>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-pickme>Выбрать</button></div>';
    } else {
      const todo = playerTodo(me);
      if (!todo.length) {
        h += emptyState("check", "Задач пока нет", "Капитан ещё не назначил вам тактики — загляните в раздел «Тактики».");
      } else {
        h += '<ul class="todo-list">';
        todo.slice(0, 5).forEach((x) => {
          h += '<li><a href="#/tactic/' + attr(x.tactic.id) + '">' +
            '<span class="todo-ic">' + ic(x.icon) + "</span>" +
            "<span><b>" + esc(x.title) + "</b><small>" + esc(x.sub) + "</small></span>" +
            '<span class="row-arrow">' + ic("chevron") + "</span></a></li>";
        });
        h += "</ul>";
      }
    }
    if (isCap()) {
      h += '<div class="quickrow">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-q="tactic">' + ic("plus") + " Тактика</button>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-q="player">' + ic("plus") + " Игрок</button>" +
        "</div>";
    }
    h += "</div></section>";

    /* 2. Карты и тактики */
    const maps = DB.cache.maps;
    h += '<section class="card"><div class="card-head"><h2>' + ic("map") + "Карты и тактики</h2>" +
      '<a class="card-link" href="#/tactics">Все тактики' + ic("chevron") + "</a></div><div class=\"card-body\">";
    const totalTacs = DB.cache.tactics.length;
    if (!maps.length) {
      h += emptyState("map", "Карт пока нет", isCap() ? "Добавьте первую карту в разделе «Тактики»." : "Капитан ещё не добавил карты.",
        isCap() ? '<button class="btn btn-primary btn-sm" type="button" data-addmap>' + ic("plus") + " Добавить карту</button>" +
        ' <button class="btn btn-ghost btn-sm" type="button" data-starter>' + ic("target") + " Загрузить стартовый набор</button>" : "") +
        (isCap() && totalTacs === 0 ? '<p class="hint" style="margin-top:10px">Стартовый набор: Mirage, Ancient, Dust 2 с дефолтами, составами и раскидками — загрузится одним нажатием.</p>' : "");
    } else if (!totalTacs && isCap()) {
      h += '<div class="empty">' + ic("target") + "<b>Карты есть, а тактик нет</b>" +
        '<span>Капитан, загрузите стартовый набор — добавим дефолты и раскидки на Mirage, Ancient и Dust 2.</span>' +
        '<button class="btn btn-primary btn-sm" type="button" data-starter>' + ic("plus") + " Загрузить стартовый набор</button></div>";
      // продолжим отрисовкой карт ниже
      h += '<div class="maplist">';
      maps.forEach((m) => {
        const list = DB.cache.tactics.filter((t) => t.map_id === m.id);
        const tCount = list.filter((x) => x.side === "T").length;
        const ctCount = list.filter((x) => x.side === "CT").length;
        h += '<a class="maprow" href="#/tactics/' + attr(m.id) + '">' +
          (mapArt(m) ? '<span class="maprow-img"><img src="' + attr(mapArt(m)) + '" alt="" loading="lazy"></span>'
                     : '<span class="maprow-img noimg">' + ic("map") + "</span>") +
          "<span class=\"maprow-main\"><b>" + esc(m.name) + "</b>" +
          "<small>" + list.length + " такт. · T: " + tCount + " · CT: " + ctCount + "</small></span>" +
          '<span class="row-arrow">' + ic("chevron") + "</span></a>";
      });
      h += "</div>";
      view().innerHTML = h;
      const nt2 = $("[data-newtactic]");
      if (nt2) nt2.onclick = () => sheetNewTactic(null);
      const pm2 = $("[data-pickme]");
      if (pm2) pm2.onclick = openProfilePicker;
      $$("[data-q]").forEach((b) => {
        b.onclick = () => {
          const q = b.dataset.q;
          if (q === "tactic") sheetNewTactic(null);
          else if (q === "player") sheetPlayer(null);
        };
      });
      $$("[data-starter]").forEach((b) => { b.onclick = () => loadStarterKit(); });
      return;
    } else {
      h += '<div class="maplist">';
      maps.forEach((m) => {
        const list = DB.cache.tactics.filter((t) => t.map_id === m.id);
        const tCount = list.filter((x) => x.side === "T").length;
        const ctCount = list.filter((x) => x.side === "CT").length;
        h += '<a class="maprow" href="#/tactics/' + attr(m.id) + '">' +
          (mapArt(m) ? '<span class="maprow-img"><img src="' + attr(mapArt(m)) + '" alt="" loading="lazy"></span>'
                     : '<span class="maprow-img noimg">' + ic("map") + "</span>") +
          "<span class=\"maprow-main\"><b>" + esc(m.name) + "</b>" +
          "<small>" + list.length + " такт. · T: " + tCount + " · CT: " + ctCount + "</small></span>" +
          '<span class="row-arrow">' + ic("chevron") + "</span></a>";
      });
      h += "</div>";
    }
    h += "</div></section>";

    view().innerHTML = h;
    const nt = $("[data-newtactic]");
    if (nt) nt.onclick = () => sheetNewTactic(null);
    const pm = $("[data-pickme]");
    if (pm) pm.onclick = openProfilePicker;
    $$("[data-q]").forEach((b) => {
      b.onclick = () => {
        const q = b.dataset.q;
        if (q === "tactic") sheetNewTactic(null);
        else if (q === "player") sheetPlayer(null);
      };
    });
    $$("[data-starter]").forEach((b) => { b.onclick = () => loadStarterKit(); });
  }

  /** Что делать игроку: задачи, гранаты и видео по всем тактикам. */
  function playerTodo(p) {
    const out = [];
    DB.cache.tactics.forEach((t) => {
      const m = mapById(t.map_id);
      const where = (m ? m.name + " · " : "") + t.name;
      blocksOfType(t, "tasks").forEach((b) => (b.items || []).forEach((it) => {
        if (it.playerId === p.id && (it.task || it.note)) {
          out.push({ tactic: t, icon: "target", title: it.task || it.note, sub: where });
        }
      }));
      blocksOfType(t, "grenades").forEach((b) => (b.items || []).forEach((it) => {
        if (it.by === p.id) {
          out.push({ tactic: t, icon: it.kind || "bomb", title: it.name || nadeT(it.kind), sub: where + " · граната" });
        }
      }));
      videosForPlayer(t, p.id).slice(0, 1).forEach((v) => {
        out.push({ tactic: t, icon: "play", title: "Видео: " + (v.title || "разбор"), sub: where });
      });
    });
    return out;
  }

  /* ============================================================
     Тактики: выбор карты → список с фильтрами
     ============================================================ */
  function viewTactics(mapId) {
    if (!mapId) return viewTacticMaps();
    const m = mapById(mapId);
    if (!m) return go("#/tactics");
    const f = S.filter;
    const all = DB.cache.tactics.filter((t) => t.map_id === m.id);
    const cats = [];
    all.forEach((t) => { if (t.category && cats.indexOf(t.category) < 0) cats.push(t.category); });
    const q = f.q.trim().toLowerCase();
    const list = all.filter((t) =>
      (!f.side || t.side === f.side) &&
      (!f.cat || t.category === f.cat) &&
      (!q || (t.name + " " + (t.category || "") + " " + (t.description || "")).toLowerCase().indexOf(q) >= 0));

    let h = '<a class="backlink" href="#/tactics">' + ic("back") + "Все карты</a>";
    h += '<header class="page-head' + (mapArt(m) ? " with-art" : "") + '"' +
      (mapArt(m) ? ' style="--art:url(\'' + attr(mapArt(m)).replace(/'/g, "%27") + '\')"' : "") + ">" +
      "<div><h1>" + esc(m.name) + "</h1><p class=\"sub\">" + all.length + " такт. на карте</p></div>" +
      '<div class="head-actions">' +
      (isCap() ? '<button class="btn btn-primary" type="button" data-newt>' + ic("plus") + " Тактика</button>" +
        '<button class="btn btn-icon" type="button" data-mapmenu title="Действия с картой">' + ic("dots") + "</button>" : "") +
      "</div></header>";

    /* фильтры: сторона · тип · название */
    h += '<div class="filters">' +
      '<div class="chips">' +
      chip(!f.side, "side", "", "Все стороны") + chip(f.side === "T", "side", "T", "T") + chip(f.side === "CT", "side", "CT", "CT") +
      "</div>" +
      (cats.length ? '<div class="chips">' + chip(!f.cat, "cat", "", "Все типы") +
        cats.map((c) => chip(f.cat === c, "cat", c, catT(c))).join("") + "</div>" : "") +
      '<div class="searchline">' + ic("search") +
      '<input id="tacSearch" type="search" placeholder="Поиск по названию" value="' + attr(f.q) + '" autocomplete="off">' +
      (f.q ? '<button class="ibtn" type="button" data-clearq title="Очистить">' + ic("x") + "</button>" : "") +
      "</div></div>";

    h += '<section class="card"><div class="card-body tight">';
    if (!list.length) {
      h += emptyState("target", all.length ? "Ничего не найдено" : "Тактик на этой карте пока нет",
        all.length ? "Измените фильтры или поисковый запрос." : (isCap() ? "Создайте первую тактику — откройте редактор и нарисуйте схему." : "Капитан ещё не добавил тактики."),
        !all.length && isCap() ? '<button class="btn btn-primary btn-sm" type="button" data-newt>' + ic("plus") + " Создать тактику</button>" : "");
    } else {
      h += '<div class="taclist">';
      list.forEach((t) => { h += tacticCardHTML(t, m); });
      h += "</div>";
    }
    h += "</div></section>";

    const mats = DB.cache.materials.filter((x) => x.map_id === m.id);
    if (mats.length) {
      h += '<section class="card"><div class="card-head"><h2>' + ic("folder") + "Материалы карты</h2></div><div class=\"card-body tight\">";
      mats.forEach((x) => { h += materialRowHTML(x); });
      h += "</div></section>";
    }

    view().innerHTML = h;
    const nt = $$("[data-newt]");
    nt.forEach((b) => { b.onclick = () => sheetNewTactic(m.id); });
    const mm = $("[data-mapmenu]");
    if (mm) mm.onclick = (e) => { e.stopPropagation(); mapMenu(e.currentTarget, m); };
    $$("[data-f]").forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.f, val = b.dataset.v || "";
        S.filter[key] = val;
        render();
      };
    });
    const inp = $("#tacSearch");
    if (inp) {
      inp.oninput = UI.debounce(() => {
        S.filter.q = inp.value;
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        const again = $("#tacSearch");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 220);
    }
    const cq = $("[data-clearq]");
    if (cq) cq.onclick = () => { S.filter.q = ""; render(); };
    bindTacticCards();
    bindMaterialRows();
  }
  const chip = (on, key, val, label) =>
    '<button class="chip' + (on ? " on" : "") + '" type="button" data-f="' + key + '" data-v="' + attr(val) + '">' + esc(label) + "</button>";

  function viewTacticMaps() {
    let h = '<header class="page-head"><div><h1>Тактики</h1>' +
      '<p class="sub">Выберите карту — откроются тактики и редактор схемы</p></div>' +
      (isCap() ? '<div class="head-actions"><button class="btn btn-primary" type="button" data-newt>' + ic("plus") + " Тактика</button>" +
        '<button class="btn btn-ghost" type="button" data-addmap>' + ic("plus") + " Карта</button></div>" : "") + "</header>";
    if (!DB.cache.maps.length) {
      h += '<section class="card"><div class="card-body">' +
        emptyState("map", "Карт пока нет", isCap() ? "Добавьте карту — к ней привяжутся тактики и схемы." : "Капитан ещё не добавил карты.",
          isCap() ? '<button class="btn btn-primary btn-sm" type="button" data-addmap>' + ic("plus") + " Добавить карту</button>" +
            ' <button class="btn btn-ghost btn-sm" type="button" data-starter>' + ic("target") + " Загрузить стартовый набор</button>" : "") +
        (isCap() && !DB.cache.tactics.length ? '<p class="hint" style="margin-top:10px">Стартовый набор: Mirage, Ancient, Dust 2 с дефолтами, составами и раскидками.</p>' : "") +
        "</div></section>";
    } else if (!DB.cache.tactics.length && isCap()) {
      h += '<section class="card"><div class="card-body">' +
        emptyState("target", "Тактик пока нет", "Карты есть — загрузите стартовый набор или создайте первую тактику.",
          '<button class="btn btn-primary btn-sm" type="button" data-newt>' + ic("plus") + " Создать тактику</button>" +
          ' <button class="btn btn-ghost btn-sm" type="button" data-starter>' + ic("target") + " Загрузить стартовый набор</button>") +
        "</div></section>";
    } else {
      h += '<div class="mapgrid">';
      DB.cache.maps.forEach((m) => {
        const list = DB.cache.tactics.filter((t) => t.map_id === m.id);
        h += '<a class="mapcard" href="#/tactics/' + attr(m.id) + '">' +
          (mapArt(m) ? '<img src="' + attr(mapArt(m)) + '" alt="" loading="lazy">' : "") +
          '<span class="mapcard-scrim"></span>' +
          '<span class="mapcard-body"><b>' + esc(m.name) + "</b><small>" + list.length + " такт.</small></span>" +
          (isCap() ? '<span class="mapcard-tools"><button class="ibtn" type="button" data-mapmenu="' + attr(m.id) + '" title="Действия с картой">' +
            ic("dots") + "</button></span>" : "") +
          "</a>";
      });
      h += "</div>";
    }
    view().innerHTML = h;
    $$("[data-newt]").forEach((b) => { b.onclick = () => sheetNewTactic(null); });
    $$("[data-addmap]").forEach((b) => { b.onclick = () => sheetMap(null); });
    $$("[data-starter]").forEach((b) => { b.onclick = () => loadStarterKit(); });
    $$("[data-mapmenu]").forEach((b) => {
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); mapMenu(e.currentTarget, mapById(b.dataset.mapmenu)); };
    });
  }

  /** Сколько кого и чего в тактике: игроки, гранаты, видео. */
  function tacticFacts(t) {
    const ids = {};
    let nades = 0;
    const add = (pid) => { if (pid) ids[pid] = true; };
    blocksOfType(t, "roster").forEach((b) => (b.items || []).forEach((it) => add(it.playerId)));
    blocksOfType(t, "tasks").forEach((b) => (b.items || []).forEach((it) => add(it.playerId)));
    blocksOfType(t, "grenades").forEach((b) => (b.items || []).forEach((it) => { nades++; add(it.by); }));
    const board = boardBlockOf(t);
    if (board) {
      (board.markers || []).forEach((x) => {
        if (x.kind === "player") add(x.playerId);
        if (Board.NADES.some((n) => n.id === x.kind)) nades++;
      });
      (board.drawings || []).forEach((d) => {
        if (d.type === "nade") nades++;
        add(d.playerId);
      });
    }
    return { players: Object.keys(ids).length, nades, videos: videosOf(t).length };
  }
  function tacticCardHTML(t, m) {
    const facts = tacticFacts(t);
    return '<article class="taccard" data-tac="' + attr(t.id) + '">' +
      '<a class="taccard-main" href="#/tactic/' + attr(t.id) + '">' +
      "<b>" + esc(t.name) + "</b>" +
      '<span class="tacmeta">' +
      '<span class="badge side-' + (t.side === "CT" ? "ct" : t.side === "ANY" ? "any" : "t") + '">' + esc(t.side === "ANY" ? "T/CT" : t.side) + "</span>" +
      (t.category ? '<span class="badge">' + esc(catT(t.category)) + "</span>" : "") +
      (m ? '<span class="badge ghost">' + esc(m.name) + "</span>" : "") +
      "</span>" +
      '<span class="tacfacts">' +
      '<span>' + ic("users") + facts.players + " игр.</span>" +
      (facts.nades ? "<span>" + ic("bomb") + facts.nades + " гранат</span>" : "") +
      (facts.videos ? "<span>" + ic("video") + facts.videos + " видео</span>" : "") +
      (t.updated_at ? "<span>" + ic("clock") + esc(fmtRel(t.updated_at)) + "</span>" : "") +
      "</span></a>" +
      '<span class="taccard-tools">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-open="' + attr(t.id) + '">Открыть</button>' +
      (isCap()
        ? '<button class="ibtn" type="button" data-tedit="' + attr(t.id) + '" title="Изменить" aria-label="Изменить тактику">' + ic("edit") + "</button>" +
          '<button class="ibtn" type="button" data-tdel="' + attr(t.id) + '" title="Удалить" aria-label="Удалить тактику">' + ic("trash") + "</button>"
        : "") +
      "</span>" +
      "</article>";
  }
  function bindTacticCards() {
    $$("[data-open]").forEach((b) => { b.onclick = () => go("#/tactic/" + b.dataset.open); });
    $$("[data-tedit]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); const t = tacticById(b.dataset.tedit); if (t) sheetEditTactic(t); };
    });
    $$("[data-tdel]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); const t = tacticById(b.dataset.tdel); if (t) deleteTactic(t); };
    });
  }
  function tacticMenu(anchor, t) {
    if (!t) return;
    openMenu(anchor, [
      { label: "Открыть", icon: "expand", onClick: () => go("#/tactic/" + t.id) },
      { label: "Изменить", icon: "edit", onClick: () => sheetEditTactic(t) },
      { label: "Переименовать", icon: "text", onClick: () => sheetEditTactic(t) },
      { label: "Копия тактики", icon: "copy", onClick: () => duplicateTactic(t.id) },
      { sep: true },
      { label: "Удалить тактику", icon: "trash", danger: true, onClick: () => deleteTactic(t) },
    ]);
  }
  function deleteTactic(t) {
    confirmDlg("Удалить тактику «" + t.name + "»?", "Схема, задачи, гранаты и видео этой тактики будут удалены у всех участников.", async () => {
      const ok = await commit('удалил тактику «' + t.name + "»", null, () => DB.del("tactics", t.id));
      if (ok !== null) {
        toast("Тактика удалена", "ok");
        go(t.map_id ? "#/tactics/" + t.map_id : "#/tactics");
      }
    });
  }

  /* ============================================================
     Тактика: редактор с доской
     ============================================================ */
  function viewTactic(id) {
    const t = tacticById(id);
    if (!t) {
      view().innerHTML = '<section class="card"><div class="card-body">' +
        emptyState("warn", "Тактика не найдена", "Возможно, её удалили. Вернитесь к списку тактик.",
          '<a class="btn btn-primary btn-sm" href="#/tactics">К тактикам</a>') + "</div></section>";
      return;
    }
    const m = mapById(t.map_id);
    const board = boardBlockOf(t);
    if (!S.focusPlayer || !playerById(S.focusPlayer)) {
      const me = myPlayer();
      S.focusPlayer = me ? me.id : null;
    }
    if (S.boardTacticId !== t.id) { S.tab = "element"; S.boardTacticId = t.id; }

    let h = '<div class="tac">';
    /* --- шапка тактики --- */
    const tacticArt = m ? (mapArt(m) || mapRadar(m) || KABANY_HERO) : "";
    h += '<header class="tac-head' + (tacticArt ? " with-art" : "") + '"' + (tacticArt ? ' style="--art:url(\'' + attr(tacticArt).replace(/'/g, "%27") + '\')"' : "") + ">" +
      '<a class="backlink" href="' + (m ? "#/tactics/" + attr(m.id) : "#/tactics") + '">' + ic("back") + esc(m ? m.name : "Тактики") + "</a>" +
      '<div class="tac-title"><h1>' + esc(t.name) + "</h1>" +
      '<span class="tac-badges">' +
      '<span class="badge side-' + (t.side === "CT" ? "ct" : t.side === "ANY" ? "any" : "t") + '">' + esc(t.side === "ANY" ? "T/CT" : t.side) + "</span>" +
      (t.category ? '<span class="badge">' + esc(catT(t.category)) + "</span>" : "") +
      (m ? '<span class="badge ghost">' + esc(m.name) + "</span>" : "") +
      "</span></div>" +
      '<div class="tac-head-actions">' +
      (m && (m.photo || m.image || mapArt(m)) ? '<button class="btn btn-ghost btn-sm" type="button" data-openart title="Открыть картинку карты">' + ic("image") + " Картинка</button>" : "") +
      '<button class="btn btn-ghost btn-sm" type="button" data-details>' + ic("layers") + " Детали</button>" +
      (isCap() ? '<button class="btn btn-icon" type="button" data-tmenu title="Действия с тактикой">' + ic("dots") + "</button>" : "") +
      "</div></header>";

    /* --- выбор игрока --- */
    h += '<div class="tac-players" data-role="playerchips">' + playerChipsHTML(t) + "</div>";

    /* --- доска + панель свойств --- */
    h += '<div class="tac-body">' +
      '<div class="tac-canvas" id="boardHost"></div>' +
      '<aside class="tac-insp" id="inspPanel">' +
      '<div class="tabs" role="tablist">' +
      '<button class="tab' + (S.tab === "element" ? " on" : "") + '" type="button" data-tab="element" role="tab">Элемент</button>' +
      '<button class="tab' + (S.tab === "player" ? " on" : "") + '" type="button" data-tab="player" role="tab">Игрок</button>' +
      '<button class="tab' + (S.tab === "tactic" ? " on" : "") + '" type="button" data-tab="tactic" role="tab">Тактика</button>' +
      "</div>" +
      '<div class="tab-body" id="inspBody"></div>' +
      "</aside></div>";
    h += "</div>";
    view().innerHTML = h;

    mountBoard(t, board);
    $$("[data-tab]").forEach((btn) => {
      btn.onclick = () => { S.tab = btn.dataset.tab; renderInspector(); };
    });
    const det = $("[data-details]");
    if (det) det.onclick = () => openTacticDetails(t);
    const oa = $("[data-openart]");
    if (oa) oa.onclick = () => {
      const art = (m && (m.photo || m.image)) ? (m.photo || m.image) : (m ? mapArt(m) : "") || KABANY_HERO;
      if (art) openViewer(art, m ? m.name : "Карта");
    };
    const tm = $("[data-tmenu]");
    if (tm) tm.onclick = (e) => { e.stopPropagation(); tacticMenu(e.currentTarget, t); };
    bindPlayerChips(t);
    renderInspector();
  }

  function playerChipsHTML(t) {
    const board = boardBlockOf(t);
    const onBoard = board ? (board.markers || []).filter((m) => m.kind === "player").map((m) => m.playerId) : [];
    let h = '<button class="pchip' + (!S.focusPlayer ? " on" : "") + '" type="button" data-focus="">' +
      ic("users") + "<span>Вся команда</span></button>";
    DB.cache.players.forEach((p) => {
      const placed = onBoard.indexOf(p.id) >= 0;
      h += '<button class="pchip' + (S.focusPlayer === p.id ? " on" : "") + (placed ? "" : " off") +
        '" type="button" data-focus="' + attr(p.id) + '" title="' + attr(p.role ? T(p.role) : "Игрок") + '"' +
        ' style="--pc:' + attr(p.color || "#f0b429") + '">' +
        "<span class=\"pchip-num\">" + playerNumber(p) + "</span><span>" + esc(p.name) + "</span></button>";
    });
    return h;
  }
  function bindPlayerChips(t) {
    $$("[data-focus]").forEach((b) => {
      b.onclick = () => {
        S.focusPlayer = b.dataset.focus || null;
        if (S.board) S.board.setFocus(S.focusPlayer);
        $("[data-role=playerchips]").innerHTML = playerChipsHTML(t);
        bindPlayerChips(t);
        if (S.focusPlayer && S.tab === "element" && !S.board.selected()) S.tab = "player";
        renderInspector();
      };
    });
  }

  /* ---------- монтаж доски ---------- */
  function destroyBoard() {
    if (!S.board) return;
    flushBoard();
    S.board.destroy();
    S.board = null;
    S.boardTacticId = null;
  }
  function flushBoard() {
    const board = S.board;
    if (!board || !board.isDirty()) return Promise.resolve();
    return board.save();
  }
  function mountBoard(t, block) {
    const host = $("#boardHost");
    if (!host) return;
    if (S.board) { S.board.destroy(); S.board = null; }
    if (!block) {
      host.innerHTML = '<div class="board-empty">' +
        emptyState("map", "Схемы пока нет", isCap() ? "Создайте схему — откроется редактор поверх радара карты." : "Капитан ещё не добавил схему.",
          isCap() ? '<button class="btn btn-primary btn-sm" type="button" data-addboard>' + ic("plus") + " Создать схему</button>" : "") +
        "</div>";
      const ab = $("[data-addboard]", host);
      if (ab) ab.onclick = () => addBoardBlock(t);
      return;
    }
    S.board = Board.create(host, {
      block,
      editable: isCap(),
      players: DB.cache.players,
      bg: block.bg || mapRadar(mapById(t.map_id)) || mapArt(mapById(t.map_id)) || KABANY_HERO,
      side: t.side,
      ic,
      glyphPath: (name) => UI.ICON[name] || "",
      nadeLabel: nadeT,
      spawnZone: () => spawnZone(t),
      videosFor: (objId) => videosForObject(t, objId),
      onOpenVideo: (v) => UI.openVideo(v),
      onEditVideos: (el) => sheetVideo(t, null, { objectId: el ? el.id : "", objectTitle: el ? Board.typeLabel(el) : "", playerId: el ? el.playerId || "" : "" }),
      onAskText: (title, preset, cb) => askText(title, preset, cb),
      onEditElement: (el) => { if (el) sheetElementDetails(t, el); },
      onConfirm: (title, text, onYes) => confirmDlg(title, text, onYes),
      onToast: (msg, kind) => toast(msg, kind),
      onFocus: () => {},
      onChange: () => { saveState("draft"); },
      onSave: () => saveBoard(t),
      onSelect: (el) => {
        if (el) S.tab = "element";
        else if (S.focusPlayer) S.tab = "player";
        renderInspector();
      },
      onTapElement: (el) => {
        if (el && window.innerWidth <= 900) openMobileInspector(t);
      },
      onMoreTools: () => sheetMoreTools(t),
    });
    S.board.setFocus(S.focusPlayer);
  }
  async function saveBoard(t) {
    const board = S.board;
    if (!board) return;
    const fresh = tacticById(t.id) || t;
    const blocks = clone(blocksOf(fresh));
    const i = blocks.findIndex((x) => x.type === "board");
    const data = board.block;
    if (i >= 0) blocks[i] = clone(data); else blocks.push(clone(data));
    saveState("saving");
    try {
      await DB.save("tactics", { id: t.id, blocks });
      saveState("saved");
      toast("Схема сохранена", "ok");
      return true;
    } catch (e) {
      saveState("draft");
      toast(UI.friendlyError(e, "Не удалось сохранить схему. Попробуйте ещё раз."), "err");
      return false;
    }
  }
  async function addBoardBlock(t) {
    const blocks = clone(blocksOf(t));
    blocks.push({ id: uid("b"), type: "board", title: "Схема", markers: [], drawings: [], markerStyle: "number" });
    const ok = await saveBlocks(t, blocks, 'добавил схему в «' + t.name + "»");
    if (ok !== null) toast("Схема создана — можно рисовать", "ok");
  }

  /* ---------- панель свойств ---------- */
  function renderInspector() {
    const body = $("#inspBody");
    if (!body) return;
    const t = tacticById(S.boardTacticId);
    if (!t) return;
    $$("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    if (S.tab === "element" && S.board) {
      S.board.renderInspector(body);
      return;
    }
    if (S.tab === "player") { body.innerHTML = inspectorPlayerHTML(t); bindInspectorPlayer(t, body); return; }
    body.innerHTML = inspectorTacticHTML(t);
    bindInspectorTactic(t, body);
  }

  function inspectorPlayerHTML(t) {
    const pid = S.focusPlayer;
    if (!pid) {
      return emptyState("user", "Выберите игрока", "Нажмите на игрока сверху или на его токен на карте — здесь появятся его позиция, маршрут, гранаты и видео.") +
        '<div class="picklist">' + DB.cache.players.map((p) =>
          '<button class="pick" type="button" data-pick="' + attr(p.id) + '">' +
          '<span class="pnum" style="--pc:' + attr(p.color || "#f0b429") + '">' + playerNumber(p) + "</span>" +
          "<span><b>" + esc(p.name) + "</b><small>" + esc(p.role ? T(p.role) : "Игрок") + "</small></span></button>").join("") + "</div>";
    }
    const p = playerById(pid);
    if (!p) return emptyState("user", "Игрок не найден", "");
    const info = playerTacticInfo(t, p);
    let h = '<div class="insp-head"><span class="insp-type">' + ic("user") + "Игрок</span>" +
      '<span class="insp-who" style="--pc:' + attr(p.color || "#f0b429") + '">' + esc(p.name) + "</span></div>";

    h += '<dl class="kv">' +
      "<dt>Роль</dt><dd>" + esc(p.role ? T(p.role) : "—") + "</dd>" +
      "<dt>Старт</dt><dd>" + esc(info.start || "не задан") + "</dd>" +
      "<dt>Маршрут</dt><dd>" + esc(info.route || "не задан") + "</dd>" +
      "</dl>";

    h += '<div class="insp-block"><span class="insp-label">Задача</span>' +
      (info.tasks.length
        ? info.tasks.map((x) => '<div class="mini"><b>' + esc(x.task || x.role || "Задача") + "</b>" +
            (x.note ? "<span>" + esc(x.note) + "</span>" : "") + "</div>").join("")
        : '<p class="insp-muted">Задач нет.</p>') + "</div>";

    h += '<div class="insp-block"><span class="insp-label">Гранаты</span>' +
      (info.nades.length
        ? info.nades.map((x) => '<div class="mini"><span class="mini-ic">' + ic(x.icon) + "</span><b>" + esc(x.title) + "</b>" +
            (x.sub ? "<span>" + esc(x.sub) + "</span>" : "") + "</div>").join("")
        : '<p class="insp-muted">Гранаты не назначены.</p>') + "</div>";

    h += '<div class="insp-block"><span class="insp-label">Комментарий капитана</span>' +
      (info.note ? '<p class="insp-text">' + esc(info.note) + "</p>" : '<p class="insp-muted">Комментария нет.</p>') +
      (isCap() ? '<button class="btn btn-ghost btn-sm" type="button" data-editnote>' + ic("edit") + " Написать</button>" : "") + "</div>";

    h += '<div class="insp-block"><span class="insp-label">Видео</span>' +
      (info.videos.length
        ? '<div class="insp-videos">' + info.videos.map((v) =>
            '<button class="vrow" type="button" data-play="' + attr(v.id) + '">' + ic("play") + "<span>" + esc(v.title || "Видео") + "</span>" +
            (v.kind ? "<small>" + esc(VIDEO_KIND_LABEL[v.kind] || "") + "</small>" : "") + "</button>").join("") + "</div>"
        : '<p class="insp-muted">Для этого игрока видео нет.</p>') +
      (isCap() ? '<button class="btn btn-ghost btn-sm" type="button" data-addvideo>' + ic("plus") + " Добавить видео</button>" : "") + "</div>";

    h += '<div class="insp-actions"><a class="btn btn-ghost btn-sm" href="#/player/' + attr(p.id) + '">' + ic("user") + " Карточка игрока</a></div>";
    return h;
  }
  function bindInspectorPlayer(t, box) {
    $$("[data-pick]", box).forEach((b) => {
      b.onclick = () => {
        S.focusPlayer = b.dataset.pick;
        S.tab = "player";
        if (S.board) S.board.setFocus(S.focusPlayer);
        $("[data-role=playerchips]").innerHTML = playerChipsHTML(t);
        bindPlayerChips(t);
        renderInspector();
      };
    });
    $$("[data-play]", box).forEach((b) => {
      b.onclick = () => {
        const v = videosOf(t).find((x) => x.id === b.dataset.play);
        if (v) UI.openVideo(v);
      };
    });
    const av = $("[data-addvideo]", box);
    if (av) av.onclick = () => sheetVideo(t, null, { playerId: S.focusPlayer || "" });
    const en = $("[data-editnote]", box);
    if (en) en.onclick = () => sheetCaptainNote(t, S.focusPlayer);
  }

  /** Всё, что относится к игроку в этой тактике. */
  function playerTacticInfo(t, p) {
    const board = boardBlockOf(t);
    const mk = board ? (board.markers || []).find((m) => m.kind === "player" && m.playerId === p.id) : null;
    const start = mk ? zoneAt(mapById(t.map_id), mk.x, mk.y) : "";
    const tasks = [];
    const nades = [];
    blocksOfType(t, "tasks").forEach((b) => (b.items || []).forEach((it) => {
      if (it.playerId === p.id) tasks.push(it);
    }));
    blocksOfType(t, "grenades").forEach((b) => (b.items || []).forEach((it) => {
      if (it.by === p.id) nades.push({ icon: it.kind || "bomb", title: it.name || nadeT(it.kind), sub: [it.from, it.to].filter(Boolean).join(" → ") });
    }));
    if (board) {
      (board.markers || []).forEach((m) => {
        if (m.playerId !== p.id) return;
        if (Board.NADES.some((n) => n.id === m.kind)) {
          nades.push({ icon: m.kind, title: m.label || nadeT(m.kind), sub: "на схеме" });
        }
      });
      (board.drawings || []).forEach((d) => {
        const mine = d.playerId === p.id || (mk && (d.a1 === mk.id || (d.anchors || []).indexOf(mk.id) >= 0));
        if (!mine) return;
        if (d.type === "nade") nades.push({ icon: d.kind || "bomb", title: d.label || nadeT(d.kind), sub: "на схеме" });
      });
    }
    let route = "";
    if (board && mk) {
      const paths = (board.drawings || []).filter((d) =>
        d.playerId === p.id || d.a1 === mk.id || (d.anchors || []).indexOf(mk.id) >= 0);
      if (paths.length) {
        const last = paths[paths.length - 1];
        const endPt = last.pts ? last.pts[last.pts.length - 1] : [last.x2, last.y2];
        route = (start ? start + " → " : "") + (zoneAt(mapById(t.map_id), endPt[0], endPt[1]) || "точка на схеме");
        if (paths.length > 1) route += " · маршрутов: " + paths.length;
      }
    }
    const note = (mk && mk.note) || (tasks[0] && tasks[0].note) || "";
    return { start, route, tasks, nades, note, videos: videosForPlayer(t, p.id) };
  }

  function inspectorTacticHTML(t) {
    let h = "";
    h += '<div class="insp-block"><span class="insp-label">Описание</span>' +
      (t.description ? '<p class="insp-text">' + esc(t.description) + "</p>" : '<p class="insp-muted">Описания нет.</p>') +
      (isCap() ? '<button class="btn btn-ghost btn-sm" type="button" data-editdesc>' + ic("edit") + " Изменить</button>" : "") + "</div>";

    /* задачи */
    const tasks = [];
    blocksOfType(t, "tasks").forEach((b) => (b.items || []).forEach((it) => tasks.push({ b, it })));
    h += sectionListHTML(t, "tasks", "Задачи", tasks, (x) => {
      const p = playerById(x.it.playerId);
      return '<div class="mini"><b>' + esc(x.it.task || x.it.role || "Задача") + "</b>" +
        (p ? '<span class="mini-who" style="--pc:' + attr(p.color || "#f0b429") + '">' + esc(p.name) + "</span>" : "") +
        (x.it.note ? "<span>" + esc(x.it.note) + "</span>" : "") + "</div>";
    });

    /* гранаты */
    const nades = [];
    blocksOfType(t, "grenades").forEach((b) => (b.items || []).forEach((it) => nades.push({ b, it })));
    h += sectionListHTML(t, "grenades", "Гранаты", nades, (x) => {
      const p = playerById(x.it.by);
      return '<div class="mini"><span class="mini-ic">' + ic(x.it.kind || "bomb") + "</span>" +
        "<b>" + esc(x.it.name || nadeT(x.it.kind)) + "</b>" +
        (p ? '<span class="mini-who" style="--pc:' + attr(p.color || "#f0b429") + '">' + esc(p.name) + "</span>" : "") +
        (x.it.from || x.it.to ? "<span>" + esc([x.it.from, x.it.to].filter(Boolean).join(" → ")) + "</span>" : "") +
        ((x.it.steps || []).length ? "<span>" + x.it.steps.length + " шага</span>" : "") + "</div>";
    });

    /* видео */
    const vids = videosOf(t).map((v) => ({ b: firstBlock(t, "video"), it: v }));
    h += '<div class="insp-block"><span class="insp-label">Видео · ' + vids.length + "</span>" +
      (vids.length ? '<div class="insp-videos">' + vids.map((x) => {
        const p = playerById(x.it.playerId);
        const parsed = UI.parseVideoUrl(x.it.url);
        return '<div class="vrow wide">' +
          '<button type="button" class="vplay" data-play="' + attr(x.it.id) + '">' + ic("play") + "</button>" +
          "<span><b>" + esc(x.it.title || "Видео") + "</b><small>" +
          esc([x.it.kind ? VIDEO_KIND_LABEL[x.it.kind] : "", p ? p.name : "", x.it.objectTitle || ""].filter(Boolean).join(" · ") ||
            (parsed && parsed.provider === "youtube" ? "YouTube" : "Ссылка")) + "</small></span>" +
          (isCap() ? '<button class="ibtn" type="button" data-vmenu="' + attr(x.it.id) + '" title="Изменить или удалить">' + ic("dots") + "</button>" : "") +
          "</div>";
      }).join("") + "</div>" : '<p class="insp-muted">Видео нет.</p>') +
      (isCap() ? '<button class="btn btn-ghost btn-sm" type="button" data-addvideo>' + ic("plus") + " Добавить видео</button>" : "") + "</div>";

    /* заметки и изображения */
    const notes = [];
    blocksOfType(t, "note").forEach((b) => (b.items || []).forEach((it) => notes.push({ b, it })));
    if (notes.length) {
      h += sectionListHTML(t, "note", "Заметки", notes, (x) =>
        '<div class="mini"><b>' + esc(x.it.title || "Заметка") + "</b><span>" + esc(x.it.text || "") + "</span></div>");
    }
    const imgs = [];
    blocksOfType(t, "image").forEach((b) => (b.items || []).forEach((it) => imgs.push({ b, it })));
    if (imgs.length) {
      h += '<div class="insp-block"><span class="insp-label">Изображения</span><div class="thumbs">' +
        imgs.map((x) => '<button class="thumb" type="button" data-img="' + attr(x.it.url) + '" data-cap="' + attr(x.it.caption || "") + '">' +
          '<img src="' + attr(x.it.url) + '" alt="" loading="lazy"></button>').join("") + "</div></div>";
    }

    if (isCap()) {
      h += '<div class="insp-block"><span class="insp-label">Добавить</span><div class="segrow wrap">' +
        '<button class="seg" type="button" data-addsec="tasks">' + ic("target") + " Задачи</button>" +
        '<button class="seg" type="button" data-addsec="grenades">' + ic("bomb") + " Гранаты</button>" +
        '<button class="seg" type="button" data-addsec="video">' + ic("video") + " Видео</button>" +
        '<button class="seg" type="button" data-addsec="note">' + ic("note") + " Заметка</button>" +
        '<button class="seg" type="button" data-addsec="image">' + ic("image") + " Изображение</button>" +
        "</div></div>";
    }
    return h;
  }
  function sectionListHTML(t, type, title, rows, rowHTML) {
    let h = '<div class="insp-block"><span class="insp-label">' + esc(title) + " · " + rows.length + "</span>";
    h += rows.length ? rows.map((x) =>
      '<div class="listrow">' + rowHTML(x) +
      (isCap() ? '<span class="listrow-tools"><button class="ibtn" type="button" data-itemmenu="' + attr(type) + ":" + attr(x.b.id) + ":" + attr(x.it.id) +
        '" title="Изменить или удалить">' + ic("dots") + "</button></span>" : "") + "</div>").join("")
      : '<p class="insp-muted">Пусто.</p>';
    if (isCap()) h += '<button class="btn btn-ghost btn-sm" type="button" data-addsec="' + type + '">' + ic("plus") + " Добавить</button>";
    return h + "</div>";
  }
  function bindInspectorTactic(t, box) {
    const ed = $("[data-editdesc]", box);
    if (ed) ed.onclick = () => sheetEditDesc(t);
    $$("[data-play]", box).forEach((b) => {
      b.onclick = () => { const v = videosOf(t).find((x) => x.id === b.dataset.play); if (v) UI.openVideo(v); };
    });
    $$("[data-vmenu]", box).forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const v = videosOf(t).find((x) => x.id === b.dataset.vmenu);
        if (v) videoMenu(e.currentTarget, t, v);
      };
    });
    $$("[data-itemmenu]", box).forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const [type, bid, iid] = b.dataset.itemmenu.split(":");
        itemMenu(e.currentTarget, t, bid, iid, type);
      };
    });
    $$("[data-addsec]", box).forEach((b) => {
      b.onclick = () => addSection(t, b.dataset.addsec);
    });
    const av = $("[data-addvideo]", box);
    if (av) av.onclick = () => sheetVideo(t, null, { playerId: S.focusPlayer || "" });
    $$("[data-img]", box).forEach((b) => { b.onclick = () => openViewer(b.dataset.img, b.dataset.cap || ""); });
  }

  function addSection(t, type) {
    if (type === "video") return sheetVideo(t, null, { playerId: S.focusPlayer || "" });
    if (type === "image") return sheetImageItem(t);
    const { blocks, block } = ensureBlock(t, type);
    const it = blankItem(type);
    block.items = block.items || [];
    block.items.push(it);
    openItemEditor(t, blocks, block, it, true);
  }
  function blankItem(type) {
    if (type === "roster") return { id: uid("i"), playerId: "", note: "" };
    if (type === "tasks") return { id: uid("i"), playerId: S.focusPlayer || "", role: "", task: "", note: "" };
    if (type === "grenades") return { id: uid("i"), kind: "smoke", name: "", by: S.focusPlayer || "", from: "", to: "", steps: [], note: "" };
    if (type === "image") return { id: uid("i"), url: "", caption: "" };
    if (type === "video") return { id: uid("i"), url: "", title: "", kind: "", playerId: "", objectId: "", note: "" };
    if (type === "note") return { id: uid("i"), title: "", text: "" };
    return { id: uid("i") };
  }
  function itemMenu(anchor, t, bid, iid, type) {
    const b = blockById(t, bid);
    const it = b && (b.items || []).find((x) => x.id === iid);
    if (!b || !it) return;
    openMenu(anchor, [
      { label: "Изменить", icon: "edit", onClick: () => {
        const blocks = clone(blocksOf(t));
        const bb = blocks.find((x) => x.id === bid);
        const ii = (bb.items || []).find((x) => x.id === iid);
        openItemEditor(t, blocks, bb, ii, false);
      } },
      { label: "Дублировать", icon: "copy", onClick: async () => {
        const blocks = clone(blocksOf(t));
        const bb = blocks.find((x) => x.id === bid);
        const copy = clone(it);
        copy.id = uid("i");
        bb.items.splice(bb.items.indexOf(it) + 1, 0, copy);
        const ok = await saveBlocks(t, blocks, null);
        if (ok !== null) toast("Скопировано", "ok");
      } },
      { sep: true },
      { label: "Удалить", icon: "trash", danger: true, onClick: () => {
        confirmDlg("Удалить элемент?", "Пункт «" + (it.name || it.task || it.title || BLOCK_NAMES[type] || "") + "» будет удалён.", async () => {
          const blocks = clone(blocksOf(t));
          const bb = blocks.find((x) => x.id === bid);
          bb.items = (bb.items || []).filter((x) => x.id !== iid);
          const ok = await saveBlocks(t, blocks, null);
          if (ok !== null) toast("Удалено", "ok");
        });
      } },
    ]);
  }

  /* ---------- редакторы пунктов ---------- */
  function playerOptions(selected) {
    return '<option value="">— не выбран —</option>' + DB.cache.players.map((p) =>
      '<option value="' + attr(p.id) + '"' + (selected === p.id ? " selected" : "") + ">" + esc(p.name) +
      (p.role ? " · " + esc(T(p.role)) : "") + "</option>").join("");
  }
  function roleOptions(selected) {
    return rolePresets().map((r) => '<option value="' + attr(r.value) + '"' + (selected === r.value ? " selected" : "") + ">" +
      esc(r.label) + "</option>").join("");
  }
  function itemFormHTML(type, it) {
    if (type === "tasks") {
      return field("Игрок", '<select data-k="playerId">' + playerOptions(it.playerId) + "</select>") +
        field("Задача", '<input data-k="task" maxlength="120" value="' + attr(it.task || "") + '" placeholder="Например: смок на CT и вход за энтри">') +
        field("Роль в раунде", '<input data-k="role" maxlength="40" value="' + attr(it.role || "") + '" placeholder="Например: энтри, саппорт">') +
        field("Комментарий капитана", '<textarea data-k="note" maxlength="240" placeholder="Тайминг, условия, что делать после">' + esc(it.note || "") + "</textarea>");
    }
    if (type === "grenades") {
      return '<div class="field-row">' +
        field("Тип", '<select data-k="kind">' + ["smoke", "molly", "flash", "he", "decoy"].map((k) =>
          '<option value="' + k + '"' + (it.kind === k ? " selected" : "") + ">" + esc(nadeT(k)) + "</option>").join("") + "</select>") +
        field("Название", '<input data-k="name" maxlength="60" value="' + attr(it.name || "") + '" placeholder="Например: Смок на CT">') + "</div>" +
        field("Кидает", '<select data-k="by">' + playerOptions(it.by) + "</select>") +
        '<div class="field-row">' +
        field("Откуда", '<input data-k="from" maxlength="40" value="' + attr(it.from || "") + '" placeholder="Позиция">') +
        field("Куда", '<input data-k="to" maxlength="40" value="' + attr(it.to || "") + '" placeholder="Цель">') + "</div>" +
        field("Шаги раскидки", '<textarea data-k="steps" placeholder="Каждый шаг с новой строки">' + esc((it.steps || []).join("\n")) + "</textarea>") +
        field("Заметка", '<input data-k="note" maxlength="140" value="' + attr(it.note || "") + '">');
    }
    if (type === "note") {
      return field("Заголовок", '<input data-k="title" maxlength="80" value="' + attr(it.title || "") + '">') +
        field("Текст", '<textarea data-k="text" maxlength="800">' + esc(it.text || "") + "</textarea>");
    }
    if (type === "roster") {
      return field("Игрок", '<select data-k="playerId">' + playerOptions(it.playerId) + "</select>") +
        field("Пометка", '<input data-k="note" maxlength="80" value="' + attr(it.note || "") + '" placeholder="Точка или роль">');
    }
    if (type === "image") {
      return field("Ссылка на изображение", '<input data-k="url" maxlength="600" value="' + attr(it.url || "") + '" placeholder="https://…">') +
        field("Подпись", '<input data-k="caption" maxlength="80" value="' + attr(it.caption || "") + '">') +
        '<button class="btn btn-ghost btn-sm" type="button" data-upload>' + ic("upload") + " Загрузить файл</button>" +
        '<input type="file" accept="image/*" hidden data-file>';
    }
    return "";
  }
  function openItemEditor(t, blocks, block, it, isNew) {
    const type = block.type;
    const paint = () => {
      openSheet((isNew ? "Новый пункт · " : "Изменить · ") + (BLOCK_NAMES[type] || "Блок"),
        field("Заголовок раздела", '<input id="beTitle" maxlength="60" value="' + attr(block.title || BLOCK_NAMES[type] || "") + '">') +
        '<div class="divider"></div>' + itemFormHTML(type, it),
        '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
        (isNew ? "" : '<button class="btn btn-danger" type="button" data-del>Удалить</button>') +
        '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
      $("[data-x]").onclick = closeSheet;
      const up = $("[data-upload]");
      if (up) {
        up.onclick = () => $("[data-file]").click();
        $("[data-file]").onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          saveState("saving");
          try {
            const res = await DB.adapter.uploadImage(DB.team.id, file);
            $('[data-k="url"]').value = res.url;
            saveState("saved");
            toast("Файл загружен", "ok");
          } catch (err) { saveState(""); toast(UI.friendlyError(err, "Не удалось загрузить файл"), "err"); }
        };
      }
      const del = $("[data-del]");
      if (del) del.onclick = () => {
        confirmDlg("Удалить пункт?", "Действие нельзя отменить.", async () => {
          block.items = (block.items || []).filter((x) => x.id !== it.id);
          const ok = await saveBlocks(t, blocks, null);
          if (ok !== null) { closeSheet(); toast("Удалено", "ok"); }
        });
      };
      $("[data-ok]").onclick = async () => {
        $$("[data-k]").forEach((inp) => {
          const k = inp.dataset.k;
          it[k] = k === "steps" ? inp.value.split("\n").map((s) => s.trim()).filter(Boolean) : inp.value.trim();
        });
        block.title = $("#beTitle").value.trim() || block.title;
        block.items = (block.items || []).filter((x) => !isBlank(type, x));
        const ok = await saveBlocks(t, blocks, (isNew ? "добавил" : "изменил") + " " + (BLOCK_NAMES[type] || "блок") + " в «" + t.name + "»");
        if (ok !== null) { closeSheet(); toast("Сохранено", "ok"); }
      };
    };
    paint();
  }
  function isBlank(type, it) {
    if (type === "tasks") return !it.playerId && !it.task && !it.role && !it.note;
    if (type === "grenades") return !it.name && !(it.steps || []).length && !it.by;
    if (type === "image" || type === "video") return !it.url;
    if (type === "note") return !it.title && !it.text;
    if (type === "roster") return !it.playerId && !it.note;
    return false;
  }
  function sheetImageItem(t) {
    const { blocks, block } = ensureBlock(t, "image");
    const it = blankItem("image");
    block.items.push(it);
    openItemEditor(t, blocks, block, it, true);
  }

  /* ---------- видео: добавление, изменение, удаление ---------- */
  function sheetVideo(t, video, preset) {
    if (!isCap()) return;
    preset = preset || {};
    const isNew = !video;
    const v = video ? clone(video) : {
      id: uid("v"), url: "", title: "", kind: "", playerId: preset.playerId || S.focusPlayer || "",
      objectId: preset.objectId || "", objectTitle: preset.objectTitle || "", note: "",
    };
    const parsed = UI.parseVideoUrl(v.url);
    openSheet(isNew ? "Новое видео" : "Изменить видео",
      '<div class="vpreview" id="vPrev">' + previewHTML(parsed, v.title) + "</div>" +
      field("Ссылка на видео", '<input id="vUrl" maxlength="600" value="' + attr(v.url) + '" placeholder="https://www.youtube.com/watch?v=…">',
        "YouTube открывается прямо в приложении — ссылку копировать не нужно") +
      field("Название", '<input id="vTitle" maxlength="80" value="' + attr(v.title) + '" placeholder="Например: Смок на CT из рампы">') +
      '<div class="field-row">' +
      field("Тип", '<select id="vKind">' + VIDEO_KINDS.map((k) =>
        '<option value="' + k + '"' + (v.kind === k ? " selected" : "") + ">" + esc(VIDEO_KIND_LABEL[k]) + "</option>").join("") + "</select>") +
      field("Игрок", '<select id="vPlayer">' + playerOptions(v.playerId) + "</select>") + "</div>" +
      field("Привязка к элементу схемы", '<select id="vObject">' + objectOptions(t, v.objectId) + "</select>",
        "Игрок увидит видео рядом с этим элементом на карте") +
      field("Заметка", '<input id="vNote" maxlength="140" value="' + attr(v.note || "") + '" placeholder="На что смотреть в видео">') +
      '<p class="form-error" id="vErr" role="alert"></p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      (isNew ? "" : '<button class="btn btn-danger" type="button" data-del>Удалить</button>') +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');

    function previewHTML(p, title) {
      if (p && p.provider === "youtube") {
        return '<img src="' + attr(p.thumb) + '" alt="" loading="lazy"><span>' + ic("play") + esc(title || "YouTube") + "</span>";
      }
      if (p && p.inline) return '<span class="novid">' + ic("video") + "Видео откроется в приложении</span>";
      if (p) return '<span class="novid">' + ic("link") + "Откроется внешней ссылкой</span>";
      return '<span class="novid">' + ic("video") + "Вставьте ссылку — покажем превью</span>";
    }
    const urlInp = $("#vUrl");
    urlInp.oninput = UI.debounce(() => {
      const p = UI.parseVideoUrl(urlInp.value);
      $("#vPrev").innerHTML = previewHTML(p, $("#vTitle").value.trim());
      if (urlInp.value.trim() && !p) $("#vErr").textContent = "Ссылка не распознана — проверьте адрес видео";
      else $("#vErr").textContent = "";
    }, 250);

    $("[data-x]").onclick = closeSheet;
    const del = $("[data-del]");
    if (del) del.onclick = () => confirmDlg("Удалить видео?", "Ссылка «" + (v.title || v.url) + "» будет удалена у всех участников.", async () => {
      const ok = await deleteVideo(t, v.id);
      if (ok) { closeSheet(); toast("Видео удалено", "ok"); }
    });
    $("[data-ok]").onclick = async () => {
      const url = $("#vUrl").value.trim();
      const errBox = $("#vErr");
      if (!url) { errBox.textContent = "Вставьте ссылку на видео"; return; }
      if (!UI.parseVideoUrl(url)) { errBox.textContent = "Ссылка не распознана. Поддерживаются YouTube, Vimeo и прямые ссылки на видеофайл."; return; }
      v.url = url;
      v.title = $("#vTitle").value.trim() || (UI.parseVideoUrl(url).provider === "youtube" ? "Видео YouTube" : url);
      v.kind = $("#vKind").value;
      v.playerId = $("#vPlayer").value;
      v.objectId = $("#vObject").value;
      v.objectTitle = (() => { const sel = $("#vObject"); return sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : ""; })();
      v.note = $("#vNote").value.trim();
      const ok = await upsertVideo(t, v);
      if (ok) { closeSheet(); toast(isNew ? "Видео добавлено" : "Видео обновлено", "ok"); }
    };
  }
  function objectOptions(t, selected) {
    const board = boardBlockOf(t);
    let opts = '<option value="">— без привязки —</option>';
    if (board) {
      (board.markers || []).concat(board.drawings || []).forEach((el) => {
        const label = Board.typeLabel(el) + (el.playerId ? " · " + ((playerById(el.playerId) || {}).name || "") : "") +
          (el.label ? " · " + el.label : "");
        opts += '<option value="' + attr(el.id) + '"' + (selected === el.id ? " selected" : "") + ">" + esc(label) + "</option>";
      });
    }
    blocksOfType(t, "tasks").concat(blocksOfType(t, "grenades")).forEach((b) => (b.items || []).forEach((it) => {
      opts += '<option value="' + attr(it.id) + '"' + (selected === it.id ? " selected" : "") + ">" +
        esc((BLOCK_NAMES[b.type] || "") + ": " + (it.name || it.task || it.title || "")) + "</option>";
    }));
    return opts;
  }
  async function upsertVideo(t, v) {
    const blocks = clone(blocksOf(t));
    let block = blocks.find((x) => x.type === "video");
    if (!block) {
      block = { id: uid("b"), type: "video", title: "Видео", items: [] };
      blocks.push(block);
    }
    block.items = block.items || [];
    const i = block.items.findIndex((x) => x.id === v.id);
    const item = {
      id: v.id, url: v.url, title: v.title, caption: v.title, kind: v.kind,
      playerId: v.playerId || "", objectId: v.objectId || "", objectTitle: v.objectTitle || "", note: v.note || "",
    };
    if (i >= 0) block.items[i] = item; else block.items.push(item);
    const ok = await saveBlocks(t, blocks, (i >= 0 ? "изменил видео в «" : "добавил видео в «") + t.name + "»");
    return ok !== null;
  }
  async function deleteVideo(t, id) {
    const blocks = clone(blocksOf(t));
    blocks.forEach((b) => {
      if (b.type === "video" && b.items) b.items = b.items.filter((x) => x.id !== id);
    });
    const ok = await saveBlocks(t, blocks, "удалил видео в «" + t.name + "»");
    return ok !== null;
  }
  function videoMenu(anchor, t, v) {
    openMenu(anchor, [
      { label: "Смотреть", icon: "play", onClick: () => UI.openVideo(v) },
      { label: "Изменить", icon: "edit", onClick: () => sheetVideo(t, v) },
      { sep: true },
      { label: "Удалить видео", icon: "trash", danger: true, onClick: () =>
        confirmDlg("Удалить видео?", "«" + (v.title || v.url) + "» будет удалено у всех участников.", async () => {
          const ok = await deleteVideo(t, v.id);
          if (ok) toast("Видео удалено", "ok");
        }) },
    ]);
  }

  /* ---------- детали тактики (мобильная шторка) ---------- */
  function openTacticDetails(t) {
    S.tab = "tactic";
    openSheet("Тактика · " + t.name, '<div id="detBody"></div>',
      '<button class="btn btn-ghost" type="button" data-x>Закрыть</button>' +
      (isCap() ? '<button class="btn btn-primary" type="button" data-edit>Изменить тактику</button>' : ""));
    const body = $("#detBody");
    body.innerHTML = inspectorTacticHTML(t);
    bindInspectorTactic(t, body);
    $("[data-x]").onclick = closeSheet;
    const ed = $("[data-edit]");
    if (ed) ed.onclick = () => sheetEditTactic(t);
    /* правки внутри шторки перерисовывают её содержимое, а не страницу */
    const refreshBody = () => {
      if (!sheetOpen()) return;
      const fresh = tacticById(t.id);
      if (!fresh) { closeSheet(); return; }
      body.innerHTML = inspectorTacticHTML(fresh);
      bindInspectorTactic(fresh, body);
    };
    body.addEventListener("click", () => setTimeout(refreshBody, 400));
  }
  function openMobileInspector(t) {
    const el = S.board ? S.board.selected() : null;
    openSheet(el ? "Элемент · " + Board.typeLabel(el) : "Свойства", '<div id="mInsp"></div>',
      '<button class="btn btn-ghost" type="button" data-x>Закрыть</button>');
    const box = $("#mInsp");
    if (S.board) S.board.renderInspector(box);
    $("[data-x]").onclick = closeSheet;
    /* после правок в панели — перерисовать её же */
    const rerender = () => { if (sheetOpen() && S.board) S.board.renderInspector($("#mInsp") || box); };
    box.addEventListener("change", () => setTimeout(rerender, 150));
    box.addEventListener("click", () => setTimeout(rerender, 150));
  }
  function sheetMoreTools(t) {
    const board = S.board;
    if (!board) return;
    const tools = Board.TOOLS.filter((x) => MOBILE_MORE.indexOf(x.id) >= 0);
    openSheet("Инструменты", '<div class="toolgrid">' +
      tools.map((x) => '<button class="toolcell" type="button" data-tool="' + x.id + '">' + ic(x.icon) + "<span>" + esc(x.label) + "</span></button>").join("") +
      "</div>" +
      '<div class="divider"></div>' +
      '<div class="toolgrid">' +
      '<button class="toolcell" type="button" data-act="undo">' + ic("undo") + "<span>Отменить</span></button>" +
      '<button class="toolcell" type="button" data-act="redo">' + ic("redo") + "<span>Повторить</span></button>" +
      '<button class="toolcell" type="button" data-act="place">' + ic("flag") + "<span>Расставить 1–5</span></button>" +
      '<button class="toolcell" type="button" data-act="fan">' + ic("fan") + "<span>Маршруты к точке</span></button>" +
      '<button class="toolcell" type="button" data-act="style">' + ic("tag") + "<span>Подписи: " +
        esc(board.block.markerStyle === "nick" ? "ники" : board.block.markerStyle === "both" ? "ник и номер" : "номера") + "</span></button>" +
      '<button class="toolcell" type="button" data-act="clear">' + ic("trash") + "<span>Очистить</span></button>" +
      '<button class="toolcell" type="button" data-act="save">' + ic("save") + "<span>Сохранить</span></button>" +
      '<button class="toolcell" type="button" data-act="big">' + ic("expand") + "<span>На весь экран</span></button>" +
      "</div>",
      '<button class="btn btn-ghost" type="button" data-x>Закрыть</button>');
    $("[data-x]").onclick = closeSheet;
    $$("[data-tool]").forEach((b) => {
      b.onclick = () => { board.setTool(b.dataset.tool); closeSheet(); };
    });
    $$("[data-act]").forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === "style") { board.cycleMarkerStyle(); closeSheet(); return; }
        if (a === "big") { board.toggleFull(); closeSheet(); return; }
        board.root.querySelector('[data-act="' + a + '"]') && board.root.querySelector('[data-act="' + a + '"]').click();
        if (a === "save" || a === "undo" || a === "redo") setTimeout(() => closeSheet(), 200);
      };
    });
  }
  const MOBILE_MORE = ["pan", "enemy", "arrow", "line", "zone", "dot", "molly", "flash", "he", "bomb", "eraser"];

  /* ---------- подпись/заметка элемента схемы ---------- */
  function sheetElementDetails(t, el) {
    if (!el) return;
    const kind = el.type || el.kind;
    openSheet("Элемент · " + Board.typeLabel(el),
      field(kind === "player" ? "Задача игрока на схеме" : "Подпись",
        '<input id="elNote" maxlength="90" value="' + attr(el.note || el.label || "") + '" placeholder="Например: WAIT — ждём смок">') +
      (el.kind === "player" ? field("Позиция", '<input id="elPos" value="' + attr(zoneAt(mapById(t.map_id), el.x, el.y)) + '" disabled>') : "") +
      '<p class="hint">Цвет, линия, видео и удаление — в панели свойств справа.</p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = () => {
      const val = $("#elNote").value.trim();
      S.board.updateSelected((target) => {
        if (target.kind === "player" || target.kind === "enemy" || kind === "arrow" || kind === "path" || kind === "line") target.note = val;
        else target.label = val;
      });
      closeSheet();
      renderInspector();
    };
  }
  function askText(title, preset, cb) {
    openSheet(title, field("Текст на схеме", '<input id="btVal" maxlength="28" value="' + attr(preset || "") + '" placeholder="Например: WAIT">'),
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Поставить</button>');
    const ok = () => {
      const v = $("#btVal").value.trim();
      if (!v) return;
      closeSheet();
      cb(v.slice(0, 28));
    };
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = ok;
    $("#btVal").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } };
  }
  function sheetCaptainNote(t, pid) {
    if (!isCap() || !pid) return;
    const board = boardBlockOf(t);
    const mk = board && (board.markers || []).find((m) => m.kind === "player" && m.playerId === pid);
    const tasks = [];
    blocksOfType(t, "tasks").forEach((b) => (b.items || []).forEach((it) => { if (it.playerId === pid) tasks.push(it); }));
    openSheet("Комментарий капитана",
      '<p class="hint">Комментарий видит игрок в своей карточке тактики.</p>' +
      field("Текст", '<textarea id="cnText" maxlength="240" placeholder="Например: не выходи до смока, жди мой счёт">' +
        esc((mk && mk.note) || (tasks[0] && tasks[0].note) || "") + "</textarea>"),
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const text = $("#cnText").value.trim();
      const blocks = clone(blocksOf(t));
      const bb = blocks.find((x) => x.type === "board");
      if (bb) {
        const m2 = (bb.markers || []).find((m) => m.kind === "player" && m.playerId === pid);
        if (m2) m2.note = text;
      }
      const tb = blocks.find((x) => x.type === "tasks");
      if (tb) {
        let it = (tb.items || []).find((x) => x.playerId === pid);
        if (!it) { it = { id: uid("i"), playerId: pid, role: "", task: "", note: "" }; tb.items = (tb.items || []).concat([it]); }
        it.note = text;
      }
      const ok = await saveBlocks(t, blocks, "написал комментарий игроку в «" + t.name + "»");
      if (ok !== null) { closeSheet(); toast("Комментарий сохранён", "ok"); if (S.board) S.board.renderAll(); }
    };
  }

  /* ============================================================
     Создание / изменение тактики и карты
     ============================================================ */
  function sheetNewTactic(presetMapId) {
    if (!isCap()) return;
    const templates = DB.cache.templates;
    openSheet("Новая тактика",
      '<form id="ntForm">' +
      field("Название", '<input id="ntName" maxlength="60" placeholder="Например: A Execute" required>') +
      '<div class="field-row">' +
      field("Карта", '<select id="ntMap">' + (presetMapId ? "" : '<option value="">— без карты —</option>') +
        DB.cache.maps.map((m) => '<option value="' + attr(m.id) + '"' + (presetMapId === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>").join("") + "</select>") +
      field("Сторона", '<select id="ntSide"><option value="T">T</option><option value="CT">CT</option><option value="ANY">Обе</option></select>') + "</div>" +
      field("Тип", '<select id="ntCat">' + ['<option value="">— без типа —</option>'].concat(
        CATEGORIES.map((c) => '<option value="' + c + '">' + esc(catT(c)) + "</option>")).join("") + "</select>") +
      (templates.length ? field("Шаблон блоков", '<select id="ntTpl"><option value="">Пустая тактика</option>' +
        templates.map((x) => '<option value="' + attr(x.id) + '">' + esc(x.name) + "</option>").join("") + "</select>") : "") +
      field("Описание", '<textarea id="ntDesc" maxlength="600" placeholder="Замысел, тайминги, условия"></textarea>') +
      '<p class="form-error" id="ntErr" role="alert"></p></form>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Создать и открыть</button>');
    $("[data-x]").onclick = closeSheet;
    const ok = async () => {
      const name = $("#ntName").value.trim();
      if (!name) { $("#ntErr").textContent = "Введите название тактики"; return; }
      const tpl = templates.find((x) => x.id === ($("#ntTpl") || {}).value);
      let blocks = tpl ? reIdBlocks(clone(tpl.blocks || [])) : [];
      if (!blocks.some((b) => b.type === "board")) {
        blocks.push({ id: uid("b"), type: "board", title: "Схема", markers: [], drawings: [], markerStyle: "number" });
      }
      const created = await commit('создал тактику «' + name + "»", null, () => DB.save("tactics", {
        map_id: $("#ntMap").value || null, name, side: $("#ntSide").value,
        category: $("#ntCat").value, description: $("#ntDesc").value.trim(), blocks,
      }));
      if (created) { closeSheet(); go("#/tactic/" + created.id); }
    };
    $("[data-ok]").onclick = ok;
    $("#ntForm").onsubmit = (e) => { e.preventDefault(); ok(); };
  }
  function reIdBlocks(blocks) {
    (blocks || []).forEach((b) => {
      b.id = uid("b");
      (b.items || []).forEach((it) => { it.id = uid("i"); });
      (b.markers || []).forEach((m) => { m.id = uid("m"); });
      (b.drawings || []).forEach((d) => { d.id = uid("d"); });
      (b.items || []).forEach((it) => { (it.videos || []).forEach((v) => { v.id = uid("v"); }); });
    });
    return blocks;
  }
  function sheetEditTactic(t) {
    if (!isCap()) return;
    openSheet("Изменить тактику",
      field("Название", '<input id="etName" maxlength="60" value="' + attr(t.name) + '" required>') +
      '<div class="field-row">' +
      field("Карта", '<select id="etMap"><option value="">— без карты —</option>' +
        DB.cache.maps.map((m) => '<option value="' + attr(m.id) + '"' + (t.map_id === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>").join("") + "</select>") +
      field("Сторона", '<select id="etSide">' + ["T", "CT", "ANY"].map((s) =>
        '<option value="' + s + '"' + (t.side === s ? " selected" : "") + ">" + esc(s === "ANY" ? "Обе" : s) + "</option>").join("") + "</select>") + "</div>" +
      field("Тип", '<select id="etCat">' + ['<option value="">— без типа —</option>'].concat(CATEGORIES.map((c) =>
        '<option value="' + c + '"' + (t.category === c ? " selected" : "") + ">" + esc(catT(c)) + "</option>")).join("") + "</select>") +
      '<div class="divider"></div>' +
      '<p class="hint">Схему, задачи, гранаты и видео правьте прямо в тактике — панель справа.</p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#etName").value.trim();
      if (!name) { toast("Введите название", "warn"); return; }
      const ok = await commit('изменил тактику «' + name + "»", { kind: "tactic", id: t.id }, () => DB.save("tactics", {
        id: t.id, name, map_id: $("#etMap").value || null, side: $("#etSide").value, category: $("#etCat").value,
      }));
      if (ok !== null) { closeSheet(); toast("Сохранено", "ok"); }
    };
  }
  async function duplicateTactic(id) {
    const t = tacticById(id);
    if (!t || !isCap()) return;
    const copy = clone(t);
    delete copy.id;
    delete copy.pos;
    copy.name = t.name + " (копия)";
    reIdBlocks(copy.blocks);
    const created = await commit('скопировал тактику «' + t.name + "»", null, () => DB.save("tactics", copy));
    if (created) { toast("Копия создана", "ok"); go("#/tactic/" + created.id); }
  }
  function sheetEditDesc(t) {
    if (!isCap()) return;
    openSheet("Описание тактики",
      field("Замысел, тайминги, условия", '<textarea id="dDesc" maxlength="800">' + esc(t.description || "") + "</textarea>"),
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const ok = await commit('изменил описание «' + t.name + "»", { kind: "tactic", id: t.id },
        () => DB.save("tactics", { id: t.id, description: $("#dDesc").value.trim() }));
      if (ok !== null) { closeSheet(); toast("Сохранено", "ok"); }
    };
  }

  function sheetMap(m) {
    if (!isCap()) return;
    const isNew = !m;
    m = m || { name: "", image: "", photo: "" };
    if (!m.photo && isNew) m.photo = KABANY_HERO;
    const presets = [["", "Без радара"]].concat(
      DB.cache.maps.filter((x) => x.image).map((x) => [x.image, x.name + " (текущий радар)"])).concat([
      ["assets/maps/mirage.png", "Mirage (встроенный радар)"],
      ["assets/maps/ancient.png", "Ancient (встроенный радар)"],
      ["assets/maps/dust2.png", "Dust 2 (встроенный радар)"],
    ]);
    openSheet(isNew ? "Новая карта" : "Изменить карту",
      field("Название", '<input id="mpName" maxlength="40" value="' + attr(m.name) + '" placeholder="Например: Mirage">') +
      field("Радар карты (фон схемы)", '<select id="mpImage">' + presets.map((p) =>
        '<option value="' + attr(p[0]) + '"' + (m.image === p[0] ? " selected" : "") + ">" + esc(p[1]) + "</option>").join("") +
        '<option value="__custom">Своя ссылка…</option></select>') +
      '<div id="mpCustomWrap" hidden>' + field("Ссылка на изображение", '<input id="mpCustom" maxlength="600" value="' + attr(m.image || "") + '" placeholder="https://…">') + "</div>" +
      field("Обложка (фото карточки) — можно открыть кликом", '<div class="vpreview" id="mpPrev" style="cursor:pointer" title="Нажмите чтобы открыть картинку">' +
        '<img src="' + attr(m.photo || mapArt(m) || KABANY_HERO) + '" alt=""></div>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-mppick>' + ic("upload") + " Загрузить фото</button>" +
        '<span style="margin-left:8px" class="hint">Фото по умолчанию — "Реальные кабаны"</span>' +
        '<input type="file" accept="image/*" hidden id="mpFile">') +
      '<p class="form-error" id="mpErr" role="alert"></p>' +
      '<p class="hint">Обложка видна без открытия — на карточке карты. Радар — фон схемы.</p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      (isNew ? "" : '<button class="btn btn-danger" type="button" data-del>Удалить карту</button>') +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    let photo = m.photo || (isNew ? KABANY_HERO : "");
    const sel = $("#mpImage");
    const syncCustom = () => { $("#mpCustomWrap").hidden = sel.value !== "__custom"; };
    sel.onchange = syncCustom;
    syncCustom();
    if (m.image && !presets.some((p) => p[0] === m.image)) { sel.value = "__custom"; syncCustom(); }
    $("#mpPrev").onclick = () => { const src = $("#mpPrev img") && $("#mpPrev img").src; if (src) openViewer(src, $("#mpName").value.trim() || m.name || "Карта"); };
    $("#mpFile").onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      readImage(file, 900).then((url) => {
        photo = url;
        $("#mpPrev").innerHTML = '<img src="' + attr(url) + '" alt="">';
        $("#mpPrev").onclick = () => openViewer(url, $("#mpName").value.trim() || m.name || "Карта");
      }).catch(() => toast(UI.friendlyError(null, "Не удалось прочитать файл"), "err"));
    };
    $("[data-mppick]").onclick = () => $("#mpFile").click();
    $("[data-x]").onclick = closeSheet;
    const del = $("[data-del]");
    if (del) del.onclick = () => deleteMap(m);
    $("[data-ok]").onclick = async () => {
      const name = $("#mpName").value.trim();
      if (!name) { $("#mpErr").textContent = "Введите название карты"; return; }
      const image = sel.value === "__custom" ? $("#mpCustom").value.trim() : sel.value;
      if (!photo) photo = KABANY_HERO;
      const payload = { name, image, photo };
      if (!isNew) payload.id = m.id;
      let saved = null;
      try { saved = await commit(isNew ? 'добавил карту «' + name + "»" : 'изменил карту «' + name + "»", isNew ? null : { kind: "map", id: m.id }, () => DB.save("maps", payload)); }
      catch (e) {
        // Fallback для старых баз без столбца photo: пробуем без photo
        const msg = String((e && e.message) || e);
        if (msg.indexOf("photo") >= 0) {
          try { const p2 = { name, image }; if (!isNew) p2.id = m.id; saved = await commit(isNew ? 'добавил карту «' + name + "»" : 'изменил карту «' + name + "»", isNew ? null : { kind: "map", id: m.id }, () => DB.save("maps", p2)); toast("Сохранено без обложки (обновите схему: supabase-schema.sql)", "warn"); } catch (e2) { toast(UI.friendlyError(e2, "Не удалось сохранить"), "err"); return; }
        } else throw e;
      }
      if (saved !== null) {
        closeSheet(); toast("Сохранено", "ok");
        // Обновляем отображение без необходимости открывать карту: перерисовываем главную и тактики
        try { await DB.refresh("maps"); } catch (ignore) {}
        render();
        if (isNew) go("#/tactics/" + saved.id);
      }
    };
  }
  async function loadStarterKit() {
    if (!isCap()) { toast("Это может сделать только капитан", "warn"); return; }
    const need = DB.cache.maps.length === 0 || DB.cache.tactics.length === 0;
    if (!need) { toast("Стартовый набор уже загружен", "ok"); return; }
    if (!confirm("Загрузить стартовый набор? Добавим карты Mirage, Ancient, Dust 2 с тактиками, составом и раскидками. Текущие данные не удалятся.")) return;
    saveState("saving");
    try {
      await Seed.seedTeam(DB.team.id);
      await DB.refresh("*");
      saveState("saved");
      toast("Стартовый набор загружен", "ok");
      render();
    } catch (e) { saveState(""); toast(UI.friendlyError(e, "Не удалось загрузить набор"), "err"); }
  }
  function deleteMap(m) {
    const n = DB.cache.tactics.filter((t) => t.map_id === m.id).length;
    confirmDlg("Удалить карту «" + m.name + "»?",
      n ? "Тактики этой карты (" + n + ") останутся, но потеряют привязку к карте." : "Действие нельзя отменить.",
      async () => {
        const ok = await commit('удалил карту «' + m.name + "»", null, () => DB.del("maps", m.id));
        if (ok !== null) { closeSheet(); toast("Карта удалена", "ok"); go("#/tactics"); }
      });
  }
  function mapMenu(anchor, m) {
    if (!m) return;
    openMenu(anchor, [
      { label: "Открыть тактики", icon: "target", onClick: () => go("#/tactics/" + m.id) },
      { label: "Изменить карту", icon: "edit", onClick: () => sheetMap(m) },
      { label: "Новая тактика", icon: "plus", onClick: () => sheetNewTactic(m.id) },
      { sep: true },
      { label: "Удалить карту", icon: "trash", danger: true, onClick: () => deleteMap(m) },
    ]);
  }
  function readImage(file, maxW) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("READ"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("IMAGE"));
        img.onload = () => {
          const scale = Math.min(1, (maxW || 900) / (img.width || maxW));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
          canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
          const ctx = canvas.getContext && canvas.getContext("2d");
          if (!ctx) { resolve(reader.result); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try { resolve(canvas.toDataURL("image/jpeg", 0.78)); } catch (e) { resolve(reader.result); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ============================================================
     Игроки
     ============================================================ */
  function viewPlayers() {
    let h = '<header class="page-head"><div><h1>Игроки</h1><p class="sub">' +
      DB.cache.players.length + " в составе</p></div>" +
      (isCap() ? '<div class="head-actions"><button class="btn btn-primary" type="button" data-addp>' + ic("plus") + " Игрок</button></div>" : "") +
      "</header>";
    if (!DB.cache.players.length) {
      h += '<section class="card"><div class="card-body">' +
        emptyState("users", "Состав пуст", isCap() ? "Добавьте игроков — к ним привяжутся задачи, гранаты и видео." : "Капитан ещё не добавил игроков.",
          isCap() ? '<button class="btn btn-primary btn-sm" type="button" data-addp>' + ic("plus") + " Добавить игрока</button>" : "") +
        "</div></section>";
    } else {
      h += '<div class="playergrid">';
      DB.cache.players.forEach((p) => { h += playerCardHTML(p); });
      h += "</div>";
    }
    view().innerHTML = h;
    $$("[data-addp]").forEach((b) => { b.onclick = () => sheetPlayer(null); });
    bindPlayerCards();
  }
  function playerCardHTML(p) {
    const brief = playerBrief(p);
    const me = p.id === DB.myPlayerId();
    return '<article class="pcard" data-player="' + attr(p.id) + '">' +
      '<div class="pcard-top">' +
      '<span class="pnum" style="--pc:' + attr(p.color || "#f0b429") + '">' + playerNumber(p) + "</span>" +
      "<span class=\"pcard-who\"><b>" + esc(p.name) + (me ? ' <i class="badge acc">вы</i>' : "") + "</b>" +
      "<small>" + esc(p.role ? T(p.role) : "Игрок") + "</small></span>" +
      (isCap() ? '<button class="ibtn" type="button" data-pmenu="' + attr(p.id) + '" title="Изменить или удалить">' + ic("dots") + "</button>" : "") +
      "</div>" +
      (brief.tactic ? '<div class="pcard-row"><span>Тактика</span><b>' + esc(brief.tactic) + "</b></div>" : "") +
      (brief.task ? '<div class="pcard-row"><span>Задача</span><b>' + esc(brief.task) + "</b></div>" : "") +
      (brief.nades ? '<div class="pcard-row"><span>Граната</span><b>' + esc(brief.nades) + "</b></div>" : "") +
      (brief.videos.length ? '<div class="pcard-videos">' + brief.videos.slice(0, 3).map((v) =>
        '<button class="vrow sm" type="button" data-play="' + attr(v.id) + '" data-tac="' + attr(v.tacticId) + '">' + ic("play") +
        "<span>" + esc(v.title || "Видео") + "</span></button>").join("") + "</div>" : "") +
      '<div class="pcard-actions"><a class="btn btn-ghost btn-sm" href="#/player/' + attr(p.id) + '">Открыть</a>' +
      (brief.tacticId ? '<a class="btn btn-ghost btn-sm" href="#/tactic/' + attr(brief.tacticId) + '">Тактика</a>' : "") +
      "</div></article>";
  }
  /** Компактная выжимка по игроку: ближайшая тактика, задача, граната, видео. */
  function playerBrief(p) {
    let tactic = "", tacticId = "", task = "", nades = "";
    const vids = [];
    DB.cache.tactics.forEach((t) => {
      let hit = false;
      blocksOfType(t, "tasks").forEach((b) => (b.items || []).forEach((it) => {
        if (it.playerId !== p.id) return;
        hit = true;
        if (!task) { task = it.task || it.role || ""; tactic = t.name; tacticId = t.id; }
      }));
      blocksOfType(t, "grenades").forEach((b) => (b.items || []).forEach((it) => {
        if (it.by !== p.id) return;
        hit = true;
        if (!nades) nades = it.name || nadeT(it.kind);
      }));
      const board = boardBlockOf(t);
      if (board && (board.markers || []).some((m) => m.kind === "player" && m.playerId === p.id)) hit = true;
      videosForPlayer(t, p.id).forEach((v) => vids.push({ id: v.id, title: v.title, url: v.url, tacticId: t.id }));
      if (hit && !tacticId) { tactic = t.name; tacticId = t.id; }
    });
    return { tactic, tacticId, task, nades, videos: vids };
  }
  function bindPlayerCards() {
    $$("[data-pmenu]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); playerMenu(e.currentTarget, b.dataset.pmenu); };
    });
    $$("[data-play]").forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = tacticById(b.dataset.tac);
        const v = t ? videosOf(t).find((x) => x.id === b.dataset.play) : null;
        if (v) UI.openVideo(v);
      };
    });
  }
  function playerMenu(anchor, id) {
    const p = playerById(id);
    if (!p) return;
    openMenu(anchor, [
      { label: "Открыть карточку", icon: "user", onClick: () => go("#/player/" + id) },
      { label: "Изменить", icon: "edit", onClick: () => sheetPlayer(p) },
      { label: "Это я", icon: "check", onClick: () => { DB.setMyPlayer(id); toast("Профиль выбран", "ok"); render(); } },
      { sep: true },
      { label: "Удалить игрока", icon: "trash", danger: true, onClick: () => deletePlayer(p) },
    ]);
  }
  /** Убрать ссылки на игрока из тактик: после удаления не должно остаться битых привязок. */
  async function unassignPlayer(pid) {
    for (const t of DB.cache.tactics.slice()) {
      let touched = false;
      const blocks = clone(blocksOf(t));
      blocks.forEach((b) => {
        (b.items || []).forEach((it) => {
          if (it.playerId === pid) { it.playerId = ""; touched = true; }
          if (it.by === pid) { it.by = ""; touched = true; }
        });
        (b.markers || []).forEach((m) => { if (m.playerId === pid) { m.playerId = null; touched = true; } });
        (b.drawings || []).forEach((d) => { if (d.playerId === pid) { d.playerId = null; touched = true; } });
      });
      if (touched) await DB.save("tactics", { id: t.id, blocks });
    }
  }
  function deletePlayer(p) {
    confirmDlg("Удалить игрока «" + p.name + "»?",
      "Задачи, гранаты и токены на схемах останутся, но потеряют привязку к игроку.", async () => {
      if (DB.myPlayerId() === p.id) DB.setMyPlayer(null);
      const ok = await commit('удалил игрока «' + p.name + "»", null, async () => {
        await unassignPlayer(p.id);
        await DB.del("players", p.id);
      });
      if (ok !== null) toast("Игрок удалён", "ok");
    });
  }
  function sheetPlayer(p) {
    if (!isCap()) return;
    const isNew = !p;
    p = p || { name: "", role: "", positions: [], color: "#f0b429", notes: "" };
    const colors = ["#f0b429", "#5aa9ff", "#4fd18b", "#ff6b5e", "#b98cff", "#ff8ac2", "#f2f5f8", "#93a1b3"];
    openSheet(isNew ? "Новый игрок" : "Изменить игрока",
      field("Ник", '<input id="plName" maxlength="24" value="' + attr(p.name) + '" placeholder="Например, s1mple" required>') +
      '<div class="field-row">' +
      field("Роль", '<select id="plRole"><option value="">— не задана —</option>' + roleOptions(p.role) +
        '<option value="__custom">Своя роль…</option></select>') +
      field("Цвет", '<div class="swatches" id="plColors">' + colors.map((c) =>
        '<button class="swatch' + ((p.color || colors[0]) === c ? " on" : "") + '" type="button" data-c="' + c +
        '" style="--sw:' + c + '" title="' + c + '" aria-label="Цвет ' + c + '"></button>').join("") + "</div>") + "</div>" +
      '<div id="plRoleWrap" hidden>' + field("Своя роль", '<input id="plRoleCustom" maxlength="30" placeholder="Например: второй снайпер">') + "</div>" +
      field("Позиции", '<input id="plPos" maxlength="90" value="' + attr((p.positions || []).join(", ")) + '" placeholder="Через запятую: Мид, A-рампа">') +
      field("Заметки", '<textarea id="plNotes" maxlength="400" placeholder="Что важно знать об игроке">' + esc(p.notes || "") + "</textarea>") +
      '<p class="form-error" id="plErr" role="alert"></p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      (isNew ? "" : '<button class="btn btn-danger" type="button" data-del>Удалить</button>') +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    let color = p.color || colors[0];
    let role = p.role || "";
    if (role && !rolePresets().some((r) => r.value === role)) {
      $("#plRole").value = "__custom";
      $("#plRoleWrap").hidden = false;
      $("#plRoleCustom").value = role;
    }
    $("#plRole").onchange = (e) => {
      $("#plRoleWrap").hidden = e.target.value !== "__custom";
      if (e.target.value !== "__custom") role = e.target.value;
    };
    $$("#plColors [data-c]").forEach((b) => {
      b.onclick = () => {
        color = b.dataset.c;
        $$("#plColors [data-c]").forEach((x) => x.classList.toggle("on", x === b));
      };
    });
    $("[data-x]").onclick = closeSheet;
    const del = $("[data-del]");
    if (del) del.onclick = () => deletePlayer(p);
    $("[data-ok]").onclick = async () => {
      const name = $("#plName").value.trim();
      if (!name) { $("#plErr").textContent = "Введите ник игрока"; return; }
      const finalRole = $("#plRole").value === "__custom" ? $("#plRoleCustom").value.trim() : $("#plRole").value;
      const payload = {
        name, role: finalRole, color,
        positions: $("#plPos").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
        notes: $("#plNotes").value.trim(),
      };
      if (!isNew) payload.id = p.id;
      const saved = await commit((isNew ? "добавил игрока «" : "изменил игрока «") + name + "»",
        isNew ? null : { kind: "player", id: p.id }, () => DB.save("players", payload));
      if (saved !== null) { closeSheet(); toast("Сохранено", "ok"); if (isNew) go("#/player/" + saved.id); }
    };
  }
  function viewPlayer(id) {
    const p = playerById(id);
    if (!p) {
      view().innerHTML = '<section class="card"><div class="card-body">' +
        emptyState("warn", "Игрок не найден", "", '<a class="btn btn-primary btn-sm" href="#/players">К составу</a>') + "</div></section>";
      return;
    }
    const isMe = p.id === DB.myPlayerId();
    let h = '<a class="backlink" href="#/players">' + ic("back") + "Игроки</a>";
    h += '<header class="page-head"><div class="head-who">' +
      '<span class="pnum lg" style="--pc:' + attr(p.color || "#f0b429") + '">' + playerNumber(p) + "</span>" +
      "<div><h1>" + esc(p.name) + (isMe ? ' <i class="badge acc">это вы</i>' : "") + "</h1>" +
      '<p class="sub">' + esc([p.role ? T(p.role) : null, (p.positions || []).join(" · ") || null].filter(Boolean).join(" · ") || "Игрок") + "</p></div></div>" +
      '<div class="head-actions">' +
      (isMe ? "" : '<button class="btn btn-ghost btn-sm" type="button" data-makeme>Это я</button>') +
      (isCap() ? '<button class="btn btn-icon" type="button" data-pm title="Изменить или удалить">' + ic("dots") + "</button>" : "") +
      "</div></header>";

    /* его тактики: карта, сторона, задача, гранаты, видео */
    const rows = playerTactics(p);
    h += '<section class="card"><div class="card-head"><h2>' + ic("target") + "Тактики игрока · " + rows.length + "</h2></div>" +
      '<div class="card-body tight">';
    if (!rows.length) h += emptyState("target", "Тактик с этим игроком нет", isCap() ? "Назначьте игрока в задачах, гранатах или на схеме." : "");
    else {
      h += '<div class="plrows">';
      rows.forEach((r) => {
        h += '<article class="plrow">' +
          '<a class="plrow-main" href="#/tactic/' + attr(r.t.id) + '">' +
          "<b>" + esc(r.t.name) + "</b>" +
          '<span class="tacmeta"><span class="badge ghost">' + esc(r.mapName || "без карты") + "</span>" +
          '<span class="badge side-' + (r.t.side === "CT" ? "ct" : r.t.side === "ANY" ? "any" : "t") + '">' + esc(r.t.side === "ANY" ? "T/CT" : r.t.side) + "</span></span>" +
          (r.task ? '<span class="plrow-task">' + ic("target") + esc(r.task) + "</span>" : "") +
          (r.nades.length ? '<span class="plrow-nades">' + r.nades.map((n) =>
            '<span class="nadepill">' + ic(n.icon) + esc(n.title) + "</span>").join("") + "</span>" : "") +
          (r.videos.length ? '<span class="plrow-videos">' + r.videos.map((v) =>
            '<button class="vrow sm" type="button" data-play="' + attr(v.id) + '" data-tac="' + attr(r.t.id) + '">' + ic("play") +
            "<span>" + esc(v.title || "Видео") + "</span></button>").join("") + "</span>" : "") +
          "</a>" +
          '<a class="btn btn-ghost btn-sm" href="#/tactic/' + attr(r.t.id) + '">Открыть</a>' +
          "</article>";
      });
      h += "</div>";
    }
    h += "</div></section>";

    if (p.notes) {
      h += '<section class="card"><div class="card-head"><h2>' + ic("note") + "Заметки</h2></div>" +
        '<div class="card-body"><p class="text">' + esc(p.notes) + "</p></div></section>";
    }
    view().innerHTML = h;
    const pm = $("[data-pm]");
    if (pm) pm.onclick = (e) => { e.stopPropagation(); playerMenu(e.currentTarget, p.id); };
    const mk = $("[data-makeme]");
    if (mk) mk.onclick = () => {
      if (DB.team.settings.allowSwitchPlayer === false && !isCap()) { toast("Смену профиля отключил капитан", "warn"); return; }
      DB.setMyPlayer(p.id);
      toast("Теперь это ваш профиль", "ok");
      render();
    };
    $$("[data-play]").forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        const t = tacticById(b.dataset.tac);
        const v = t ? videosOf(t).find((x) => x.id === b.dataset.play) : null;
        if (v) UI.openVideo(v);
      };
    });
  }
  function playerTactics(p) {
    const out = [];
    DB.cache.tactics.forEach((t) => {
      const info = playerTacticInfo(t, p);
      if (!info.tasks.length && !info.nades.length && !info.videos.length && !info.start) return;
      out.push({
        t, mapName: (mapById(t.map_id) || {}).name || "",
        task: (info.tasks[0] && (info.tasks[0].task || info.tasks[0].role)) || info.route || "",
        nades: info.nades.slice(0, 3).map((n) => ({ icon: n.icon, title: n.title })),
        videos: info.videos.slice(0, 3),
      });
    });
    return out;
  }

  /* ============================================================
     Чат
     ============================================================ */
  function viewChat() {
    const msgs = (DB.cache.messages || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const notice = msgs.slice().reverse().find((x) => x.kind === "notice");
    let h = '<header class="page-head"><div><h1>Чат команды</h1>' +
      '<p class="sub">' + (DB.mode() === "cloud" ? "Сообщения приходят всем сразу" : "Локальный режим: чат виден только на этом устройстве") + "</p></div>" +
      (isCap() ? '<div class="head-actions"><button class="btn btn-ghost btn-sm' + (S.chatNotice ? " on" : "") + '" type="button" data-notice>' +
        ic("megaphone") + " Объявление</button></div>" : "") + "</header>";

    h += '<section class="card chatcard"><div class="card-body tight">';
    if (notice) {
      h += '<div class="notice">' + ic("megaphone") + "<div><b>Объявление · " + esc(notice.author || "Капитан") + "</b>" +
        "<p>" + esc(notice.text) + "</p><small>" + esc(fmtTime(notice.ts)) + "</small></div></div>";
    }
    h += '<div class="chatlist" id="chatList">' + chatListHTML(msgs) + "</div>";
    h += "</div></section>";

    h += '<form class="composer" id="chatForm">' +
      '<input id="chatText" maxlength="500" autocomplete="off" placeholder="' +
      (S.chatNotice ? "Текст объявления для команды…" : "Сообщение команде…") + '" value="' + attr(S.chatDraft) + '">' +
      '<button class="btn btn-primary btn-send" type="submit" data-send>' + ic("send") + "<span>Отправить</span></button>" +
      "</form>";

    view().innerHTML = h;
    const list = $("#chatList");
    if (list) list.scrollTop = list.scrollHeight;
    const nf = $("[data-notice]");
    if (nf) nf.onclick = () => { S.chatNotice = !S.chatNotice; viewChat(); $("#chatText").focus(); };
    const input = $("#chatText");
    input.oninput = () => { S.chatDraft = input.value; };
    $("#chatForm").onsubmit = (e) => { e.preventDefault(); sendChat(input); };
    bindChatItems();
    window.scrollTo(0, document.body.scrollHeight);
  }
  function chatListHTML(msgs) {
    const me = DB.actorName();
    if (!msgs.length && !S.chatPending.length) {
      return emptyState("chat", "Сообщений пока нет", "Напишите первое — команда увидит его сразу.");
    }
    let h = "";
    msgs.forEach((m) => { h += chatMsgHTML(m, me); });
    S.chatPending.forEach((m) => { h += chatMsgHTML(m, me); });
    return h;
  }
  function chatMsgHTML(m, me) {
    const mine = m.author === me;
    const st = m._state || "sent";
    return '<div class="msg' + (mine ? " me" : "") + (m.kind === "notice" ? " notice" : "") + (st !== "sent" ? " " + st : "") +
      '" data-msg="' + attr(m.id || "") + '">' +
      '<div class="msg-head"><b>' + esc(m.author || "—") + "</b><time>" + (st === "sending" ? "отправляем…" : esc(fmtTime(m.ts))) +
      (st === "failed" ? ' · <span class="msg-err">не отправлено</span>' : "") + "</time>" +
      ((st === "sent" && DB.canDeleteMessage(m)) ? '<button class="ibtn msg-del" type="button" data-del="' + attr(m.id) + '" title="Удалить сообщение">' + ic("trash") + "</button>" : "") +
      "</div>" +
      '<p class="msg-text">' + esc(m.text) + "</p>" +
      (st === "failed" ? '<div class="msg-actions"><button class="btn btn-ghost btn-sm" type="button" data-retry="' + attr(m.id) + '">' +
        ic("refresh") + " Повторить</button>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-drop="' + attr(m.id) + '">Убрать</button></div>' : "") +
      "</div>";
  }
  function bindChatItems() {
    $$("[data-del]").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.del;
        confirmDlg("Удалить сообщение?", "Сообщение исчезнет у всех участников.", async () => {
          try {
            await DB.deleteMessage(id);
            toast("Сообщение удалено", "ok");
            refreshChatList();
          } catch (e) { toast(UI.friendlyError(e, "Не удалось удалить сообщение"), "err"); }
        });
      };
    });
    $$("[data-retry]").forEach((b) => {
      b.onclick = () => {
        const p = S.chatPending.find((x) => x.id === b.dataset.retry);
        if (!p) return;
        S.chatPending = S.chatPending.filter((x) => x.id !== p.id);
        dispatchMessage(p.text, p.kind === "notice");
      };
    });
    $$("[data-drop]").forEach((b) => {
      b.onclick = () => {
        S.chatPending = S.chatPending.filter((x) => x.id !== b.dataset.drop);
        refreshChatList();
      };
    });
  }
  /** Обновляем только ленту: ввод и фокус поля не теряются. */
  function refreshChatList() {
    const list = $("#chatList");
    if (!list) return;
    const msgs = (DB.cache.messages || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    list.innerHTML = chatListHTML(msgs);
    bindChatItems();
    list.scrollTop = list.scrollHeight;
  }
  function sendChat(input) {
    const text = String(input.value || "").trim();
    if (!text) {
      input.classList.add("shake");
      setTimeout(() => input.classList.remove("shake"), 320);
      toast("Введите текст сообщения", "warn");
      return;
    }
    input.value = "";
    S.chatDraft = "";
    dispatchMessage(text, S.chatNotice && isCap());
    if (S.chatNotice) {
      S.chatNotice = false;
      const nf = $("[data-notice]");
      if (nf) nf.classList.remove("on");
      input.placeholder = "Сообщение команде…";
    }
  }
  function dispatchMessage(text, isNotice) {
    const pending = { id: uid("p"), author: DB.actorName(), text, kind: isNotice ? "notice" : "msg", ts: Date.now(), _state: "sending" };
    S.chatPending.push(pending);
    refreshChatList();
    DB.sendMessage(text, isNotice ? "notice" : "msg").then(() => {
      S.chatPending = S.chatPending.filter((x) => x.id !== pending.id);
      refreshChatList();
    }).catch((e) => {
      UI.logError("чат: отправка", e);
      pending._state = "failed";
      refreshChatList();
      toast(UI.friendlyError(e, "Не удалось отправить сообщение. Попробуйте ещё раз."), "err");
    });
  }

  /* ============================================================
     Материалы (библиотека команды)
     ============================================================ */
  const MAT_ICON = { image: "image", video: "video", gif: "image", link: "link", note: "note", pdf: "note", demo: "save" };
  const MAT_NAME = { image: "Фото", video: "Видео", gif: "GIF", link: "Ссылка", note: "Заметка", pdf: "PDF", demo: "Демо" };
  function materialRowHTML(m) {
    return '<div class="listrow" data-mat="' + attr(m.id) + '">' +
      '<button class="mini" type="button" data-mopen="' + attr(m.id) + '">' +
      '<span class="mini-ic">' + ic(MAT_ICON[m.type] || "link") + "</span><b>" + esc(m.title) + "</b>" +
      (m.description ? "<span>" + esc(m.description.slice(0, 90)) + "</span>" : "") +
      ((mapById(m.map_id) || {}).name ? "<small>" + esc((mapById(m.map_id) || {}).name) + "</small>" : "") +
      "</button>" +
      (isCap() ? '<span class="listrow-tools"><button class="ibtn" type="button" data-mmenu="' + attr(m.id) + '" title="Изменить или удалить">' +
        ic("dots") + "</button></span>" : "") + "</div>";
  }
  function bindMaterialRows() {
    $$("[data-mopen]").forEach((b) => {
      b.onclick = () => { const m = materialById(b.dataset.mopen); if (m) openMaterial(m); };
    });
    $$("[data-mmenu]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); materialMenu(e.currentTarget, b.dataset.mmenu); };
    });
  }
  function openMaterial(m) {
    const parsed = UI.parseVideoUrl(m.url);
    if (m.type === "image" || m.type === "gif") {
      if (m.url) return openViewer(m.url, m.title);
      return toast("Файл не прикреплён", "warn");
    }
    if (m.type === "note") {
      return openSheet(m.title, '<p class="text">' + esc(m.description || "—") + "</p>",
        '<button class="btn btn-ghost" type="button" data-x>Закрыть</button>' +
        (isCap() ? '<button class="btn btn-primary" type="button" data-ed>Изменить</button>' : ""));
    }
    if (parsed && parsed.inline) return UI.openVideo({ title: m.title, url: m.url });
    if (m.url) return window.open(m.url, "_blank", "noopener");
    toast("Ссылка не указана", "warn");
  }
  function materialMenu(anchor, id) {
    const m = materialById(id);
    if (!m) return;
    openMenu(anchor, [
      { label: "Открыть", icon: "expand", onClick: () => openMaterial(m) },
      { label: "Изменить", icon: "edit", onClick: () => sheetMaterial(m) },
      { sep: true },
      { label: "Удалить", icon: "trash", danger: true, onClick: () =>
        confirmDlg("Удалить материал «" + m.title + "»?", "Действие нельзя отменить.", async () => {
          const ok = await commit('удалил материал «' + m.title + "»", null, () => DB.del("materials", id));
          if (ok !== null) toast("Удалено", "ok");
        }) },
    ]);
  }
  function sheetMaterial(m) {
    if (!isCap()) return;
    const isNew = !m;
    m = m || { type: "link", title: "", url: "", description: "", map_id: null };
    openSheet(isNew ? "Новый материал" : "Изменить материал",
      '<div class="field-row">' +
      field("Тип", '<select id="mtType">' + Object.keys(MAT_NAME).map((tp) =>
        '<option value="' + tp + '"' + (m.type === tp ? " selected" : "") + ">" + esc(MAT_NAME[tp]) + "</option>").join("") + "</select>") +
      field("Карта", '<select id="mtMap"><option value="">— общая —</option>' + DB.cache.maps.map((x) =>
        '<option value="' + attr(x.id) + '"' + (m.map_id === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select>") + "</div>" +
      field("Название", '<input id="mtTitle" maxlength="80" value="' + attr(m.title) + '" placeholder="Например: Разбор демо Mirage">') +
      field("Ссылка или файл", '<input id="mtUrl" maxlength="600" value="' + attr(m.url || "") + '" placeholder="https://…">',
        "YouTube и Vimeo открываются внутри приложения") +
      '<button class="btn btn-ghost btn-sm" type="button" data-up>' + ic("upload") + " Загрузить файл</button>" +
      '<input type="file" hidden data-file>' +
      field("Описание или текст заметки", '<textarea id="mtDesc" maxlength="800">' + esc(m.description || "") + "</textarea>") +
      '<p class="form-error" id="mtErr" role="alert"></p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      (isNew ? "" : '<button class="btn btn-danger" type="button" data-del>Удалить</button>') +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-up]").onclick = () => $("[data-file]").click();
    $("[data-file]").onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      saveState("saving");
      try {
        const res = await DB.adapter.uploadImage(DB.team.id, file);
        $("#mtUrl").value = res.url;
        saveState("saved");
        toast("Файл загружен", "ok");
      } catch (err) { saveState(""); toast(UI.friendlyError(err, "Не удалось загрузить файл"), "err"); }
    };
    const del = $("[data-del]");
    if (del) del.onclick = () => confirmDlg("Удалить материал?", "Действие нельзя отменить.", async () => {
      const ok = await commit("удалил материал", null, () => DB.del("materials", m.id));
      if (ok !== null) { closeSheet(); toast("Удалено", "ok"); }
    });
    $("[data-ok]").onclick = async () => {
      const title = $("#mtTitle").value.trim();
      if (!title) { $("#mtErr").textContent = "Введите название"; return; }
      const payload = {
        type: $("#mtType").value, title, url: $("#mtUrl").value.trim(),
        description: $("#mtDesc").value.trim(), map_id: $("#mtMap").value || null,
      };
      if (!isNew) payload.id = m.id;
      const ok = await commit((isNew ? "добавил материал «" : "изменил материал «") + title + "»", null, () => DB.save("materials", payload));
      if (ok !== null) { closeSheet(); toast("Сохранено", "ok"); }
    };
  }

  /* ============================================================
     Настройки
     ============================================================ */
  function viewSettings() {
    const st = DB.team.settings || {};
    let h = '<header class="page-head"><div><h1>Настройки</h1><p class="sub">' + esc(DB.team.name) +
      " · " + (isCap() ? "режим капитана" : "режим игрока") + "</p></div></header>";

    if (!isCap()) {
      h += '<section class="card"><div class="card-head"><h2>' + ic("lock") + "Права</h2></div><div class=\"card-body\">" +
        '<p class="text">Вы вошли как игрок: смотрите тактики и видео, пишете в чат. Правки делает капитан.</p>' +
        '<button class="btn btn-primary" type="button" data-capin>' + ic("shield") + " Войти как капитан</button></div></section>";
    }

    /* Команда */
    h += '<section class="card"><div class="card-head"><h2>' + ic("home") + "Команда</h2>" +
      (isCap() ? '<button class="card-link" type="button" data-teamedit>Изменить' + ic("chevron") + "</button>" : "") + "</div>" +
      '<div class="card-body"><dl class="kv">' +
      "<dt>Название</dt><dd>" + esc(DB.team.name) + "</dd>" +
      "<dt>Капитан</dt><dd>" + esc(DB.team.captainName || "—") + "</dd>" +
      (isCap() ? "<dt>PIN команды</dt><dd><button class=\"btn btn-ghost btn-sm\" type=\"button\" data-pin=\"team\">Сменить PIN</button></dd>" +
        "<dt>PIN капитана</dt><dd><button class=\"btn btn-ghost btn-sm\" type=\"button\" data-pin=\"captain\">Сменить PIN</button></dd>" : "") +
      "</dl></div></section>";

    /* Игроки */
    h += '<section class="card"><div class="card-head"><h2>' + ic("users") + "Игроки · " + DB.cache.players.length + "</h2>" +
      (isCap() ? '<button class="card-link" type="button" data-addp>Добавить' + ic("plus") + "</button>" : "") + "</div>" +
      '<div class="card-body tight">';
    if (!DB.cache.players.length) h += emptyState("users", "Состав пуст", isCap() ? "Добавьте первого игрока." : "");
    DB.cache.players.forEach((p) => {
      h += '<div class="listrow"><button class="mini" type="button" data-goto="#/player/' + attr(p.id) + '">' +
        '<span class="pnum" style="--pc:' + attr(p.color || "#f0b429") + '">' + playerNumber(p) + "</span>" +
        "<b>" + esc(p.name) + "</b><span>" + esc(p.role ? T(p.role) : "Игрок") + "</span></button>" +
        (isCap() ? '<span class="listrow-tools"><button class="ibtn" type="button" data-pmenu="' + attr(p.id) +
          '" title="Изменить или удалить">' + ic("dots") + "</button></span>" : "") + "</div>";
    });
    h += "</div></section>";

    /* Роли */
    const roles = rolePresets();
    h += '<section class="card"><div class="card-head"><h2>' + ic("shield") + "Роли</h2>" +
      (isCap() ? '<button class="card-link" type="button" data-addrole>Добавить' + ic("plus") + "</button>" : "") + "</div>" +
      '<div class="card-body"><div class="chips">' + roles.map((r) =>
        '<span class="chip static">' + esc(r.label) + (isCap() && ROLES_DEFAULT.indexOf(r.value) < 0
          ? '<button class="chip-x" type="button" data-delrole="' + attr(r.value) + '" title="Удалить роль">' + ic("x") + "</button>" : "") + "</span>").join("") +
      "</div><p class=\"hint\">Роли подставляются в карточке игрока и в задачах тактики.</p></div></section>";

    /* Права */
    h += '<section class="card"><div class="card-head"><h2>' + ic("lock") + "Права</h2></div><div class=\"card-body\">" +
      '<ul class="rights"><li><b>Капитан</b><span>создаёт, изменяет и удаляет тактики, карты, игроков и видео; меняет PIN и состав</span></li>' +
      '<li><b>Игрок</b><span>смотрит тактики и видео, пишет в чат, выбирает свой профиль</span></li></ul>' +
      '<label class="switch"><input type="checkbox" data-switchprofile' + (st.allowSwitchPlayer !== false ? " checked" : "") +
      (isCap() ? "" : " disabled") + '><span>Игроки могут менять свой профиль</span></label>' +
      (isCap() ? '<div class="btnrow"><button class="btn btn-ghost btn-sm" type="button" data-capout>Выйти из режима капитана</button></div>' : "") +
      "</div></section>";

    /* Язык терминов */
    h += '<section class="card"><div class="card-head"><h2>' + ic("note") + "Язык</h2></div><div class=\"card-body\">" +
      '<p class="hint">Интерфейс — на русском. Переключите терминологию CS2, если команда привыкла к английским названиям.</p>' +
      '<div class="segrow">' +
      '<button class="seg' + (termsLang() === "ru" ? " on" : "") + '" type="button" data-terms="ru">Русские термины</button>' +
      '<button class="seg' + (termsLang() === "en" ? " on" : "") + '" type="button" data-terms="en">CS2 (англ.)</button>' +
      "</div><p class=\"hint\">Пример: " + esc(nadeT("smoke")) + " · " + esc(nadeT("flash")) + " · " + esc(catT("Execute")) + "</p></div></section>";

    /* Аккаунт */
    const me = myPlayer();
    h += '<section class="card"><div class="card-head"><h2>' + ic("user") + "Аккаунт</h2></div><div class=\"card-body\">" +
      '<dl class="kv"><dt>Профиль</dt><dd>' + (me ? esc(me.name) + " · " + esc(me.role ? T(me.role) : "Игрок") : "не выбран") + "</dd>" +
      "<dt>Устройство</dt><dd>" + esc(DB.mode() === "cloud" ? "облачная синхронизация" : "локальный режим") + "</dd></dl>" +
      '<div class="btnrow">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-pickme>' + ic("user") + (me ? " Сменить профиль" : " Выбрать профиль") + "</button>" +
      '<button class="btn btn-ghost btn-sm" type="button" data-logout>' + ic("logout") + " Выйти из команды</button>" +
      (isCap() ? '<button class="btn btn-danger btn-sm" type="button" data-delteam>' + ic("trash") + " Удалить команду</button>" : "") +
      "</div></div></section>";

    /* Материалы команды */
    h += '<section class="card"><div class="card-head"><h2>' + ic("folder") + "Материалы · " + DB.cache.materials.length + "</h2>" +
      (isCap() ? '<button class="card-link" type="button" data-addm>Добавить' + ic("plus") + "</button>" : "") + "</div>" +
      '<div class="card-body tight">';
    if (!DB.cache.materials.length) h += emptyState("folder", "Материалов нет", isCap() ? "Добавьте ссылки, демо или фото команды." : "");
    DB.cache.materials.forEach((m) => { h += materialRowHTML(m); });
    h += "</div></section>";

    /* Данные и облако — только капитану */
    if (isCap()) {
      h += '<section class="card"><div class="card-head"><h2>' + ic("cloud") + "Данные и синхронизация</h2></div><div class=\"card-body\">" +
        '<p class="text">' + (DB.mode() === "cloud"
          ? "Облако подключено: правки приходят игрокам без перезагрузки."
          : "Облако не подключено — данные живут только на этом устройстве. Подключите Supabase по инструкции SETUP.md, чтобы команда видела правки.") + "</p>" +
        '<div class="btnrow">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-cloud>' + ic("cloud") + " Подключение</button>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-cloudcheck>' + ic("refresh") + " Проверить связь</button>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-export>' + ic("download") + " Экспорт</button>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-import>' + ic("upload") + " Импорт</button>" +
        '<input type="file" accept="application/json,.json" hidden data-impfile>' +
        "</div></div></section>";
    }

    view().innerHTML = h;
    bindSettings();
  }
  function bindSettings() {
    const capin = $("[data-capin]");
    if (capin) capin.onclick = () => askCaptainPin("");
    const capout = $("[data-capout]");
    if (capout) capout.onclick = () => {
      DB.role = "player";
      DB.persistSession();
      toast("Вы в режиме игрока", "ok");
      render();
    };
    const te = $("[data-teamedit]");
    if (te) te.onclick = sheetTeamEdit;
    $$("[data-pin]").forEach((b) => { b.onclick = () => sheetChangePin(b.dataset.pin); });
    const ap = $("[data-addp]");
    if (ap) ap.onclick = () => sheetPlayer(null);
    $$("[data-pmenu]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); playerMenu(e.currentTarget, b.dataset.pmenu); };
    });
    $$("[data-goto]").forEach((b) => { b.onclick = () => go(b.dataset.goto); });
    const ar = $("[data-addrole]");
    if (ar) ar.onclick = sheetAddRole;
    $$("[data-delrole]").forEach((b) => {
      b.onclick = () => {
        const roles = (DB.settings().roles || ROLES_DEFAULT).filter((r) => r !== b.dataset.delrole);
        saveSettings({ roles }, "Список ролей обновлён");
      };
    });
    const sw = $("[data-switchprofile]");
    if (sw) sw.onchange = () => saveSettings({ allowSwitchPlayer: sw.checked }, "Права обновлены");
    $$("[data-terms]").forEach((b) => {
      b.onclick = () => saveSettings({ terms: b.dataset.terms }, b.dataset.terms === "en" ? "Термины CS2 (англ.)" : "Русские термины");
    });
    const pm = $("[data-pickme]");
    if (pm) pm.onclick = openProfilePicker;
    const lo = $("[data-logout]");
    if (lo) lo.onclick = () => confirmDlg("Выйти из команды?", "Устройство забудет сессию — для входа снова понадобятся название и PIN.", doLogout, "Выйти");
    const dt = $("[data-delteam]");
    if (dt) dt.onclick = () => confirmDlg("Удалить команду «" + DB.team.name + "»?",
      "Все тактики, игроки, видео и чат будут удалены у всех участников. Действие необратимо — сначала сделайте экспорт.",
      async () => {
        saveState("saving");
        try {
          await DB.adapter.deleteTeam(DB.team.id);
          saveState("");
          toast("Команда удалена", "ok");
          doLogout();
        } catch (e) { saveState(""); toast(UI.friendlyError(e, "Не удалось удалить команду"), "err"); }
      });
    const am = $("[data-addm]");
    if (am) am.onclick = () => sheetMaterial(null);
    bindMaterialRows();
    const cl = $("[data-cloud]");
    if (cl) cl.onclick = sheetCloud;
    const cc = $("[data-cloudcheck]");
    if (cc) cc.onclick = sheetCloudCheck;
    const ex = $("[data-export]");
    if (ex) ex.onclick = exportTeam;
    const im = $("[data-import]");
    if (im) im.onclick = () => $("[data-impfile]").click();
    const imf = $("[data-impfile]");
    if (imf) imf.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) importTeam(f); };
  }
  async function saveSettings(patch, okText) {
    saveState("saving");
    try {
      await DB.setTeamSettings(patch);
      await DB.log("изменил настройки команды", null);
      saveState("saved");
      toast(okText || "Сохранено", "ok");
      render();
    } catch (e) {
      saveState("");
      toast(UI.friendlyError(e, "Не удалось сохранить настройки"), "err");
    }
  }
  function sheetTeamEdit() {
    if (!isCap()) return;
    openSheet("Команда",
      field("Название", '<input id="teName" maxlength="40" value="' + attr(DB.team.name) + '">') +
      field("Имя капитана", '<input id="teCap" maxlength="24" value="' + attr(DB.team.captainName || "") + '">') +
      '<p class="form-error" id="teErr" role="alert"></p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#teName").value.trim();
      if (!name) { $("#teErr").textContent = "Введите название команды"; return; }
      saveState("saving");
      try {
        DB.team = await DB.adapter.updateTeam(DB.team.id, { name, captainName: $("#teCap").value.trim() });
        DB.persistSession();
        await DB.log("изменил данные команды", null);
        saveState("saved");
        closeSheet();
        toast("Сохранено", "ok");
        render();
      } catch (e) { saveState(""); $("#teErr").textContent = UI.friendlyError(e, "Не удалось сохранить"); }
    };
  }
  function sheetChangePin(kind) {
    if (!isCap()) return;
    const isTeam = kind === "team";
    openSheet(isTeam ? "Новый PIN команды" : "Новый PIN капитана",
      (isTeam ? '<p class="hint">Сообщите новый PIN всем игрокам.</p>' : '<p class="hint">PIN капитана открывает правки. Не совпадайте его с PIN команды.</p>') +
      field("Новый PIN", '<input id="pin1" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off">') +
      field("Повторите PIN", '<input id="pin2" type="password" inputmode="numeric" minlength="4" maxlength="32" autocomplete="off">') +
      '<p class="form-error" id="pinErr" role="alert"></p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const a = $("#pin1").value, c = $("#pin2").value;
      const errBox = $("#pinErr");
      if (a.length < 4) { errBox.textContent = "Минимум 4 символа"; return; }
      if (a !== c) { errBox.textContent = "PIN-коды не совпадают"; return; }
      saveState("saving");
      /* PIN капитана не должен совпадать с PIN команды: иначе любой игрок
         сможет повысить себя до капитана. Проверяем входом без смены сессии. */
      if (!isTeam) {
        try {
          const probe = await DB.adapter.login({ name: DB.team.name, pin: a });
          if (probe && probe.team) {
            saveState("");
            errBox.textContent = "Этот PIN уже используется для входа команды — придумайте другой";
            return;
          }
        } catch (probeErr) { /* PIN не подошёл команде — значит, не совпадает */ }
      }
      try {
        await DB.adapter.setPin(DB.team.id, kind, a);
        await DB.log(isTeam ? "сменил PIN команды" : "сменил PIN капитана", null);
        saveState("saved");
        closeSheet();
        toast("PIN изменён", "ok");
      } catch (e) { saveState(""); errBox.textContent = UI.friendlyError(e, "Не удалось сменить PIN"); }
    };
  }
  function sheetAddRole() {
    if (!isCap()) return;
    openSheet("Новая роль",
      field("Название роли", '<input id="rlName" maxlength="30" placeholder="Например: Второй снайпер">') +
      '<p class="form-error" id="rlErr" role="alert"></p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      '<button class="btn btn-primary" type="button" data-ok>Добавить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#rlName").value.trim();
      const current = DB.settings().roles || ROLES_DEFAULT;
      if (!name) { $("#rlErr").textContent = "Введите название роли"; return; }
      if (current.indexOf(name) >= 0) { $("#rlErr").textContent = "Такая роль уже есть"; return; }
      closeSheet();
      await saveSettings({ roles: current.concat([name]).slice(0, 20) }, "Роль добавлена");
    };
  }
  function sheetCloud() {
    const cfg = DB.cloudConfig();
    openSheet("Подключение к облаку",
      '<p class="hint">Постоянное подключение — файл supabase-config.js (см. SETUP.md). Здесь можно ввести ключи для этого устройства.</p>' +
      field("Project URL", '<input id="clUrl" maxlength="140" value="' + attr((cfg && cfg.url) || "") + '" placeholder="https://ваш-проект.supabase.co">') +
      field("Публичный ключ", '<input id="clKey" maxlength="600" value="' + attr((cfg && cfg.anonKey) || "") + '" placeholder="sb_publishable_…">') +
      '<p class="form-error" id="clErr" role="alert"></p>',
      '<button class="btn btn-ghost" type="button" data-x>Отмена</button>' +
      (cfg ? '<button class="btn btn-danger" type="button" data-clr>Сбросить</button>' : "") +
      '<button class="btn btn-primary" type="button" data-ok>Подключить</button>');
    $("[data-x]").onclick = closeSheet;
    const clr = $("[data-clr]");
    if (clr) clr.onclick = () => { DB.clearCloudOverride(); location.reload(); };
    $("[data-ok]").onclick = () => {
      const url = $("#clUrl").value.trim(), key = $("#clKey").value.trim();
      const errBox = $("#clErr");
      if (!url || !key) { errBox.textContent = "Заполните оба поля"; return; }
      if (DB.keyRole(key) === "service_role") {
        errBox.textContent = "Это секретный ключ — он обходит защиту базы. Нужен публичный ключ (sb_publishable_… или anon).";
        return;
      }
      DB.setCloudOverride({ url, anonKey: key });
      location.reload();
    };
  }
  async function sheetCloudCheck() {
    openSheet("Проверка связи", UI.loading("Проверяем подключение…"),
      '<button class="btn btn-ghost" type="button" data-x>Закрыть</button>');
    $("[data-x]").onclick = closeSheet;
    let rows = [];
    try { rows = await DB.diagnose(); }
    catch (e) {
      UI.logError("диагностика", e);
      rows = [{ name: "Проверка", ok: false, detail: "не удалось завершить проверку", fix: "Обновите страницу и попробуйте снова." }];
    }
    const body = $("#sheetRoot .sheet-body");
    if (!body) return;
    const bad = rows.filter((r) => !r.ok).length;
    body.innerHTML = '<ul class="diag">' + rows.map((r) =>
      "<li class=\"" + (r.ok ? "ok" : "bad") + '">' + ic(r.ok ? "check" : "warn") +
      "<div><b>" + esc(r.name) + "</b>" + (r.detail ? "<span>" + esc(r.detail) + "</span>" : "") +
      (!r.ok && r.fix ? "<small>" + esc(r.fix) + "</small>" : "") + "</div></li>").join("") + "</ul>" +
      '<p class="hint">' + (bad ? "Пункты с предупреждением нужно исправить — под каждым написано, что сделать."
        : "Всё подключено: правки капитана приходят игрокам без перезагрузки.") + "</p>";
  }
  /* Экспорт/импорт копии команды. В выгрузку попадают только те таблицы,
     которые импорт умеет восстановить; чат и журнал остаются на устройстве. */
  const EXPORT_TABLES = ["players", "maps", "tactics", "materials", "templates"];

  function exportTeam() {
    const snap = { app: "cs2-team-playbook", v: 3, exportedAt: new Date().toISOString(), team: DB.team, data: {} };
    EXPORT_TABLES.forEach((t) => { snap.data[t] = clone(DB.cache[t] || []); });
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

  /** Заменить ссылки на игроков внутри блоков тактики (id после импорта новые). */
  function remapPlayerRefs(node, playerIds) {
    if (Array.isArray(node)) { node.forEach((x) => remapPlayerRefs(x, playerIds)); return; }
    if (!node || typeof node !== "object") return;
    ["playerId", "by"].forEach((k) => {
      if (node[k] && playerIds[node[k]]) node[k] = playerIds[node[k]];
    });
    Object.keys(node).forEach((k) => {
      if (k !== "playerId" && k !== "by") remapPlayerRefs(node[k], playerIds);
    });
  }

  async function applySnapshot(snap) {
    const teamId = DB.team.id;
    const byPos = (a, b) => (a.pos || 0) - (b.pos || 0);
    /* 1. очищаем содержимое */
    for (const table of EXPORT_TABLES) {
      for (const r of (DB.cache[table] || []).slice()) await DB.adapter.del(table, teamId, r.id, true);
    }
    /* 2. загружаем заново, запоминая новые id игроков и карт */
    const playerIds = {}, mapIds = {};
    for (const r of (snap.data.players || []).slice().sort(byPos)) {
      const copy = clone(r), old = copy.id;
      delete copy.id; delete copy.team_id;
      const row = await DB.adapter.save("players", teamId, copy);
      if (old) playerIds[old] = row.id;
    }
    for (const r of (snap.data.maps || []).slice().sort(byPos)) {
      const copy = clone(r), old = copy.id;
      delete copy.id; delete copy.team_id;
      const row = await DB.adapter.save("maps", teamId, copy);
      if (old) mapIds[old] = row.id;
    }
    for (const r of (snap.data.tactics || []).slice().sort(byPos)) {
      const copy = clone(r);
      delete copy.id; delete copy.team_id; delete copy.pos;
      if (copy.map_id) copy.map_id = mapIds[copy.map_id] || null;
      remapPlayerRefs(copy.blocks, playerIds);
      await DB.adapter.save("tactics", teamId, copy);
    }
    for (const r of (snap.data.materials || []).slice().sort(byPos)) {
      const copy = clone(r);
      delete copy.id; delete copy.team_id; delete copy.pos;
      if (copy.map_id) copy.map_id = mapIds[copy.map_id] || null;
      await DB.adapter.save("materials", teamId, copy);
    }
    for (const r of (snap.data.templates || []).slice().sort(byPos)) {
      const copy = clone(r);
      delete copy.id; delete copy.team_id; delete copy.pos;
      remapPlayerRefs(copy.blocks, playerIds);
      await DB.adapter.save("templates", teamId, copy);
    }
    /* 3. выбранный профиль тоже переезжает на новый id */
    const mine = DB.myPlayerId();
    DB.setMyPlayer(mine && playerIds[mine] ? playerIds[mine] : null);
    await DB.adapter.log(teamId, DB.actorName(), "загрузил плейбук из файла", null);
    await DB.refresh("*");
  }

  function importTeam(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let snap = null;
      try { snap = JSON.parse(reader.result); } catch (e) { snap = null; }
      if (!snap || snap.app !== "cs2-team-playbook" || !snap.data) {
        toast("Файл не похож на выгрузку плейбука", "err");
        return;
      }
      openModal("Заменить данные команды?",
        "<p>Текущие тактики, игроки, карты и материалы будут заменены данными из файла. Чат и журнал останутся.</p>", [
        { id: "no", label: "Отмена" },
        { id: "yes", label: "Заменить", danger: true, onClick: async () => {
          saveState("saving");
          try {
            await applySnapshot(snap);
            saveState("saved");
            render();
            go("#/overview");
            toast("Плейбук загружен", "ok");
          } catch (e) {
            saveState("");
            UI.logError("импорт плейбука", e);
            toast(UI.friendlyError(e, "Не удалось загрузить файл"), "err");
          }
        } },
      ]);
    };
    reader.onerror = () => toast("Не удалось прочитать файл", "err");
    reader.readAsText(file);
  }

  /* ============================================================
     Поиск
     ============================================================ */
  function openSearch() {
    closeMenus();
    const ov = document.createElement("div");
    ov.className = "searchov";
    ov.innerHTML = '<div class="searchbar">' + ic("search") +
      '<input id="gSearch" type="search" placeholder="Поиск: смок, Mirage, задача игрока…" autocomplete="off">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-x>Закрыть</button></div>' +
      '<div class="searchres" id="gRes"></div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.onclick = (e) => { if (e.target === ov) close(); };
    $("[data-x]", ov).onclick = close;
    const input = $("#gSearch", ov);
    const res = $("#gRes", ov);
    const run = () => {
      const list = DB.search(input.value);
      if (!list.length) {
        res.innerHTML = '<div class="empty slim">' + ic("search") + "<b>" +
          (input.value.trim().length < 2 ? "Введите минимум 2 символа" : "Ничего не найдено") + "</b></div>";
        return;
      }
      res.innerHTML = list.map((r) =>
        '<button class="srow" type="button" data-kind="' + attr(r.kind) + '" data-id="' + attr(r.id) + '">' +
        ic(r.kind === "player" ? "user" : r.kind === "map" ? "map" : r.kind === "material" ? "folder" : "target") +
        "<span><b>" + esc(r.title) + "</b><small>" + esc(r.sub || "") + "</small></span></button>").join("");
      $$(".srow", res).forEach((b) => {
        b.onclick = () => { close(); openRef(b.dataset.kind, b.dataset.id); };
      });
    };
    input.oninput = UI.debounce(run, 130);
    run();
    setTimeout(() => input.focus(), 40);
  }
  function openRef(kind, id) {
    if (kind === "tactic") go("#/tactic/" + id);
    else if (kind === "player") go("#/player/" + id);
    else if (kind === "map") go("#/tactics/" + id);
    else if (kind === "material") { const m = materialById(id); if (m) openMaterial(m); }
  }

  /* ============================================================
     События данных и запуск
     ============================================================ */
  function onDbEvent(evt) {
    if (!evt) return;
    if (evt.type === "status") {
      paintNet();
      if (evt.cloudError) toast("Облако недоступно — работаем локально", "warn");
      return;
    }
    if (evt.type === "team") { render(false); return; }
    if (evt.type === "data") {
      const table = evt.table === "*" ? "*" : evt.table;
      DB.refresh(table).then(() => {
        if (!DB.team) return;
        /* чат: обновляем только ленту, чтобы не терять ввод */
        if (table === "messages" && parseHash()[0] === "chat") {
          refreshChatList();
          return;
        }
        /* доска с несохранёнными правками: страницу не пересобираем */
        if ((table === "tactics" || table === "*") && S.board && S.board.isDirty()) {
          S.dirtyRemote = evt.origin === "remote";
          return;
        }
        /* На экране тактики при открытой шторке экран не пересобираем:
           пересоздание доски сбросило бы выбранный элемент. Дорисуем при закрытии. */
        if ((sheetOpen() || modalOpen()) && parseHash()[0] === "tactic") { S.needRender = true; return; }
        const y = window.scrollY;
        const onTactic = parseHash()[0] === "tactic";
        render();
        window.scrollTo(0, onTactic ? 0 : y);
        if (evt.origin === "remote" && !sheetOpen() && !modalOpen()) toast("Обновлено", "ok");
      }).catch((e) => UI.logError("обновление данных", e));
      return;
    }
  }

  function boot() {
    const search = $("#searchBtn");
    if (search) {
      search.innerHTML = ic("search");
      search.onclick = () => { if (DB.team) openSearch(); };
    }
    window.addEventListener("hashchange", route);
    window.addEventListener("pagehide", () => { flushBoard(); });
    window.addEventListener("beforeunload", (e) => {
      if (S.board && S.board.isDirty()) { e.preventDefault(); e.returnValue = ""; }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (S.board && S.board.isFull()) { S.board.toggleFull(); return; }
      closeMenus();
      if (modalOpen()) closeModal();
      else if (sheetOpen()) {
        closeSheet();
        if (S.dirtyRemote) { S.dirtyRemote = false; render(); }
      } else closeViewer();
      flushPendingRender();
    });
    window.addEventListener("resize", UI.debounce(() => {
      if (S.board && parseHash()[0] === "tactic") S.board.renderActions();
    }, 200));
    DB.on(onDbEvent);
    DB.draftGuard = () => !!(S.board && S.board.isDirty());
    DB.init().then(() => {
      S.booted = true;
      route();
    }).catch((e) => {
      UI.logError("запуск", e);
      view().innerHTML = '<section class="card"><div class="card-body">' +
        emptyState("warn", "Не удалось запустить приложение", "Обновите страницу. Если ошибка повторяется — проверьте подключение в настройках.",
          '<button class="btn btn-primary btn-sm" type="button" onclick="location.reload()">Обновить</button>') + "</div></section>";
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
