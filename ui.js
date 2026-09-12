/* ============================================================
   PBUI — единый слой интерфейса плейбука.
   Иконки, тосты, шторки, модальные окна, меню, просмотр фото и
   встроенный видеоплеер, понятные тексты ошибок.
   Один набор примитивов на всё приложение: одинаковые кнопки,
   радиусы, отступы и состояния на всех экранах.
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const attr = (v) => esc(v).replace(/`/g, "");
  const uid = (p) => (p || "x") + Math.random().toString(36).slice(2, 10);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const debounce = (fn, ms) => {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  };

  /* ---------- иконки: единый набор, stroke 1.7, 24×24 ---------- */
  const ICON = {
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/>',
    users: '<path d="M16 20v-1.6A3.4 3.4 0 0 0 12.6 15H6.4A3.4 3.4 0 0 0 3 18.4V20"/><circle cx="9.5" cy="8" r="3.4"/><path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3"/><path d="M15.5 4.7a3.4 3.4 0 0 1 0 6.6"/>',
    user: '<path d="M19 20v-1.8A3.2 3.2 0 0 0 15.8 15H8.2A3.2 3.2 0 0 0 5 18.2V20"/><circle cx="12" cy="8" r="3.6"/>',
    chat: '<path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    map: '<path d="M9 4.5 3.5 6.6v13L9 17.5l6 2 5.5-2.1v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M16.5 3.9a2.1 2.1 0 0 1 3 3L7.8 18.6 3.5 20l1.4-4.3z"/>',
    trash: '<path d="M4 7h16"/><path d="M18 7v12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5V7"/><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M10.5 11.5v5M13.5 11.5v5"/>',
    copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M6 15H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 3h8.5A1.5 1.5 0 0 1 15 4.5V6"/>',
    undo: '<path d="M4 8v5h5"/><path d="M4.5 13a8 8 0 1 1 2.3 5.3"/>',
    redo: '<path d="M20 8v5h-5"/><path d="M19.5 13a8 8 0 1 0-2.3 5.3"/>',
    save: '<path d="M19 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5h11L20.5 8v11a1.5 1.5 0 0 1-1.5 1.5z"/><path d="M16.5 20.5v-7h-9v7"/><path d="M7.5 3.5v5h7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6.5 9.4 17.1 4 11.7"/>',
    dots: '<circle cx="12" cy="5.2" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18.8" r="1.5"/>',
    chevron: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    back: '<path d="M19 12H5"/><path d="m11.5 18.5-6.5-6.5 6.5-6.5"/>',
    cursor: '<path d="m4.5 3.5 6.9 16.6 2.3-6.9 6.9-2.3z"/>',
    hand: '<path d="M8 12V5.8a1.4 1.4 0 0 1 2.8 0V11"/><path d="M10.8 10.6V4.9a1.4 1.4 0 0 1 2.8 0v5.7"/><path d="M13.6 10.9V6.4a1.4 1.4 0 0 1 2.8 0v7.9"/><path d="M16.4 11.4a1.4 1.4 0 0 1 2.8 0v3.2A6 6 0 0 1 13.2 21h-1a5 5 0 0 1-4-2l-2.4-3.4a1.4 1.4 0 0 1 2.1-1.8L8 15V12"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18h4a3.5 3.5 0 0 0 0-7h-1a3.5 3.5 0 0 1 0-7h4"/>',
    arrow: '<path d="M5 19 19 5"/><path d="M9.5 5H19v9.5"/>',
    line: '<path d="M5 19 19 5"/>',
    zone: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
    dot: '<circle cx="12" cy="12" r="3.4"/>',
    text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    eraser: '<path d="m8 20-4.4-4.4a1.8 1.8 0 0 1 0-2.5L13 3.7l7.3 7.3-9.4 9.4a1.8 1.8 0 0 1-1.3.6z"/><path d="M20.5 20H9"/>',
    grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="M11 8.2v5.6M8.2 11h5.6"/><path d="m20.5 20.5-4.2-4.2"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="M8.2 11h5.6"/><path d="m20.5 20.5-4.2-4.2"/>',
    fit: '<path d="M15 3.5h5.5V9"/><path d="M9 20.5H3.5V15"/><path d="M20.5 3.5 14 10"/><path d="M3.5 20.5 10 14"/>',
    expand: '<path d="M15 3.5h5.5V9"/><path d="M9 20.5H3.5V15"/><path d="M20.5 3.5 14 10"/><path d="M3.5 20.5 10 14"/>',
    smoke: '<path d="M17.4 19.2a4.4 4.4 0 0 0 .5-8.8A6.9 6.9 0 0 0 4.6 12.4 3.9 3.9 0 0 0 6.2 19.2z"/>',
    molly: '<path d="M12 21.5a7.5 7.5 0 0 0 7.5-7.5c0-3.3-1.9-6.1-3.8-8-.5 1.9-1.4 2.8-2.4 3.3C13.6 6 12.9 3.6 10 2.2c.5 2.8-.9 4.2-2.3 6.1-1.4 1.8-3.2 3.2-3.2 5.2A7.5 7.5 0 0 0 12 21.5z"/>',
    flash: '<path d="M13.2 2.5 4 13.8h7l-1 7.7 9.3-11.3h-7z"/>',
    he: '<circle cx="12" cy="13" r="5.5"/><path d="M12 3.2v3M9.6 4.4l1 2.4M14.4 4.4l-1 2.4"/>',
    bomb: '<circle cx="10.5" cy="14" r="6.4"/><path d="m15.4 9.1 2-2M18.6 4.4l.6 2.6M18.6 4.4l2.6.6"/>',
    enemy: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/><circle cx="12" cy="12" r="9"/>',
    flag: '<path d="M5 21V4.2c3.6-1.8 7.2 1.8 10.8 0v10.6c-3.6 1.8-7.2-1.8-10.8 0"/>',
    video: '<rect x="2.8" y="6" width="13" height="12" rx="2.2"/><path d="m21.2 8.6-5.4 3.4 5.4 3.4z"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.6 5.6 3.4-5.6 3.4z"/>',
    image: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.2"/><circle cx="9" cy="9" r="1.6"/><path d="m20.5 15.5-4.7-4.7L4.6 20.5"/>',
    link: '<path d="M10.2 13.4a4.2 4.2 0 0 0 6 .4l2.4-2.4a4.3 4.3 0 0 0-6-6l-1.4 1.3"/><path d="M13.8 10.6a4.2 4.2 0 0 0-6-.4l-2.4 2.4a4.3 4.3 0 0 0 6 6l1.4-1.4"/>',
    folder: '<path d="M3.8 6.4A1.9 1.9 0 0 1 5.7 4.5h3.4l2 2.4h7.2a1.9 1.9 0 0 1 1.9 1.9v8.3a1.9 1.9 0 0 1-1.9 1.9H5.7a1.9 1.9 0 0 1-1.9-1.9z"/>',
    tag: '<path d="M11.6 3.5H20v8.4l-8.9 8.9a1.6 1.6 0 0 1-2.3 0l-6.1-6.1a1.6 1.6 0 0 1 0-2.3z"/><circle cx="16.2" cy="7.8" r="1.4"/>',
    note: '<path d="M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h5.5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7v5.3l3.2 2"/>',
    megaphone: '<path d="M4 10.4v3.2a1 1 0 0 0 1 1h2.6L12 18.4V5.6L7.6 9.4H5a1 1 0 0 0-1 1z"/><path d="M15.6 9a4.3 4.3 0 0 1 0 6"/><path d="M18.2 6.6a7.8 7.8 0 0 1 0 10.8"/>',
    send: '<path d="m21.5 2.5-10 10"/><path d="M21.5 2.5 15 21.5l-3.6-8-8-3.6z"/>',
    warn: '<path d="M10.4 4.1 2.6 17.6A1.8 1.8 0 0 0 4.2 20.4h15.6a1.8 1.8 0 0 0 1.6-2.8L13.6 4.1a1.8 1.8 0 0 0-3.2 0z"/><path d="M12 9.4v4M12 16.8h.01"/>',
    info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11.2v5M12 8h.01"/>',
    logout: '<path d="M9.5 20.5H5.8a1.8 1.8 0 0 1-1.8-1.8V5.3a1.8 1.8 0 0 1 1.8-1.8h3.7"/><path d="m15.8 16.3 4.2-4.3-4.2-4.3"/><path d="M20 12H9.5"/>',
    upload: '<path d="M20.5 15.5v3.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8v-3.7"/><path d="m7.8 8.3 4.2-4.3 4.2 4.3"/><path d="M12 4v11.5"/>',
    download: '<path d="M20.5 15.5v3.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8v-3.7"/><path d="m7.8 11.7 4.2 4.3 4.2-4.3"/><path d="M12 16V4.5"/>',
    layers: '<path d="m12 3.2 8.8 4.6L12 12.4 3.2 7.8z"/><path d="m3.2 12.4 8.8 4.6 8.8-4.6"/>',
    dash: '<path d="M12 4v3.4M12 10.6v3.4M12 17.2v3.4"/>',
    both: '<path d="M7.5 8 3.5 12l4 4"/><path d="M16.5 8l4 4-4 4"/><path d="M3.5 12h17"/>',
    fan: '<circle cx="12" cy="12" r="2.2"/><path d="M5.5 5.5 9.6 9.6M18.5 5.5l-4.1 4.1M5.5 18.5l4.1-4.1M18.5 18.5l-4.1-4.1"/>',
    lock: '<rect x="4.8" y="10.5" width="14.4" height="10" rx="2"/><path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0v2.7"/>',
    shield: '<path d="M12 3.2 5 6v6c0 4.2 3 7.4 7 8.8 4-1.4 7-4.6 7-8.8V6z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
    refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.8 4.4v5h-5"/>',
    cloud: '<path d="M17.4 19.2a4.4 4.4 0 0 0 .5-8.8A6.9 6.9 0 0 0 4.6 12.4a3.9 3.9 0 0 0 1.6 6.8z"/>',
  };
  const ic = (name, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true">' +
    (ICON[name] || ICON.info) + "</svg>";

  /* ---------- даты ---------- */
  function fmtRel(ts) {
    if (!ts) return "";
    const s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
    if (s < 60) return "только что";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " мин назад";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " ч назад";
    const d = Math.floor(h / 24);
    if (d === 1) return "вчера";
    if (d < 7) return d + " дн назад";
    return new Date(Number(ts)).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }
  function fmtTime(ts) {
    if (!ts) return "";
    return new Date(Number(ts)).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  /* ---------- ошибки: пользователю — понятный текст, техника — в консоль ---------- */
  const FRIENDLY = {
    OFFLINE: "Нет соединения. Проверьте интернет и попробуйте ещё раз.",
    EMPTY: "Введите текст сообщения.",
    TOO_LONG: "Сообщение слишком длинное — до 500 знаков.",
    DENIED: "Недостаточно прав: это может сделать только капитан.",
    NO_TEAM: "Команда не найдена.",
    BAD_PIN: "Неверный PIN.",
    NAME_TAKEN: "Такое название уже занято.",
    BAD_INPUT: "Проверьте введённые данные.",
    TOO_BIG: "Файл слишком большой.",
  };
  function logError(where, e) {
    try { console.error("[playbook] " + where, e); } catch (err) {}
  }
  /** Текст для пользователя: без «Firebase», «TypeError» и прочей техники. */
  function friendlyError(e, fallback) {
    logError(fallback || "ошибка", e);
    const code = e && e.code;
    if (code && FRIENDLY[code]) return FRIENDLY[code];
    const msg = String((e && e.message) || "");
    if (/row-level security|RLS/i.test(msg)) return FRIENDLY.DENIED;
    if (/Failed to fetch|NetworkError|timeout|ECONN/i.test(msg)) return FRIENDLY.OFFLINE;
    if (/JSON|undefined is not|null is not|is not a function/i.test(msg)) return fallback || "Не удалось выполнить действие. Попробуйте ещё раз.";
    // Сообщения адаптера уже написаны по-русски и без техники — их можно показать.
    if (msg && /[а-яё]/i.test(msg) && msg.length < 90) return msg;
    return fallback || "Не удалось выполнить действие. Попробуйте ещё раз.";
  }

  /* ---------- тосты ---------- */
  const TOAST_ICON = { ok: "check", warn: "warn", err: "warn", info: "info" };
  function toast(msg, kind) {
    const root = $("#toastRoot");
    if (!root) return;
    const k = kind === "error" ? "err" : (kind || "info");
    const el = document.createElement("div");
    el.className = "toast toast-" + k;
    el.setAttribute("role", "status");
    el.innerHTML = ic(TOAST_ICON[k] || "info") + "<span>" + esc(msg) + "</span>";
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    const kill = () => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 220);
    };
    setTimeout(kill, k === "err" || k === "warn" ? 4200 : 2600);
    el.addEventListener("click", kill);
    while (root.children.length > 3) root.firstChild.remove();
  }

  /* ---------- индикатор сохранения ---------- */
  let saveTimer = null;
  function saveState(state) {
    const el = $("#saveState");
    if (!el) return;
    clearTimeout(saveTimer);
    el.className = "savestate";
    if (!state) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    if (state === "saving") { el.classList.add("is-saving"); el.textContent = "Сохраняем…"; }
    else if (state === "saved") {
      el.classList.add("is-ok"); el.textContent = "Сохранено";
      saveTimer = setTimeout(() => { el.hidden = true; }, 2200);
    } else if (state === "draft") { el.classList.add("is-draft"); el.textContent = "Не сохранено"; }
    else if (state === "offline") { el.classList.add("is-err"); el.textContent = "Нет соединения"; }
  }

  /* ---------- шторка (bottom sheet на телефоне, панель справа на десктопе) ---------- */
  let sheetCount = 0;
  function openSheet(title, bodyHTML, footHTML, opts) {
    opts = opts || {};
    closeMenus();
    const root = $("#sheetRoot");
    if (!root) return null;
    root.hidden = false;
    root.classList.toggle("sheet-wide", !!opts.wide);
    root.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + attr(title) + '">' +
      '<div class="sheet-grab" aria-hidden="true"></div>' +
      '<div class="sheet-head"><h2>' + esc(title) + "</h2>" +
      '<button class="ibtn" type="button" data-sheet-close title="Закрыть">' + ic("x") + "</button></div>" +
      '<div class="sheet-body">' + bodyHTML + "</div>" +
      (footHTML ? '<div class="sheet-foot">' + footHTML + "</div>" : "") +
      "</div>";
    sheetCount++;
    root.onclick = (e) => { if (e.target === root) closeSheet(); };
    $("[data-sheet-close]", root).onclick = closeSheet;
    const focusable = $('input, select, textarea, button.btn-primary', $(".sheet-body", root));
    if (focusable && opts.autofocus !== false) {
      setTimeout(() => { try { focusable.focus(); } catch (e) {} }, 60);
    }
    return root;
  }
  function closeSheet() {
    const root = $("#sheetRoot");
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
    root.classList.remove("sheet-wide");
    sheetCount = Math.max(0, sheetCount - 1);
  }
  const sheetOpen = () => !!($("#sheetRoot") && !$("#sheetRoot").hidden);

  /* ---------- модальное окно ---------- */
  function openModal(title, textHTML, buttons) {
    const root = $("#modalRoot");
    if (!root) return;
    const list = buttons && buttons.length ? buttons : [{ id: "ok", label: "Закрыть", primary: true }];
    root.innerHTML =
      '<div class="modal" role="alertdialog" aria-modal="true" aria-label="' + attr(title) + '">' +
      "<h2>" + esc(title) + "</h2>" +
      (textHTML ? '<div class="modal-text">' + textHTML + "</div>" : "") +
      '<div class="modal-actions">' + list.map((b) =>
        '<button class="btn ' + (b.primary ? "btn-primary" : b.danger ? "btn-danger" : "btn-ghost") +
        '" type="button" data-mbtn="' + attr(b.id) + '">' + esc(b.label) + "</button>").join("") +
      "</div></div>";
    root.hidden = false;
    root.onclick = (e) => { if (e.target === root) closeModal(); };
    $$("[data-mbtn]", root).forEach((btn) => {
      btn.onclick = () => {
        const b = list.find((x) => x.id === btn.dataset.mbtn);
        closeModal();
        if (b && b.onClick) b.onClick();
      };
    });
  }
  function closeModal() {
    const root = $("#modalRoot");
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
  }
  const modalOpen = () => !!($("#modalRoot") && !$("#modalRoot").hidden);

  /** Подтверждение удаления — единый текст на всё приложение. */
  function confirmDlg(title, description, onYes, yesLabel) {
    openModal(title, "<p>" + esc(description || "Действие нельзя отменить.") + "</p>", [
      { id: "no", label: "Отмена" },
      { id: "yes", label: yesLabel || "Удалить", danger: true, onClick: onYes },
    ]);
  }

  /* ---------- всплывающее меню ---------- */
  function closeMenus() {
    $$(".menu").forEach((m) => m.remove());
    document.removeEventListener("click", closeMenus);
    document.removeEventListener("scroll", closeMenus, true);
  }
  function openMenu(anchor, items) {
    closeMenus();
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    items.forEach((it) => {
      if (it.sep) { menu.insertAdjacentHTML("beforeend", '<div class="menu-sep"></div>'); return; }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item" + (it.danger ? " danger" : "");
      b.setAttribute("role", "menuitem");
      b.innerHTML = (it.icon ? ic(it.icon) : "") + "<span>" + esc(it.label) + "</span>";
      b.onclick = (e) => { e.stopPropagation(); closeMenus(); if (it.onClick) it.onClick(); };
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { top: 0, bottom: 0, left: 0, right: 0 };
    const mw = 236;
    const mh = Math.min(window.innerHeight - 16, items.length * 40 + 16);
    let x = clamp(r.right - mw, 8, Math.max(8, window.innerWidth - mw - 8));
    let y = r.bottom + 6;
    if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    setTimeout(() => {
      document.addEventListener("click", closeMenus);
      document.addEventListener("scroll", closeMenus, true);
    }, 0);
  }
  const menuOpen = () => !!document.querySelector(".menu");

  /* ---------- просмотр изображений ---------- */
  function openViewer(src, caption) {
    const root = $("#viewerRoot");
    if (!root) return;
    root.innerHTML = '<button class="ibtn viewer-close" type="button" data-vclose title="Закрыть">' + ic("x") + "</button>" +
      '<figure class="viewer-fig"><img class="viewer-img" src="' + attr(src) + '" alt="' + attr(caption || "") + '">' +
      (caption ? "<figcaption>" + esc(caption) + "</figcaption>" : "") + "</figure>";
    root.hidden = false;
    root.onclick = (e) => { if (e.target !== $(".viewer-img", root)) closeViewer(); };
    $("[data-vclose]", root).onclick = (e) => { e.stopPropagation(); closeViewer(); };
  }
  function closeViewer() {
    const root = $("#viewerRoot");
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
  }
  const viewerOpen = () => !!($("#viewerRoot") && !$("#viewerRoot").hidden);

  /* ---------- видео: распознаём ссылку и показываем плеер внутри сайта ---------- */
  const YT_PATTERNS = [
    /(?:youtube\.com\/watch\?(?:[^#]*&)?v=)([A-Za-z0-9_-]{11})/i,
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/i,
  ];
  function parseVideoUrl(raw) {
    const url = String(raw || "").trim();
    if (!url) return null;
    for (let i = 0; i < YT_PATTERNS.length; i++) {
      const m = url.match(YT_PATTERNS[i]);
      if (m) {
        return {
          provider: "youtube", id: m[1], url,
          embed: "https://www.youtube-nocookie.com/embed/" + m[1] + "?rel=0&modestbranding=1&playsinline=1",
          thumb: "https://i.ytimg.com/vi/" + m[1] + "/hqdefault.jpg",
          inline: true,
        };
      }
    }
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vm) return { provider: "vimeo", id: vm[1], url, embed: "https://player.vimeo.com/video/" + vm[1], inline: true };
    if (/^(https?:)?\/\/.+\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(url) || /^data:video\//i.test(url)) {
      return { provider: "file", url, src: url, inline: true };
    }
    if (/^https?:\/\//i.test(url)) return { provider: "link", url, inline: false };
    return null;
  }
  /** Встроенный плеер: YouTube/Vimeo — iframe, файл — <video>, иначе ссылка наружу. */
  function openVideo(video) {
    const root = $("#viewerRoot");
    if (!root) return;
    const v = parseVideoUrl(video && video.url);
    if (!v) { toast("Не удалось распознать ссылку на видео", "warn"); return; }
    let player;
    if (v.provider === "file") {
      player = '<video class="viewer-video" src="' + attr(v.src) + '" controls playsinline preload="metadata"></video>';
    } else if (v.inline) {
      player = '<iframe class="viewer-frame" src="' + attr(v.embed) + '" title="' + attr(video.title || "Видео") +
        '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
    } else {
      player = '<div class="viewer-noplay">' + ic("link") + "<p>Источник не поддерживает встраивание.</p>" +
        '<a class="btn btn-primary" href="' + attr(v.url) + '" target="_blank" rel="noopener">Открыть видео</a></div>';
    }
    root.innerHTML = '<button class="ibtn viewer-close" type="button" data-vclose title="Закрыть">' + ic("x") + "</button>" +
      '<figure class="viewer-fig viewer-video-fig">' + player +
      (video.title ? "<figcaption>" + esc(video.title) + "</figcaption>" : "") + "</figure>";
    root.hidden = false;
    root.onclick = (e) => { if (e.target === root) closeViewer(); };
    $("[data-vclose]", root).onclick = (e) => { e.stopPropagation(); closeViewer(); };
  }

  /* ---------- мелкие кирпичики разметки ---------- */
  const field = (label, inner, hint) =>
    '<label class="field"><span class="field-label">' + esc(label) + "</span>" + inner +
    (hint ? '<small class="field-hint">' + esc(hint) + "</small>" : "") + "</label>";
  function emptyState(icon, title, hint, actionHTML) {
    return '<div class="empty">' + ic(icon || "info") + "<b>" + esc(title) + "</b>" +
      (hint ? "<span>" + esc(hint) + "</span>" : "") + (actionHTML || "") + "</div>";
  }
  const loading = (label) => '<div class="loading" role="status"><span class="spinner"></span>' + esc(label || "Загрузка…") + "</div>";

  const api = {
    $, $$, esc, attr, uid, clone, clamp, debounce,
    ICON, ic,
    fmtRel, fmtTime,
    logError, friendlyError,
    toast, saveState,
    openSheet, closeSheet, sheetOpen,
    openModal, closeModal, modalOpen, confirmDlg,
    openMenu, closeMenus, menuOpen,
    openViewer, closeViewer, viewerOpen,
    parseVideoUrl, openVideo,
    field, emptyState, loading,
  };
  if (typeof window !== "undefined") window.PBUI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
