/* ============================================================
   PBBoard — тактическая доска поверх радара карты.
   Центр экрана: карта. Слева (на телефоне — снизу): инструменты.
   Справа: свойства выбранного элемента.

   Производительность: страница не пересобирается на каждое движение.
   Во время перетаскивания меняются только атрибуты нужных SVG-узлов,
   полная перерисовка — лишь на структурных изменениях (добавил/удалил/
   отменил). Зум и панорамирование — один transform на группу.
   ============================================================ */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const r1 = (v) => Math.round(v * 10) / 10;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clamp100 = (v) => clamp(v, -20, 120);
  const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
  const uid = (p) => (p || "x") + Math.random().toString(36).slice(2, 10);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ""));

  /* ---------- палитра и инструменты ---------- */
  const COLORS = [
    { c: "#f0b429", n: "Жёлтый" }, { c: "#ff6b5e", n: "Красный" },
    { c: "#5aa9ff", n: "Синий" }, { c: "#4fd18b", n: "Зелёный" },
    { c: "#b98cff", n: "Фиолетовый" }, { c: "#f2f5f8", n: "Белый" },
    { c: "#ff8ac2", n: "Розовый" }, { c: "#93a1b3", n: "Серый" },
  ];
  const WIDTHS = [{ w: 1, n: "Тонкая" }, { w: 2, n: "Обычная" }, { w: 3, n: "Толстая" }];
  const STROKE = { 1: 0.55, 2: 0.9, 3: 1.5 };
  const strokeW = (w) => STROKE[w] || STROKE[2];
  const ENEMY_COLOR = "#ff5a4d";

  const NADES = [
    { id: "smoke", icon: "smoke", label: "Смоук", key: "s", auto: "#9fb0c0" },
    { id: "molly", icon: "molly", label: "Молотов", key: "m", auto: "#ff7a59" },
    { id: "flash", icon: "flash", label: "Флешка", key: "f", auto: "#ffd166" },
    { id: "he", icon: "he", label: "ХЕ", key: "g", auto: "#c3ced9" },
    { id: "bomb", icon: "bomb", label: "Бомба", key: "b", auto: "#f0b429" },
  ];
  const nadeMeta = (id) => NADES.filter((n) => n.id === id)[0] ||
    { id: id, icon: "bomb", label: "Граната", auto: "#c3ced9" };

  const TOOLS = [
    { id: "select", icon: "cursor", label: "Выбор и перенос", key: "v", group: "nav" },
    { id: "pan", icon: "hand", label: "Двигать карту", key: "h", group: "nav" },
    { id: "player", icon: "user", label: "Игрок своей команды", key: "p", group: "unit" },
    { id: "enemy", icon: "enemy", label: "Противник", key: "x", group: "unit" },
    { id: "path", icon: "route", label: "Маршрут с точками остановки", key: "r", group: "draw" },
    { id: "arrow", icon: "arrow", label: "Стрелка движения", key: "a", group: "draw" },
    { id: "line", icon: "line", label: "Линия", key: "l", group: "draw" },
    { id: "zone", icon: "zone", label: "Зона", key: "z", group: "draw" },
    { id: "dot", icon: "dot", label: "Точка", key: "o", group: "draw" },
    { id: "smoke", icon: "smoke", label: "Смоук", key: "s", group: "nade" },
    { id: "molly", icon: "molly", label: "Молотов", key: "m", group: "nade" },
    { id: "flash", icon: "flash", label: "Флешка", key: "f", group: "nade" },
    { id: "he", icon: "he", label: "ХЕ", key: "g", group: "nade" },
    { id: "bomb", icon: "bomb", label: "Бомба", key: "b", group: "nade" },
    { id: "text", icon: "text", label: "Текст", key: "t", group: "misc" },
    { id: "eraser", icon: "eraser", label: "Удалить элемент", key: "e", group: "misc" },
  ];
  /* Компактная нижняя панель телефона: самое нужное + «Ещё». */
  const MOBILE_TOOLS = ["select", "player", "path", "smoke", "text"];
  const DRAW_TYPES = ["arrow", "line", "pen", "zone", "path"];
  const NADE_IDS = NADES.map((n) => n.id);

  const TYPE_LABEL = {
    arrow: "Стрелка", line: "Линия", pen: "Рисунок", zone: "Зона", path: "Маршрут",
    nade: "Граната", number: "Номер", text: "Текст", point: "Подпись",
    player: "Игрок", enemy: "Противник", dot: "Точка",
    smoke: "Смоук", molly: "Молотов", flash: "Флешка", he: "ХЕ", decoy: "Обманка", bomb: "Бомба",
  };
  const typeLabel = (el) => {
    if (!el) return "";
    const t = el.type || el.kind;
    if (NADE_IDS.indexOf(t) >= 0 || t === "decoy") return nadeMeta(t).label;
    return TYPE_LABEL[t] || "Элемент";
  };

  /* ============================================================
     Создание доски
     ============================================================ */
  function create(host, opts) {
    opts = opts || {};
    const ic = opts.ic;
    const api = {};
    const b = opts.block;
    const editable = !!opts.editable;

    /* --- состояние --- */
    const st = {
      tool: "select",
      sel: null,
      color: COLORS[0].c,
      w: 2,
      dash: false,
      head: "end",
      grid: false,
      snap: false,
      focus: null,          // игрок, на котором сфокусирована схема
      waitFan: false,       // режим «стрелки к точке»
      pendingPlayer: null,  // какого игрока ставить следующим
      pathDraft: null,      // точки маршрута, который ещё рисуется
      dirty: false,
      busy: false,
      big: false,
      k: 1, tx: 0, ty: 0,
    };
    const hist = { u: [], r: [] };
    const pointers = new Map();
    let pinch = null;
    let rafPending = false;
    let pendingMove = null;

    if (b.markers == null) b.markers = [];
    if (b.drawings == null) b.drawings = [];
    if (!b.markerStyle) b.markerStyle = "number";
    if (b.view && typeof b.view === "object") {
      st.k = clamp(+b.view.k || 1, 0.6, 8);
      st.tx = +b.view.tx || 0;
      st.ty = +b.view.ty || 0;
    }

    const elements = () => b.drawings.concat(b.markers);
    const findEl = (id) => {
      if (!id) return null;
      return b.drawings.find((d) => d.id === id) || b.markers.find((m) => m.id === id) || null;
    };
    const nadeLabel = (kind) => (opts.nadeLabel ? opts.nadeLabel(kind) : nadeMeta(kind).label);
    const players = () => opts.players || [];
    const playerById = (id) => players().find((p) => p.id === id) || null;
    const playerIndex = (p) => players().indexOf(p) + 1;

    /* ============================================================
       Разметка доски
       ============================================================ */
    function mount() {
      host.innerHTML = "";
      host.classList.add("tb-host");

      const root = document.createElement("div");
      root.className = "tb";
      root.innerHTML =
        '<div class="tb-main">' +
          '<div class="tb-actions" data-role="actions"></div>' +
          '<div class="tb-stage" data-role="stage">' +
            '<svg class="tb-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" data-role="svg">' +
              '<g class="tb-vp" data-role="vp">' +
                (opts.bg ? '<image class="tb-map" href="' + esc(opts.bg) + '" xlink:href="' + esc(opts.bg) + '" x="0" y="0" width="100" height="100" preserveAspectRatio="none"/>' : "") +
                '<rect class="tb-nobg" x="0" y="0" width="100" height="100"' + (opts.bg ? ' fill="transparent"' : "") + "/>" +
                '<g class="tb-grid" data-role="grid" hidden></g>' +
                '<g class="tb-shapes" data-role="shapes"></g>' +
                '<g class="tb-marks" data-role="marks"></g>' +
                '<g class="tb-ui" data-role="ui"></g>' +
                '<g class="tb-preview" data-role="preview"></g>' +
              "</g>" +
            "</svg>" +
            '<div class="tb-zoom" data-role="zoom"></div>' +
            '<div class="tb-hint" data-role="hint" hidden></div>' +
          "</div>" +
        "</div>" +
        '<div class="tb-tools" data-role="tools"></div>' +
        '<div class="tb-mtools" data-role="mtools"></div>';
      host.appendChild(root);

      api.root = root;
      api.svg = $('[data-role="svg"]', root);
      api.vp = $('[data-role="vp"]', root);
      api.stage = $('[data-role="stage"]', root);
      api.gridG = $('[data-role="grid"]', root);
      api.shapesG = $('[data-role="shapes"]', root);
      api.marksG = $('[data-role="marks"]', root);
      api.uiG = $('[data-role="ui"]', root);
      api.previewG = $('[data-role="preview"]', root);

      /* Радар не загрузился (битая ссылка, протухший signed URL) — пробуем
         запасные фоны по цепи, а в конце честно говорим, что схема без подложки,
         вместо «чёрного экрана». */
      (function bindBgFallback() {
        const img = $(".tb-map", root);
        if (!img) return;
        img.addEventListener("error", function onErr() {
          const next = (opts.bgFallbacks || []).shift();
          if (!next) {
            img.removeEventListener("error", onErr);
            img.remove();
            hint("Радар карты не загрузился — схема рисуется без подложки. Капитан может сменить фон в «Изменить карту».");
            return;
          }
          img.setAttribute("href", next);
          try { img.setAttribute("xlink:href", next); } catch (e) {}
        });
      })();

      buildGrid();
      renderTools();
      renderActions();
      renderZoom();
      renderAll();
      bindStage();
      if (editable) bindKeys();
      applyFocus();
      return api;
    }

    function buildGrid() {
      let g = "";
      for (let i = 0; i <= 100; i += 5) {
        const major = i % 25 === 0;
        g += '<line x1="' + i + '" y1="0" x2="' + i + '" y2="100" class="' + (major ? "major" : "") + '"/>';
        g += '<line x1="0" y1="' + i + '" x2="100" y2="' + i + '" class="' + (major ? "major" : "") + '"/>';
      }
      api.gridG.innerHTML = g;
      api.gridG.hidden = !st.grid;
    }

    /* ---------- панель инструментов ---------- */
    function toolBtn(t, active) {
      return '<button class="tb-tool' + (active ? " on" : "") + '" type="button" data-tool="' + t.id +
        '" title="' + esc(t.label) + " · " + t.key.toUpperCase() + '" aria-label="' + esc(t.label) +
        '" aria-pressed="' + (active ? "true" : "false") + '">' + ic(t.icon) + "</button>";
    }
    function renderTools() {
      if (!editable) {
        $('[data-role="tools"]', api.root).innerHTML = "";
        $('[data-role="mtools"]', api.root).innerHTML = "";
        api.root.classList.add("tb-readonly");
        return;
      }
      const groups = ["nav", "unit", "draw", "nade", "misc"];
      let h = "";
      groups.forEach((g) => {
        const list = TOOLS.filter((t) => t.group === g);
        h += '<div class="tb-tgroup" role="group" aria-label="' + esc(g) + '">' +
          list.map((t) => toolBtn(t, st.tool === t.id)).join("") + "</div>";
      });
      $('[data-role="tools"]', api.root).innerHTML = h;

      /* телефон: компактная нижняя панель + «Ещё» */
      let m = MOBILE_TOOLS.map((id) => TOOLS.filter((t) => t.id === id)[0])
        .filter(Boolean).map((t) => toolBtn(t, st.tool === t.id)).join("");
      m += '<button class="tb-tool' + (st.tool && MOBILE_TOOLS.indexOf(st.tool) < 0 ? " on" : "") +
        '" type="button" data-moretools title="Ещё инструменты" aria-label="Ещё инструменты">' + ic("dots") + "</button>";
      $('[data-role="mtools"]', api.root).innerHTML = m;

      $$("[data-role=tools] [data-tool]", api.root).forEach((btn) => {
        btn.onclick = () => setTool(btn.dataset.tool);
      });
      $$("[data-role=mtools] [data-tool]", api.root).forEach((btn) => {
        btn.onclick = () => setTool(btn.dataset.tool);
      });
      const more = $("[data-moretools]", api.root);
      if (more) more.onclick = () => opts.onMoreTools && opts.onMoreTools(api);
    }

    /* ---------- быстрые действия (сверху) ---------- */
    function actBtn(icon, label, data, on, disabled) {
      return '<button class="tb-act' + (on ? " on" : "") + '" type="button" data-act="' + data +
        '" title="' + esc(label) + '" aria-label="' + esc(label) + '"' + (disabled ? " disabled" : "") + ">" +
        ic(icon) + "<span>" + esc(label) + "</span></button>";
    }
    function renderActions() {
      const bar = $('[data-role="actions"]', api.root);
      if (!bar) return;
      if (!editable) {
        bar.innerHTML = '<span class="tb-count">' + ic("layers") + " Элементов: " + elements().length + "</span>" +
          '<span class="tb-spacer"></span>' +
          actBtn("flag", "Расставить состав", "place", false, false) +
          actBtn(st.big ? "x" : "expand", st.big ? "Свернуть" : "На весь экран", "big", st.big, false);
      } else {
        bar.innerHTML =
          actBtn("undo", "Отменить (Ctrl+Z)", "undo", false, !hist.u.length) +
          actBtn("redo", "Повторить (Ctrl+Shift+Z)", "redo", false, !hist.r.length) +
          '<span class="tb-sep"></span>' +
          actBtn("flag", "Расставить 1–5 по спауну", "place", false, false) +
          actBtn("fan", "Маршруты всех к точке", "fan", st.waitFan, false) +
          actBtn("grid", "Сетка", "grid", st.grid, false) +
          '<span class="tb-sep"></span>' +
          actBtn("trash", "Очистить схему", "clear", false, false) +
          '<span class="tb-spacer"></span>' +
          '<span class="tb-savestate" data-role="savestate"></span>' +
          actBtn("save", "Сохранить (Ctrl+S)", "save", st.dirty, false) +
          '<span class="tb-sep"></span>' +
          actBtn(st.big ? "x" : "expand", st.big ? "Свернуть" : "На весь экран", "big", st.big, false);
      }
      $$("[data-act]", bar).forEach((btn) => {
        btn.onclick = () => doAction(btn.dataset.act);
      });
      paintSaveState();
    }
    function paintSaveState() {
      const el = $('[data-role="savestate"]', api.root);
      if (!el) return;
      el.className = "tb-savestate" + (st.dirty ? " dirty" : "");
      el.textContent = st.dirty ? "Есть несохранённые правки" : "";
    }

    function renderZoom() {
      const box = $('[data-role="zoom"]', api.root);
      if (!box) return;
      box.innerHTML =
        '<button class="tb-zbtn" type="button" data-zoom="out" title="Уменьшить" aria-label="Уменьшить">' + ic("zoomout") + "</button>" +
        '<button class="tb-zpct" type="button" data-zoom="reset" title="Сбросить масштаб">' + Math.round(st.k * 100) + "%</button>" +
        '<button class="tb-zbtn" type="button" data-zoom="in" title="Увеличить" aria-label="Увеличить">' + ic("zoomin") + "</button>" +
        '<button class="tb-zbtn" type="button" data-zoom="fit" title="Вписать карту" aria-label="Вписать карту">' + ic("fit") + "</button>";
      $$("[data-zoom]", box).forEach((btn) => {
        btn.onclick = () => {
          const z = btn.dataset.zoom;
          if (z === "in") zoomBy(1.25);
          else if (z === "out") zoomBy(1 / 1.25);
          else if (z === "reset") setView(1, 0, 0);
          else fit();
        };
      });
    }

    function hint(text) {
      const el = $('[data-role="hint"]', api.root);
      if (!el) return;
      if (!text) { el.hidden = true; el.textContent = ""; return; }
      el.hidden = false;
      el.innerHTML = ic("info") + "<span>" + esc(text) + "</span>";
    }

    /* ============================================================
       Отрисовка элементов
       ============================================================ */
    function elColor(el) {
      if (el.kind === "enemy") return ENEMY_COLOR;
      if (el.kind === "player") {
        const p = playerById(el.playerId);
        return isHex(p && p.color) ? p.color : (isHex(el.color) ? el.color : COLORS[0].c);
      }
      if (NADE_IDS.indexOf(el.kind || el.type) >= 0 || el.type === "nade" || el.kind === "decoy") {
        const kind = el.kind || "smoke";
        return isHex(el.color) && el.colorOverride ? el.color : nadeMeta(kind === "decoy" ? "he" : kind).auto;
      }
      return isHex(el.color) ? el.color : COLORS[0].c;
    }
    function textWidth(str, size) {
      return Math.min(46, Math.max(8, String(str).length * size * 0.62 + 3.2));
    }
    function bendPoint(d) {
      const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
      if (!d.bend) return { x: mx, y: my };
      const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: mx - (dy / len) * d.bend, y: my + (dx / len) * d.bend };
    }
    function shapePath(d) {
      if (!d.bend) return "M" + r1(d.x1) + " " + r1(d.y1) + " L" + r1(d.x2) + " " + r1(d.y2);
      const c = bendPoint(d);
      return "M" + r1(d.x1) + " " + r1(d.y1) + " Q" + r1(c.x) + " " + r1(c.y) + " " + r1(d.x2) + " " + r1(d.y2);
    }
    function triPath(x, y, ax, ay, size) {
      const a = Math.atan2(y - ay, x - ax);
      const sp = 0.44;
      return "M" + r1(x) + " " + r1(y) +
        " L" + r1(x - size * Math.cos(a - sp)) + " " + r1(y - size * Math.sin(a - sp)) +
        " L" + r1(x - size * Math.cos(a + sp)) + " " + r1(y - size * Math.sin(a + sp)) + " Z";
    }
    const headSize = (d) => 1.5 + strokeW(d.w) * 1.15;
    const dashAttr = (d) => d.dash ? ' stroke-dasharray="' + r1(strokeW(d.w) * 2.4) + " " + r1(strokeW(d.w) * 1.6) + '"' : "";

    function pathPoints(d) {
      const pts = (d.pts && d.pts.length >= 2) ? d.pts : [[d.x1, d.y1], [d.x2, d.y2]];
      return pts;
    }
    function pathD(d) {
      const pts = pathPoints(d);
      if (pts.length === 2) return "M" + r1(pts[0][0]) + " " + r1(pts[0][1]) + " L" + r1(pts[1][0]) + " " + r1(pts[1][1]);
      // сглаженные углы: квадратичные кривые через середины отрезков
      let s = "M" + r1(pts[0][0]) + " " + r1(pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        s += " Q" + r1(pts[i][0]) + " " + r1(pts[i][1]) + " " + r1(mx) + " " + r1(my);
      }
      const last = pts[pts.length - 1];
      s += " L" + r1(last[0]) + " " + r1(last[1]);
      return s;
    }

    function shapeHTML(d) {
      const sel = st.sel === d.id;
      const c = elColor(d);
      const sw = r1(strokeW(d.w));
      const cls = "tb-el tb-shape" + (sel ? " sel" : "");
      const data = 'data-el="' + d.id + '"';
      if (d.type === "arrow" || d.type === "line") {
        const p = shapePath(d);
        let heads = "";
        if (d.type === "arrow") {
          const c2 = bendPoint(d);
          heads = '<path class="tb-head" fill="' + c + '" d="' + triPath(d.x2, d.y2, c2.x, c2.y, headSize(d)) + '"/>';
          if (d.head === "both") heads += '<path class="tb-head" fill="' + c + '" d="' + triPath(d.x1, d.y1, c2.x, c2.y, headSize(d)) + '"/>';
        }
        return '<g class="' + cls + '" ' + data + ' data-kind="' + d.type + '">' +
          '<path class="tb-hit" d="' + p + '"/><path class="tb-vis" stroke="' + c + '" stroke-width="' + sw + '"' + dashAttr(d) + ' d="' + p + '"/>' +
          heads + "</g>";
      }
      if (d.type === "path") {
        const p = pathD(d);
        const pts = pathPoints(d);
        const last = pts[pts.length - 1], prev = pts[pts.length - 2] || pts[0];
        return '<g class="' + cls + '" ' + data + ' data-kind="path">' +
          '<path class="tb-hit" d="' + p + '"/><path class="tb-vis" stroke="' + c + '" stroke-width="' + sw + '"' + dashAttr(d) + ' d="' + p + '"/>' +
          '<path class="tb-head" fill="' + c + '" d="' + triPath(last[0], last[1], prev[0], prev[1], headSize(d)) + '"/>' +
          "</g>";
      }
      if (d.type === "pen") {
        const pts = (d.points || []).map((q) => r1(q[0]) + "," + r1(q[1])).join(" ");
        return '<g class="' + cls + '" ' + data + ' data-kind="pen">' +
          '<polyline class="tb-hit" points="' + pts + '"/><polyline class="tb-vis" stroke="' + c +
          '" stroke-width="' + sw + '"' + dashAttr(d) + ' points="' + pts + '"/></g>';
      }
      if (d.type === "zone") {
        const label = d.label ? '<text class="tb-zonetext" x="' + r1(d.x) + '" y="' + r1(d.y - d.ry - 1) + '" fill="' + c + '">' + esc(d.label) + "</text>" : "";
        return '<g class="' + cls + '" ' + data + ' data-kind="zone">' +
          '<ellipse class="tb-hit" cx="' + r1(d.x) + '" cy="' + r1(d.y) + '" rx="' + r1(d.rx) + '" ry="' + r1(d.ry) + '"/>' +
          '<ellipse class="tb-zone" fill="' + c + '" stroke="' + c + '" cx="' + r1(d.x) + '" cy="' + r1(d.y) +
          '" rx="' + r1(d.rx) + '" ry="' + r1(d.ry) + '"/>' + label + "</g>";
      }
      if (d.type === "nade" || d.type === "number" || d.type === "text") {
        return markerHTML({
          id: d.id, kind: d.type === "text" ? "point" : d.type === "number" ? "dot" : (d.kind || "smoke"),
          x: d.x, y: d.y, label: d.type === "number" ? d.text : (d.label || ""), color: d.color,
          w: d.w, note: d.note, playerId: d.playerId, legacyDraw: true,
        });
      }
      return "";
    }

    function markerHTML(m) {
      const sel = st.sel === m.id;
      const c = elColor(m);
      const cls = "tb-el tb-mark" + (sel ? " sel" : "");
      const data = 'data-el="' + m.id + '"';
      const tr = 'transform="translate(' + r1(m.x) + "," + r1(m.y) + ')"';
      const label = String(m.label || "").slice(0, 28);

      if (m.kind === "player") {
        const p = playerById(m.playerId);
        let idx, nick;
        if (p) { idx = String(playerIndex(p)); nick = String(p.name).slice(0, 12); }
        else if (m.genericNum != null) { idx = String(m.genericNum); nick = String(m.genericName || "Игрок " + idx).slice(0, 12); }
        else if (m.label && /^\d+$/.test(String(m.label).trim())) { idx = String(m.label).trim(); nick = ""; }
        else { idx = String((b.markers.filter((x) => x.kind === "player").indexOf(m) + 1) || "?"); nick = ""; }
        const style = b.markerStyle || "number";
        let inner;
        if (style === "nick" || style === "both") {
          const w = textWidth(nick, 2.6);
          inner = '<circle class="tb-token" r="3.1" fill="#10151c" stroke="' + c + '"/>' +
            '<text class="tb-toknum" y="0.95" fill="' + c + '">' + idx + "</text>" +
            '<rect class="tb-tag" x="' + r1(-w / 2) + '" y="3.6" width="' + r1(w) + '" height="3" rx="0.9" fill="#10151c" stroke="' + c + '"/>' +
            '<text class="tb-tagnick" y="5.7" fill="' + c + '">' + esc(nick) + "</text>";
          if (style === "nick") {
            inner = '<rect class="tb-tag" x="' + r1(-w / 2) + '" y="-1.6" width="' + r1(w) + '" height="3.2" rx="1" fill="#10151c" stroke="' + c + '"/>' +
              '<text class="tb-tagnick" y="0.7" fill="' + c + '">' + esc(nick) + "</text>";
          }
        } else {
          inner = '<circle class="tb-token" r="3.1" fill="#10151c" stroke="' + c + '"/>' +
            '<text class="tb-toknum" y="1" fill="' + c + '">' + idx + "</text>";
        }
        return '<g class="' + cls + '" ' + data + ' data-kind="player" ' + tr + ">" +
          '<circle class="tb-hit" r="4.4"/>' + inner +
          (m.note ? '<text class="tb-note" y="-4.2">' + esc(String(m.note).slice(0, 22)) + "</text>" : "") + "</g>";
      }
      if (m.kind === "enemy") {
        return '<g class="' + cls + '" ' + data + ' data-kind="enemy" ' + tr + ">" +
          '<circle class="tb-hit" r="4.4"/>' +
          '<circle class="tb-token enemy" r="3.1" fill="#1a1113" stroke="' + c + '"/>' +
          '<path class="tb-enemyx" d="M-1.3 -1.3 L1.3 1.3 M1.3 -1.3 L-1.3 1.3" stroke="' + c + '"/>' +
          (label ? '<text class="tb-note" y="-4.2">' + esc(label) + "</text>" : "") + "</g>";
      }
      if (m.kind === "dot") {
        return '<g class="' + cls + '" ' + data + ' data-kind="dot" ' + tr + ">" +
          '<circle class="tb-hit" r="3.4"/><circle class="tb-dot" r="1.5" fill="' + c + '" stroke="' + c + '"/>' +
          (label ? '<text class="tb-note" y="-2.8">' + esc(label) + "</text>" : "") + "</g>";
      }
      if (NADE_IDS.indexOf(m.kind) >= 0 || m.kind === "decoy") {
        const meta = nadeMeta(m.kind === "decoy" ? "he" : m.kind);
        return '<g class="' + cls + '" ' + data + ' data-kind="' + m.kind + '" ' + tr + ">" +
          '<circle class="tb-hit" r="4.2"/>' +
          '<circle class="tb-nade" r="2.9" fill="#12171e" stroke="' + c + '"/>' +
          '<g class="tb-nadeglyph" transform="scale(0.17) translate(-12,-12)" fill="none" stroke="' + c +
          '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          (opts.glyphPath ? opts.glyphPath(meta.icon) : "") + "</g>" +
          (label ? '<text class="tb-nadelabel" y="5.2" fill="' + c + '">' + esc(label.slice(0, 6)) + "</text>" : "") +
          (m.playerId ? '<circle class="tb-nadeowner" cx="2.6" cy="-2.6" r="1.15" fill="' +
            esc((playerById(m.playerId) || {}).color || c) + '"/>' : "") +
          "</g>";
      }
      // подпись / текст
      const size = 2.5 + strokeW(m.w || 2) * 0.5;
      const w = textWidth(label || "текст", size);
      return '<g class="' + cls + '" ' + data + ' data-kind="text" ' + tr + ">" +
        '<rect class="tb-hit" x="' + r1(-w / 2 - 0.8) + '" y="' + r1(-size) + '" width="' + r1(w + 1.6) + '" height="' + r1(size * 2) + '"/>' +
        '<rect class="tb-label" x="' + r1(-w / 2) + '" y="' + r1(-size * 0.82) + '" width="' + r1(w) + '" height="' + r1(size * 1.64) +
        '" rx="0.9" fill="#11161d" stroke="' + c + '"/>' +
        '<text class="tb-labeltext" y="' + r1(size * 0.36) + '" fill="' + c + '" style="font-size:' + r1(size) + 'px">' +
        esc(label || "текст") + "</text></g>";
    }

    function renderAll() {
      api.shapesG.innerHTML = b.drawings.map(shapeHTML).join("");
      api.marksG.innerHTML = b.markers.map(markerHTML).join("");
      renderUI();
      applyFocus();
      renderActions();
    }
    /** Перерисовать один узел на месте — используется при перетаскивании,
        чтобы не трогать остальные элементы и не дёргать страницу. */
    function repaintEl(el) {
      const isMark = b.markers.indexOf(el) >= 0;
      const html = isMark ? markerHTML(el) : shapeHTML(el);
      const tmp = document.createElement("div");
      tmp.innerHTML = '<svg xmlns="' + NS + '">' + html + "</svg>";
      const src = tmp.firstChild && tmp.firstChild.firstChild;
      if (!src) return;
      const old = api.svg.querySelector('[data-el="' + el.id + '"]');
      const layer = isMark ? api.marksG : api.shapesG;
      const fresh = document.importNode(src, true);
      if (old && old.parentNode) old.parentNode.replaceChild(fresh, old);
      else layer.appendChild(fresh);
    }

    /* ---------- выделение и ручки ---------- */
    function renderUI() {
      const el = findEl(st.sel);
      if (!el || !editable) { api.uiG.innerHTML = ""; return; }
      const k = st.k;
      const hs = 1.5 / k;         // размер ручек в мировых единицах — постоянный на экране
      const sw = 0.45 / k;
      let h = "";
      const ring = (cx, cy, r) => '<circle class="tb-selring" cx="' + r1(cx) + '" cy="' + r1(cy) + '" r="' + r1(r) +
        '" stroke-width="' + r1(sw) + '" vector-effect="non-scaling-stroke"/>';
      if (el.type === "arrow" || el.type === "line") {
        const c = bendPoint(el);
        h += '<path class="tb-selbox" d="' + shapePath(el) + '" stroke-width="' + r1(sw) + '" vector-effect="non-scaling-stroke"/>' +
          handle(el.x1, el.y1, "1", hs) + handle(el.x2, el.y2, "2", hs) +
          (el.type === "arrow" ? handle(c.x, c.y, "bend", hs * 0.85) : "");
      } else if (el.type === "path") {
        h += '<path class="tb-selbox" d="' + pathD(el) + '" stroke-width="' + r1(sw) + '" vector-effect="non-scaling-stroke"/>';
        pathPoints(el).forEach((p, i) => { h += handle(p[0], p[1], "p" + i, hs); });
        // ручка добавления точки — на середине последнего сегмента
        const pts = pathPoints(el);
        const mid = [(pts[pts.length - 2][0] + pts[pts.length - 1][0]) / 2, (pts[pts.length - 2][1] + pts[pts.length - 1][1]) / 2];
        h += handle(mid[0], mid[1], "add", hs * 0.8);
      } else if (el.type === "zone") {
        h += ring(el.x, el.y, Math.max(el.rx, el.ry) + 0.8) +
          handle(el.x + el.rx, el.y, "rx", hs) + handle(el.x, el.y + el.ry, "ry", hs);
      } else if (el.type === "pen") {
        const pts = el.points || [];
        if (pts.length) {
          const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
          const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
          const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
          h += '<rect class="tb-selrect" x="' + r1(x0 - 0.8) + '" y="' + r1(y0 - 0.8) + '" width="' + r1(x1 - x0 + 1.6) +
            '" height="' + r1(y1 - y0 + 1.6) + '" stroke-width="' + r1(sw) + '" vector-effect="non-scaling-stroke"/>';
        }
      } else {
        const rr = el.kind === "player" || el.kind === "enemy" ? 4.2 : NADE_IDS.indexOf(el.kind) >= 0 ? 3.9 : 3.4;
        h += ring(el.x, el.y, rr);
      }
      api.uiG.innerHTML = h;
      $$("[data-handle]", api.uiG).forEach((node) => {
        node.addEventListener("pointerdown", (e) => onHandleDown(e, node.dataset.handle));
      });
      return hs;
    }
    const handle = (x, y, which, r) => '<circle class="tb-handle" data-handle="' + which + '" cx="' + r1(x) + '" cy="' + r1(y) +
      '" r="' + r1(r) + '" vector-effect="non-scaling-stroke"/>';

    /* ---------- фокус на игроке ---------- */
    function relates(el, pid) {
      if (!pid) return true;
      if (el.playerId === pid) return true;
      if (el.kind === "player" || el.type === "player") return el.playerId === pid;
      const a1 = el.a1 ? findEl(el.a1) : null;
      const a2 = el.a2 ? findEl(el.a2) : null;
      if (a1 && a1.playerId === pid) return true;
      if (a2 && a2.playerId === pid) return true;
      if (el.anchors && el.anchors.some((aid) => { const a = findEl(aid); return a && a.playerId === pid; })) return true;
      return false;
    }
    function applyFocus() {
      const pid = st.focus;
      api.root.classList.toggle("has-focus", !!pid);
      $$("[data-el]", api.svg).forEach((node) => {
        const el = findEl(node.dataset.el);
        node.classList.toggle("dim", !!pid && !!el && !relates(el, pid));
      });
    }
    function setFocus(pid) {
      st.focus = pid || null;
      applyFocus();
      if (opts.onFocus) opts.onFocus(st.focus);
    }

    /* ============================================================
       Зум и панорама
       ============================================================ */
    function applyView() {
      api.vp.setAttribute("transform", "translate(" + r1(st.tx) + "," + r1(st.ty) + ") scale(" + r1(st.k) + ")");
      const pct = $('[data-zoom="reset"]', api.root);
      if (pct) pct.textContent = Math.round(st.k * 100) + "%";
      b.view = { k: r1(st.k), tx: r1(st.tx), ty: r1(st.ty) };
      renderUI();
    }
    function setView(k, tx, ty) {
      st.k = clamp(k, 0.6, 8);
      st.tx = tx; st.ty = ty;
      applyView();
    }
    /** Зум относительно точки в экранных процентах (0..100). */
    function zoomAt(k2, px, py) {
      const k1 = st.k;
      const nk = clamp(k2, 0.6, 8);
      if (nk === k1) return;
      st.tx = px - (px - st.tx) * (nk / k1);
      st.ty = py - (py - st.ty) * (nk / k1);
      st.k = nk;
      applyView();
    }
    function zoomBy(f) { zoomAt(st.k * f, 50, 50); }
    function fit() { setView(1, 0, 0); }
    /** Экранные координаты → координаты viewBox (0..100) с учётом preserveAspectRatio="meet":
        карта всегда квадратная и центрированная, контейнер может быть любым. */
    function viewBoxPoint(clientX, clientY) {
      const r = api.svg.getBoundingClientRect();
      if (!r.width || !r.height) return { x: 50, y: 50 };
      const scale = Math.min(r.width / 100, r.height / 100);
      const offX = (r.width - 100 * scale) / 2;
      const offY = (r.height - 100 * scale) / 2;
      return { x: (clientX - r.left - offX) / scale, y: (clientY - r.top - offY) / scale };
    }
    function toWorld(clientX, clientY) {
      const v = viewBoxPoint(clientX, clientY);
      let x = (v.x - st.tx) / st.k, y = (v.y - st.ty) / st.k;
      if (st.snap || st.grid) { x = Math.round(x / 2.5) * 2.5; y = Math.round(y / 2.5) * 2.5; }
      return { x: r1(clamp100(x)), y: r1(clamp100(y)) };
    }
    /* ============================================================
       История
       ============================================================ */
    const snapshot = () => JSON.stringify({ markers: b.markers, drawings: b.drawings, markerStyle: b.markerStyle });
    function pushHist() {
      hist.u.push(snapshot());
      if (hist.u.length > 60) hist.u.shift();
      hist.r.length = 0;
      renderActions();
    }
    function applySnap(s) {
      const v = JSON.parse(s);
      b.markers = v.markers || [];
      b.drawings = v.drawings || [];
      b.markerStyle = v.markerStyle || "number";
      if (st.sel && !findEl(st.sel)) st.sel = null;
    }
    function undo() {
      if (!hist.u.length) { opts.onToast && opts.onToast("Отменять нечего"); return; }
      hist.r.push(snapshot());
      applySnap(hist.u.pop());
      commit();
      renderUI();
      notifySelect();
    }
    function redo() {
      if (!hist.r.length) { opts.onToast && opts.onToast("Повторять нечего"); return; }
      hist.u.push(snapshot());
      applySnap(hist.r.pop());
      commit();
      renderUI();
      notifySelect();
    }

    /* ============================================================
       Изменения и сохранение
       ============================================================ */
    function commit(silent) {
      st.dirty = true;
      if (!silent) renderAll();
      paintSaveState();
      if (opts.onChange) opts.onChange(api);
    }
    function save() {
      if (!opts.onSave) return Promise.resolve();
      const p = Promise.resolve(opts.onSave(api));
      return p.then(() => { st.dirty = false; paintSaveState(); renderActions(); return true; })
        .catch(() => { st.dirty = true; paintSaveState(); return false; });
    }
    api.isDirty = () => st.dirty;
    api.clearDirty = () => { st.dirty = false; paintSaveState(); };

    /* ---------- привязка стрелок к токенам ---------- */
    function anchorNear(x, y, skipId) {
      let best = null, bd = 4.2 / Math.max(1, st.k) + 2;
      b.markers.forEach((m) => {
        if (m.id === skipId) return;
        if (m.kind !== "player" && m.kind !== "enemy" && m.kind !== "dot") return;
        const d = dist(m.x, m.y, x, y);
        if (d < bd) { bd = d; best = m; }
      });
      return best;
    }
    function attachAnchors(d) {
      if (d.type !== "arrow" && d.type !== "line" && d.type !== "path") return;
      if (d.type === "path") {
        const pts = pathPoints(d);
        d.anchors = d.anchors || [];
        const a0 = anchorNear(pts[0][0], pts[0][1]);
        const a1 = anchorNear(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        d.anchors[0] = a0 ? a0.id : null;
        d.anchors[pts.length - 1] = a1 ? a1.id : null;
        d.a1 = d.anchors[0]; d.a2 = a1 ? a1.id : null;
        return;
      }
      const a1 = anchorNear(d.x1, d.y1), a2 = anchorNear(d.x2, d.y2);
      d.a1 = a1 ? a1.id : null;
      d.a2 = a2 ? a2.id : null;
    }
    /** Передвинутый токен тянет за собой привязанные маршруты. */
    function followAnchors(mkId) {
      const mk = findEl(mkId);
      if (!mk) return;
      b.drawings.forEach((d) => {
        if (d.a1 === mkId) { d.x1 = mk.x; d.y1 = mk.y; }
        if (d.a2 === mkId) { d.x2 = mk.x; d.y2 = mk.y; }
        if (d.type === "path" && d.anchors) {
          d.anchors.forEach((aid, i) => {
            if (aid !== mkId || !d.pts || !d.pts[i]) return;
            d.pts[i] = [mk.x, mk.y];
          });
        }
      });
    }
    function repaintLinked(mkId) {
      b.drawings.forEach((d) => {
        const linked = d.a1 === mkId || d.a2 === mkId ||
          (d.type === "path" && (d.anchors || []).indexOf(mkId) >= 0);
        if (linked) repaintEl(d);
      });
    }

    /* ============================================================
       Инструменты
       ============================================================ */
    function setTool(id) {
      if (!editable) return;
      const tool = TOOLS.find((t) => t.id === id);
      if (!tool) return;
      st.tool = id;
      st.waitFan = false;
      cancelPathDraft();
      renderTools();
      renderActions();
      hintForTool();
      api.stage.classList.toggle("tool-draw", ["arrow", "line", "zone", "path", "pen"].indexOf(id) >= 0);
      api.stage.classList.toggle("tool-pan", id === "pan");
      try { api.root.focus({ preventScroll: true }); } catch (e) {}
    }
    function hintForTool() {
      const map = {
        path: "Ставьте точки маршрута по карте. Готово — нажмите «Готово» или Enter.",
        arrow: "Тяните от точки к точке. Конец у токена прилипнет к игроку.",
        zone: "Тяните, чтобы задать размер зоны.",
        player: st.pendingPlayer ? "Поставить: " + playerName(st.pendingPlayer) : (players().length ? "Нажмите на карту — поставим игрока (доступны " + (players().length - b.markers.filter((m)=>m.kind==="player").length) + " своб., можно ставить сколько угодно)" : "Нажмите на карту — поставим игрока (состав пуст: токены будут пронумерованы 1,2,…)"),
        enemy: "Нажмите на карту — поставим противника.",
        text: "Нажмите на карту и введите текст.",
        eraser: "Нажмите на элемент, чтобы удалить его.",
        fan: "Нажмите точку на карте — туда пойдут маршруты от всех игроков.",
      };
      hint(st.waitFan ? map.fan : map[st.tool] || "");
    }
    const playerName = (pid) => { const p = playerById(pid); return p ? p.name : ""; };

    function nextFreePlayer() {
      const used = b.markers.filter((m) => m.kind === "player").map((m) => m.playerId);
      return players().find((p) => used.indexOf(p.id) < 0) || null;
    }
    function placePlayer(pt) {
      let p = st.pendingPlayer ? playerById(st.pendingPlayer) : nextFreePlayer();
      // Если все игроки уже на схеме — разрешаем ставить сколько угодно:
      // берём игрока в фокусе, затем первого из состава, затем generic
      if (!p) {
        if (st.focus) p = playerById(st.focus);
        if (!p && players().length) p = players()[0];
      }
      if (p) {
        pushHist();
        const mk = { id: uid("m"), kind: "player", playerId: p.id, x: pt.x, y: pt.y, color: p.color || "", label: "", note: "" };
        b.markers.push(mk);
        st.sel = mk.id;
        st.pendingPlayer = null;
        commit();
        notifySelect();
        opts.onToast && opts.onToast("Поставлен " + p.name + " · номер " + playerIndex(p));
        return;
      }
      // Состав пуст — ставим generic токен с номером
      const count = b.markers.filter((m) => m.kind === "player").length + 1;
      const col = st.color || (COLORS[count % COLORS.length] || COLORS[0]).c;
      pushHist();
      const mk = { id: uid("m"), kind: "player", playerId: null, genericNum: count, genericName: "Игрок " + count, x: pt.x, y: pt.y, color: col, label: "", note: "" };
      b.markers.push(mk);
      st.sel = mk.id;
      st.pendingPlayer = null;
      commit();
      notifySelect();
      opts.onToast && opts.onToast("Поставлен игрок " + count + " (состав пуст — токен без привязки)");
    }
    function placeMarker(kind, pt) {
      pushHist();
      const mk = { id: uid("m"), kind, x: pt.x, y: pt.y, color: "", label: "", note: "", playerId: st.focus || null };
      if (NADE_IDS.indexOf(kind) >= 0) { mk.playerId = st.focus || null; }
      b.markers.push(mk);
      st.sel = mk.id;
      commit();
      notifySelect();
      if (kind === "enemy") opts.onToast && opts.onToast("Противник поставлен");
    }
    function askText(cb, preset, title) {
      if (opts.onAskText) { opts.onAskText(title || "Текст", preset || "", cb); return; }
      const v = window.prompt(title || "Текст", preset || "");
      if (v != null && v.trim()) cb(v.trim().slice(0, 28));
    }

    /* ---------- маршрут по точкам ---------- */
    function cancelPathDraft() {
      if (!st.pathDraft) return;
      st.pathDraft = null;
      api.previewG.innerHTML = "";
      hintForTool();
    }
    function finishPathDraft() {
      const d = st.pathDraft;
      if (!d) return;
      if (d.pts.length < 2) { cancelPathDraft(); return; }
      pushHist();
      const el = {
        id: uid("d"), type: "path", pts: d.pts.slice(), color: d.color, w: st.w, dash: st.dash,
        head: "end", playerId: st.focus || null, anchors: [],
      };
      attachAnchors(el);
      b.drawings.push(el);
      st.pathDraft = null;
      api.previewG.innerHTML = "";
      st.sel = el.id;
      commit();
      renderUI();
      notifySelect();
      opts.onToast && opts.onToast("Маршрут из " + el.pts.length + " точек добавлен");
    }
    function pathDraftPoint(pt) {
      if (!st.pathDraft) {
        st.pathDraft = { pts: [[pt.x, pt.y]], color: st.focus ? ((playerById(st.focus) || {}).color || st.color) : st.color };
      } else {
        const last = st.pathDraft.pts[st.pathDraft.pts.length - 1];
        if (dist(last[0], last[1], pt.x, pt.y) < 1.2) return;
        st.pathDraft.pts.push([pt.x, pt.y]);
      }
      drawPathPreview();
      hint("Точек: " + st.pathDraft.pts.length + " · Enter — готово, Backspace — убрать точку, Esc — отменить");
    }
    function drawPathPreview() {
      const d = st.pathDraft;
      if (!d) { api.previewG.innerHTML = ""; return; }
      const fake = { pts: d.pts, w: st.w, dash: st.dash };
      api.previewG.innerHTML = '<path class="tb-prev" d="' + pathD(fake) + '" stroke="' + d.color +
        '" stroke-width="' + r1(strokeW(st.w)) + '"' + dashAttr(fake) + "/>" +
        d.pts.map((p) => '<circle class="tb-prevdot" cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="' + r1(0.9 / st.k) + '" fill="' + d.color + '"/>').join("");
    }

    /* ============================================================
       Жесты на карте
       ============================================================ */
    let drag = null;
    function bindStage() {
      const svg = api.svg;
      svg.style.touchAction = "none";

      svg.addEventListener("pointerdown", onPointerDown);
      svg.addEventListener("pointermove", onPointerMove);
      svg.addEventListener("pointerup", onPointerUp);
      svg.addEventListener("pointercancel", onPointerUp);
      svg.addEventListener("wheel", onWheel, { passive: false });
      svg.addEventListener("dblclick", onDblClick);
      svg.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    function onWheel(e) {
      e.preventDefault();
      const v = viewBoxPoint(e.clientX, e.clientY);
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
      zoomAt(st.k * f, v.x, v.y);
    }

    function onDblClick(e) {
      if (!editable) return;
      const node = e.target.closest ? e.target.closest("[data-el]") : null;
      if (node) {
        e.preventDefault();
        select(node.dataset.el);
        if (opts.onEditElement) opts.onEditElement(findEl(st.sel), api);
      }
    }

    function onPointerDown(e) {
      if (e.button === 2) return;
      const pt = toWorld(e.clientX, e.clientY);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { api.svg.setPointerCapture(e.pointerId); } catch (err) {}

      /* два пальца — зум и панорама */
      if (pointers.size === 2) {
        const p = Array.from(pointers.values());
        pinch = { d: dist(p[0].x, p[0].y, p[1].x, p[1].y), k: st.k, tx: st.tx, ty: st.ty,
          mid: viewBoxPoint((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2) };
        drag = null;
        return;
      }

      const handleNode = e.target.closest ? e.target.closest("[data-handle]") : null;
      if (handleNode) return; // обработчик в renderUI

      const elNode = e.target.closest ? e.target.closest("[data-el]") : null;
      const mid = e.button === 1;
      const wantPan = st.tool === "pan" || mid || st.space;

      if (wantPan) {
        drag = { kind: "pan", sx: e.clientX, sy: e.clientY, tx: st.tx, ty: st.ty };
        e.preventDefault();
        return;
      }
      if (!editable) {
        drag = { kind: "pan", sx: e.clientX, sy: e.clientY, tx: st.tx, ty: st.ty };
        return;
      }

      /* режим «маршруты всех к точке» */
      if (st.waitFan) {
        e.preventDefault();
        st.waitFan = false;
        fanOut(pt);
        renderActions();
        hintForTool();
        return;
      }

      /* инструменты-«рисовалки» */
      if (st.tool === "arrow" || st.tool === "line" || st.tool === "zone" || st.tool === "pen") {
        e.preventDefault();
        startStroke(pt, st.tool);
        return;
      }
      if (st.tool === "path") {
        e.preventDefault();
        pathDraftPoint(pt);
        return;
      }
      if (st.tool === "player") { e.preventDefault(); placePlayer(pt); return; }
      if (st.tool === "enemy") { e.preventDefault(); placeMarker("enemy", pt); return; }
      if (NADE_IDS.indexOf(st.tool) >= 0) { e.preventDefault(); placeMarker(st.tool, pt); return; }
      if (st.tool === "dot") { e.preventDefault(); placeMarker("dot", pt); return; }
      if (st.tool === "text") {
        e.preventDefault();
        askText((val) => {
          pushHist();
          b.markers.push({ id: uid("m"), kind: "point", x: pt.x, y: pt.y, label: val, color: st.color, w: st.w, playerId: st.focus || null });
          st.sel = b.markers[b.markers.length - 1].id;
          commit();
          notifySelect();
        }, "", "Текст на схеме");
        return;
      }
      if (st.tool === "eraser") {
        e.preventDefault();
        if (elNode) removeElement(elNode.dataset.el);
        return;
      }

      /* выбор / перенос */
      if (elNode) {
        e.preventDefault();
        select(elNode.dataset.el);
        startElDrag(elNode.dataset.el, e);
        return;
      }
      if (st.sel) { select(null); }
      drag = { kind: "pan", sx: e.clientX, sy: e.clientY, tx: st.tx, ty: st.ty };
    }

    function onPointerMove(e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const p = Array.from(pointers.values());
        const d = dist(p[0].x, p[0].y, p[1].x, p[1].y);
        const mid = viewBoxPoint((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        const k2 = clamp(pinch.k * (d / (pinch.d || 1)), 0.6, 8);
        // панорама двумя пальцами + зум к центру щипка
        const panX = mid.x - pinch.mid.x, panY = mid.y - pinch.mid.y;
        st.tx = pinch.tx + panX - (pinch.mid.x - pinch.tx) * (k2 / pinch.k - 1);
        st.ty = pinch.ty + panY - (pinch.mid.y - pinch.ty) * (k2 / pinch.k - 1);
        st.k = k2;
        applyView();
        return;
      }
      if (!drag) return;
      pendingMove = e;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!drag || !pendingMove) return;
        applyDrag(pendingMove);
      });
    }

    function applyDrag(e) {
      if (!drag) return;
      if (drag.kind === "pan") {
        const r = api.svg.getBoundingClientRect();
        const scale = (r.width && r.height) ? Math.min(r.width / 100, r.height / 100) : 1;
        setView(st.k, drag.tx + (e.clientX - drag.sx) / scale, drag.ty + (e.clientY - drag.sy) / scale);
        return;
      }
      if (drag.kind === "stroke") { drag.move(e); return; }
      if (drag.kind === "el") { drag.move(e); return; }
      if (drag.kind === "handle") { drag.move(e); return; }
    }

    function onPointerUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      try { api.svg.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!drag) return;
      const d = drag;
      drag = null;
      pendingMove = null;
      if (d.kind === "stroke") d.end(e);
      else if (d.kind === "el") d.end(e);
      else if (d.kind === "handle") d.end(e);
    }

    function onHandleDown(e, which) {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const el = findEl(st.sel);
      if (!el) return;
      // Захват указателя на svg: жест не срывается, даже если курсор ушёл за край карты.
      try { api.svg.setPointerCapture(e.pointerId); } catch (err) {}
      let started = false;
      const move = (ev) => {
        const pt = toWorld(ev.clientX, ev.clientY);
        if (!started) { started = true; pushHist(); }
        if (el.type === "zone") {
          if (which === "rx") el.rx = r1(clamp(Math.abs(pt.x - el.x), 2, 70));
          else el.ry = r1(clamp(Math.abs(pt.y - el.y), 2, 70));
        } else if (el.type === "path") {
          if (which === "add") {
            const pts = pathPoints(el);
            pts.splice(pts.length - 1, 0, [pt.x, pt.y]);
            el.pts = pts;
            el.anchors = el.anchors || [];
            el.anchors.splice(pts.length - 2, 0, null);
          } else {
            const i = +String(which).slice(1);
            if (!el.pts) return;
            el.pts[i] = [pt.x, pt.y];
            if (el.anchors) el.anchors[i] = null;
          }
          attachAnchors(el);
        } else if (which === "bend") {
          const mx = (el.x1 + el.x2) / 2, my = (el.y1 + el.y2) / 2;
          const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          el.bend = r1(clamp((((pt.x - mx) * -dy + (pt.y - my) * dx) / len) * 2, -34, 34));
        } else if (which === "1") { el.x1 = pt.x; el.y1 = pt.y; el.a1 = null; }
        else if (which === "2") { el.x2 = pt.x; el.y2 = pt.y; el.a2 = null; }
        repaintEl(el);
        renderUI();
      };
      // Жест ведёт общий обработчик доски (onPointerMove → rAF), без лишних слушателей.
      drag = {
        kind: "handle", move,
        end: () => { if (started) { commit(true); renderAll(); notifySelect(); } },
      };
    }

    /* ---------- перенос элемента ---------- */
    function startElDrag(id, e) {
      const el = findEl(id);
      if (!el) return;
      const startW = toWorld(e.clientX, e.clientY);
      const orig = clone(el.pts ? { pts: el.pts } : { x: el.x, y: el.y, x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2, points: el.points });
      let moved = false;
      const move = (ev) => {
        const pt = toWorld(ev.clientX, ev.clientY);
        const dx = pt.x - startW.x, dy = pt.y - startW.y;
        if (!moved) {
          if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) return;
          moved = true;
          st.busy = true;
          pushHist();
        }
        if (el.pts) {
          el.pts = orig.pts.map((q) => [r1(clamp100(q[0] + dx)), r1(clamp100(q[1] + dy))]);
          el.anchors = [];
        } else if (el.x1 != null) {
          el.x1 = r1(clamp100(orig.x1 + dx)); el.y1 = r1(clamp100(orig.y1 + dy));
          el.x2 = r1(clamp100(orig.x2 + dx)); el.y2 = r1(clamp100(orig.y2 + dy));
        } else if (el.points) {
          el.points = orig.points.map((q) => [r1(clamp100(q[0] + dx)), r1(clamp100(q[1] + dy))]);
        } else {
          el.x = r1(clamp100(orig.x + dx)); el.y = r1(clamp100(orig.y + dy));
        }
        if (el.kind === "player" || el.kind === "enemy" || el.kind === "dot") followAnchors(el.id);
        repaintEl(el);
        if (el.kind === "player" || el.kind === "enemy" || el.kind === "dot") repaintLinked(el.id);
        renderUI();
      };
      drag = {
        kind: "el", move,
        end: () => {
          st.busy = false;
          if (!moved) {
            // короткий тап по элементу: на телефоне открываем свойства
            if (opts.onTapElement) opts.onTapElement(el, api);
            return;
          }
          if (el.pts || el.x1 != null) attachAnchors(el);
          commit(true);
          renderAll();
          notifySelect();
        },
      };
    }

    /* ---------- рисование новых фигур ---------- */
    function startStroke(startPt, type) {
      const preview = document.createElementNS(NS, "path");
      preview.setAttribute("class", "tb-prev");
      preview.setAttribute("stroke", st.color);
      preview.setAttribute("stroke-width", r1(strokeW(st.w)));
      api.previewG.appendChild(preview);
      const pts = [[startPt.x, startPt.y]];
      let end = startPt;
      const draw = () => {
        if (type === "pen") preview.setAttribute("d", "M" + pts.map((q) => q.join(" ")).join(" L"));
        else if (type === "zone") {
          const cx = (startPt.x + end.x) / 2, cy = (startPt.y + end.y) / 2;
          const rx = Math.abs(end.x - startPt.x) / 2, ry = Math.abs(end.y - startPt.y) / 2;
          preview.setAttribute("d", "M" + r1(cx - rx) + " " + r1(cy) + " a" + r1(rx) + " " + r1(ry) + " 0 1 0 " +
            r1(rx * 2) + " 0 a" + r1(rx) + " " + r1(ry) + " 0 1 0 " + r1(-rx * 2) + " 0 Z");
        } else {
          const d = type === "arrow" ? triPath(end.x, end.y, startPt.x, startPt.y, headSize({ w: st.w })) : "";
          preview.setAttribute("d", "M" + startPt.x + " " + startPt.y + " L" + end.x + " " + end.y + " " + d);
        }
      };
      draw();
      let started = false;
      drag = {
        kind: "stroke",
        move: (ev) => {
          const pt = toWorld(ev.clientX, ev.clientY);
          started = true;
          if (type === "pen") {
            const last = pts[pts.length - 1];
            if (dist(last[0], last[1], pt.x, pt.y) < 0.7 / st.k) return;
            pts.push([pt.x, pt.y]);
          } else end = pt;
          draw();
        },
        end: () => {
          api.previewG.innerHTML = "";
          if (!started) return;
          if (type === "pen") {
            const clean = simplify(pts, 0.4);
            if (clean.length < 2) return;
            pushHist();
            const el = { id: uid("d"), type: "pen", points: clean, color: st.color, w: st.w, dash: st.dash };
            b.drawings.push(el);
            st.sel = el.id;
          } else if (type === "zone") {
            const rx = Math.abs(end.x - startPt.x) / 2, ry = Math.abs(end.y - startPt.y) / 2;
            if (rx < 1.5 && ry < 1.5) return;
            pushHist();
            const el = {
              id: uid("d"), type: "zone", x: r1((startPt.x + end.x) / 2), y: r1((startPt.y + end.y) / 2),
              rx: r1(Math.max(2.5, rx)), ry: r1(Math.max(2.5, ry)), color: st.color, w: st.w, label: "",
            };
            b.drawings.push(el);
            st.sel = el.id;
          } else {
            if (dist(startPt.x, startPt.y, end.x, end.y) < 1.4) return;
            pushHist();
            const el = {
              id: uid("d"), type, x1: startPt.x, y1: startPt.y, x2: end.x, y2: end.y, bend: 0,
              color: st.color, w: st.w, dash: st.dash, head: type === "arrow" ? st.head : null,
              playerId: st.focus || null,
            };
            attachAnchors(el);
            b.drawings.push(el);
            st.sel = el.id;
          }
          commit();
          renderUI();
          notifySelect();
        },
      };
    }
    function simplify(pts, tol) {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = out[out.length - 1], p = pts[i], n = pts[i + 1];
        const cross = Math.abs((p[0] - a[0]) * (n[1] - a[1]) - (p[1] - a[1]) * (n[0] - a[0]));
        const len = dist(a[0], a[1], n[0], n[1]) || 1;
        if (cross / len > tol || i === pts.length - 2) out.push(p);
      }
      out.push(pts[pts.length - 1]);
      return out;
    }

    /* ============================================================
       Операции над элементами
       ============================================================ */
    function select(id) {
      st.sel = id || null;
      $$("[data-el]", api.svg).forEach((n) => n.classList.toggle("sel", n.dataset.el === st.sel));
      renderUI();
      notifySelect();
    }
    function notifySelect() {
      if (opts.onSelect) opts.onSelect(findEl(st.sel), api);
    }
    function removeElement(id) {
      const el = findEl(id);
      if (!el) return;
      pushHist();
      b.drawings = b.drawings.filter((d) => d.id !== id);
      b.markers = b.markers.filter((m) => m.id !== id);
      b.drawings.forEach((d) => {
        if (d.a1 === id) d.a1 = null;
        if (d.a2 === id) d.a2 = null;
        if (d.anchors) d.anchors = d.anchors.map((a) => (a === id ? null : a));
      });
      if (st.sel === id) st.sel = null;
      commit();
      notifySelect();
    }
    function duplicateSelected() {
      const el = findEl(st.sel);
      if (!el) { opts.onToast && opts.onToast("Сначала выберите элемент"); return; }
      pushHist();
      const copy = clone(el);
      copy.id = uid(el.pts || el.x1 != null || el.points || el.type === "zone" ? "d" : "m");
      const off = 3.5;
      if (copy.pts) copy.pts = copy.pts.map((q) => [r1(clamp100(q[0] + off)), r1(clamp100(q[1] + off))]);
      else if (copy.x1 != null) { copy.x1 = r1(copy.x1 + off); copy.y1 = r1(copy.y1 + off); copy.x2 = r1(copy.x2 + off); copy.y2 = r1(copy.y2 + off); }
      else if (copy.points) copy.points = copy.points.map((q) => [r1(clamp100(q[0] + off)), r1(clamp100(q[1] + off))]);
      else { copy.x = r1(clamp100(copy.x + off)); copy.y = r1(clamp100(copy.y + off)); }
      copy.a1 = copy.a2 = null;
      copy.anchors = [];
      if (b.markers.indexOf(el) >= 0) b.markers.push(copy); else b.drawings.push(copy);
      st.sel = copy.id;
      commit();
      notifySelect();
    }
    function arrowFromSelected() {
      const el = findEl(st.sel);
      if (!el) { opts.onToast && opts.onToast("Сначала выберите элемент"); return; }
      let from = null;
      if (el.x != null) from = { x: el.x, y: el.y };
      else if (el.x2 != null) from = { x: el.x2, y: el.y2 };
      else if (el.pts) from = { x: el.pts[el.pts.length - 1][0], y: el.pts[el.pts.length - 1][1] };
      if (!from) { opts.onToast && opts.onToast("Стрелку можно тянуть от точки или токена", "warn"); return; }
      setTool("arrow");
      pushHist();
      const d = {
        id: uid("d"), type: "arrow", x1: r1(from.x), y1: r1(from.y), x2: r1(from.x + 12), y2: r1(from.y - 12),
        bend: 0, color: el.color || st.color, w: st.w, dash: st.dash, head: st.head, playerId: el.playerId || null,
      };
      if (b.markers.indexOf(el) >= 0) d.a1 = el.id;
      attachAnchors(d);
      b.drawings.push(d);
      st.sel = d.id;
      commit();
      renderUI();
      notifySelect();
      opts.onToast && opts.onToast("Стрелка добавлена — потяните концы");
    }
    function clearBoard() {
      if (!elements().length) { opts.onToast && opts.onToast("Схема уже пустая"); return; }
      if (opts.onConfirm) {
        opts.onConfirm("Очистить схему?", "Все элементы схемы будут удалены. Действие можно отменить кнопкой «Отменить».", () => {
          pushHist();
          b.markers = []; b.drawings = [];
          st.sel = null;
          commit();
          notifySelect();
        });
      } else {
        pushHist();
        b.markers = []; b.drawings = [];
        st.sel = null;
        commit();
        notifySelect();
      }
    }
    function autoPlace() {
      const zone = opts.spawnZone ? opts.spawnZone() : null;
      pushHist();
      b.markers = b.markers.filter((m) => m.kind !== "player");
      let list = players().slice(0, 5);
      // Если состав пуст — расставляем 5 generic токенов
      if (!list.length) {
        const n = 5;
        for (let i = 0; i < n; i++) {
          let x, y;
          if (zone) {
            const spread = Math.max(16, zone.w || 18);
            const step = spread / (n - 1 || 1);
            x = zone.x - spread / 2 + step * i;
            y = zone.y + (i % 2 ? 3 : -3);
          } else {
            x = 22 + (54 / 4) * i;
            y = (opts.side === "CT") ? 26 : 74;
          }
          const col = COLORS[i % COLORS.length].c;
          b.markers.push({
            id: uid("m"), kind: "player", playerId: null, genericNum: i + 1, genericName: "Игрок " + (i + 1), color: col,
            x: r1(clamp100(x)), y: r1(clamp100(y)), label: "", note: "",
          });
        }
        st.sel = null;
        commit();
        opts.onToast && opts.onToast("Расставлены 5 токенов (состав пуст — без привязки)", "ok");
        return;
      }
      const n = list.length;
      list.forEach((p, i) => {
        let x, y;
        if (zone) {
          const spread = Math.max(16, zone.w || 18);
          const step = n > 1 ? spread / (n - 1) : 0;
          x = zone.x - spread / 2 + step * i;
          y = zone.y + (i % 2 ? 3 : -3);
        } else {
          const step = n > 1 ? 54 / (n - 1) : 0;
          x = 22 + step * i;
          y = (opts.side === "CT") ? 26 : 74;
        }
        b.markers.push({
          id: uid("m"), kind: "player", playerId: p.id, color: p.color || "",
          x: r1(clamp100(x)), y: r1(clamp100(y)), label: "", note: "",
        });
      });
      st.sel = null;
      commit();
      opts.onToast && opts.onToast("Состав расставлен: " + n + " игроков", "ok");
    }
    function fanOut(pt) {
      const marks = b.markers.filter((m) => m.kind === "player");
      if (!marks.length) { opts.onToast && opts.onToast("Сначала расставьте игроков", "warn"); return; }
      pushHist();
      marks.forEach((mk) => {
        const p = playerById(mk.playerId);
        const d = {
          id: uid("d"), type: "arrow", x1: mk.x, y1: mk.y, x2: pt.x, y2: pt.y, bend: 0,
          color: (p && isHex(p.color)) ? p.color : st.color, w: st.w, dash: st.dash, head: "end",
          a1: mk.id, a2: null, playerId: mk.playerId || null,
        };
        b.drawings.push(d);
      });
      commit();
      opts.onToast && opts.onToast("Маршруты к точке от " + marks.length + " игроков", "ok");
    }
    function doAction(act) {
      if (act === "undo") return undo();
      if (act === "redo") return redo();
      if (act === "clear") return clearBoard();
      if (act === "save") return save();
      if (act === "place") return autoPlace();
      if (act === "grid") {
        st.grid = !st.grid;
        api.gridG.hidden = !st.grid;
        return renderActions();
      }
      if (act === "fan") {
        if (!editable) return;
        st.waitFan = !st.waitFan;
        renderActions();
        hintForTool();
        if (st.waitFan) opts.onToast && opts.onToast("Нажмите точку на карте");
        return;
      }
      if (act === "big") {
        st.big = !st.big;
        host.classList.toggle("tb-full", st.big);
        document.body.classList.toggle("board-full", st.big);
        renderActions();
        renderZoom();
        setTimeout(() => fit(), 30);
        return;
      }
    }

    /* ============================================================
       Панель свойств выбранного элемента
       ============================================================ */
    function renderInspector(container) {
      if (!container) return;
      const el = findEl(st.sel);
      if (!el) {
        container.innerHTML = '<div class="insp-empty">' + ic("cursor") +
          "<b>" + (editable ? "Выберите элемент на карте" : "Схема доступна для просмотра") + "</b>" +
          "<span>" + (editable
            ? "Нажмите на игрока, гранату или стрелку — здесь появятся цвет, подпись, задача и видео."
            : "Капитан может приближать карту и переключать игроков.") + "</span></div>";
        return;
      }
      const kind = el.type || el.kind;
      const p = el.playerId ? playerById(el.playerId) : null;
      const videos = opts.videosFor ? opts.videosFor(el.id) : [];
      let h = '<div class="insp-head"><span class="insp-type">' + ic(kind === "player" ? "user" : kind === "enemy" ? "enemy" :
        NADE_IDS.indexOf(kind) >= 0 ? nadeMeta(kind).icon : kind === "zone" ? "zone" : kind === "path" ? "route" :
        kind === "arrow" ? "arrow" : kind === "line" ? "line" : kind === "dot" ? "dot" : "text") +
        esc(typeLabel(el)) + "</span>" + (p ? '<span class="insp-who" style="--pc:' + esc(p.color || "#f0b429") + '">' + esc(p.name) + "</span>" : "") + "</div>";

      /* игрок */
      if (kind === "player") {
        h += '<div class="insp-rows">' +
          (editable ? '<label class="field"><span class="field-label">Игрок</span><select data-prop="playerId">' +
            '<option value="">— не выбран —</option>' + players().map((x) =>
              '<option value="' + x.id + '"' + (el.playerId === x.id ? " selected" : "") + ">" + esc(x.name) +
              (x.role ? " · " + esc(x.role) : "") + "</option>").join("") + "</select></label>" : "") +
          '<label class="field"><span class="field-label">Задача на схеме</span>' +
          '<input data-prop="note" maxlength="90" value="' + esc(el.note || "") + '" placeholder="Например: смок на CT, ждём выход"' +
          (editable ? "" : " disabled") + "></label>" +
          "</div>";
      } else if (kind === "enemy") {
        h += '<label class="field"><span class="field-label">Подпись</span><input data-prop="label" maxlength="18" value="' +
          esc(el.label || "") + '" placeholder="Например: AWP"' + (editable ? "" : " disabled") + "></label>";
      } else if (NADE_IDS.indexOf(kind) >= 0 || kind === "decoy") {
        h += '<div class="insp-rows">' +
          '<label class="field"><span class="field-label">Название</span><input data-prop="label" maxlength="18" value="' +
          esc(el.label || "") + '" placeholder="Например: Смок CT"' + (editable ? "" : " disabled") + "></label>" +
          (editable ? '<label class="field"><span class="field-label">Кидает</span><select data-prop="playerId">' +
            '<option value="">— вся команда —</option>' + players().map((x) =>
              '<option value="' + x.id + '"' + (el.playerId === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") +
            "</select></label>" : "") +
          "</div>";
      } else if (kind === "point" || kind === "text" || el.type === "text" || el.type === "number") {
        h += '<label class="field"><span class="field-label">Текст</span><input data-prop="' +
          (el.type === "number" ? "text" : el.type === "text" ? "text" : "label") + '" maxlength="28" value="' +
          esc(el.label || el.text || "") + '"' + (editable ? "" : " disabled") + "></label>";
      } else if (kind === "zone") {
        h += '<label class="field"><span class="field-label">Название зоны</span><input data-prop="label" maxlength="24" value="' +
          esc(el.label || "") + '" placeholder="Например: Зона смока"' + (editable ? "" : " disabled") + "></label>";
      } else if (kind === "dot") {
        h += '<label class="field"><span class="field-label">Подпись точки</span><input data-prop="label" maxlength="18" value="' +
          esc(el.label || "") + '" placeholder="Точка остановки"' + (editable ? "" : " disabled") + "></label>";
      } else if (kind === "arrow" || kind === "line" || kind === "path" || kind === "pen") {
        h += '<label class="field"><span class="field-label">Комментарий к маршруту</span>' +
          '<input data-prop="note" maxlength="90" value="' + esc(el.note || "") + '" placeholder="Например: идём после смока"' +
          (editable ? "" : " disabled") + "></label>" +
          (editable ? '<label class="field"><span class="field-label">Игрок маршрута</span><select data-prop="playerId">' +
            '<option value="">— общий —</option>' + players().map((x) =>
              '<option value="' + x.id + '"' + (el.playerId === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") +
            "</select></label>" : "");
      }

      /* стиль */
      if (editable) {
        h += '<div class="insp-block"><span class="insp-label">Цвет</span><div class="swatches">';
        COLORS.forEach((c) => {
          h += '<button class="swatch' + (elColor(el) === c.c ? " on" : "") + '" type="button" data-color="' + c.c +
            '" style="--sw:' + c.c + '" title="' + esc(c.n) + '" aria-label="' + esc(c.n) + '"></button>';
        });
        h += "</div></div>";
        if (DRAW_TYPES.indexOf(kind) >= 0 && kind !== "zone") {
          h += '<div class="insp-block"><span class="insp-label">Линия</span><div class="segrow">' +
            WIDTHS.map((w) => '<button class="seg' + ((el.w || 2) === w.w ? " on" : "") + '" type="button" data-w="' + w.w + '">' + esc(w.n) + "</button>").join("") +
            '<button class="seg' + (el.dash ? " on" : "") + '" type="button" data-toggle="dash">' + ic("dash") + " Пунктир</button>" +
            (kind === "arrow" ? '<button class="seg' + (el.head === "both" ? " on" : "") + '" type="button" data-toggle="both">' + ic("both") + " Два конца</button>" : "") +
            "</div></div>";
        }
        if (kind === "path") {
          h += '<div class="insp-block"><span class="insp-label">Точки маршрута: ' + pathPoints(el).length + "</span>" +
            '<div class="segrow"><button class="seg" type="button" data-addpoint>' + ic("plus") + " Добавить точку</button>" +
            '<button class="seg" type="button" data-delpoint>' + ic("trash") + " Убрать последнюю</button></div></div>";
        }
      }

      /* видео элемента */
      h += '<div class="insp-block"><span class="insp-label">Видео к элементу</span>';
      if (!videos.length) {
        h += '<p class="insp-muted">' + (editable ? "Видео пока нет — добавьте ссылку на YouTube." : "Для этого элемента видео нет.") + "</p>";
      } else {
        h += '<div class="insp-videos">' + videos.map((v) =>
          '<button class="vrow" type="button" data-play="' + esc(v.id) + '">' + ic("play") +
          "<span>" + esc(v.title || "Видео") + "</span></button>").join("") + "</div>";
      }
      if (editable && opts.onEditVideos) {
        h += '<button class="btn btn-ghost btn-sm insp-addvideo" type="button" data-addvideo>' + ic("plus") + " Видео</button>";
      }
      h += "</div>";

      /* действия */
      if (editable) {
        h += '<div class="insp-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-el="dup">' + ic("copy") + " Копировать</button>" +
          ((kind === "player" || NADE_IDS.indexOf(kind) >= 0 || kind === "dot" || kind === "enemy" || kind === "point")
            ? '<button class="btn btn-ghost btn-sm" type="button" data-el="arrow">' + ic("arrow") + " Стрелка отсюда</button>" : "") +
          '<button class="btn btn-danger btn-sm" type="button" data-el="del">' + ic("trash") + " Удалить</button>" +
          "</div>";
      }

      container.innerHTML = h;

      /* привязка событий панели */
      $$("[data-prop]", container).forEach((inp) => {
        const apply = () => {
          const el2 = findEl(st.sel);
          if (!el2) return;
          pushHist();
          const key = inp.dataset.prop;
          el2[key] = inp.value;
          if (key === "playerId" && el2.kind === "player" && inp.value) {
            const p2 = playerById(inp.value);
            if (p2) el2.color = p2.color || "";
          }
          commit();
          renderUI();
          notifySelect();
        };
        if (inp.tagName === "SELECT") inp.onchange = apply;
        else inp.onchange = apply;
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } };
      });
      $$("[data-color]", container).forEach((btn) => {
        btn.onclick = () => {
          const el2 = findEl(st.sel);
          if (!el2) return;
          pushHist();
          st.color = btn.dataset.color;
          el2.color = st.color;
          if (NADE_IDS.indexOf(el2.kind) >= 0) el2.colorOverride = true;
          commit();
          renderInspector(container);
          notifySelect();
        };
      });
      $$("[data-w]", container).forEach((btn) => {
        btn.onclick = () => {
          const el2 = findEl(st.sel);
          if (!el2) return;
          pushHist();
          st.w = +btn.dataset.w;
          el2.w = st.w;
          commit();
          renderInspector(container);
        };
      });
      $$("[data-toggle]", container).forEach((btn) => {
        btn.onclick = () => {
          const el2 = findEl(st.sel);
          if (!el2) return;
          pushHist();
          if (btn.dataset.toggle === "dash") { el2.dash = !el2.dash; st.dash = el2.dash; }
          else { el2.head = el2.head === "both" ? "end" : "both"; }
          commit();
          renderInspector(container);
        };
      });
      const addp = $("[data-addpoint]", container);
      if (addp) addp.onclick = () => {
        const el2 = findEl(st.sel);
        if (!el2 || !el2.pts) return;
        pushHist();
        const last = el2.pts[el2.pts.length - 1];
        el2.pts.push([r1(clamp100(last[0] + 6)), r1(clamp100(last[1] - 6))]);
        attachAnchors(el2);
        commit();
        renderUI();
        renderInspector(container);
      };
      const delp = $("[data-delpoint]", container);
      if (delp) delp.onclick = () => {
        const el2 = findEl(st.sel);
        if (!el2 || !el2.pts || el2.pts.length <= 2) { opts.onToast && opts.onToast("Минимум две точки маршрута"); return; }
        pushHist();
        el2.pts.pop();
        if (el2.anchors) el2.anchors.pop();
        attachAnchors(el2);
        commit();
        renderUI();
        renderInspector(container);
      };
      $$("[data-play]", container).forEach((btn) => {
        btn.onclick = () => {
          const v = videos.find((x) => x.id === btn.dataset.play);
          if (v && opts.onOpenVideo) opts.onOpenVideo(v);
        };
      });
      const av = $("[data-addvideo]", container);
      if (av) av.onclick = () => opts.onEditVideos && opts.onEditVideos(findEl(st.sel), api);
      $$("[data-el]", container).forEach((btn) => {
        btn.onclick = () => {
          const a = btn.dataset.el;
          if (a === "dup") duplicateSelected();
          else if (a === "arrow") arrowFromSelected();
          else if (a === "del") removeElement(st.sel);
          if (opts.onInspectorAction) opts.onInspectorAction(a);
        };
      });
    }

    /* ============================================================
       Клавиатура
       ============================================================ */
    function bindKeys() {
      api.root.tabIndex = 0;
      api.root.addEventListener("keydown", onKeyDown);
      api.root.addEventListener("keyup", (e) => {
        if (e.code === "Space") { st.space = false; api.stage.classList.remove("tool-pan"); }
      });
    }
    function onKeyDown(e) {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const meta = e.ctrlKey || e.metaKey;
      if (e.code === "Space" && !meta) {
        st.space = true;
        api.stage.classList.add("tool-pan");
        e.preventDefault();
        return;
      }
      if (meta && (e.key === "z" || e.key === "Z" || e.key === "я" || e.key === "Я")) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (meta && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (meta && (e.key === "s" || e.key === "S" || e.key === "ы" || e.key === "Ы")) { e.preventDefault(); save(); return; }
      if (meta && (e.key === "d" || e.key === "D")) { e.preventDefault(); duplicateSelected(); return; }
      if (meta) return;
      if (e.key === "Escape") {
        if (st.pathDraft) { cancelPathDraft(); return; }
        if (st.big) { doAction("big"); return; }
        if (st.sel) { select(null); return; }
        return;
      }
      if (e.key === "Enter" && st.pathDraft) { e.preventDefault(); finishPathDraft(); return; }
      if ((e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        if (st.pathDraft && st.pathDraft.pts.length > 1) {
          st.pathDraft.pts.pop();
          drawPathPreview();
          return;
        }
        if (st.sel) removeElement(st.sel);
        return;
      }
      if (/^[1-5]$/.test(e.key)) {
        const p = players()[+e.key - 1];
        if (!p) return;
        st.pendingPlayer = p.id;
        setTool("player");
        hintForTool();
        return;
      }
      const k = e.key.toLowerCase();
      const tool = TOOLS.find((t) => t.key === k);
      if (tool) { e.preventDefault(); setTool(tool.id); }
    }

    /* ============================================================
       Публичный API
       ============================================================ */
    api.state = st;
    api.block = b;
    api.mount = mount;
    api.setTool = setTool;
    api.select = select;
    api.selected = () => findEl(st.sel);
    api.removeElement = removeElement;
    api.duplicateSelected = duplicateSelected;
    api.arrowFromSelected = arrowFromSelected;
    api.undo = undo;
    api.redo = redo;
    api.save = save;
    api.clear = clearBoard;
    api.autoPlace = autoPlace;
    api.zoomBy = zoomBy;
    api.zoomAt = zoomAt;
    api.fit = fit;
    api.setView = setView;
    api.renderAll = renderAll;
    api.commitNow = commit;
    /** Изменить выбранный элемент: история, перерисовка и отметка «не сохранено». */
    api.updateSelected = (mutate) => {
      const el = findEl(st.sel);
      if (!el) return null;
      pushHist();
      mutate(el);
      commit();
      renderUI();
      notifySelect();
      return el;
    };
    api.renderInspector = renderInspector;
    api.renderTools = renderTools;
    api.renderActions = renderActions;
    api.setFocus = setFocus;
    api.focusPlayer = () => st.focus;
    api.finishPathDraft = finishPathDraft;
    api.cancelPathDraft = cancelPathDraft;
    api.setMarkerStyle = (mode) => { b.markerStyle = mode; pushHist(); commit(); };
    api.cycleMarkerStyle = () => {
      const order = ["number", "nick", "both"];
      const next = order[(order.indexOf(b.markerStyle || "number") + 1) % order.length];
      api.setMarkerStyle(next);
      return next;
    };
    api.setStyle = (patch) => {
      if (patch.color) st.color = patch.color;
      if (patch.w) st.w = patch.w;
      if (patch.dash != null) st.dash = !!patch.dash;
      if (patch.head) st.head = patch.head;
    };
    api.style = () => ({ color: st.color, w: st.w, dash: st.dash, head: st.head });
    api.historyLen = () => ({ undo: hist.u.length, redo: hist.r.length });
    api.count = () => elements().length;
    api.toggleFull = () => doAction("big");
    api.isFull = () => st.big;
    api.destroy = () => {
      /* режим «на весь экран» прячет шапку и меню — при уходе с экрана возвращаем их */
      st.big = false;
      host.classList.remove("tb-full", "tb-host");
      document.body.classList.remove("board-full");
      host.innerHTML = "";
    };
    api.refresh = () => { renderAll(); renderTools(); renderActions(); renderZoom(); };
    /** Данные элемента для панели игрока (стартовая позиция, маршрут). */
    api.elementsOfPlayer = (pid) => elements().filter((el) => relates(el, pid));
    api.playerMarker = (pid) => b.markers.find((m) => m.kind === "player" && m.playerId === pid) || null;
    api.typeLabel = typeLabel;
    api.nadeLabel = nadeLabel;
    api.TOOLS = TOOLS;
    api.NADES = NADES;
    api.COLORS = COLORS;

    return mount();
  }

  const api = { create, TOOLS, NADES, COLORS, WIDTHS, typeLabel, nadeMeta };
  if (typeof window !== "undefined") window.PBBoard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
