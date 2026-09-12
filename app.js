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

  /* ---------- иконки: строгие SVG вместо смайликов ---------- */
  const ICON = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
    target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1.5 14h5M9.5 8h5M17.5 16h5"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    star: '<path d="m12 3 2.7 5.6 6.2.9-4.5 4.3 1.1 6.2-5.5-2.9-5.5 2.9 1.1-6.2L3.1 9.5l6.2-.9L12 3z"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
    expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    collapse: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
    gridlines: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    dash: '<path d="M12 4v3.5M12 10.5V14M12 17v3.5"/>',
    bothends: '<path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h18"/>',
    tag: '<path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.6"/>',
    flag: '<path d="M4 22V4c4-2 8 2 12 0v12c-4 2-8-2-12 0"/>',
    fan: '<circle cx="12" cy="12" r="2.2"/><path d="M5 5l4.2 4.2M19 5l-4.2 4.2M5 19l4.2-4.2M19 19l-4.2-4.2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    send: '<path d="m22 2-11 11"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
    mega: '<path d="M3 10v4a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/>',
    smoke: '<path d="M17.5 19a4.5 4.5 0 0 0 .4-9A7 7 0 0 0 4.3 12.5 4 4 0 0 0 6 19h11.5z"/>',
    molly: '<path d="M12 22c4.4 0 8-3.6 8-8 0-3.5-2-6.5-4-8.5-.5 2-1.5 3-2.5 3.5C13.8 6 13 3.5 10 2c.5 3-1 4.5-2.5 6.5C6 10.5 4 12 4 14c0 4.4 3.6 8 8 8z"/>',
    flash: '<path d="M13 2 3 14h8l-1 8 11-14h-8l0-6z"/>',
    he: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/>',
    decoy: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
    bomb: '<circle cx="10.5" cy="13.5" r="6.5"/><path d="m15 9 2.2-2.2M18.6 5.4 17 3.8M18.6 5.4 20.2 7"/>',
    cursor: '<path d="m3 3 7.5 18 2.5-7.5L20.5 11 3 3z"/>',
    arrow: '<path d="M5 19 19 5"/><path d="M9 5h10v10"/>',
    line: '<path d="M5 19 19 5"/>',
    zone: '<circle cx="12" cy="12" r="8"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    text: '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    eraser: '<path d="m7 21-4.6-4.6a2 2 0 0 1 0-2.8L13 3l8 8-10.6 10.6a2 2 0 0 1-1.4.4H7z"/><path d="M22 21H7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    warn: '<path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    dots: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    crown: '<path d="m3 8 4 4 5-6 5 6 4-4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  };
  const ic = (name, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[name] || ICON.dots) + "</svg>";
  /** Мини-глиф гранаты для SVG-схемы (серьёзный значок вместо эмодзи). */
  function nadeGlyph(kind, color) {
    const d = ICON[kind] || ICON.bomb;
    return '<g transform="scale(0.30) translate(-12,-12)" fill="none" stroke="' + color + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + "</g>";
  }
  /* Стаagger-появления блоков: revSeq сбрасывается в render(). */
  let revSeq = 0;
  const rcls = (base) => base + ' rev" style="--i:' + (revSeq++ % 10);
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
    boardWidth: 2,
    boardDash: false,
    boardHead: "end",
    boardNade: "smoke",
    boardGrid: false,
    boardBig: null,
    boardHist: {},
    boardWait: null,
    boardFrom: null,
    boardBusy: false,
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
    el.classList.remove("ok", "draft");
    if (state === "saving") { el.textContent = "Сохраняем…"; }
    else if (state === "saved") {
      el.classList.add("ok"); el.textContent = "Сохранено";
      saveTimer = setTimeout(() => { el.hidden = true; }, 2000);
    } else if (state === "draft") {
      el.classList.add("draft"); el.textContent = "Не сохранено";
    } else if (state === "offline") {
      el.textContent = "Нет соединения";
    }
  }

  /* ---------- экран входа: живое фото фоном ---------- */
  const AUTH_BG_KEY = "cs2pb.authbg.v1";
  /* Постер команды «Кабаны» — основной фон: на входе и размытым на рабочих страницах. */
  const AUTH_BG_DEFAULT = "assets/kabany-hero.jpg";
  const AUTH_BG_PREVIEW = "assets/kabany-hero.small.jpg";
  /* localStorage — через window: в тестах (jsdom) голое имя недоступно. */
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = (k) => { try { window.localStorage.removeItem(k); } catch (e) {} };
  function readAuthBg() {
    try {
      const v = JSON.parse(lsGet(AUTH_BG_KEY) || "null");
      return v && typeof v === "object" ? v : null;
    } catch (e) { return null; }
  }
  function authBgState() {
    const st = readAuthBg() || {};
    return {
      src: st.src || AUTH_BG_DEFAULT,
      preview: st.src ? st.src : AUTH_BG_PREVIEW,
      blur: st.blur == null ? 3 : Math.max(0, Math.min(24, +st.blur || 0)),
      dim: st.dim == null ? 46 : Math.max(0, Math.min(92, +st.dim || 0)),
      custom: !!st.src,
      teamKey: st.teamKey || "",
    };
  }
  function writeAuthBg(patch) {
    const cur = readAuthBg() || {};
    const next = Object.assign({}, cur, patch || {});
    const ok = lsSet(AUTH_BG_KEY, JSON.stringify(next));
    applyAuthScene();
    return ok;
  }
  function resetAuthBg() {
    lsDel(AUTH_BG_KEY);
    applyAuthScene();
  }
  function applyAuthScene() {
    const scene = $("#authScene");
    if (!scene) return;
    const st = authBgState();
    const img = $("#authSceneImg");
    if (img) img.style.backgroundImage = 'url("' + st.src + '")';
    const pre = $("#authScenePre");
    if (pre) pre.style.backgroundImage = 'url("' + st.preview + '")';
    scene.classList.toggle("isdefault", !st.custom);
    document.documentElement.style.setProperty("--auth-blur", st.blur + "px");
    document.documentElement.style.setProperty("--auth-dim", (st.dim / 100).toFixed(2));
  }
  /** Лёгкое движение фона за пальцем/курсором — то самое «чуть-чуть оживить». */
  function bindAuthSceneFx() {
    const scene = $("#authScene");
    if (!scene || !window.requestAnimationFrame || scene.dataset.fx) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce && reduce.matches) return;   // человеку без анимаций — человеку без параллакса
    scene.dataset.fx = "1";
    const par = $("#authScenePar");
    let tx = 0, ty = 0, cur = { x: 0, y: 0 }, raf = 0;
    const tick = () => {
      raf = 0;
      cur.x += (tx - cur.x) * 0.12;
      cur.y += (ty - cur.y) * 0.12;
      if (par) {
        par.style.transform = "translate3d(" + cur.x.toFixed(2) + "px," + cur.y.toFixed(2) + "px,0)";
        par.style.setProperty("--tilt", (cur.x / 26).toFixed(3) + "deg");
      }
      if (Math.abs(tx - cur.x) > 0.2 || Math.abs(ty - cur.y) > 0.2) { raf = requestAnimationFrame(tick); }
    };
    const onMove = (e) => {
      if (!document.body.classList.contains("auth-mode")) return;
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      tx = ((e.clientX / w) - 0.5) * 18;
      ty = ((e.clientY / h) - 0.5) * 14;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("deviceorientation", (e) => {
      if (!document.body.classList.contains("auth-mode") || e.gamma == null) return;
      tx = Math.max(-16, Math.min(16, (e.gamma || 0) * 0.6));
      ty = Math.max(-12, Math.min(12, ((e.beta || 0) - 45) * 0.35));
      if (!raf) raf = requestAnimationFrame(tick);
    });
    window.addEventListener("resize", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  }

  /* --- уменьшение картинки, чтобы в localStorage и в облако влезало --- */
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  }
  function shrinkDataUrl(src, maxW, quality) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      setTimeout(() => finish(src), 4000);
      const img = document.createElement("img");
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0;
          if (!w || !h) return finish(src);
          const k = Math.min(1, maxW / w);
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(w * k));
          cv.height = Math.max(1, Math.round(h * k));
          const ctx = cv.getContext && cv.getContext("2d");
          if (!ctx || !cv.toDataURL) return finish(src);
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          const out = cv.toDataURL("image/jpeg", quality);
          finish(out && out.length && out.length < src.length ? out : src);
        } catch (e) { finish(src); }
      };
      img.onerror = () => finish(src);
      img.src = src;
    });
  }
  /** Открыть системный выбор файла и поставить картинку фоном входа. */
  function pickAuthBg(opts) {
    const o = opts || {};
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) { toast("Файл больше 12 МБ — возьмите полегче", "warn"); return; }
      saveState("saving");
      try {
        const raw = await fileToDataUrl(f);
        const small = await shrinkDataUrl(raw, o.maxW || 1600, o.quality || 0.72);
        if (o.onUrl) { await o.onUrl(small); return; }
        const ok = writeAuthBg({ src: small, teamKey: "" });
        applyAuthScene();
        saveState("");
        toast(ok ? "Фото на входе обновлено" : "Сохранено, но память устройства переполнена — возьмите файл меньше", ok ? "ok" : "warn");
      } catch (e) {
        saveState("");
        toast((e && e.message) || "Не удалось обработать фото", "warn");
      }
    };
    inp.click();
  }

  /* --- общий фон команды (лежит в settings, синхронизируется как всё остальное) --- */
  function teamAuthBg() {
    const st = DB.team && DB.team.settings;
    return st && st.authBg && st.authBg.src ? st.authBg : null;
  }
  function syncAuthBgFromTeam() {
    const tb = teamAuthBg();
    if (!tb) return;
    const cur = readAuthBg();
    if (cur && cur.teamKey && cur.teamKey === tb.key) return;
    writeAuthBg({ src: tb.src, blur: tb.blur, dim: tb.dim, teamKey: tb.key });
  }
  async function pushAuthBgToTeam(bg) {
    if (!isCap()) { toast("Только капитан может менять фон для всех", "warn"); return false; }
    const st = authBgState();
    const payload = {
      src: bg.src || st.src,
      blur: bg.blur != null ? bg.blur : st.blur,
      dim: bg.dim != null ? bg.dim : st.dim,
      key: uid("bg"),
    };
    saveState("saving");
    try {
      const small = await shrinkDataUrl(payload.src, 1200, 0.66);
      payload.src = small;
      DB.team = await DB.adapter.updateTeam(DB.team.id, { settings: { authBg: payload } });
      DB.persistSession();
      await DB.log("обновил фото на входе команды", null);
      writeAuthBg({ src: payload.src, blur: payload.blur, dim: payload.dim, teamKey: payload.key });
      saveState("saved");
      toast("Фото отправлено всей команде", "ok");
      return true;
    } catch (e) {
      saveState("");
      toast((e && e.message) || "Не сохранилось в облако", "warn");
      return false;
    }
  }

  /** Шторка настроек фона входа — доступна и до входа в команду. */
  function sheetAuthBg() {
    const st = authBgState();
    openSheet("Фото на входе",
      '<div class="bgprev"><img src="' + esc(st.src) + '" alt="Фон входа"></div>' +
      '<label class="field"><span>Размытие фона · <b id="abBlurV">' + st.blur + "</b> px</span>" +
      '<input id="abBlur" type="range" min="0" max="24" step="1" value="' + st.blur + '"></label>' +
      '<label class="field"><span>Затемнение · <b id="abDimV">' + st.dim + "</b>%</span>" +
      '<input id="abDim" type="range" min="0" max="92" step="1" value="' + st.dim + '"></label>' +
      '<p class="muted tiny">Фото — главное на экране входа: форма стоит поверх него в затемнённом стекле. ' +
      "На телефоне фон чуть смещается вместе с наклоном, на компьютере — за курсором.</p>" +
      '<div class="btnrow"><button class="btn ghost tiny" data-abpick type="button">Выбрать своё фото…</button>' +
      '<button class="btn ghost tiny" data-abdef type="button">Стандартное</button></div>' +
      (DB.team ? '<p class="muted tiny">' + (teamAuthBg() ? "Сейчас используется общее фото команды." : "Общего фото команды нет — фон только на этом устройстве.") + "</p>" : ""),
      '<button class="btn ghost" data-x type="button">Закрыть</button>' +
      (DB.team && isCap() ? '<button class="btn" data-abteam type="button">Сохранить для всей команды</button>' : ""));
    $("[data-x]", $("#sheetRoot")).onclick = closeSheet;
    const blur = $("#abBlur"), dim = $("#abDim");
    const live = () => {
      writeAuthBg({ blur: +blur.value, dim: +dim.value });
      $("#abBlurV").textContent = blur.value;
      $("#abDimV").textContent = dim.value;
    };
    if (blur) blur.oninput = live;
    if (dim) dim.oninput = live;
    $("[data-abpick]", $("#sheetRoot")).onclick = () => {
      pickAuthBg({
        onUrl: async (url) => {
          const cur = authBgState();
          const ok = writeAuthBg({ src: url, blur: cur.blur, dim: cur.dim, teamKey: "" });
          closeSheet();
          sheetAuthBg();
          toast(ok ? "Фото поставлено на этот экран" : "Фото поставлено, но в память не влезло — возьмите файл меньше", ok ? "ok" : "warn");
        },
      });
    };
    $("[data-abdef]", $("#sheetRoot")).onclick = () => { resetAuthBg(); closeSheet(); sheetAuthBg(); toast("Вернул стандартное фото", "ok"); };
    const teamBtn = $("[data-abteam]", $("#sheetRoot"));
    if (teamBtn) teamBtn.onclick = async () => {
      const ok = await pushAuthBgToTeam({});
      if (ok) { closeSheet(); render(); }
    };
  }
  /* ---------- /экран входа: фон ---------- */

  /* ---------- sheet (bottom sheet / dialog) ---------- */
  function openSheet(title, bodyHTML, footHTML) {
    closeMenus();
    S.sheetOpen = true;
    const root = $("#sheetRoot");
    root.innerHTML = '<div class="sheet" role="dialog"><div class="sheet-head"><h3>' + esc(title) +
      '</h3><button class="iconbtn" data-close type="button" title="Закрыть">' + ic("x") + '</button></div><div class="sheet-body">' +
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
    root.innerHTML = '<button class="iconbtn viewer-x" type="button" title="Закрыть">' + ic("x") + '</button><div><img class="viewer-img" src="' +
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
    await flushDrafts(); // черновики схемы не должны перезатереться общим сохранением
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
    { id: "overview", label: "Обзор", hash: "#/overview", icon: "grid" },
    { id: "maps", label: "Карты", hash: "#/maps", icon: "map" },
    { id: "tactics", label: "Тактики", hash: "#/tactics", icon: "target" },
    { id: "chat", label: "Чат", hash: "#/chat", icon: "chat" },
    { id: "players", label: "Игроки", hash: "#/players", icon: "users" },
    { id: "materials", label: "Материалы", hash: "#/materials", icon: "folder" },
    { id: "me", label: "Мой профиль", hash: "#/me", icon: "user" },
  ];
  const BOTTOM_NAV = ["overview", "maps", "tactics", "chat", "players"];

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
    document.body.classList.toggle("auth-mode", !logged);
    if (!logged) applyAuthScene();
    $("#topbar").hidden = !logged;
    $("#sidebar").hidden = !logged;
    $("#bottomNav").hidden = !logged;
    document.body.classList.toggle("captain", logged && isCap());
    document.body.classList.toggle("board-full", !!S.boardBig);
    if (!logged) return;
    $("#brandTeam").textContent = DB.team.name;
    const badge = $("#roleBadge");
    badge.textContent = isCap() ? "Капитан" : "Игрок";
    badge.classList.toggle("cap", isCap());
    paintNet();
    const sb = $("#searchBtn");
    if (sb && !sb.dataset.icon) { sb.innerHTML = ic("search"); sb.dataset.icon = "1"; }
    const bg = $("#appBg");
    if (bg) {
      const want = 'url("' + authBgState().src + '")';
      if (bg.style.backgroundImage !== want) bg.style.backgroundImage = want;
    }
    const cur = currentNavId();
    $("#sideNav").innerHTML = NAV.map((n) =>
      '<a class="snlink' + (cur === n.id ? " on" : "") + '" href="' + n.hash + '">' + ic(n.icon) + "<span>" + esc(n.label) + "</span></a>"
    ).join("") + '<a class="snlink' + (cur === "manage" ? " on" : "") + '" href="#/manage">' + ic("settings") + "<span>Управление</span></a>";
    $("#sideFoot").innerHTML = esc(DB.mode() === "cloud" ? "Облако: синхронизация включена" : "Локальный режим: облако не подключено") +
      '<br><a href="#/manage" style="color:var(--muted)">Открыть настройки</a>';
    $("#bottomNav").innerHTML = BOTTOM_NAV.map((id) => {
      const n = NAV.find((x) => x.id === id);
      return '<a class="bnbtn' + (cur === id ? " on" : "") + '" href="' + n.hash + '">' + ic(n.icon) + "<span>" + esc(n.label) + "</span></a>";
    }).join("") + '<button class="bnbtn' + ((cur === "materials" || cur === "me" || cur === "manage") ? " on" : "") + '" data-more type="button">' + ic("dots") + "<span>Ещё</span></button>";
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
      rowHTML("#/materials", "Материалы", DB.cache.materials.length + " шт.", "folder") +
      rowHTML("#/me", "Мой профиль", myName() || "Выбрать себя", "user") +
      rowHTML("#/manage", "Управление", isCap() ? "Панель капитана" : "Вход для капитана", "settings") +
      "</div></div>" +
      '<div class="btnrow"><button class="btn ghost block" data-logout type="button">' + ic("logout") + " Выйти из команды</button></div>", "");
    $$("[data-goto]").forEach((a) => { a.onclick = closeSheet; });
    $("[data-logout]").onclick = () => { closeSheet(); doLogout(); };
  }
  function rowHTML(hash, title, sub, icon) {
    return '<a class="row" data-goto href="' + hash + '">' +
      (icon ? '<span class="matic">' + ic(icon) + "</span>" : "") +
      '<span class="row-main"><b>' + esc(title) + "</b>" +
      (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span class="row-arrow">' + ic("chevron") + "</span></a>";
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
        esc(r.title) + "</b><small>" + esc(r.sub || "") + "</small></span><span class=\"row-arrow\">" + ic("chevron") + "</span></button>"
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
    S.boardFrom = null;
    S.boardWait = null;
    flushDrafts(); // несохранённая схема уезжает в базу до смены экрана
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
    revSeq = 0;
    paintShell();
    if (id === "overview" || id === "") viewOverview();
    else if (id === "maps") viewMaps();
    else if (id === "map") viewMap(p[1]);
    else if (id === "tactics") viewTactics(p[1]);
    else if (id === "tactic") viewTactic(p[1]);
    else if (id === "chat") viewChat();
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
  const LAST_TEAM_KEY = "cs2pb.lastTeam";
  function lastTeamName() {
    return lsGet(LAST_TEAM_KEY) || "";
  }
  function rememberTeamName(name) {
    try {
      const v = String(name || "").trim().slice(0, 40);
      if (v) lsSet(LAST_TEAM_KEY, v);
    } catch (e) {}
  }
  function authHeadHTML() {
    return '<div class="authhead"><span class="authmark">CS2</span><span class="authhead-txt">' +
      "<b>TEAM PLAYBOOK</b><small>Тактики, роли, раскидки — один вход на всю команду</small></span></div>";
  }
  function authFootHTML() {
    return '<div class="authfoot"><button class="linklike" data-authbgbtn type="button">' + ic("image") + ' Фото на входе</button></div>';
  }
  function wireAuthFoot() {
    const btn = $("[data-authbgbtn]");
    if (btn) btn.onclick = (e) => { e.preventDefault(); sheetAuthBg(); };
  }
  function viewLogin() {
    const view = $("#view");
    const last = lastTeamName();
    view.innerHTML =
      '<div class="authwrap">' + authHeadHTML() +
      '<div class="authcard"><p class="autheye">CS2 TEAM PLAYBOOK</p><h1>Вход команды</h1>' +
      '<p class="sub">Название команды и PIN — больше ничего не нужно.</p>' +
      '<div class="authtabs"><button class="authtab' + (authMode === "player" ? " on" : "") + '" data-m="player" type="button">Игрок</button>' +
      '<button class="authtab' + (authMode === "captain" ? " on" : "") + '" data-m="captain" type="button">Капитан</button></div>' +
      '<form id="loginForm"><label class="field"><span>Название команды</span>' +
      '<input id="liName" maxlength="40" autocomplete="off" placeholder="Например, БРАТЫ" value="' + esc(last) + '" required></label>' +
      '<label class="field"><span>' + (authMode === "player" ? "PIN команды" : "PIN капитана") + "</span>" +
      '<input id="liPin" type="password" inputmode="numeric" maxlength="32" autocomplete="off" placeholder="••••••" required></label>' +
      '<div class="form-error" id="liErr"></div>' +
      '<div class="btnrow"><button class="btn block" type="submit">Войти</button></div></form>' +
      '<div class="authlinks"><button class="linklike" id="goCreate" type="button">Нет команды? Создать команду</button></div>' +
      (last ? '<div class="authquick"><span class="muted tiny">Вход с этого устройства:</span> ' +
        '<button class="chip mini" id="authQuick" type="button">' + esc(last) + "</button></div>" : "") +
      "</div>" + authFootHTML() + "</div>";
    $$(".authtab").forEach((b) => { b.onclick = () => { authMode = b.dataset.m; viewLogin(); }; });
    $("#goCreate").onclick = () => go("#/create");
    const quick = $("#authQuick");
    if (quick) quick.onclick = () => { const i = $("#liName"); i.value = last; i.focus(); $("#liPin").focus(); };
    wireAuthFoot();
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
        rememberTeamName(name);
        afterEnter();
      } catch (err) {
        errBox.textContent = (err && err.code === "ASK_TEAM_PIN")
          ? "С нового устройства сначала войдите как игрок (PIN команды), затем введите PIN капитана"
          : ((err && err.message) || "Не получилось войти");
      }
    };
    setTimeout(() => {
      const i = last ? $("#liPin") : $("#liName");
      if (i) i.focus();
    }, 50);
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
    syncAuthBgFromTeam();
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
      '<div class="authwrap">' + authHeadHTML() +
      '<div class="authcard"><p class="autheye">CS2 TEAM PLAYBOOK</p><h1>Новая команда</h1>' +
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
      "</div>" + authFootHTML() + "</div>";
    $("#goLogin").onclick = () => go("#/login");
    wireAuthFoot();
    $("#crForm").onsubmit = async (e) => {
      e.preventDefault();
      const errBox = $("#crErr");
      errBox.textContent = "";
      const pin = $("#crPin").value, capPin = $("#crCapPin").value;
      if (pin === capPin) { errBox.textContent = "PIN команды и PIN капитана должны различаться"; return; }
      // Имена читаем до await: DB.createTeam перерисовывает экран, и полей уже не будет.
      const teamName = $("#crName").value, capName = $("#crCap").value;
      try {
        await DB.createTeam(
          { name: teamName, pin, captain: capName, captainPin: capPin },
          (teamId) => Seed.seedTeam(teamId)
        );
        rememberTeamName(teamName);
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

    let html = '<div class="' + rcls("pagehead") + '"><div><h1>' + esc(DB.team.name) + "</h1>" +
      '<p class="sub">' + (me ? "Привет, " + esc(me.name) : "Обзор команды") + "</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-newtactic type="button">' + ic("plus") + " Тактика</button></div>" : "") + "</div>";

    html += '<div class="' + rcls("statchips") + '">' +
      '<a class="statchip" href="#/players">' + ic("users") + "<b>" + DB.cache.players.length + "</b> игроков</a>" +
      '<a class="statchip" href="#/maps">' + ic("map") + "<b>" + DB.cache.maps.length + "</b> карт</a>" +
      '<a class="statchip" href="#/tactics">' + ic("target") + "<b>" + DB.cache.tactics.length + "</b> тактик</a>" +
      '<a class="statchip" href="#/chat">' + ic("chat") + "Чат команды</a>" +
      "</div>";

    html += '<div class="ovgrid two">';
    // Состав
    html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("users") + 'Состав</h2><button class="more" data-go="#/players" type="button">' + ic("chevron") + ' Все</button></div><div class="rosterchips">';
    if (!DB.cache.players.length) html += '<div class="empty">Пока пусто.</div>';
    DB.cache.players.forEach((p) => {
      html += '<a class="rchip" style="--pc:' + esc(p.color || "#e8a72f") + '" href="#/player/' + p.id + '">' + esc(p.name) +
        (p.role ? " <small>" + esc(p.role) + "</small>" : "") + (me && me.id === p.id ? " <small>· вы</small>" : "") + "</a>";
    });
    html += "</div></div>";

    // Мой профиль / выбор себя
    if (me) {
      const inv = involvement(me.id);
      html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("user") + 'Твой профиль</h2><button class="more" data-go="#/me" type="button">' + ic("chevron") + ' Открыть</button></div><div class="sec-pad">' +
        "<div><b>" + esc(me.name) + "</b>" + (me.role ? ' · <span class="muted">' + esc(me.role) + "</span>" : "") + "</div>" +
        '<div class="tiny muted">Тактики: ' + inv.tactics.length + " · Задачи: " + inv.tasks.length + " · Гранаты: " + inv.nades.length + "</div></div></div>";
    } else if (DB.cache.players.length) {
      html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("user") + 'Кто ты?</h2></div><div class="sec-pad"><div class="btnrow" style="margin-top:0">';
      DB.cache.players.forEach((p) => {
        html += '<button class="btn ghost tiny" data-pick="' + p.id + '" type="button">' + esc(p.name) + "</button>";
      });
      html += "</div></div></div>";
    }

    // Быстрый доступ к картам
    html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("map") + 'Карты</h2><button class="more" data-go="#/maps" type="button">' + ic("chevron") + ' Все</button></div><div class="sec-body">';
    if (!DB.cache.maps.length) html += '<div class="empty">Карт пока нет.</div>';
    maps.forEach((m) => {
      html += '<a class="row" href="#/map/' + m.id + '">' + mapThumb(m, 52) + '<span class="row-main"><b>' + esc(m.name) +
        "</b><small>" + tacticsOfMap(m.id).length + ' такт.</small></span><span class="row-arrow">' + ic("chevron") + "</span></a>";
    });
    html += "</div></div>";

    // Активные тактики (недавно обновлённые)
    html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("target") + 'Активные тактики</h2><button class="more" data-go="#/tactics" type="button">' + ic("chevron") + ' Все</button></div><div class="sec-body">';
    if (!recentTactics.length) html += '<div class="empty">Тактик пока нет.</div>';
    recentTactics.forEach((t) => {
      const m = mapById(t.map_id);
      html += tacticRowHTML(t, m);
    });
    html += "</div></div>";

    // Избранное
    if (favs.length) {
      html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("star") + 'Избранное</h2></div><div class="sec-body">';
      favs.forEach((f) => {
        html += '<button class="row" data-favgo="' + f.kind + ":" + esc(f.id) + '" type="button"><span class="row-main"><b>' + esc(f.title) +
          "</b><small>" + esc(favKindName(f.kind)) + '</small></span><span class="row-arrow">' + ic("chevron") + "</span></button>";
      });
      html += "</div></div>";
    }

    // Последние изменения
    html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("clock") + 'Последние изменения</h2></div><div class="sec-body">';
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
    return '<a class="' + rcls("row") + '" href="#/tactic/' + t.id + '"><span class="row-main"><b>' + esc(t.name) + "</b><small>" +
      esc((m ? m.name + " · " : "") + (t.category || "Тактика")) + "</small></span>" +
      '<span class="row-side">' + sideBadge(t.side) + '<span class="row-arrow">' + ic("chevron") + "</span></span></a>";
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

  /* ---------- обложки карт ---------- */
  const MAP_ART = {
    mirage: "assets/maps/cards/mirage.jpg",
    ancient: "assets/maps/cards/ancient.jpg",
    dust2: "assets/maps/cards/dust2.jpg",
  };
  function mapSlug(name) {
    const s = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (s.indexOf("mirage") >= 0) return "mirage";
    if (s.indexOf("ancient") >= 0) return "ancient";
    if (s.indexOf("dust") >= 0) return "dust2";
    return "";
  }
  /** Фото карты: своё (загрузил капитан) → встроенная обложка → радар. */
  function mapArt(m) {
    if (!m) return "";
    if (m.photo) return m.photo;
    return MAP_ART[mapSlug(m.name)] || "";
  }
  function mapCardHTML(m, href, opts) {
    opts = opts || {};
    const art = mapArt(m);
    const baked = !m.photo && !!MAP_ART[mapSlug(m.name)]; // имя уже вплавлено в обложку
    const n = tacticsOfMap(m.id).length;
    let h = '<a class="' + rcls("mapcard" + (art ? "" : " noart")) + '" href="' + href + '">' +
      (art ? '<img class="mc-img" src="' + esc(art) + '" alt="" loading="lazy">' : "") +
      '<span class="mc-scrim"></span>' +
      (baked ? "" : '<span class="mc-name">' + esc(m.name) + "</span>") +
      '<span class="mc-body"><span class="mc-cap">' + esc(m.name) + '</span><span class="mc-meta">' + ic("target") + n + " такт.</span></span>";
    if (opts.tools) {
      h += '<span class="mc-tools">' +
        '<button class="starbtn' + (DB.isFav("map", m.id) ? " on" : "") + '" data-fav="map:' + m.id + '" type="button" title="В избранное">' + ic("star") + "</button>" +
        (isCap() ? '<button class="menubtn" data-mapmenu="' + m.id + '" type="button" title="Действия">' + ic("dots") + "</button>" : "") +
        "</span>";
    }
    return h + "</a>";
  }

  /* ---------- maps ---------- */
  function viewMaps() {
    const view = $("#view");
    let html = '<div class="' + rcls("pagehead") + '"><div><h1>Карты</h1><p class="sub">' +
      DB.cache.maps.length + " шт. · откройте карту, чтобы смотреть тактики и схемы</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-addmap type="button">' + ic("plus") + " Карта</button></div>" : "") + "</div>";
    if (!DB.cache.maps.length) {
      html += '<div class="' + rcls("sec") + '"><div class="sec-pad"><div class="empty">Карт пока нет.' +
        (isCap() ? " Добавьте первую." : "") + "</div></div></div>";
    } else {
      html += '<div class="mapgrid">';
      DB.cache.maps.forEach((m) => { html += mapCardHTML(m, "#/map/" + m.id, { tools: true }); });
      html += "</div>";
    }
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
    const art = mapArt(m);
    let html = '<a class="backlink" href="#/maps">' + ic("back") + " Карты</a>";
    html += '<div class="' + rcls("maphero") + '"' + (art ? ' style="background-image:url(\'' + esc(art).replace(/'/g, "%27") + '\')"' : "") + ">" +
      "<h1>" + esc(m.name) + "</h1>" +
      '<p class="sub">' + (tT.length + tCT.length + tAny.length) + " такт. · " + mats.length + " матер.</p></div>";
    html += '<div class="' + rcls("pagehead") + '"><div></div><div class="actions">' +
      '<button class="starbtn' + (DB.isFav("map", m.id) ? " on" : "") + '" data-fav type="button" title="В избранное">' + ic("star") + "</button>" +
      (isCap() ? '<button class="btn tiny" data-addt type="button">' + ic("plus") + " Тактика</button>" +
        '<button class="menubtn" data-mm type="button" title="Действия">' + ic("dots") + "</button>" : "") + "</div></div>";
    if (m.image) html += '<div class="' + rcls("sec") + '"><div class="thumbs" style="padding:12px"><button class="thumb" data-full type="button"><img src="' + esc(m.image) + '" alt=""><span>Открыть радар</span></button></div></div>';
    html += sideSection("Сторона T", tT, m);
    html += sideSection("Сторона CT", tCT, m);
    if (tAny.length) html += sideSection("Обе стороны", tAny, m);
    if (mats.length) {
      html += '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + ic("folder") + 'Материалы карты</h2></div><div class="sec-body">';
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
    let html = '<div class="' + rcls("sec") + '"><div class="sec-head"><h2>' + esc(title) + " · " + list.length + "</h2></div><div class=\"sec-body\">";
    if (!list.length) html += '<div class="empty">Пусто.</div>';
    list.forEach((t) => { html += tacticRowHTML(t, m); });
    return html + "</div></div>";
  }

  /* ---------- tactics list + filters ---------- */
  const CATEGORIES = ["Execute", "Default", "Retake", "Split", "Control", "Utility", "Pistol", "Eco", "Force"];
  /** Без карты — витрина выбора карты крупными фото; с картой — тактики этой карты. */
  function viewTactics(mapId) {
    const view = $("#view");
    const f = S.tfilter;
    if (!mapId) {
      let html = '<div class="' + rcls("pagehead") + '"><div><h1>Тактики</h1><p class="sub">Выберите карту — внутри тактики и схемы стороны</p></div>' +
        (isCap() ? '<div class="actions"><button class="btn tiny" data-newt type="button">' + ic("plus") + " Тактика</button></div>" : "") + "</div>";
      if (!DB.cache.maps.length) {
        html += '<div class="' + rcls("sec") + '"><div class="sec-pad"><div class="empty">Карт пока нет.' +
          (isCap() ? " Добавьте карту в разделе «Карты»." : "") + "</div></div></div>";
      } else {
        html += '<div class="mapgrid">';
        DB.cache.maps.forEach((m) => { html += mapCardHTML(m, "#/tactics/" + m.id, {}); });
        html += "</div>";
      }
      view.innerHTML = html;
      const nt0 = $("[data-newt]", view);
      if (nt0) nt0.onclick = () => sheetNewTactic(null);
      return;
    }
    const m = mapById(mapId);
    if (!m) { go("#/tactics"); return; }
    const cats = [];
    DB.cache.tactics.forEach((t) => { if (t.category && cats.indexOf(t.category) < 0) cats.push(t.category); });
    const art = mapArt(m);
    let html = '<a class="backlink" href="#/tactics">' + ic("back") + " Выбор карты</a>";
    html += '<div class="' + rcls("maphero") + '"' + (art ? ' style="background-image:url(\'' + esc(art).replace(/'/g, "%27") + '\')"' : "") + ">" +
      "<h1>" + esc(m.name) + "</h1>" +
      '<p class="sub">' + tacticsOfMap(m.id).length + " такт. на карте</p></div>";
    html += '<div class="' + rcls("pagehead") + '"><div></div><div class="actions">' +
      (isCap() ? '<button class="btn tiny" data-newt type="button">' + ic("plus") + " Тактика</button>" : "") + "</div></div>";
    // Фильтры: сторона + категория
    html += '<div class="' + rcls("chiprow") + '"><button class="chip' + (!f.side ? " on" : "") + '" data-f="side:" type="button">T/CT</button>' +
      '<button class="chip' + (f.side === "T" ? " on" : "") + '" data-f="side:T" type="button">T</button>' +
      '<button class="chip' + (f.side === "CT" ? " on" : "") + '" data-f="side:CT" type="button">CT</button></div>';
    if (cats.length) {
      html += '<div class="' + rcls("chiprow") + '"><button class="chip' + (!f.cat ? " on" : "") + '" data-f="cat:" type="button">Все типы</button>';
      cats.forEach((c) => {
        html += '<button class="chip' + (f.cat === c ? " on" : "") + '" data-f="cat:' + esc(c) + '" type="button">' + esc(c) + "</button>";
      });
      html += "</div>";
    }
    const list = DB.cache.tactics.filter((t) =>
      t.map_id === m.id && (!f.side || t.side === f.side || t.side === "ANY") && (!f.cat || t.category === f.cat));
    html += '<div class="' + rcls("sec") + '"><div class="sec-body">';
    if (!list.length) html += '<div class="empty">На этой карте тактик пока нет.' + (isCap() ? " Добавьте первую." : "") + "</div>";
    list.forEach((t) => { html += tacticRowHTML(t, m); });
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
    if (nt) nt.onclick = () => sheetNewTactic(m.id);
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
    let photo = m.photo || "";
    const presets = [
      ["", "Без изображения"],
      ["assets/maps/mirage.png", "Mirage (встроенный радар)"],
      ["assets/maps/ancient.png", "Ancient (встроенный радар)"],
      ["assets/maps/dust2.png", "Dust 2 (встроенный радар)"],
    ];
    openSheet(isNew ? "Новая карта" : "Изменить карту",
      '<label class="field"><span>Название</span><input id="mpName" maxlength="40" value="' + esc(m.name) + '" placeholder="Mirage"></label>' +
      '<div class="field"><span>Фото карты (обложка)</span>' +
      '<div class="bgprev" style="margin-bottom:8px"><img id="mpPrev" src="' + esc(photo || mapArt(m) || "assets/maps/mirage.png") + '" alt="" style="max-height:120px;width:100%;object-fit:cover;border-radius:10px;border:1px solid var(--border-2)"></div>' +
      '<div class="btnrow" style="margin-top:0"><button class="btn ghost tiny" data-mppick type="button">' + ic("upload") + " Загрузить фото</button>" +
      '<button class="btn ghost tiny" data-mpclear type="button"' + (photo ? "" : " disabled") + ">Сбросить на стандарт</button></div>" +
      '<input type="file" accept="image/*" hidden id="mpFile"></div>' +
      '<label class="field"><span>Изображение радара</span><select id="mpPreset">' +
      presets.map((p) => '<option value="' + p[0] + '"' + (m.image === p[0] ? " selected" : "") + ">" + p[1] + "</option>").join("") +
      '<option value="__custom">Своя ссылка…</option></select></label>' +
      '<label class="field" id="mpCustomWrap" hidden><span>Ссылка на изображение</span><input id="mpCustom" maxlength="500" value="' + esc(m.image || "") + '" placeholder="https://…"></label>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
    const preset = $("#mpPreset");
    const syncCustom = () => { $("#mpCustomWrap").hidden = preset.value !== "__custom"; };
    preset.onchange = syncCustom;
    if (m.image && !presets.some((p) => p[0] === m.image)) { preset.value = "__custom"; syncCustom(); }
    const prev = $("#mpPrev");
    $("#mpFile").onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      fileToDataUrl(file).then((url) => shrinkDataUrl(url, 1000, 0.72)).then((small) => {
        photo = small;
        prev.src = small;
        const clr = $("[data-mpclear]"); if (clr) clr.disabled = false;
      }).catch(() => toast("Не удалось прочитать файл", "warn"));
    };
    $("[data-mppick]").onclick = () => $("#mpFile").click();
    $("[data-mpclear]").onclick = (e) => { photo = ""; prev.src = mapArt({ name: $("#mpName").value }) || "assets/maps/mirage.png"; e.currentTarget.disabled = true; };
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = async () => {
      const name = $("#mpName").value.trim();
      if (!name) return;
      const image = preset.value === "__custom" ? $("#mpCustom").value.trim() : preset.value;
      const payload = { name, image, photo };
      if (!isNew) payload.id = m.id;
      const saved = await commit(isNew ? 'добавил карту «' + name + "»" : 'изменил карту «' + name + "»", isNew ? null : { kind: "map", id: m.id }, () => DB.save("maps", payload));
      if (saved) { closeSheet(); if (isNew) go("#/map/" + saved.id); else render(); }
    };
  }

  /* ---------- tactic detail ---------- */
  const BLOCK_NAMES = { roster: "Состав", tasks: "Задачи", grenades: "Гранаты", board: "Схема", image: "Изображения", video: "Видео", note: "Заметки" };
  const NADE_ICON = { smoke: "smoke", molly: "molly", flash: "flash", he: "he", decoy: "decoy" };
  const NADE_NAME = { smoke: "Смouk", molly: "Молотов", flash: "Флешка" };
  const NADE_NAMES = { smoke: "Смоук", molly: "Молотов", flash: "Флешка", he: "Хешка", decoy: "Обманка" };
  function nadeName(k) { return NADE_NAMES[k] || "Граната"; }

  function viewTactic(id) {
    const t = tacticById(id);
    const view = $("#view");
    if (!t) { go("#/tactics"); return; }
    const m = mapById(t.map_id);
    let html = '<a class="backlink" href="' + (m ? "#/tactics/" + m.id : "#/tactics") + '">' + ic("back") + " " + esc(m ? m.name : "Тактики") + "</a>";
    html += '<div class="' + rcls("pagehead") + '"><div><h1>' + esc(t.name) + "</h1>" +
      '<p class="sub">' + esc([m ? m.name : null, t.side === "ANY" ? "T/CT" : t.side, t.category || null].filter(Boolean).join(" / ")) +
      (t.updated_at ? " · обновлено " + fmtRel(t.updated_at) : "") + "</p></div>" +
      '<div class="actions"><button class="starbtn' + (DB.isFav("tactic", t.id) ? " on" : "") + '" data-fav type="button" title="В избранное">' + ic("star") + "</button>" +
      (isCap() ? '<button class="menubtn" data-tmenu type="button" title="Действия">' + ic("dots") + "</button>" : "") + "</div></div>";
    if (isCap() && (S.draft || {})[t.id]) {
      html += '<div class="draftbar">' + ic("warn") + "<span>Есть несохранённые правки схемы</span>" +
        '<button class="btn tiny" data-savenow type="button">' + ic("save") + " Сохранить</button></div>";
    }

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
    const sn = $("[data-savenow]", view);
    if (sn) sn.onclick = async () => { await flushDrafts(); render(); toast("Сохранено", "ok"); };
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
      '<div class="block-head">' + (isCap() ? '<span class="grip" data-grip title="Тяните, чтобы переместить">' + ic("grip") + '</span>' : "") +
      "<h3>" + esc(title) + (b.hidden ? " · скрыт" : "") + "</h3>" +
      (isCap() ? '<button class="menubtn" data-bmenu="' + b.id + '" type="button" title="Действия">' + ic("dots") + '</button>' : "") + "</div>" +
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
      '<div class="nade"><div><span class="nadeic">' + ic(NADE_ICON[it.kind] || "bomb") + "</span><b>" + esc(it.name || nadeName(it.kind)) + "</b> " +
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
      '<div class="task"><span class="nadeic">' + ic("video") + '</span><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.caption || it.url) + "</a></div>"
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
        fld("Тип", '<select ' + d + ' data-k="kind">' + ["smoke", "molly", "flash", "he", "decoy"].map((k) => '<option value="' + k + '"' + (it.kind === k ? " selected" : "") + ">" + NADE_ICON[k] + " " + nadeName(k) + "</option>").join("") + "</select>") +
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
  const BOARD_COLORS = [
    { c: "#e8a72f", n: "жёлтый" }, { c: "#ef5d5d", n: "красный" },
    { c: "#5da9ff", n: "синий" }, { c: "#48cf8b", n: "зелёный" },
    { c: "#b984ff", n: "фиолет" }, { c: "#f2f4f7", n: "белый" },
    { c: "#ff8ac2", n: "розовый" }, { c: "#8e9aa8", n: "серый" },
  ];
  const STROKE_PX = { 1: 1.9, 2: 3.2, 3: 5.2 };
  const BOARD_WIDTHS = [{ w: 1, n: "Тонко" }, { w: 2, n: "Средне" }, { w: 3, n: "Жирно" }];
  const strokePx = (w) => STROKE_PX[w] || STROKE_PX[2];
  const BOARD_TOOLS = [
    { id: "select", icon: "cursor", n: "Выбор", key: "V" },
    { id: "arrow", icon: "arrow", n: "Движение", key: "A" },
    { id: "line", icon: "line", n: "Линия", key: "L" },
    { id: "pen", icon: "edit", n: "Карандаш", key: "P" },
    { id: "zone", icon: "zone", n: "Зона", key: "Z" },
    { id: "player", icon: "user", n: "Игрок", key: "1" },
    { id: "number", icon: "hash", n: "Номер", key: "N" },
    { id: "text", icon: "text", n: "Текст", key: "X" },
    { id: "nade", icon: "bomb", n: "Граната", key: "G" },
    { id: "eraser", icon: "eraser", n: "Ластик", key: "E" },
  ];
  const NADE_KINDS = [
    { k: "smoke", i: "smoke", n: "Смоук" }, { k: "molly", i: "molly", n: "Молотов" },
    { k: "flash", i: "flash", n: "Флеш" }, { k: "he", i: "he", n: "Хешка" },
    { k: "decoy", i: "decoy", n: "Обманка" },
  ];
  const nadeMeta = (k) => NADE_KINDS.filter((x) => x.k === k)[0] || { k: k, i: "bomb", n: "Граната" };
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : BOARD_COLORS[0].c);
  const clamp100 = (v) => Math.max(0, Math.min(100, v));
  const r1 = (v) => Math.round(v * 10) / 10;

  function boardBg(t, b) {
    if (b.bg) return b.bg;
    const m = mapById(t.map_id);
    return m ? m.image : "";
  }

  /* --- geometry helpers --- */
  function bendPoint(d) {
    const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
    if (!d.bend) return { x: mx, y: my };
    const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: mx - (dy / len) * d.bend, y: my + (dx / len) * d.bend };
  }
  function arrowPathD(d) {
    if (!d.bend) return "M" + d.x1 + " " + d.y1 + " L" + d.x2 + " " + d.y2;
    const c = bendPoint(d);
    return "M" + d.x1 + " " + d.y1 + " Q" + r1(c.x) + " " + r1(c.y) + " " + d.x2 + " " + d.y2;
  }
  function triPath(x, y, ax, ay, size) {
    const a = Math.atan2(y - ay, x - ax);
    const spread = 0.42;
    const p1x = x - size * Math.cos(a - spread), p1y = y - size * Math.sin(a - spread);
    const p2x = x - size * Math.cos(a + spread), p2y = y - size * Math.sin(a + spread);
    return "M" + r1(x) + " " + r1(y) + " L" + r1(p1x) + " " + r1(p1y) + " L" + r1(p2x) + " " + r1(p2y) + " Z";
  }
  function headSize(d) { return 2.6 + strokePx(d.w) * 0.75; }
  function dashAttr(d) {
    if (!d.dash) return "";
    const s = strokePx(d.w);
    return ' stroke-dasharray="' + r1(s * 2.2 + 2) + " " + r1(s * 1.5 + 1.4) + '"';
  }
  /** Снап конца стрелки к ближнему игроку — чтобы маршрут ехал вместе с токеном. */
  function anchorNear(b, x, y) {
    let best = null, bd = 5.4;
    (b.markers || []).forEach((mk) => {
      if (mk.kind !== "player") return;
      const dd = Math.sqrt((mk.x - x) * (mk.x - x) + (mk.y - y) * (mk.y - y));
      if (dd < bd) { bd = dd; best = mk; }
    });
    return best;
  }
  function attachAnchors(b, d) {
    if (d.type !== "arrow" && d.type !== "line") return;
    const a1 = anchorNear(b, d.x1, d.y1), a2 = anchorNear(b, d.x2, d.y2);
    d.a1 = a1 ? a1.id : null;
    d.a2 = a2 ? a2.id : null;
  }
  function followAnchors(b, mkId) {
    (b.drawings || []).forEach((d) => {
      if (d.type !== "arrow" && d.type !== "line") return;
      if (d.a1 === mkId) { d.x1 = r1(mkById(b, mkId).x); d.y1 = r1(mkById(b, mkId).y); }
      if (d.a2 === mkId) { d.x2 = r1(mkById(b, mkId).x); d.y2 = r1(mkById(b, mkId).y); }
    });
  }
  function mkById(b, id) { return (b.markers || []).filter((x) => x.id === id)[0] || { x: 50, y: 50 }; }

  /* --- rendering --- */
  function boardHTML(t, b) {
    const big = S.boardBig === b.id;
    let h = '<div class="boardwrap board' + (big ? " big" : "") + (isCap() ? " editable" : "") +
      (S.boardGrid ? " grid" : "") + '" data-board="' + b.id + '" tabindex="0">' +
      '<div class="board-inner">';
    h += '<div class="map-canvas">' + boardCanvasHTML(t, b) + "</div>";
    h += '<div class="boardbar">' + boardBarHTML(t, b) + "</div>";
    h += "</div>";
    if (big) h += '<button class="iconbtn board-close" data-bclose type="button" title="Закрыть (Esc)">' + ic("x") + '</button>';
    return h + "</div>";
  }
  function boardCanvasHTML(t, b) {
    const bg = boardBg(t, b);
    let h = "";
    if (bg) h += '<img class="map-photo" src="' + esc(bg) + '" alt="" draggable="false">';
    else h += '<div class="empty">Нет фона карты.</div>';
    h += boardSVG(b, isCap());
    return h;
  }
  function boardCount(b) {
    return (b.drawings || []).length + (b.markers || []).filter((m) => m.kind === "player").length;
  }
  function boardBarHTML(t, b) {
    if (!isCap()) {
      return '<div class="board-row"><span class="board-hint">Схема · ' + boardCount(b) + " эл.</span>" +
        '<span class="board-spacer"></span><button class="toolbtn" data-bzoom type="button">' +
        ic(S.boardBig === b.id ? "collapse" : "expand") + " " +
        (S.boardBig === b.id ? "Свернуть" : "Открыть") + "</button></div>";
    }
    const dirty = !!(S.draft || {})[t.id];
    let h = '<div class="board-row board-tools" role="toolbar">';
    BOARD_TOOLS.forEach((x) => {
      h += '<button class="toolbtn tool' + (S.boardTool === x.id ? " on" : "") + '" data-tool="' + x.id +
        '" type="button" title="' + esc(x.n) + " (" + x.key + ')"><span class="ti">' + ic(x.icon) + "</span>" +
        '<span class="tl">' + esc(x.n) + "</span></button>";
    });
    h += "</div>";

    h += '<div class="board-row board-style">';
    h += '<span class="bgroup">';
    BOARD_COLORS.forEach((x) => {
      h += '<button class="swatch' + (S.boardColor === x.c ? " on" : "") + '" data-color="' + x.c +
        '" style="--sw:' + x.c + '" type="button" title="' + esc(x.n) + '"></button>';
    });
    h += "</span>";
    h += '<span class="bgroup">' + BOARD_WIDTHS.map((x) =>
      '<button class="toolbtn sm' + (S.boardWidth === x.w ? " on" : "") + '" data-w="' + x.w +
      '" type="button">' + esc(x.n) + "</button>").join("") + "</span>";
    h += '<span class="bgroup">' +
      '<button class="toolbtn sm' + (S.boardDash ? " on" : "") + '" data-tog="dash" type="button" title="Пунктир — для необязательных/теневых маршрутов">' + ic("dash") + " Пунктир</button>" +
      '<button class="toolbtn sm' + (S.boardHead === "both" ? " on" : "") + '" data-tog="head" type="button" title="Наконечники с двух сторон — размен/обмен">' + ic("bothends") + " Два конца</button>" +
      '<button class="toolbtn sm' + (S.boardGrid ? " on" : "") + '" data-tog="grid" type="button" title="Сетка 5% + привязка к ней">' + ic("gridlines") + " Сетка</button>" +
      "</span>";
    h += '<span class="bgroup">' +
      '<button class="toolbtn sm" data-mstyle type="button" title="Как показывать игроков">' + ic("tag") + " " +
      (b.markerStyle === "nick" ? "Ники" : b.markerStyle === "both" ? "Ник+№" : "Номера") + "</button>" +
      "</span>";
    h += "</div>";

    if (S.boardTool === "nade") {
      h += '<div class="board-row board-sub">';
      NADE_KINDS.forEach((x) => {
        h += '<button class="toolbtn sm' + (S.boardNade === x.k ? " on" : "") + '" data-nade="' + x.k +
          '" type="button">' + ic(x.i) + " " + esc(x.n) + "</button>";
      });
      h += "</div>";
    }
    if (S.boardSel) {
      h += '<div class="board-row board-sub">' +
        '<button class="toolbtn sm" data-beditel type="button">' + ic("edit") + " Подпись</button>" +
        '<button class="toolbtn sm" data-bdupel type="button">' + ic("copy") + " Дубликат</button>" +
        '<button class="toolbtn sm" data-bline type="button">' + ic("arrow") + " Стрелка отсюда</button>" +
        '<button class="toolbtn sm" data-bdel type="button">' + ic("trash") + " Удалить</button>" +
        "</div>";
    }
    if (S.boardWait === b.id) {
      h += '<div class="board-row board-sub warn"><b>Тапните точку</b> — туда пойдут стрелки от всех игроков</div>';
    }
    h += '<div class="board-row board-acts">' +
      '<button class="toolbtn sm" data-bundo type="button"' + (histLen(b, "u") ? "" : " disabled") + ">" + ic("undo") + " Отменить" +
      (histLen(b, "u") ? " (" + histLen(b, "u") + ")" : "") + "</button>" +
      '<button class="toolbtn sm" data-bredo type="button"' + (histLen(b, "r") ? "" : " disabled") + ">" + ic("redo") + " Вернуть</button>" +
      '<span class="board-spacer"></span>' +
      '<button class="toolbtn sm" data-bplace type="button" title="Разложить состав по спауну стороны">' + ic("flag") + " Расставить 1–5</button>" +
      '<button class="toolbtn sm" data-bfan type="button" title="Стрелки от каждого игрока в одну точку">' + ic("fan") + " Стрелки к точке</button>" +
      '<button class="toolbtn sm" data-bclear type="button">' + ic("trash") + " Очистить</button>" +
      '<button class="toolbtn sm" data-bzoom type="button">' + ic(S.boardBig === b.id ? "collapse" : "expand") + " " + (S.boardBig === b.id ? "Свернуть" : "Во весь экран") + "</button>" +
      '<button class="toolbtn sm savebtn' + (dirty ? " dirty" : "") + '" data-bsave type="button" title="Отправить правки схемы в команду">' + ic("save") + " Сохранить</button>" +
      "</div>";
    return h;
  }
  function histLen(b, kind) {
    const h = S.boardHist && S.boardHist[b.id];
    return h ? h[kind].length : 0;
  }
  function boardSVG(b, editable) {
    const sel = S.boardSel;
    let body = '<rect class="map-hit-area" width="100" height="100" fill="transparent"/>';
    (b.drawings || []).forEach((d) => {
      body += drawItemHTML(b, d, !!(sel && sel.id === d.id), editable);
    });
    (b.markers || []).forEach((mk) => {
      body += markerSVG(b, mk, !!(sel && sel.id === mk.id), editable);
    });
    return '<svg class="tactical-map' + (editable ? " editing" : "") + '" viewBox="0 0 100 100" preserveAspectRatio="none" data-svg="' +
      b.id + '">' + body + "</svg>";
  }
  function drawItemHTML(b, d, selected, editable) {
    const c = safeColor(d.color);
    const sw = strokePx(d.w);
    const cls = "draw-item" + (selected ? " selected" : "");
    if (d.type === "arrow" || d.type === "line") {
      const p = arrowPathD(d);
      let heads = "";
      if (d.type === "arrow") {
        heads = '<path class="ahead" fill="' + c + '" d="' + triPath(d.x2, d.y2, bendPoint(d).x, bendPoint(d).y, headSize(d)) + '"/>';
        if (d.head === "both") {
          heads += '<path class="ahead" fill="' + c + '" d="' + triPath(d.x1, d.y1, bendPoint(d).x, bendPoint(d).y, headSize(d)) + '"/>';
        }
      }
      return '<g class="' + cls + '" data-draw="' + d.id + '">' +
        '<path class="shape hit" d="' + p + '"/>' +
        '<path class="shape vis" stroke="' + c + '" stroke-width="' + sw + '"' + dashAttr(d) + ' d="' + p + '"/>' +
        heads +
        '<path class="shape halo" d="' + p + '"/>' +
        (selected && editable ? handleHTML(d) : "") +
        "</g>";
    }
    if (d.type === "pen") {
      const pts = (d.points || []).map((p) => p[0] + "," + p[1]).join(" ");
      return '<g class="' + cls + '" data-draw="' + d.id + '">' +
        '<polyline class="shape hit" points="' + pts + '"/>' +
        '<polyline class="shape vis" stroke="' + c + '" stroke-width="' + sw + '"' + dashAttr(d) + ' points="' + pts + '"/>' +
        '<polyline class="shape halo" points="' + pts + '"/>' +
        "</g>";
    }
    if (d.type === "zone") {
      return '<g class="' + cls + ' zone-item" data-draw="' + d.id + '">' +
        '<ellipse class="zone-hit" cx="' + d.x + '" cy="' + d.y + '" rx="' + d.rx + '" ry="' + d.ry + '"/>' +
        '<ellipse class="zone-vis" fill="' + c + '" stroke="' + c + '" cx="' + d.x + '" cy="' + d.y + '" rx="' + d.rx + '" ry="' + d.ry + '"/>' +
        '<ellipse class="zone-halo" cx="' + d.x + '" cy="' + d.y + '" rx="' + d.rx + '" ry="' + d.ry + '"/>' +
        (selected && editable ? '<circle class="bhandle" data-handle="rx" cx="' + r1(d.x + d.rx) + '" cy="' + d.y + '" r="2.4"/>' +
          '<circle class="bhandle" data-handle="ry" cx="' + d.x + '" cy="' + r1(d.y + d.ry) + '" r="2.4"/>' : "") +
        "</g>";
    }
    if (d.type === "nade") {
      const meta = nadeMeta(d.kind);
      const auto = d.kind === "smoke" ? "#9aa4b0" : d.kind === "molly" ? "#ef5d5d" : d.kind === "flash" ? "#e8c56a" : d.kind === "he" ? "#ff9d5c" : "#d8dee6";
      const nc = /^#[0-9a-f]{6}$/i.test(String(d.color || "")) ? d.color : auto;
      const label = String(d.label || "").slice(0, 3);
      return '<g class="' + cls + ' draw-marker nade-item" data-draw="' + d.id + '" transform="translate(' + d.x + "," + d.y + ')">' +
        '<circle class="chip-hit" r="4.9"/>' +
        '<circle class="tactic-number-bg" r="3.4" stroke="' + nc + '"/>' +
        '<text class="tactic-number-text" y=".15" fill="' + nc + '" style="font-size:3.5px">' + meta.i + "</text>" +
        (label ? '<text class="nade-idx" y="6.3" fill="' + nc + '">' + esc(label) + "</text>" : "") +
        '<circle class="selection-ring" r="4.5"/>' + "</g>";
    }
    if (d.type === "number") {
      const size = 2.85 + strokePx(d.w) * 0.4;
      return '<g class="' + cls + ' draw-marker" data-draw="' + d.id + '" transform="translate(' + d.x + "," + d.y + ')">' +
        '<circle class="chip-hit" r="' + (size + 1.4) + '"/>' +
        '<circle class="tactic-number-bg" r="' + size + '" stroke="' + c + '"/>' +
        '<text class="tactic-number-text" y=".15" fill="' + c + '" style="font-size:' + r1(size * 1.28) + 'px">' + esc(String(d.text || "1").slice(0, 3)) + "</text>" +
        '<circle class="selection-ring" r="' + (size + 1.1) + '"/>' +
        "</g>";
    }
    // text / label
    const label = String(d.text || "?").slice(0, 26);
    const size = 2.5 + strokePx(d.w) * 0.36;
    const w = Math.min(60, Math.max(11, label.length * (size * 0.58) + 5));
    return '<g class="' + cls + ' draw-marker" data-draw="' + d.id + '" transform="translate(' + d.x + "," + d.y + ')">' +
      '<rect class="chip-hit" x="' + (-w / 2 - 1) + '" y="-3.2" width="' + (w + 2) + '" height="6.4"/>' +
      '<rect class="tactic-label-bg" x="' + (-w / 2) + '" y="' + (-size * 0.83) + '" width="' + w + '" height="' + r1(size * 1.66) +
      '" rx="1" stroke="' + c + '"/>' +
      '<text class="tactic-label" y=".1" fill="' + c + '" style="font-size:' + size + 'px">' + esc(label) + "</text>" +
      '<rect class="selection-ring" x="' + (-w / 2 - 1.1) + '" y="' + (-size * 0.83 - 1) + '" width="' + (w + 2.2) + '" height="' + r1(size * 1.66 + 2) + '" rx="1.2"/>' +
      "</g>";
  }
  function handleHTML(d) {
    return '<circle class="bhandle" data-handle="1" cx="' + d.x1 + '" cy="' + d.y1 + '" r="2.4"/>' +
      '<circle class="bhandle" data-handle="2" cx="' + d.x2 + '" cy="' + d.y2 + '" r="2.4"/>' +
      '<circle class="bhandle bend" data-handle="b" cx="' + r1(bendPoint(d).x) + '" cy="' + r1(bendPoint(d).y) + '" r="2"/>';
  }
  function markerSVG(b, mk, selected, editable) {
    const sel = selected ? " selected" : "";
    if (mk.kind === "player") {
      const p = playerById(mk.playerId);
      const color = safeColor((p && p.color) || mk.color);
      const idx = p ? DB.cache.players.indexOf(p) + 1 : "?";
      const style = b.markerStyle || "number";
      const nick = p ? String(p.name).slice(0, 14) : "?";
      let inner = "";
      if (style === "nick") {
        const w = Math.min(34, Math.max(12, nick.length * 1.75 + 5));
        inner = '<rect class="player-tag" x="' + (-w / 2) + '" y="-2.7" width="' + w + '" height="5.4" rx="1" stroke="' + color + '"/>' +
          '<text class="player-nick" y=".1" fill="' + color + '">' + esc(nick) + "</text>";
      } else {
        inner = '<circle class="pmk-dot" r="3.25" stroke="' + color + '"/>' +
          '<text class="player-num" y=".1" fill="' + color + '">' + idx + "</text>" +
          (style === "both" ? '<text class="player-sub" y="5.6" fill="' + color + '">' + esc(nick.slice(0, 10)) + "</text>" : "");
      }
      return '<g class="pmk draw-item' + sel + '" data-marker="' + mk.id + '" transform="translate(' + mk.x + "," + mk.y + ')">' +
        '<circle class="chip-hit" r="5"/>' + inner + '<circle class="selection-ring" r="4.6"/>' + "</g>";
    }
    if (mk.kind === "smoke" || mk.kind === "molly" || mk.kind === "flash" || mk.kind === "he" || mk.kind === "decoy") {
      const meta = nadeMeta(mk.kind);
      const c = mk.kind === "smoke" ? "#9aa4b0" : mk.kind === "molly" ? "#ef5d5d" : mk.kind === "flash" ? "#e8c56a" : "#d8dee6";
      return '<g class="draw-item draw-marker' + sel + '" data-marker="' + mk.id + '" transform="translate(' + mk.x + "," + mk.y + ')">' +
        '<circle class="chip-hit" r="4.6"/>' +
        '<circle class="tactic-number-bg" r="3.1" stroke="' + c + '"/>' +
        nadeGlyph(mk.kind, c) +
        (mk.label ? '<text class="nade-idx" y="5.6" fill="' + c + '">' + esc(mk.label) + "</text>" : "") +
        '<circle class="selection-ring" r="4.1"/>' + "</g>";
    }
    const label = String(mk.label || "?").slice(0, 18);
    const w = Math.min(40, Math.max(10, label.length * 1.8 + 5));
    const c = safeColor(mk.color);
    return '<g class="draw-item draw-marker' + sel + '" data-marker="' + mk.id + '" transform="translate(' + mk.x + "," + mk.y + ')">' +
      '<rect class="chip-hit" x="' + (-w / 2 - 1) + '" y="-3.4" width="' + (w + 2) + '" height="6.8"/>' +
      '<rect class="tactic-label-bg" x="' + (-w / 2) + '" y="-2.5" width="' + w + '" height="5" rx="1" stroke="' + c + '"/>' +
      '<text class="tactic-label" y=".1" fill="' + c + '">' + esc(label) + "</text>" +
      '<rect class="selection-ring" x="' + (-w / 2 - 1.1) + '" y="-3.5" width="' + (w + 2.2) + '" height="7" rx="1.2"/>' + "</g>";
  }

  /* --- repaint in place (без пересборки всей страницы) --- */
  function repaintBoard(t, b) {
    $$('[data-board="' + b.id + '"]').forEach((wrap) => {
      const canvas = $(".map-canvas", wrap);
      if (canvas) canvas.innerHTML = boardCanvasHTML(t, b);
      const bar = $(".boardbar", wrap);
      if (bar) { bar.innerHTML = boardBarHTML(t, b); wireBoardBar(wrap, t, b); }
      const svg = $("[data-svg]", wrap);
      if (svg) bindBoardSVG(svg, t, b);
      if (document.activeElement === wrap) { try { wrap.focus({ preventScroll: true }); } catch (e) {} }
    });
  }

  /* --- history + persistence --- */
  function hist(b) {
    if (!S.boardHist) S.boardHist = {};
    if (!S.boardHist[b.id]) S.boardHist[b.id] = { u: [], r: [] };
    return S.boardHist[b.id];
  }
  function boardSnapshot(b) {
    return JSON.stringify({ markers: b.markers || [], drawings: b.drawings || [], markerStyle: b.markerStyle || "number" });
  }
  function pushHist(t, b) {
    const h = hist(b);
    h.u.push(boardSnapshot(b));
    if (h.u.length > 30) h.u.shift();
    h.r.length = 0;
  }
  function applySnapshot(b, snap) {
    const v = JSON.parse(snap);
    b.markers = v.markers || [];
    b.drawings = v.drawings || [];
    b.markerStyle = v.markerStyle;
  }
  function boardUndo(t, b) {
    const h = hist(b);
    if (!h.u.length) { toast("Отменять нечего"); return; }
    h.r.push(boardSnapshot(b));
    applySnapshot(b, h.u.pop());
    S.boardSel = null;
    boardCommit(t, b);
  }
  function boardRedo(t, b) {
    const h = hist(b);
    if (!h.r.length) { toast("Возвращать нечего"); return; }
    h.u.push(boardSnapshot(b));
    applySnapshot(b, h.r.pop());
    S.boardSel = null;
    boardCommit(t, b);
  }
  /* ---------- черновики схемы ----------
     Рисование не дёргает базу на каждый жест: правки живут в кэше,
     страница не пересобирается, а сохранение — явное (кнопка «Сохранить»)
     или автоматическое при уходе с экрана. Так доска не лагает. */
  function draftIds() { return Object.keys(S.draft || {}); }
  function markDraft(t) {
    S.draft = S.draft || {};
    if (!S.draft[t.id]) S.draft[t.id] = true;
    saveState("draft");
  }
  /** Перерисовать доску на месте и пометить тактику как несохранённую. */
  function boardCommit(t, b) {
    markDraft(t);
    repaintBoard(t, b);
  }
  /** Отправить все черновики схем в базу одним заходом. */
  function flushDrafts() {
    const ids = draftIds();
    if (!ids.length) return Promise.resolve();
    S.draft = {};
    saveState("saving");
    return Promise.all(ids.map((id) => {
      const t = tacticById(id);
      if (!t) return Promise.resolve();
      const blocks = clone(t.blocks || []);
      return DB.save("tactics", { id: t.id, blocks }).catch((e) => {
        markDraft(t); // не удалось отправить — черновик остаётся
        toast((e && e.message) || "Не сохранилось", "warn");
      });
    })).then(() => { if (!draftIds().length) saveState("saved"); });
  }
  /* --- операции --- */
  function usedPlayerIds(b) {
    return (b.markers || []).filter((m) => m.kind === "player").map((m) => m.playerId);
  }
  function nextFreePlayer(b) {
    const used = usedPlayerIds(b);
    const all = DB.cache.players.filter((p) => used.indexOf(p.id) < 0);
    return all[0] || null;
  }
  function playerByIdOrder(p) { return DB.cache.players.indexOf(p) + 1; }

  function spawnZoneFor(t) {
    const m = mapById(t.map_id);
    const base = window.TACTICS_BASE && window.TACTICS_BASE.maps;
    if (!m || !base) return null;
    let map = null;
    Object.keys(base).forEach((k) => { if (base[k].name === m.name) map = base[k]; });
    if (!map || !(map.zones || []).length) return null;
    const kind = t.side === "CT" ? "ctspawn" : "tspawn";
    return map.zones.filter((z) => z.kind === kind)[0] || map.zones[0] || null;
  }
  function boardAutoPlace(t, b) {
    const players = DB.cache.players.slice(0, 5);
    if (!players.length) { toast("Сначала добавьте игроков в состав", "warn"); return; }
    const z = spawnZoneFor(t);
    const n = players.length;
    const pts = players.map((p, i) => {
      if (z) {
        const spread = Math.max(14, z.w || 16);
        const step = n > 1 ? spread / (n - 1) : 0;
        return { x: clamp100(z.x - spread / 2 + step * i), y: clamp100(z.y + (i % 2 ? 2.6 : -1.6)) };
      }
      const step = n > 1 ? 56 / (n - 1) : 0;
      return { x: 22 + step * i, y: t.side === "CT" ? 24 : 76 };
    });
    pushHist(t, b);
    b.markers = (b.markers || []).filter((m) => m.kind !== "player");
    players.forEach((p, i) => {
      b.markers.push({
        id: uid("m"), kind: "player", playerId: p.id, label: "", color: p.color || "",
        x: r1(pts[i].x), y: r1(pts[i].y), note: "",
      });
    });
    boardCommit(t, b);
    toast("Расставил " + n + " по " + (z ? "спауну" : "центру"), "ok");
  }
  function boardFanOut(t, b, pt) {
    const marks = (b.markers || []).filter((m) => m.kind === "player");
    if (!marks.length) { toast("Сначала расставьте игроков", "warn"); return false; }
    pushHist(t, b);
    b.drawings = b.drawings || [];
    marks.forEach((mk) => {
      const p = playerById(mk.playerId);
      b.drawings.push({
        id: uid("d"), type: "arrow", x1: r1(mk.x), y1: r1(mk.y), x2: r1(pt.x), y2: r1(pt.y),
        bend: 0, color: safeColor(p && p.color || S.boardColor), w: S.boardWidth,
        dash: S.boardDash, head: "end", a1: mk.id, a2: null,
      });
    });
    boardCommit(t, b);
    toast("Стрелки от " + marks.length + " игроков", "ok");
    return true;
  }
  function boardDeleteSel(t, b) {
    const sel = S.boardSel;
    if (!sel) { toast("Сначала выберите элемент схемы"); return; }
    pushHist(t, b);
    b.drawings = (b.drawings || []).filter((x) => x.id !== sel.id);
    b.markers = (b.markers || []).filter((x) => x.id !== sel.id);
    (b.drawings || []).forEach((d) => {
      if (d.a1 === sel.id) { d.a1 = null; }
      if (d.a2 === sel.id) { d.a2 = null; }
    });
    S.boardSel = null;
    boardCommit(t, b);
  }
  function boardDupSel(t, b) {
    const sel = S.boardSel;
    if (!sel) { toast("Сначала выберите элемент"); return; }
    const d = (b.drawings || []).filter((x) => x.id === sel.id)[0];
    if (!d) { toast("Дублировать можно только стрелки, линии, зоны и подписи", "warn"); return; }
    pushHist(t, b);
    const cp = clone(d);
    cp.id = uid("d");
    cp.x1 = d.x1 != null ? r1(clamp100(d.x1 + 5)) : cp.x1;
    cp.y1 = d.y1 != null ? r1(clamp100(d.y1 + 5)) : cp.y1;
    cp.x2 = d.x2 != null ? r1(clamp100(d.x2 + 5)) : cp.x2;
    cp.y2 = d.y2 != null ? r1(clamp100(d.y2 + 5)) : cp.y2;
    if (d.x != null) { cp.x = r1(clamp100(d.x + 5)); cp.y = r1(clamp100(d.y + 5)); }
    if (d.points) cp.points = d.points.map((p) => [r1(clamp100(p[0] + 5)), r1(clamp100(p[1] + 5))]);
    cp.a1 = cp.a2 = null;
    b.drawings.push(cp);
    S.boardSel = { id: cp.id };
    boardCommit(t, b);
  }
  function recolorSelection(t, b) {
    const sel = S.boardSel;
    if (!sel) { repaintBoard(t, b); return; }
    const d = (b.drawings || []).filter((x) => x.id === sel.id)[0];
    if (d) { pushHist(t, b); d.color = S.boardColor; d.w = S.boardWidth; d.dash = S.boardDash; boardCommit(t, b); return; }
    const mk = (b.markers || []).filter((x) => x.id === sel.id)[0];
    if (mk && mk.kind === "point") { pushHist(t, b); mk.color = S.boardColor; boardCommit(t, b); return; }
    repaintBoard(t, b);
  }
  function boardEditSelText(t, b) {
    const sel = S.boardSel;
    if (!sel) { toast("Сначала выберите элемент"); return; }
    const d = (b.drawings || []).concat(b.markers || []).filter((x) => x.id === sel.id)[0];
    if (!d) return;
    if (d.kind === "player") {
      const p = playerById(d.playerId);
      openSheet(p ? p.name : "Игрок",
        fld("Игрок", '<select id="esPlayer">' + playerOptions(d.playerId) + "</select>") +
        fld("Заметка к токену", '<input id="esNote" maxlength="120" value="' + esc(d.note || "") + '">'),
        '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Сохранить</button>');
      $("[data-x]").onclick = closeSheet;
      $("[data-ok]").onclick = () => {
        pushHist(t, b);
        d.playerId = $("#esPlayer").value || d.playerId;
        d.note = $("#esNote").value.trim();
        closeSheet();
        boardCommit(t, b);
      };
      return;
    }
    if (d.type === "nade") {
      askBoardText("text", (val) => {
        pushHist(t, b);
        d.label = val.slice(0, 3);
        boardCommit(t, b);
      }, d.label || "");
      return;
    }
    const isNum = d.type === "number";
    askBoardText(isNum ? "number" : "text", (val) => {
      pushHist(t, b);
      d.text = val;
      boardCommit(t, b);
    }, d.text || "");
  }
  /** От выбранной точки/токена тянем стрелку: тап по схеме — и маршрут готов. */
  function boardStartArrowFromSel(t, b) {
    const sel = S.boardSel;
    if (!sel) { toast("Сначала выберите элемент"); return; }
    const mk = (b.markers || []).filter((x) => x.id === sel.id)[0];
    const d = (b.drawings || []).filter((x) => x.id === sel.id)[0];
    let from = null, anchorId = null;
    if (mk) { from = { x: mk.x, y: mk.y }; anchorId = mk.id; }
    else if (d && d.x != null) { from = { x: d.x, y: d.y }; }
    else if (d && d.x2 != null) { from = { x: d.x2, y: d.y2 }; }
    if (!from) { toast("Стрелку можно потянуть от токена, номера или подписи", "warn"); return; }
    S.boardFrom = { blockId: b.id, from: from, anchor: anchorId };
    toast("Теперь тапните, куда идёт движение");
  }
  function boardClear(t, b) {
    if (!(b.drawings || []).length && !(b.markers || []).length) { toast("Схема уже пустая"); return; }
    confirmDlg("Очистить всю схему? Будет кнопка «Отменить».", () => {
      pushHist(t, b);
      b.drawings = []; b.markers = [];
      S.boardSel = null;
      boardCommit(t, b);
    });
  }

  /* --- wiring --- */
  /** После тихого обновления кэша (правка схемы ещё на экране) переводим
      обработчики уже отрисованных досок на свежие объекты кэша. */
  function rebindBoards() {
    const p = parseHash();
    if (p[0] !== "tactic") return;
    const t = tacticById(p[1]);
    if (!t) return;
    wireBoards($("#view"), t);
  }
  function wireBoards(view, t) {
    $$("[data-board]", view).forEach((wrap) => {
      const b = blockById(t, wrap.dataset.board);
      if (!b) return;
      wireBoardBar(wrap, t, b);
      const svg = $("[data-svg]", wrap);
      if (svg) bindBoardSVG(svg, t, b);
      wrap.addEventListener("keydown", (e) => boardKeys(e, t, b));
    });
  }
  function boardKeys(e, t, b) {
    if (!isCap()) return;
    const k = e.key;
    if (k === "Escape") {
      if (S.boardBig === b.id) { S.boardBig = null; S.boardWait = null; S.boardFrom = null; render(); return; }
      S.boardFrom = null;
      if (S.boardWait === b.id) S.boardWait = null;
      if (S.boardSel) { S.boardSel = null; }
      repaintBoard(t, b);
      return;
    }
    const meta = e.ctrlKey || e.metaKey;
    if (meta && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) boardRedo(t, b); else boardUndo(t, b); return; }
    if (meta && (k === "y" || k === "Y")) { e.preventDefault(); boardRedo(t, b); return; }
    if (meta && (k === "d" || k === "D")) { e.preventDefault(); boardDupSel(t, b); return; }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); boardDeleteSel(t, b); return; }
    if (meta) return;
    for (let i = 0; i < BOARD_TOOLS.length; i++) {
      if (k.toUpperCase() === BOARD_TOOLS[i].key) {
        S.boardTool = BOARD_TOOLS[i].id;
        S.boardSel = null;
        repaintBoard(t, b);
        return;
      }
    }
  }
  function wireBoardBar(wrap, t, b) {
    $$("[data-bzoom]", wrap).forEach((el) => {
      el.onclick = (e) => { e.preventDefault(); e.stopPropagation(); S.boardBig = S.boardBig === b.id ? null : b.id; render(); };
    });
    const zc = $("[data-bclose]", wrap);
    if (zc) zc.onclick = (e) => { e.preventDefault(); e.stopPropagation(); S.boardBig = null; render(); };
    if (!isCap()) return;
    $$("[data-tool]", wrap).forEach((btn) => {
      btn.onclick = () => {
        S.boardTool = S.boardTool === btn.dataset.tool && btn.dataset.tool !== "select" ? "select" : btn.dataset.tool;
        S.boardSel = null;
        S.boardFrom = null;
        S.boardWait = null;
        repaintBoard(t, b);
        // Фокус на доске — сразу работают горячие клавиши (V/A/L/P/Z/N/T/G/E, Ctrl+Z).
        try { wrap.focus({ preventScroll: true }); } catch (e) {}
      };
    });
    $$("[data-color]", wrap).forEach((btn) => {
      btn.onclick = () => { S.boardColor = btn.dataset.color; recolorSelection(t, b); };
    });
    $$("[data-w]", wrap).forEach((btn) => {
      btn.onclick = () => { S.boardWidth = +btn.dataset.w; recolorSelection(t, b); };
    });
    $$("[data-tog]", wrap).forEach((btn) => {
      btn.onclick = () => {
        const k = btn.dataset.tog;
        if (k === "dash") S.boardDash = !S.boardDash;
        else if (k === "head") S.boardHead = S.boardHead === "both" ? "end" : "both";
        else if (k === "grid") { S.boardGrid = !S.boardGrid; wrap.classList.toggle("grid", S.boardGrid); }
        repaintBoard(t, b);
      };
    });
    $$("[data-nade]", wrap).forEach((btn) => {
      btn.onclick = () => { S.boardNade = btn.dataset.nade; repaintBoard(t, b); };
    });
    const ms = $("[data-mstyle]", wrap);
    if (ms) ms.onclick = () => {
      const order = ["number", "nick", "both"];
      const i = order.indexOf(b.markerStyle || "number");
      b.markerStyle = order[(i + 1) % order.length];
      boardCommit(t, b);
    };
    $$("[data-bsave]", wrap).forEach((el) => {
      el.onclick = async () => {
        try {
          // Сохранение шлёт событие данных → кэш обновится и страница пересвяжется сам.
          await boardSaveNow(t, b);
          toast("Схема сохранена", "ok");
        } catch (e) { /* тост уже показан в boardSaveNow */ }
      };
    });
    $$("[data-bundo]", wrap).forEach((el) => { el.onclick = () => boardUndo(t, b); });
    $$("[data-bredo]", wrap).forEach((el) => { el.onclick = () => boardRedo(t, b); });
    $$("[data-bdel]", wrap).forEach((el) => { el.onclick = () => boardDeleteSel(t, b); });
    $$("[data-bdupel]", wrap).forEach((el) => { el.onclick = () => boardDupSel(t, b); });
    $$("[data-beditel]", wrap).forEach((el) => { el.onclick = () => boardEditSelText(t, b); });
    $$("[data-bline]", wrap).forEach((el) => { el.onclick = () => boardStartArrowFromSel(t, b); });
    $$("[data-bplace]", wrap).forEach((el) => { el.onclick = () => boardAutoPlace(t, b); });
    $$("[data-bfan]", wrap).forEach((el) => {
      el.onclick = () => {
        if (S.boardWait === b.id) { S.boardWait = null; repaintBoard(t, b); return; }
        S.boardWait = b.id;
        S.boardTool = "select";
        toast("Тапните точку на схеме");
        repaintBoard(t, b);
      };
    });
    $$("[data-bclear]", wrap).forEach((el) => { el.onclick = () => boardClear(t, b); });
  }
  function boardSaveNow(t, b) {
    const blocks = clone(t.blocks || []);
    const i = blocks.findIndex((x) => x.id === b.id);
    if (i >= 0) blocks[i] = clone(b);
    saveState("saving");
    return DB.save("tactics", { id: t.id, blocks }).then(() => {
      if (S.draft) delete S.draft[t.id];
      if (!draftIds().length) saveState("saved");
    }).catch((e) => {
      markDraft(t);
      toast((e && e.message) || "Не сохранилось", "warn");
      throw e;
    });
  }

  /* --- pointer interactions --- */
  function svgPoint(svg, e) {
    const r = svg.getBoundingClientRect();
    const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
    let x = r.width ? ((cx - r.left) / r.width) * 100 : 50;
    let y = r.height ? ((cy - r.top) / r.height) * 100 : 50;
    x = clamp100(x); y = clamp100(y);
    if (S.boardGrid) { x = Math.round(x / 5) * 5; y = Math.round(y / 5) * 5; }
    return { x: r1(x), y: r1(y) };
  }
  function bindBoardSVG(svg, t, b) {
    svg.addEventListener("pointerdown", (e) => {
      if (!isCap() || (e.button != null && e.button > 0)) return;
      const pt = svgPoint(svg, e);
      const handle = e.target.closest ? e.target.closest("[data-handle]") : null;
      const drawEl = e.target.closest ? e.target.closest("[data-draw]") : null;
      const markEl = e.target.closest ? e.target.closest("[data-marker]") : null;

      // 1) режим «стрелки к точке»
      if (S.boardWait === b.id) {
        e.preventDefault();
        S.boardWait = null;
        boardFanOut(t, b, pt);
        return;
      }
      // 2) стрелка от выбранного элемента
      if (S.boardFrom && S.boardFrom.blockId === b.id) {
        e.preventDefault();
        const from = S.boardFrom.from;
        pushHist(t, b);
        b.drawings = b.drawings || [];
        const nd = {
          id: uid("d"), type: "arrow", x1: r1(from.x), y1: r1(from.y), x2: pt.x, y2: pt.y, bend: 0,
          color: S.boardColor, w: S.boardWidth, dash: S.boardDash, head: S.boardHead,
        };
        b.drawings.push(nd);
        if (S.boardFrom.anchor) nd.a1 = S.boardFrom.anchor; else attachAnchors(b, nd);
        S.boardFrom = null;
        S.boardSel = { id: nd.id };
        boardCommit(t, b);
        return;
      }
      // 3) ручки выделенного элемента
      if (handle && S.boardSel) {
        e.preventDefault();
        startHandleDrag(e, svg, t, b, handle.dataset.handle);
        return;
      }
      // 4) инструменты рисования
      if (S.boardTool === "arrow" || S.boardTool === "line" || S.boardTool === "pen" || S.boardTool === "zone") {
        e.preventDefault();
        startStroke(e, svg, t, b, pt, S.boardTool);
        return;
      }
      if (S.boardTool === "player") {
        e.preventDefault();
        const p = nextFreePlayer(b);
        if (!p) { toast("Весь состав уже на схеме — тяните токены пальцем", "warn"); S.boardTool = "select"; repaintBoard(t, b); return; }
        pushHist(t, b);
        const mk = { id: uid("m"), kind: "player", playerId: p.id, label: "", color: p.color || "", x: pt.x, y: pt.y, note: "" };
        b.markers = b.markers || [];
        b.markers.push(mk);
        S.boardSel = { id: mk.id };
        boardCommit(t, b);
        toast(p.name + " — номер " + playerByIdOrder(p));
        return;
      }
      if (S.boardTool === "number" || S.boardTool === "nade") {
        e.preventDefault();
        pushHist(t, b);
        b.drawings = b.drawings || [];
        if (S.boardTool === "number") {
          const next = nextNumber(b);
          const d = { id: uid("d"), type: "number", x: pt.x, y: pt.y, text: String(next), color: S.boardColor, w: S.boardWidth };
          b.drawings.push(d);
          S.boardSel = { id: d.id };
        } else {
          const d = { id: uid("d"), type: "nade", kind: S.boardNade, x: pt.x, y: pt.y, color: S.boardColor, w: S.boardWidth, label: String(nadeCount(b) + 1) };
          b.drawings.push(d);
          S.boardSel = { id: d.id };
        }
        boardCommit(t, b);
        return;
      }
      if (S.boardTool === "text") {
        e.preventDefault();
        askBoardText("text", (val) => {
          pushHist(t, b);
          b.drawings = b.drawings || [];
          const d = { id: uid("d"), type: "text", x: pt.x, y: pt.y, text: val, color: S.boardColor, w: S.boardWidth };
          b.drawings.push(d);
          S.boardSel = { id: d.id };
          boardCommit(t, b);
        }, "");
        return;
      }
      if (S.boardTool === "eraser") {
        e.preventDefault();
        const victim = (drawEl && drawEl.dataset.draw) || (markEl && markEl.dataset.marker);
        if (!victim) return;
        S.boardSel = { id: victim };
        boardDeleteSel(t, b);
        return;
      }
      // 5) выделение/перетаскивание
      if (markEl) {
        e.preventDefault();
        S.boardSel = { id: markEl.dataset.marker };
        startMarkerDrag(e, svg, t, b, markEl);
        return;
      }
      if (drawEl) {
        e.preventDefault();
        S.boardSel = { id: drawEl.dataset.draw };
        startDrawDrag(e, svg, t, b, drawEl);
        return;
      }
      if (S.boardSel) { S.boardSel = null; repaintBoard(t, b); }
    });
  }
  function nextNumber(b) {
    let max = 0;
    (b.drawings || []).forEach((d) => { if (d.type === "number" && +d.text > max) max = +d.text; });
    return max + 1;
  }
  function nadeCount(b) {
    return (b.drawings || []).filter((d) => d.type === "nade").length +
      (b.markers || []).filter((m) => m.kind === "smoke" || m.kind === "molly" || m.kind === "flash" || m.kind === "he").length;
  }
  function askBoardText(type, cb, preset) {
    openSheet(type === "number" ? "Номер" : "Подпись",
      fld(type === "number" ? "Число 1–99" : "Текст (до 26 знаков)",
        '<input id="btVal" maxlength="' + (type === "number" ? 2 : 26) + '" ' + (type === "number" ? 'inputmode="numeric"' : "") +
        ' value="' + esc(preset || "") + '">'),
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn" data-ok type="button">Поставить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = () => {
      let v = $("#btVal").value.trim();
      if (type === "number") {
        v = v.replace(/\D/g, "").slice(0, 2);
        if (!v || +v < 1) return;
      } else if (!v) return;
      else v = v.slice(0, 26);
      closeSheet();
      cb(v);
    };
    $("#btVal").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("[data-ok]").onclick(); } };
    setTimeout(() => { const el = $("#btVal"); if (el) el.focus(); }, 50);
  }
  function dragLoop(move, up) {
    S.boardBusy = true;
    window.addEventListener("pointermove", move, { passive: false });
    const end = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      S.boardBusy = false;
      up(e);
    };
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }
  function startMarkerDrag(e, svg, t, b, el) {
    const mk = (b.markers || []).filter((x) => x.id === el.dataset.marker)[0];
    if (!mk) { repaintBoard(t, b); return; }
    const origin = { x: mk.x, y: mk.y };
    let moved = false;
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const p = svgPoint(svg, ev);
      if (Math.abs(p.x - origin.x) < 0.2 && Math.abs(p.y - origin.y) < 0.2 && !moved) return;
      if (!moved) { moved = true; pushHist(t, b); }
      mk.x = r1(p.x); mk.y = r1(p.y);
      el.setAttribute("transform", "translate(" + mk.x + "," + mk.y + ")");
      followAnchors(b, mk.id);
      refreshArrowPaths(svg, b, mk.id);
    };
    dragLoop(move, () => {
      if (!moved) return;
      boardCommit(t, b);
    });
  }
  /** Быстро перекрасить только те стрелки, что привязаны к токену. */
  function refreshArrowPaths(svg, b, mkId) {
    (b.drawings || []).forEach((d) => {
      if ((d.type !== "arrow" && d.type !== "line") || (d.a1 !== mkId && d.a2 !== mkId)) return;
      const g = svg.querySelector('[data-draw="' + d.id + '"]');
      if (g) paintShape(g, d);
    });
  }
  function paintShape(g, d) {
    const p = arrowPathD(d);
    ["hit", "vis", "halo"].forEach((k) => {
      const el = g.querySelector(".shape." + k);
      if (el) el.setAttribute("d", p);
    });
    const heads = g.querySelectorAll(".ahead");
    if (heads.length) {
      const c = bendPoint(d);
      heads[0].setAttribute("d", triPath(d.x2, d.y2, c.x, c.y, headSize(d)));
      if (heads[1]) heads[1].setAttribute("d", triPath(d.x1, d.y1, c.x, c.y, headSize(d)));
    }
  }
  function startDrawDrag(e, svg, t, b, el) {
    const d = (b.drawings || []).filter((x) => x.id === el.dataset.draw)[0];
    if (!d) { repaintBoard(t, b); return; }
    const start = svgPoint(svg, e);
    const orig = { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, x: d.x, y: d.y, points: (d.points || []).slice() };
    let moved = false;
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const p = svgPoint(svg, ev);
      const dx = p.x - start.x, dy = p.y - start.y;
      if (!moved) {
        if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return;
        moved = true;
        pushHist(t, b);
      }
      if (d.type === "arrow" || d.type === "line") {
        d.x1 = r1(clamp100(orig.x1 + dx)); d.y1 = r1(clamp100(orig.y1 + dy));
        d.x2 = r1(clamp100(orig.x2 + dx)); d.y2 = r1(clamp100(orig.y2 + dy));
        paintShape(el, d);
      } else if (d.type === "pen") {
        d.points = (orig.points || []).map((q) => [r1(clamp100(q[0] + dx)), r1(clamp100(q[1] + dy))]);
        applyLiveOffsets(el, d);
      } else if (d.type === "zone") {
        d.x = r1(clamp100(orig.x + dx)); d.y = r1(clamp100(orig.y + dy));
        applyLiveOffsets(el, d);
      } else {
        d.x = r1(clamp100(orig.x + dx)); d.y = r1(clamp100(orig.y + dy));
        el.setAttribute("transform", "translate(" + d.x + "," + d.y + ")");
      }
    };
    dragLoop(move, () => {
      if (!moved) return;
      if (d.type === "arrow" || d.type === "line") attachAnchors(b, d);
      boardCommit(t, b);
    });
  }
  function startHandleDrag(e, svg, t, b, which) {
    const sel = S.boardSel;
    const d = (b.drawings || []).filter((x) => x.id === sel.id)[0];
    if (!d) return;
    const g = svg.querySelector('[data-draw="' + d.id + '"]');
    let moved = false;
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const p = svgPoint(svg, ev);
      if (!moved) { moved = true; pushHist(t, b); }
      if (d.type === "zone") {
        d.rx = r1(Math.max(3, Math.abs(p.x - d.x)));
        d.ry = r1(Math.max(3, Math.abs(p.y - d.y)));
        if (g) ["zone-hit", "zone-vis", "zone-halo"].forEach((k) => {
          const el = g.querySelector("." + k);
          if (el) { el.setAttribute("rx", d.rx); el.setAttribute("ry", d.ry); }
        });
        return;
      }
      if (which === "b") {
        const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
        const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        d.bend = r1(Math.max(-32, Math.min(32, (((p.x - mx) * -dy + (p.y - my) * dx) / len) * 2)));
      } else if (which === "1") { d.x1 = p.x; d.y1 = p.y; d.a1 = null; }
      else { d.x2 = p.x; d.y2 = p.y; d.a2 = null; }
      if (g) paintShape(g, d);
    };
    dragLoop(move, () => {
      if (!moved) return;
      if (d.type !== "zone") attachAnchors(b, d);
      boardCommit(t, b);
    });
  }
  function startStroke(e, svg, t, b, start, type) {
    const NS = "http://www.w3.org/2000/svg";
    let preview = document.createElementNS(NS, "path");
    preview.setAttribute("class", "preview-line");
    preview.setAttribute("stroke", S.boardColor);
    preview.setAttribute("stroke-width", strokePx(S.boardWidth));
    svg.appendChild(preview);
    const pts = [[r1(start.x), r1(start.y)]];
    let end = start, zoneStart = start;
    const mkHead = (x2, y2, bx, by) => triPath(x2, y2, bx, by, headSize({ w: S.boardWidth }));
    const drawPreview = () => {
      if (type === "pen") {
        preview.setAttribute("d", "M" + pts.map((q) => q.join(" ")).join(" L"));
      } else if (type === "zone") {
        const cx = (zoneStart.x + end.x) / 2, cy = (zoneStart.y + end.y) / 2;
        const rx = Math.abs(end.x - zoneStart.x) / 2, ry = Math.abs(end.y - zoneStart.y) / 2;
        preview.setAttribute("d", "M" + r1(cx - rx) + " " + r1(cy) +
          " a" + r1(rx) + " " + r1(ry) + " 0 1 0 " + r1(rx * 2) + " 0 a" + r1(rx) + " " + r1(ry) + " 0 1 0 " + r1(-rx * 2) + " 0 Z");
      } else {
        preview.setAttribute("d", "M" + start.x + " " + start.y + " L" + end.x + " " + end.y + " " + mkHead(end.x, end.y, start.x, start.y));
      }
    };
    drawPreview();
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const p = svgPoint(svg, ev);
      if (type === "pen") {
        const last = pts[pts.length - 1];
        if (Math.sqrt((p.x - last[0]) * (p.x - last[0]) + (p.y - last[1]) * (p.y - last[1])) < 0.8) return;
        pts.push([r1(p.x), r1(p.y)]);
      } else {
        end = p;
      }
      drawPreview();
    };
    dragLoop(move, () => {
      preview.remove();
      b.drawings = b.drawings || [];
      if (type === "pen") {
        const clean = simplifyPts(pts, 0.45);
        if (clean.length < 2) return;
        const d = { id: uid("d"), type: "pen", points: clean, color: S.boardColor, w: S.boardWidth, dash: S.boardDash };
        pushHist(t, b);
        b.drawings.push(d);
        S.boardSel = { id: d.id };
      } else if (type === "zone") {
        const rx = Math.abs(end.x - zoneStart.x) / 2, ry = Math.abs(end.y - zoneStart.y) / 2;
        if (rx < 2 && ry < 2) return;
        const d = {
          id: uid("d"), type: "zone", x: r1((zoneStart.x + end.x) / 2), y: r1((zoneStart.y + end.y) / 2),
          rx: r1(Math.max(3, rx)), ry: r1(Math.max(3, ry)), color: S.boardColor, w: S.boardWidth,
        };
        pushHist(t, b);
        b.drawings.push(d);
        S.boardSel = { id: d.id };
      } else {
        if (Math.sqrt((end.x - start.x) * (end.x - start.x) + (end.y - start.y) * (end.y - start.y)) < 1.6) return;
        const d = {
          id: uid("d"), type, x1: r1(start.x), y1: r1(start.y), x2: r1(end.x), y2: r1(end.y),
          bend: 0, color: S.boardColor, w: S.boardWidth, dash: S.boardDash, head: type === "arrow" ? S.boardHead : null,
        };
        attachAnchors(b, d);
        pushHist(t, b);
        b.drawings.push(d);
        S.boardSel = { id: d.id };
      }
      boardCommit(t, b);
    });
  }
  /** Убираем «лесенку» от пальца: не даём обводке разрастись до сотен точек. */
  function simplifyPts(pts, tol) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], p = pts[i], n = pts[i + 1];
      const cross = Math.abs((p[0] - a[0]) * (n[1] - a[1]) - (p[1] - a[1]) * (n[0] - a[0]));
      const len = Math.sqrt((n[0] - a[0]) * (n[0] - a[0]) + (n[1] - a[1]) * (n[1] - a[1])) || 1;
      if (cross / len > tol || i === pts.length - 2) out.push(p);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* --- шторка настроек схемы --- */
  function sheetBoardEdit(t, b, isNew) {
    openSheet("Схема",
      fld("Заголовок", '<input id="bdTitle" maxlength="60" value="' + esc(b.title || "Схема") + '">') +
      fld("Свой фон (ссылка, пусто = радар карты)", '<input id="bdBg" maxlength="500" value="' + esc(b.bg || "") + '" placeholder="https://…">') +
      '<div class="btnrow"><button class="btn ghost tiny" data-bdbg type="button">Загрузить фон из файла</button>' +
      '<input type="file" accept="image/*" hidden data-bdbgfile></div>' +
      '<p class="muted tiny">Файл встраивается прямо в схему — видят все. Ссылка — если картинка уже лежит в сети.</p>' +
      '<div class="divider"></div>' +
      '<p class="muted tiny">Как рисовать: выбери инструмент и тяни пальцем мышкой. ' +
      "Стрелка, оконченная у токена игрока, привязывается к нему и едет вместе с ним. " +
      'Горячие клавиши: V, A, L, P, Z, N, T, G, E · Ctrl+Z — отменить · Delete — удалить.</p>',
      '<button class="btn ghost" data-x type="button">Отмена</button>' +
      (isNew ? "" : '<button class="btn danger" data-clear type="button">Очистить</button>') +
      '<button class="btn" data-ok type="button">Сохранить</button>');
    $("[data-x]").onclick = closeSheet;
    const clr = $("[data-clear]");
    if (clr) clr.onclick = () => confirmDlg("Очистить схему?", () => {
      pushHist(t, b);
      b.markers = []; b.drawings = [];
      const blocks = clone(t.blocks || []);
      const i = blocks.findIndex((x) => x.id === b.id);
      if (i >= 0) { blocks[i] = clone(b); saveBlocks(t, blocks, null).then(() => closeSheet()); }
    });
    const upl = $("[data-bdbg]"), uplFile = $("[data-bdbgfile]");
    if (upl && uplFile) {
      upl.onclick = () => uplFile.click();
      uplFile.onchange = async () => {
        const file = uplFile.files && uplFile.files[0];
        if (!file) return;
        saveState("saving");
        try {
          const up = await DB.adapter.uploadImage(DB.team.id, file);
          const url = await shrinkDataUrl(up.url, 1200, 0.72);
          const target = $("#bdBg");
          if (target) target.value = url;
          saveState("saved");
          toast("Фон подставлен — нажмите «Сохранить»", "ok");
        } catch (err2x) { saveState(""); toast((err2x && err2x.message) || "Не загрузилось", "warn"); }
      };
    }
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

  /* ---------- /board block ---------- */

  /* ---------- players ---------- */
  /* ---------- чат команды ---------- */
  let chatNoticeMode = false;
  function viewChat() {
    const view = $("#view");
    const me = DB.actorName();
    const msgs = (DB.cache.messages || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const notice = msgs.slice().reverse().find((x) => x.kind === "notice");
    let html = '<div class="' + rcls("pagehead") + '"><div><h1>Чат команды</h1>' +
      '<p class="sub">Сообщения видят только участники команды' + (DB.mode() === "cloud" ? " · синхронизация в реальном времени" : " · локальный режим") + "</p></div></div>";
    if (notice) {
      html += '<div class="' + rcls("noticebanner") + '">' + ic("mega") + "<div><b>Объявление · " + esc(notice.author || "Капитан") + "</b>" +
        esc(notice.text) + "<small>" + fmtTime(notice.ts) + "</small></div></div>";
    }
    html += '<div class="chatlist" id="chatList">';
    if (!msgs.length) {
      html += '<div class="' + rcls("sec") + '"><div class="sec-pad"><div class="empty">Сообщений пока нет. Напишите первое — команда увидит его сразу.</div></div></div>';
    }
    msgs.forEach((m) => {
      const mine = m.author === me;
      const canDel = isCap() || mine;
      html += '<div class="' + rcls("msg" + (mine ? " me" : "") + (m.kind === "notice" ? " notice" : "")) + '">' +
        '<div class="mhead"><b>' + esc(m.author || "—") + "</b><time>" + fmtTime(m.ts) + "</time>" +
        (canDel ? '<button class="mdel" data-mdel="' + esc(m.id) + '" type="button" title="Удалить">' + ic("trash") + "</button>" : "") +
        "</div>" + '<div class="mtext">' + esc(m.text) + "</div></div>";
    });
    html += "</div>";
    html += '<form class="chatbar" id="chatForm">' +
      (isCap() ? '<button class="toolbtn sm' + (chatNoticeMode ? " on" : "") + '" data-notice type="button" title="Объявление от капитана">' + ic("mega") + "</button>" : "") +
      '<input id="chatText" maxlength="500" placeholder="' + (chatNoticeMode ? "Текст объявления…" : "Сообщение команде…") + '" autocomplete="off">' +
      '<button class="btn" data-send type="submit">' + ic("send") + "<span>Отправить</span></button></form>";
    view.innerHTML = html;
    const list = $("#chatList", view);
    if (list) list.scrollTop = list.scrollHeight;
    const nf = $("[data-notice]", view);
    if (nf) nf.onclick = () => { chatNoticeMode = !chatNoticeMode; viewChat(); const inp = $("#chatText"); if (inp) inp.focus(); };
    $("#chatForm", view).onsubmit = (e) => {
      e.preventDefault();
      const inp = $("#chatText", view);
      const text = String(inp.value || "").trim();
      if (!text) return;
      inp.value = "";
      DB.save("messages", {
        id: uid("ms"), author: me, authorName: me,
        kind: chatNoticeMode && isCap() ? "notice" : "msg",
        text, ts: Date.now(),
      }).catch((er) => toast((er && er.message) || "Не отправилось", "warn"));
      if (chatNoticeMode) { chatNoticeMode = false; }
    };
    $$("[data-mdel]", view).forEach((b) => {
      b.onclick = () => DB.del("messages", b.dataset.mdel).catch((er) => toast((er && er.message) || "Не удалилось", "warn"));
    });
    window.scrollTo(0, document.body.scrollHeight);
  }

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
        esc((p.positions || []).join(" · ") || "—") + "</td>" + (isCap() ? '<td><button class="menubtn" data-pmenu="' + p.id + '" type="button" title="Действия">' + ic("dots") + '</button></td>' : "") + "</tr>";
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
    let html = '<a class="backlink" href="#/players">' + ic("back") + ' Игроки</a><div class="' + rcls("pagehead") + '"><div><h1>' + esc(p.name) +
      (isMe ? ' <span class="badge acc">это вы</span>' : "") + "</h1>" +
      '<p class="sub">' + esc([p.role || null, (p.positions || []).join(" / ") || null].filter(Boolean).join(" · ") || "Игрок") + "</p></div>" +
      '<div class="actions"><button class="starbtn' + (DB.isFav("player", p.id) ? " on" : "") + '" data-fav type="button" title="В избранное">' + ic("star") + '</button>' +
      (isCap() ? '<button class="menubtn" data-pm type="button" title="Действия">' + ic("dots") + '</button>' : "") + "</div></div>";
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
        esc(r.tactic.name + (m ? " · " + m.name : "")) + "</small></span><span class=\"row-arrow\">" + ic("chevron") + "</span></a>";
    });
    html += "</div></div>";
    // Гранаты
    html += '<div class="sec"><div class="sec-head"><h2>Гранаты · ' + inv.nades.length + "</h2></div><div class=\"sec-body\">";
    if (!inv.nades.length) html += '<div class="empty">Гранаты не назначены.</div>';
    inv.nades.forEach((r) => {
      html += '<a class="row" href="#/tactic/' + r.tactic.id + '"><span class="row-main"><b>' + (NADE_ICON[r.item.kind] || "") + " " + esc(r.item.name || nadeName(r.item.kind)) +
        "</b><small>" + esc(r.tactic.name) + "</small></span><span class=\"row-arrow\">" + ic("chevron") + "</span></a>";
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
        esc(r.tactic.name) + (r.item.note ? " · " + r.item.note : "") + "</small></span><span class=\"row-arrow\">" + ic("chevron") + "</span></a>";
    });
    html += "</div></div>";
    html += '<div class="sec"><div class="sec-head"><h2>Мои гранаты · ' + inv.nades.length + "</h2></div><div class=\"sec-body\">";
    if (!inv.nades.length) html += '<div class="empty">Пока нет.</div>';
    inv.nades.slice(0, 20).forEach((r) => {
      html += '<a class="row" href="#/tactic/' + r.tactic.id + '"><span class="row-main"><b>' + (NADE_ICON[r.item.kind] || "") + " " + esc(r.item.name || nadeName(r.item.kind)) +
        "</b><small>" + esc(r.tactic.name + (((r.item.steps || []).length) ? " · " + r.item.steps.length + " шаг." : "")) + "</small></span><span class=\"row-arrow\">" + ic("chevron") + "</span></a>";
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
  const MAT_ICON = { image: "image", video: "video", gif: "film", link: "link", note: "note", pdf: "file", demo: "save" };
  function viewMaterials() {
    const view = $("#view");
    const f = S.mfilter;
    const types = ["image", "video", "gif", "link", "note", "pdf", "demo"].filter((tp) => DB.cache.materials.some((m) => m.type === tp));
    let html = '<div class="pagehead"><div><h1>Материалы</h1><p class="sub">' + DB.cache.materials.length + " шт.</p></div>" +
      (isCap() ? '<div class="actions"><button class="btn tiny" data-addm type="button">+ Материал</button></div>' : "") + "</div>";
    if (types.length > 1) {
      html += '<div class="chiprow"><button class="chip' + (!f.type ? " on" : "") + '" data-f="type:" type="button">Все</button>';
      types.forEach((tp) => {
        html += '<button class="chip' + (f.type === tp ? " on" : "") + '" data-f="type:' + tp + '" type="button">' + ic(MAT_ICON[tp] || "file") + " " + esc(matTypeName(tp)) + "</button>";
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
      '<span class="matic">' + ic(MAT_ICON[m.type] || "link") + '</span><span style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.title) +
      "</b>" + (map || m.description ? "<small class=\"muted\" style=\"display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">" + esc([map ? map.name : null, m.description || null].filter(Boolean).join(" · ")) + "</small>" : "") + "</span></button>" +
      '<span class="row-side"><button class="starbtn' + (DB.isFav("material", m.id) ? " on" : "") + '" data-mfav="' + m.id + '" type="button" title="В избранное">' + ic("star") + "</button>" +
      (isCap() ? '<button class="menubtn" data-mmenu="' + m.id + '" type="button" title="Действия">' + ic("dots") + "</button>" : "") + "</span></div>";
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

    // Фото на входе
    html += '<div class="sec"><div class="sec-head"><h2>Фото на входе</h2><button class="more" data-authbg type="button">Настроить</button></div>' +
      '<div class="sec-pad"><p class="muted tiny">' +
      (teamAuthBg() ? "Стоит общее фото команды — его видят все при входе, меню затемнено и размыто поверх."
        : "Общего фото нет: каждый видит стандартное (или своё, если поставил локально).") +
      "</p>" +
      '<div class="btnrow"><button class="btn ghost tiny" data-authbgpick type="button">Загрузить для всех</button>' +
      '<button class="btn ghost tiny" data-authbgclear type="button"' + (teamAuthBg() ? "" : " disabled") + ">Убрать общее</button></div></div></div>";

    // Быстрые действия
    html += '<div class="sec"><div class="sec-head"><h2>Быстрое создание</h2></div><div class="sec-pad"><div class="btnrow" style="margin-top:0">' +
      '<button class="btn ghost tiny" data-q="player" type="button">+ Игрок</button>' +
      '<button class="btn ghost tiny" data-q="map" type="button">+ Карта</button>' +
      '<button class="btn ghost tiny" data-q="tactic" type="button">+ Тактика</button>' +
      '<button class="btn ghost tiny" data-q="material" type="button">+ Материал</button></div></div></div>';

    // Шаблоны
    html += '<div class="sec"><div class="sec-head"><h2>Шаблоны тактик · ' + DB.cache.templates.length + "</h2></div><div class=\"sec-body\">";
    if (!DB.cache.templates.length) html += '<div class="empty">Шаблонов нет. Сохраните тактику как шаблон из её меню.</div>';
    DB.cache.templates.forEach((tp) => {
      html += '<div class="row" style="cursor:default"><span class="row-main"><b>' + esc(tp.name) + "</b><small>" + (tp.blocks || []).length + " бл.</small></span>" +
        '<span class="row-side"><button class="menubtn" data-tplmenu="' + tp.id + '" type="button" title="Действия">' + ic("dots") + '</button></span></div>';
    });
    html += "</div></div>";

    // Облако
    html += '<div class="sec"><div class="sec-head"><h2>Облако</h2></div><div class="sec-pad">' +
      (cloud
        ? '<p class="muted tiny">Синхронизация включена. Правки капитана прилетают игрокам сами.</p>'
        : '<p class="muted tiny">Облако не подключено: каждый видит только своё устройство. Подключите Supabase по инструкции SETUP.md ' +
          "(файл supabase-config.js), либо введите ключи ниже для проверки на этом устройстве.</p>") +
      '<div class="btnrow"><button class="btn ghost tiny" data-cloud type="button">' + (cloud ? "Проверить / сменить ключи" : "Подключить облако") + "</button>" +
      '<button class="btn ghost tiny" data-cloudcheck type="button">Проверить связь</button></div></div></div>';

    // Журнал
    html += '<div class="sec"><div class="sec-head"><h2>Журнал изменений</h2></div><div class="sec-body">';
    const feed = DB.cache.activity.slice(0, 30);
    if (!feed.length) html += '<div class="empty">Пока тихо.</div>';
    feed.forEach((a) => { html += activityRowHTML(a); });
    html += "</div></div>";

    // Данные команды: резервная копия и перенос между проектами
    html += '<div class="sec"><div class="sec-head"><h2>Данные команды</h2></div><div class="sec-pad">' +
      '<p class="muted tiny">Резервная копия: файл со всеми картами, тактиками, составом и материалами. PIN в файл не попадают.</p>' +
      '<div class="btnrow"><button class="btn ghost tiny" data-export type="button">Экспорт в файл</button>' +
      '<button class="btn ghost tiny" data-import type="button">Загрузить из файла</button></div>' +
      '<input type="file" accept="application/json,.json" hidden data-impfile></div></div>';

    // Сброс содержимого: капитан начинает с чистого листа
    html += '<div class="sec"><div class="sec-head"><h2>Сброс содержимого</h2></div><div class="sec-pad">' +
      '<p class="muted tiny">Удаляет выбранные данные команды у всех участников. Карты с фото и названиями остаются — ' +
      "схемы рисуются заново с нуля. Действие необратимо: сначала сделайте экспорт.</p>" +
      '<div class="btnrow"><button class="btn danger tiny" data-purge type="button">' + ic("trash") + " Удалить данные команды</button></div></div></div>";

    // Опасная зона
    html += '<div class="sec"><div class="sec-head"><h2>Опасная зона</h2></div><div class="sec-pad"><div class="btnrow" style="margin-top:0">' +
      '<button class="btn ghost tiny" data-logout type="button">' + ic("logout") + " Выйти из команды</button>" +
      '<button class="btn danger tiny" data-delteam type="button">Удалить команду</button></div></div></div>';

    view.innerHTML = html;
    $$("[data-act]", view).forEach((b) => {
      b.onclick = () => { const [k, id] = b.dataset.act.split(":"); if (k && id) openRef(k, id); };
    });
    $("[data-teamedit]", view).onclick = sheetTeamEdit;
    $("[data-authbg]", view).onclick = sheetAuthBg;
    $("[data-authbgpick]", view).onclick = () => {
      pickAuthBg({
        maxW: 1600, quality: 0.72,
        onUrl: async (url) => { const ok = await pushAuthBgToTeam({ src: url }); if (ok) render(); },
      });
    };
    const bgClear = $("[data-authbgclear]", view);
    if (bgClear) bgClear.onclick = async () => {
      saveState("saving");
      try {
        DB.team = await DB.adapter.updateTeam(DB.team.id, { settings: { authBg: null } });
        DB.persistSession();
        await DB.log("убрал общее фото входа", null);
        saveState("saved");
        render();
        toast("Общее фото убрано", "ok");
      } catch (e) { saveState(""); toast((e && e.message) || "Не сохранилось", "warn"); }
    };
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
    $("[data-cloudcheck]", view).onclick = sheetCloudCheck;
    $("[data-export]", view).onclick = exportTeam;
    $("[data-import]", view).onclick = () => $("[data-impfile]", view).click();
    $("[data-impfile]", view).onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importTeam(f);
    };
    $("[data-purge]", view).onclick = sheetPurge;
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

  /** Капитанский сброс: убираем содержимое, карты с фото остаются для рисования с нуля. */
  function sheetPurge() {
    if (!isCap()) return;
    const opts = [
      { t: "tactics", n: "Тактики и схемы", on: true },
      { t: "materials", n: "Материалы", on: true },
      { t: "templates", n: "Шаблоны тактик", on: true },
      { t: "messages", n: "Чат команды", on: true },
      { t: "activity", n: "Журнал изменений", on: true },
      { t: "players", n: "Состав игроков", on: false },
    ];
    openSheet("Сброс содержимого команды",
      '<p class="muted tiny" style="margin-top:0">Карты остаются: фото, названия и радары не удаляются — схемы рисуются заново.</p>' +
      opts.map((o) => '<label class="checkrow"><input type="checkbox" data-pt="' + o.t + '"' + (o.on ? " checked" : "") + ">" +
        "<span>" + o.n + " · " + (DB.cache[o.t] || []).length + " шт.</span></label>").join("") +
      '<div class="form-error" id="pgErr"></div>',
      '<button class="btn ghost" data-x type="button">Отмена</button><button class="btn danger" data-ok type="button">Удалить</button>');
    $("[data-x]").onclick = closeSheet;
    $("[data-ok]").onclick = () => {
      const tables = $$("[data-pt]").filter((c) => c.checked).map((c) => c.dataset.pt);
      if (!tables.length) { $("#pgErr").textContent = "Выберите, что удалить"; return; }
      const total = tables.reduce((n, t) => n + (DB.cache[t] || []).length, 0);
      confirmDlg("Удалить " + total + " записей у всех участников?", async () => {
        saveState("saving");
        try {
          await DB.purge(tables);
          if (tables.indexOf("activity") < 0) await DB.log("очистил содержимое команды", null);
          saveState("saved");
          closeSheet();
          render();
          toast("Готово: карты на месте, содержимое очищено", "ok");
        } catch (e) { saveState(""); toast((e && e.message) || "Не удалилось", "warn"); }
      });
    };
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
      fld("Anon key", '<input id="clKey" maxlength="500" value="' + esc((cfg && cfg.anonKey) || "") + '" placeholder="eyJ…">') +
      '<div class="form-error" id="clErr"></div>',
      '<button class="btn ghost" data-x type="button">Отмена</button>' +
      (cfg ? '<button class="btn danger" data-clr type="button">Сбросить</button>' : "") +
      '<button class="btn" data-ok type="button">Подключить</button>');
    $("[data-x]").onclick = closeSheet;
    const clr = $("[data-clr]");
    if (clr) clr.onclick = () => { DB.clearCloudOverride(); location.reload(); };
    $("[data-ok]").onclick = () => {
      const url = $("#clUrl").value.trim(), anonKey = $("#clKey").value.trim();
      const err = $("#clErr");
      if (!url || !anonKey) { err.textContent = "Заполните оба поля"; return; }
      if (DB.keyRole(anonKey) === "service_role") {
        err.textContent = "Это service_role key — секретный, он обходит защиту базы. Нужен anon public key из Settings → API.";
        return;
      }
      DB.setCloudOverride({ url, anonKey });
      location.reload();
    };
  }

  /* Проверка связи: пошагово показывает, что подключено, а что нет. */
  async function sheetCloudCheck() {
    openSheet("Проверка связи", '<div class="loading" style="min-height:120px"><span class="loading-dot"></span>Проверяем…</div>',
      '<button class="btn ghost" data-x type="button">Закрыть</button>');
    $("[data-x]").onclick = closeSheet;
    let rows = [];
    try { rows = await DB.diagnose(); }
    catch (e) { rows = [{ name: "Проверка", ok: false, detail: (e && e.message) || "сбой", fix: "Обновите страницу и попробуйте снова." }]; }
    const box = $("#sheetRoot .sheet-body");
    if (!box) return; // шторку закрыли, пока шла проверка
    const bad = rows.filter((r) => !r.ok).length;
    box.innerHTML = rows.map((r) =>
      '<div class="row" style="cursor:default"><span class="row-main"><b><span class="diagic ' + (r.ok ? "ok" : "bad") + '">' + ic(r.ok ? "check" : "x") + "</span>" + esc(r.name) + "</b>" +
      (r.detail ? "<small>" + esc(r.detail) + "</small>" : "") + "</span></div>" +
      (!r.ok && r.fix ? '<p class="muted tiny" style="margin:2px 0 10px">' + esc(r.fix) + "</p>" : "")
    ).join("") +
      '<p class="muted tiny" style="margin:12px 0">' + (bad
        ? "Не всё гладко: пункты с отметкой «не пройдено» нужно исправить — под каждым написано что делать."
        : "Всё подключено: правки капитана прилетают игрокам сами, без перезагрузки.") + "</p>";
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
    if (evt.type === "team") { syncAuthBgFromTeam(); render(false); return; }
    if (evt.type === "favs") { render(); return; }
    if (evt.type === "data") {
      DB.refresh(evt.table === "*" ? "*" : evt.table).then(() => {
        if (!DB.team) return;
        // Пока капитан ведёт линию, страницу не пересобираем: иначе жест срывается,
        // а своя правка схемы уже отрисована локально (repaintBoard).
        if (S.boardBusy && (evt.table === "tactics" || evt.table === "*")) {
          if (evt.origin === "remote") S.dirtyRemote = true;
          rebindBoards(); // кэш обновился — переводим обработчики доски на свежие объекты
          return;
        }
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
    // Фон входа включаем сразу, до DB.init: иначе перед экраном входа мелькает тёмный экран.
    document.body.classList.toggle("auth-mode", !DB.team);
    applyAuthScene();
    bindAuthSceneFx();
    $("#searchBtn").onclick = () => { if (DB.team) openSearch(); };
    window.addEventListener("hashchange", route);
    // Закрываем вкладку с несохранённой схемой — предупреждаем и пытаемся успеть сохранить.
    window.addEventListener("pagehide", () => { flushDrafts(); });
    window.addEventListener("beforeunload", (e) => {
      if (draftIds().length) { e.preventDefault(); e.returnValue = ""; }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (S.boardBig) { S.boardBig = null; S.boardWait = null; S.boardFrom = null; render(); return; }
        closeMenus();
        if (modalOpen()) closeModal(); else if (sheetOpen()) closeSheet(); else closeViewer();
      }
    });
    DB.on(onDbEvent);
    DB.draftGuard = () => draftIds().length > 0;
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
