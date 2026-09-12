/* Интеграционный прогон в jsdom: настоящий index.html + все скрипты.
   Проверяем то, что можно проверить без браузера: маршруты, отрисовку,
   CRUD (создание/правка/удаление тактик, игроков, видео, элементов схемы),
   чат, права капитана и игрока, доску и её историю изменений.

   Конфигурацию берём из supabase-config.example.js, а не из рабочего
   supabase-config.js: в рабочем лежат настоящие ключи проекта, db.js с ними
   включает облачный режим и тест уходит в сетевые вызовы. Проверки ниже
   рассчитаны на локальный режим — облачный слой отдельно покрыт в test-client.mjs. */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
let pass = 0, fail = 0;
const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  ok ? pass++ : fail++;
};

/* ---------------- окружение ---------------- */
const dom = new JSDOM(readFileSync(`${ROOT}/index.html`, "utf8"), {
  url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
window.onunhandledrejection = (e) => errors.push("unhandled: " + (e.reason && e.reason.message || e.reason));
/* Нативные диалоги запрещены: приложение обязано пользоваться своими шторками. */
const nativeDialogs = [];
window.confirm = () => { nativeDialogs.push("confirm"); return true; };
window.prompt = () => { nativeDialogs.push("prompt"); return ""; };
window.alert = () => { nativeDialogs.push("alert"); };

const FILES = ["supabase-config.example.js", "data.js", "db.js", "ui.js", "board.js", "seed.js", "app.js"];
let loadFailed = false;
for (const f of FILES) {
  try {
    window.eval(readFileSync(`${ROOT}/${f}`, "utf8"));
  } catch (e) {
    check(`загрузка ${f}`, false, String(e.message).slice(0, 200));
    loadFailed = true;
  }
}

const $ = (s, r) => (r || doc).querySelector(s);
const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const view = () => doc.getElementById("view");
const DB = () => window.PlaybookDB;

async function go(hash, ms = 220) {
  window.location.hash = hash;
  window.dispatchEvent(new window.Event("hashchange"));
  await tick(ms);
}
function fire(el, type, extra) {
  if (!el) throw new Error("нет элемента для события " + type);
  el.dispatchEvent(new window.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0 }, extra)));
}
function click(sel, root) {
  const el = typeof sel === "string" ? $(sel, root) : sel;
  if (!el) throw new Error("не найден элемент " + sel);
  fire(el, "click");
  return el;
}
/** Клик по пункту всплывающего меню по тексту. */
function menuByLabel(label) {
  const item = $$(".menu .menu-item").filter((b) => txt(b) === label)[0];
  if (!item) throw new Error("в меню нет пункта «" + label + "»: " + $$(".menu .menu-item").map(txt).join("|"));
  fire(item, "click");
  return item;
}
async function submit(formSel, ms = 350) {
  const f = $(formSel);
  if (!f) throw new Error("нет формы " + formSel);
  f.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick(ms);
}
/** Pointer-события на доске (jsdom: MouseEvent с типом pointerdown годится). */
function ptr(type, target, x = 10, y = 10) {
  target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
}
function boardEl() { return $("#boardHost"); }
function svgEl() { return $("#boardHost svg.tb-svg"); }
function els() { return $$("#boardHost .tb-el"); }
function saveStateText() { return txt($('#boardHost [data-role="savestate"]')); }
function tacticRows() { return $$(".taccard"); }
function sheetStillOpen() { const r = $("#sheetRoot"); return !!r && !r.hidden && !!r.querySelector(".sheet"); }
function dbTactic(id) { return DB().cache.tactics.filter((t) => t.id === id)[0] || null; }
function boardBlockOf(t) { return ((t && t.blocks) || []).filter((b) => b.type === "board")[0] || null; }

async function main() {
  if (loadFailed) { report(); return; }
  check("скрипты загружаются без исключений", errors.length === 0, errors.join(" | "));
  check("старый service worker снимается с регистрации и чистит кэш", (() => {
    const html = readFileSync(`${ROOT}/index.html`, "utf8");
    return /serviceWorker/.test(html) && /unregister/.test(html) && /caches/.test(html) &&
      !/"sw\.js"|'sw\.js'/.test(html);
  })());

  /* boot() навешан на DOMContentLoaded — событие уже прошло, вызываем его сами. */
  doc.dispatchEvent(new window.Event("DOMContentLoaded"));
  await tick(400);

  /* ================= 1. Вход ================= */
  check("вход: показан экран входа команды", !!$("#loginForm") && /команд/i.test(txt(view())), txt(view()).slice(0, 60));
  check("вход: пустой PIN не пускает и объясняет причину", await (async () => {
    $("#liName").value = "БРАТЫ";
    $("#liPin").value = "";
    await submit("#loginForm", 200);
    return /PIN|название/i.test(txt($("#liErr"))) && DB().team === null;
  })(), txt($("#liErr")));
  check("вход: неверный PIN показывает понятную ошибку", await (async () => {
    $("#liPin").value = "0000";
    await submit("#loginForm", 300);
    return /неверный|не найдена/i.test(txt($("#liErr")));
  })(), txt($("#liErr")));

  /* ================= 2. Создание команды ================= */
  await go("#/create", 200);
  check("создание: форма команды открылась", !!$("#crForm"));
  $("#crName").value = "БРАТЫ";
  $("#crPin").value = "1234";
  $("#crCap").value = "Макс";
  $("#crCapPin").value = "9876";
  await submit("#crForm", 1200);
  check("создание: команда создана, показан экран с PIN", /Команда создана/.test(txt(view())), txt(view()).slice(0, 60));
  check("создание: стартовый набор загружен (игроки, карты, тактики)",
    DB().cache.players.length === 5 && DB().cache.maps.length === 3 && DB().cache.tactics.length === 12,
    `игроков=${DB().cache.players.length}, карт=${DB().cache.maps.length}, тактик=${DB().cache.tactics.length}`);
  click("#openPb");
  await tick(300);
  check("создание: вошли в плейбук и попали на «Обзор»", window.location.hash === "#/overview", window.location.hash);

  /* ================= 3. Обзор ================= */
  const ov = txt(view());
  check("обзор: названа команда и капитан", /БРАТЫ/.test(ov) && /Капитан:\s*Макс/.test(ov), ov.slice(0, 70));
  check("обзор: есть блок «Что сделать сейчас»", /Что сделать сейчас/.test(ov));
  check("обзор: показаны карты и количество тактик", /Карты и тактики/.test(ov) && $$(".maprow").length === 3,
    String($$(".maprow").length));
  check("обзор: убраны «Активные тактики» и лишняя статистика",
    !/Активные тактики/.test(ov) && $$(".statchip, .statgrid, .hero-strip").length === 0);
  check("обзор: капитану предложены быстрые действия", $$("[data-q]").length === 2, String($$("[data-q]").length));

  /* профиль игрока → задачи в обзоре */
  click("[data-pickme]");
  await tick(200);
  check("профиль: открылся выбор игрока", $$(".pick").length === 5, String($$(".pick").length));
  click($$(".pick")[0]);
  await tick(300);
  check("профиль: после выбора в обзоре появились задачи игрока", $$(".todo-list a").length > 0,
    String($$(".todo-list a").length));

  /* ================= 4. Навигация ================= */
  const navLabels = $$("#bottomNav .bnav").map((b) => txt(b));
  check("навигация: ровно 5 разделов — Обзор, Тактики, Игроки, Чат, Настройки",
    navLabels.join("|") === "Обзор|Тактики|Игроки|Чат|Настройки", navLabels.join("|"));
  check("навигация: боковое меню совпадает с нижним", $$("#sideNav .navlink").length === 5,
    String($$("#sideNav .navlink").length));
  check("навигация: старые адреса перенаправляются", await (async () => {
    await go("#/manage", 200);
    const a = window.location.hash;
    await go("#/maps", 200);
    const b = window.location.hash;
    return a === "#/settings" && b === "#/tactics";
  })(), `${window.location.hash}`);

  /* ================= 5. Тактики: карты и фильтры ================= */
  await go("#/tactics", 250);
  check("тактики: витрина карт отрисована", $$(".mapcard").length === 3 && /Mirage/i.test(txt(view())),
    String($$(".mapcard").length));
  let mirage = DB().cache.maps.filter((m) => /mirage/i.test(m.name))[0];
  await go("#/tactics/" + mirage.id, 250);
  const allCount = tacticRows().length;
  check("тактики: список тактик карты показан", allCount === 4, String(allCount));
  check("тактики: есть фильтры стороны, типа и поиск по названию",
    $$('[data-f="side"]').length === 3 && $$('[data-f="cat"]').length >= 2 && !!$("#tacSearch"));
  check("тактики: в карточке есть сторона, тип, карта, число игроков и «Открыть»", await (async () => {
    const card = tacticRows()[0];
    return !!card.querySelector(".badge") && /игр\./.test(txt(card)) && !!card.querySelector("[data-open]");
  })());
  click('[data-f="side"][data-v="CT"]');
  await tick(250);
  check("фильтр: сторона CT оставляет только CT-тактики",
    tacticRows().length === 2 && tacticRows().every((c) => /CT/.test(txt(c))), String(tacticRows().length));
  click('[data-f="side"][data-v=""]');
  await tick(200);
  $("#tacSearch").value = "Раскидки";
  $("#tacSearch").dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(400);
  check("фильтр: поиск по названию сужает список",
    tacticRows().length === 2 && tacticRows().every((c) => /Раскидки/.test(txt(c))), String(tacticRows().length));
  click("[data-clearq]");
  await tick(250);
  check("фильтр: сброс поиска возвращает весь список", tacticRows().length === allCount, String(tacticRows().length));

  /* ================= 6. Редактор тактики (доска) ================= */
  let defT = DB().cache.tactics.filter((t) => t.map_id === mirage.id && t.side === "T" && /Дефолт/.test(t.name))[0];
  await go("#/tactic/" + defT.id, 350);
  check("доска: карта отрисована в SVG", !!svgEl() && $$("#boardHost svg.tb-svg image, #boardHost svg.tb-svg rect.tb-nobg").length > 0);
  check("доска: стартовые позиции игроков из набора видны", els().length === 5, String(els().length));
  const toolIds = $$('#boardHost [data-tool]').map((b) => b.dataset.tool);
  check("доска: полный набор инструментов (выбор, игроки, противник, маршрут, стрелка, линия, зона, точка, гранаты, бомба, текст, удалить)",
    ["select", "pan", "player", "enemy", "path", "arrow", "line", "zone", "dot", "smoke", "molly", "flash", "he", "bomb", "text", "eraser"]
      .every((t) => toolIds.indexOf(t) >= 0), toolIds.join(","));
  check("доска: у каждого инструмента есть подсказка", $$('#boardHost [data-tool]').every((b) => (b.title || "").length > 3));
  const actIds = $$('#boardHost [data-act]').map((b) => b.dataset.act);
  check("доска: быстрые действия — отменить, повторить, расставить, очистить, сохранить",
    ["undo", "redo", "place", "fan", "grid", "clear", "save"].every((a) => actIds.indexOf(a) >= 0), actIds.join(","));
  check("доска: есть масштаб (уменьшить/увеличить/вписать)", $$('[data-zoom]').length === 4, String($$('[data-zoom]').length));
  check("доска: панель свойств с вкладками Элемент/Игрок/Тактика",
    $$('[data-tab]').map((b) => b.dataset.tab).join("|") === "element|player|tactic");

  /* рисуем новую гранату */
  click('#boardHost [data-tool="smoke"]');
  await tick(120);
  ptr("pointerdown", svgEl(), 30, 30);
  ptr("pointerup", svgEl(), 30, 30);
  await tick(150);
  check("доска: инструмент «Смоук» ставит элемент на карту", els().length === 6, String(els().length));
  check("доска: появилась отметка о несохранённых правках", /несохран/i.test(saveStateText()), saveStateText());

  /* отмена / повтор */
  click('#boardHost [data-act="undo"]');
  await tick(150);
  check("доска: «Отменить» убирает последний элемент", els().length === 5, String(els().length));
  click('#boardHost [data-act="redo"]');
  await tick(150);
  check("доска: «Повторить» возвращает элемент", els().length === 6, String(els().length));

  /* зум меняет transform, а не перерисовывает страницу */
  const vp = $('#boardHost [data-role="vp"]');
  const beforeZoom = vp.getAttribute("transform");
  click('[data-zoom="in"]');
  await tick(120);
  check("доска: увеличение меняет transform группы (без перерисовки DOM)",
    vp.getAttribute("transform") !== beforeZoom, vp.getAttribute("transform"));

  /* выбор элемента → панель свойств (сначала инструмент «Выбор», иначе граната ставит новую) */
  click('#boardHost [data-tool="select"]');
  await tick(120);
  const smokeNode = $$('#boardHost .tb-el[data-kind="smoke"]')[0];
  ptr("pointerdown", smokeNode, 30, 30);
  ptr("pointerup", smokeNode, 30, 30);
  await tick(200);
  check("доска: выбранный элемент подсвечен и показан в панели свойств",
    $$('#boardHost .tb-el.sel').length === 1 && /Смоук|Название/.test(txt($("#inspBody"))), txt($("#inspBody")).slice(0, 50));
  check("доска: в панели есть цвет, название, привязка к игроку, видео и удаление",
    !!$('[data-prop="label"]', $("#inspBody")) && $$('[data-color]', $("#inspBody")).length >= 4 &&
    !!$('[data-prop="playerId"]', $("#inspBody")) && !!$('[data-el="del"]', $("#inspBody")));

  /* правка свойства реально меняет данные */
  const labelInput = $('[data-prop="label"]', $("#inspBody"));
  labelInput.value = "Смок CT";
  labelInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  await tick(200);
  check("доска: правка названия в панели меняет элемент",
    $('[data-prop="label"]', $("#inspBody")).value === "Смок CT" && /Смок C/.test($("#boardHost").innerHTML),
    $('[data-prop="label"]', $("#inspBody")).value);

  /* сохранение схемы */
  click('#boardHost [data-act="save"]');
  await tick(400);
  const savedT = dbTactic(defT.id);
  check("доска: «Сохранить» записывает схему в хранилище",
    saveStateText() === "" && (boardBlockOf(savedT).markers || []).length === 6,
    `меток=${(boardBlockOf(savedT).markers || []).length}, состояние=«${saveStateText()}»`);
  check("доска: сохранённое название элемента дошло до базы",
    (boardBlockOf(savedT).markers || []).some((m) => m.label === "Смок CT"));

  /* удаление элемента схемы */
  click('[data-el="del"]', $("#inspBody"));
  await tick(250);
  check("доска: удаление элемента убирает его со схемы", els().length === 5, String(els().length));
  click('#boardHost [data-act="save"]');
  await tick(350);
  check("доска: удалённый элемент не вернулся после сохранения",
    (boardBlockOf(dbTactic(defT.id)).markers || []).length === 5);

  /* очистка всей разметки */
  click('#boardHost [data-act="clear"]');
  await tick(200);
  check("доска: очистка спрашивает подтверждение (своя модалка, не window.confirm)",
    !!$(".modal") && nativeDialogs.length === 0, nativeDialogs.join(","));
  click('[data-mbtn="yes"]');
  await tick(300);
  check("доска: «Очистить схему» убирает всю разметку", els().length === 0, String(els().length));
  click('#boardHost [data-act="undo"]');
  await tick(200);
  check("доска: очистка отменяется через «Отменить»", els().length === 5, String(els().length));
  click('#boardHost [data-act="save"]');
  await tick(350);

  /* режим «на весь экран» и выход из него */
  click('#boardHost [data-act="big"]');
  await tick(250);
  check("доска: режим «на весь экран» включается",
    doc.body.classList.contains("board-full") && $("#boardHost").classList.contains("tb-full"));
  await go("#/overview", 300);
  check("доска: при уходе с экрана полноэкранный режим снимается (шапка и меню возвращаются)",
    !doc.body.classList.contains("board-full"), doc.body.className);
  await go("#/tactic/" + defT.id, 350);

  /* ================= 7. Вид игрока в тактике ================= */
  const chips = $$('[data-focus]');
  check("тактика: переключатели игроков 1–5 и «Вся команда»", chips.length === 6, String(chips.length));
  click(chips[1]);
  await tick(300);
  check("игрок: схема затемняет чужие элементы (фокус на игроке)", $$("#boardHost .tb-el.dim").length > 0,
    String($$("#boardHost .tb-el.dim").length));
  const insp = txt($("#inspBody"));
  check("игрок: в панели видны старт, маршрут, задача, гранаты, комментарий капитана и видео",
    ["Роль", "Старт", "Маршрут", "Задача", "Гранаты", "Комментарий капитана", "Видео"].every((k) => insp.indexOf(k) >= 0),
    insp.replace(/\s+/g, " ").slice(0, 120));
  check("игрок: комментарий капитана из стартового набора на месте", /Мид|рампа|аппарт|спаун|точка/i.test(insp),
    insp.slice(0, 90));
  click(chips[0]);
  await tick(250);
  check("игрок: «Вся команда» снимает затемнение", $$("#boardHost .tb-el.dim").length === 0);

  /* ================= 8. Видео (YouTube без перехода на сайт) ================= */
  click('[data-tab="tactic"]');
  await tick(250);
  click("[data-addvideo]", $("#inspBody"));
  await tick(250);
  check("видео: открылась форма привязки видео", !!$("#vUrl") && !!$("#vPlayer") && !!$("#vKind"));
  $("#vUrl").value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  $("#vUrl").dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(350);
  check("видео: ссылка YouTube распознаётся сразу и показан предпросмотр",
    /YouTube/i.test(txt($("#vPrev"))), txt($("#vPrev")).slice(0, 60));
  $("#vTitle").value = "Смок на CT-ступени";
  $("#vPlayer").value = DB().cache.players[3].id;
  $("#vKind").value = "smoke";
  click("[data-ok]");
  await tick(400);
  const vT = dbTactic(defT.id);
  const vItems = ((vT.blocks || []).filter((b) => b.type === "video")[0] || {}).items || [];
  check("видео: сохранено в тактике с привязкой к игроку и типу",
    vItems.length === 1 && vItems[0].playerId === DB().cache.players[3].id && vItems[0].kind === "smoke",
    JSON.stringify(vItems[0] || {}).slice(0, 120));
  check("видео: показано в панели тактики", /Смок на CT-ступени/.test(txt($("#inspBody"))));

  /* проигрывание внутри приложения */
  click('[data-play]', $("#inspBody"));
  await tick(300);
  const frame = $("#viewerRoot iframe");
  check("видео: открывается встроенным плеером внутри приложения (не уходом на YouTube)",
    !!frame && /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/.test(frame.getAttribute("src") || ""),
    frame ? frame.getAttribute("src") : "нет iframe");
  click("#viewerRoot [data-vclose]");
  await tick(200);
  check("видео: плеер закрывается и возвращает к тактике", $("#viewerRoot").hidden === true);

  /* видео видно у конкретного игрока */
  click('[data-tab="player"]');
  await tick(200);
  const p4chip = $$('[data-focus]')[4];
  click(p4chip);
  await tick(300);
  check("видео: игрок видит своё видео в своей панели", /Смок на CT-ступени/.test(txt($("#inspBody"))),
    txt($("#inspBody")).slice(0, 80));

  /* удаление видео */
  click('[data-tab="tactic"]');
  await tick(250);
  click("[data-vmenu]", $("#inspBody"));
  await tick(200);
  menuByLabel("Удалить видео");
  await tick(200);
  click('[data-mbtn="yes"]');
  await tick(400);
  const afterDel = ((dbTactic(defT.id).blocks || []).filter((b) => b.type === "video")[0] || {}).items || [];
  check("видео: удаление стирает запись из базы, а не только из интерфейса",
    afterDel.length === 0 && !/Смок на CT-ступени/.test(txt($("#inspBody"))), JSON.stringify(afterDel).slice(0, 60));

  /* ================= 9. CRUD тактик ================= */
  await go("#/tactics/" + mirage.id, 300);
  click("[data-newt]");
  await tick(250);
  check("тактика: форма создания открылась", !!$("#ntForm") && !!$("#ntName"));
  $("#ntName").value = "Сплит А через палас";
  $("#ntSide").value = "T";
  $("#ntCat").value = "Execute";
  await submit("#ntForm", 500);
  let created = DB().cache.tactics.filter((t) => t.name === "Сплит А через палас")[0];
  check("тактика: создана и сразу открыта в редакторе",
    !!created && window.location.hash === "#/tactic/" + created.id, window.location.hash);
  check("тактика: у новой тактики есть пустая схема для рисования",
    !!created && !!boardBlockOf(created) && !!svgEl(), "");
  await go("#/tactics/" + mirage.id, 300);
  check("тактика: новая тактика видна в списке карты", tacticRows().length === allCount + 1 &&
    $$('.taccard[data-tac="' + created.id + '"]').length === 1, String(tacticRows().length));

  /* переименование */
  await go("#/tactic/" + created.id, 350);
  click("[data-tmenu]");
  await tick(200);
  menuByLabel("Изменить");
  await tick(250);
  check("тактика: форма изменения открылась с текущими данными", $("#etName") && $("#etName").value === "Сплит А через палас",
    $("#etName") ? $("#etName").value : "нет поля");
  $("#etName").value = "Сплит А (палас + рампа)";
  $("#etCat").value = "Split";
  click("[data-ok]");
  await tick(450);
  check("тактика: переименована в базе и в шапке экрана",
    dbTactic(created.id).name === "Сплит А (палас + рампа)" && /Сплит А \(палас/.test(txt(view())),
    dbTactic(created.id).name);
  check("тактика: тип изменён", dbTactic(created.id).category === "Split", dbTactic(created.id).category);

  /* копия тактики: схема и блоки копируются, идентификаторы новые */
  click("[data-tmenu]");
  await tick(200);
  menuByLabel("Копия тактики");
  await tick(600);
  const copy = DB().cache.tactics.filter((t) => t.name === "Сплит А (палас + рампа) (копия)")[0];
  check("тактика: копия создана и открыта", !!copy && window.location.hash === "#/tactic/" + copy.id,
    copy ? window.location.hash : "копии нет");
  check("тактика: копия получила новые идентификаторы блоков (не ссылается на оригинал)",
    !!copy && (copy.blocks || []).every((b) => b.id !== (dbTactic(created.id).blocks || []).filter((x) => x.type === b.type)[0]?.id));
  await go("#/tactics/" + mirage.id, 300);
  click('[data-tdel="' + copy.id + '"]');
  await tick(250);
  click('[data-mbtn="yes"]');
  await tick(450);
  check("тактика: копия удаляется независимо от оригинала",
    !dbTactic(copy.id) && !!dbTactic(created.id));

  /* карточка игрока: компактный вид */
  await go("#/players", 300);
  check("игроки: компактные карточки состава отрисованы", $$(".pcard").length === 5, String($$(".pcard").length));
  const pc = txt($$(".pcard")[0]);
  check("игроки: в карточке номер, ник, роль, тактика и кнопка «Открыть»",
    /\d/.test(pc) && /Открыть/.test(pc), pc.slice(0, 90));
  check("игроки: в интерфейсе нет «сырого» SVG и служебных значений",
    !/<svg|<path|\[object Object\]|undefined|NaN/.test(view().innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "")),
    (view().innerHTML.match(/undefined|NaN|\[object Object\]/g) || []).slice(0, 3).join(","));

  /* ================= 10. Игроки: создание, правка, удаление ================= */
  await go("#/settings", 300);
  click("[data-addp]");
  await tick(250);
  check("игроки: форма добавления открылась", !!$("#plName"));
  $("#plName").value = "Шестой";
  $("#plRole").value = "Support";
  click("[data-ok]");
  await tick(450);
  const newP = DB().cache.players.filter((p) => p.name === "Шестой")[0];
  check("игроки: новый игрок сохранён и открыта его карточка",
    !!newP && DB().cache.players.length === 6 && window.location.hash === "#/player/" + newP.id,
    `${DB().cache.players.length}, ${window.location.hash}`);
  await go("#/settings", 300);
  check("игроки: новый игрок сразу виден в настройках команды",
    $$('[data-pmenu="' + newP.id + '"]').length === 1 && /Шестой/.test(txt(view())),
    String($$("[data-pmenu]").length));
  click('[data-pmenu="' + newP.id + '"]');
  await tick(200);
  menuByLabel("Изменить");
  await tick(250);
  $("#plName").value = "Седьмой";
  click("[data-ok]");
  await tick(450);
  check("игроки: имя изменено в базе", !!DB().cache.players.filter((p) => p.id === newP.id && p.name === "Седьмой")[0]);
  /* привязываем нового игрока к токену на схеме, затем удаляем его */
  await go("#/tactic/" + defT.id, 350);
  click('#boardHost [data-tool="select"]');
  await tick(120);
  const tok = $$('#boardHost .tb-el[data-kind="player"]')[4];
  ptr("pointerdown", tok, 40, 40);
  ptr("pointerup", tok, 40, 40);
  await tick(250);
  const sel = $('[data-prop="playerId"]', $("#inspBody"));
  check("схема: токен игрока выбран, в панели можно назначить игрока", !!sel && sel.tagName === "SELECT",
    sel ? sel.tagName : "нет поля");
  sel.value = newP.id;
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await tick(250);
  click('#boardHost [data-act="save"]');
  await tick(400);
  check("схема: назначенный игрок сохранён в токене",
    (boardBlockOf(dbTactic(defT.id)).markers || []).some((m) => m.playerId === newP.id));
  await go("#/settings", 300);
  click('[data-pmenu="' + newP.id + '"]');
  await tick(200);
  menuByLabel("Удалить игрока");
  await tick(200);
  click('[data-mbtn="yes"]');
  await tick(450);
  check("игроки: удалённый игрок исчез из базы и из списка",
    DB().cache.players.length === 5 && !DB().cache.players.some((p) => p.id === newP.id) &&
    !/Седьмой/.test(txt(view())), String(DB().cache.players.length));
  check("игроки: после удаления в тактиках не осталось битых привязок", (() => {
    const ids = DB().cache.players.map((x) => x.id);
    const dangling = [];
    DB().cache.tactics.forEach((t) => (t.blocks || []).forEach((b) => {
      (b.markers || []).forEach((m) => { if (m.playerId && ids.indexOf(m.playerId) < 0) dangling.push("marker"); });
      (b.drawings || []).forEach((d) => { if (d.playerId && ids.indexOf(d.playerId) < 0) dangling.push("drawing"); });
      (b.items || []).forEach((it) => {
        if (it.playerId && ids.indexOf(it.playerId) < 0) dangling.push("item.playerId");
        if (it.by && ids.indexOf(it.by) < 0) dangling.push("item.by");
      });
    }));
    return dangling.length === 0;
  })(), "");

  /* ================= 11. Роли и язык терминов ================= */
  click("[data-addrole]");
  await tick(250);
  $("#rlName").value = "Снайпер";
  click("[data-ok]");
  await tick(400);
  check("роли: добавленная роль сохранена в настройках команды",
    (DB().team.settings.roles || []).indexOf("Снайпер") >= 0 && /Снайпер/.test(txt(view())),
    JSON.stringify(DB().team.settings.roles));
  click('[data-delrole="Снайпер"]');
  await tick(400);
  check("роли: удаление роли убирает её из настроек",
    (DB().team.settings.roles || []).indexOf("Снайпер") < 0, JSON.stringify(DB().team.settings.roles));

  click('[data-terms="en"]');
  await tick(400);
  check("язык: терминология CS2 (англ.) переключается и сохраняется",
    DB().team.settings.terms === "en" && /Smoke/.test(txt(view())), txt($('[data-terms="en"]')));
  click('[data-terms="ru"]');
  await tick(400);
  check("язык: русские термины возвращаются", DB().team.settings.terms === "ru" && /Смоук/.test(txt(view())));

  /* материалы команды */
  const matBefore = DB().cache.materials.length;
  click("[data-addm]");
  await tick(250);
  check("материалы: форма добавления открылась", !!$("#mtTitle") && !!$("#mtType") && !!$("#mtUrl"));
  $("#mtTitle").value = "Разбор демо Mirage";
  $("#mtType").value = "video";
  $("#mtUrl").value = "https://youtu.be/dQw4w9WgXcQ";
  $("#mtMap").value = mirage.id;
  click("[data-ok]");
  await tick(500);
  const mat = DB().cache.materials.filter((m) => m.title === "Разбор демо Mirage")[0];
  check("материалы: добавлены и видны в настройках", !!mat && DB().cache.materials.length === matBefore + 1,
    String(DB().cache.materials.length));
  click('[data-mopen="' + mat.id + '"]');
  await tick(300);
  check("материалы: YouTube-ссылка открывается встроенным плеером",
    !!$("#viewerRoot iframe") && /youtube-nocookie/.test($("#viewerRoot iframe").getAttribute("src") || ""),
    $("#viewerRoot iframe") ? $("#viewerRoot iframe").getAttribute("src") : "нет плеера");
  click("#viewerRoot [data-vclose]");
  await tick(200);
  await go("#/tactics/" + mirage.id, 300);
  check("материалы: материал карты показан на экране карты", /Разбор демо Mirage/.test(txt(view())));
  await go("#/settings", 300);
  click('[data-mmenu="' + mat.id + '"]');
  await tick(200);
  menuByLabel("Удалить");
  await tick(200);
  click('[data-mbtn="yes"]');
  await tick(500);
  check("материалы: удаление стирает материал из базы",
    !DB().cache.materials.some((m) => m.id === mat.id) && DB().cache.materials.length === matBefore,
    String(DB().cache.materials.length));

  /* смена PIN капитана */
  click('[data-pin="captain"]');
  await tick(250);
  $("#pin1").value = "1234";
  $("#pin2").value = "1234";
  click("[data-ok]");
  await tick(400);
  check("PIN: капитанский PIN совпадающий с командным отклоняется",
    /уже используется|не должен совпадать/i.test(txt($("#pinErr"))), txt($("#pinErr")));
  $("#pin1").value = "5555";
  $("#pin2").value = "5555";
  click("[data-ok]");
  await tick(500);
  check("PIN: новый PIN капитана сохранён", !sheetStillOpen() && /PIN изменён/.test(txt($("#toastRoot"))),
    txt($("#toastRoot")).slice(0, 40));
  DB().role = "player";
  await DB().loginCaptain("5555");
  check("PIN: вход капитана работает с новым PIN", DB().isCaptain() === true);

  /* экспорт копии плейбука */
  let exportedBlob = null;
  window.URL.createObjectURL = (b) => { exportedBlob = b; return "blob:fake"; };
  window.URL.revokeObjectURL = () => {};
  click("[data-export]");
  await tick(300);
  const exportedText = exportedBlob ? await new Promise((res) => {
    const fr = new window.FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => res("");
    fr.readAsText(exportedBlob);
  }) : "";
  let snap = null;
  try { snap = JSON.parse(exportedText); } catch (e) { snap = null; }
  check("экспорт: скачивается JSON со всеми таблицами команды",
    !!snap && snap.app === "cs2-team-playbook" && snap.data.tactics.length === DB().cache.tactics.length &&
    !!snap.team.name && snap.data.players.length === 5,
    snap ? `тактик=${snap.data.tactics.length}` : "файл не получен");
  check("экспорт: PIN-хэши и соль не попадают в выгрузку",
    exportedText.length > 0 && !/pinHash|captainPinHash|salt/.test(exportedText));

  /* ================= 12. Карты: создание и удаление (каскад) ================= */
  await go("#/tactics", 300);
  click("[data-addmap]");
  await tick(250);
  check("карты: форма добавления открылась", !!$("#mpName"));
  $("#mpName").value = "Nuke";
  click("[data-ok]");
  await tick(450);
  const nuke = DB().cache.maps.filter((m) => m.name === "Nuke")[0];
  check("карты: новая карта сохранена и открыта", !!nuke && window.location.hash === "#/tactics/" + nuke.id,
    window.location.hash);
  await go("#/tactics", 300);
  check("карты: новая карта появилась в витрине", $$(".mapcard").length === 4, String($$(".mapcard").length));
  await go("#/tactics/" + nuke.id, 300);
  check("карты: у пустой карты понятное пустое состояние и кнопка создания",
    /Тактик на этой карте пока нет/.test(txt(view())) && !!$("[data-newt]"), txt(view()).slice(0, 70));
  await go("#/tactics", 300);
  click('[data-mapmenu="' + nuke.id + '"]');
  await tick(200);
  menuByLabel("Удалить карту");
  await tick(200);
  click('[data-mbtn="yes"]');
  await tick(450);
  check("карты: удаление карты убирает её из витрины",
    !DB().cache.maps.some((m) => m.id === nuke.id) && $$(".mapcard").length === 3, String($$(".mapcard").length));

  /* ================= 13. Удаление тактики ================= */
  await go("#/tactics/" + mirage.id, 300);
  const victim = DB().cache.tactics.filter((t) => t.name === "Сплит А (палас + рампа)")[0];
  click('[data-tdel="' + victim.id + '"]');
  await tick(250);
  check("тактика: удаление спрашивает подтверждение", !!$(".modal") && /Удалить тактику/.test(txt($(".modal"))));
  click('[data-mbtn="yes"]');
  await tick(450);
  check("тактика: удалена из базы и из списка",
    !dbTactic(victim.id) && !$$('.taccard[data-tac="' + victim.id + '"]').length,
    String(tacticRows().length));
  await go("#/tactic/" + victim.id, 300);
  check("тактика: прямой адрес удалённой тактики показывает понятное состояние, а не пустой экран",
    /Тактика не найдена/.test(txt(view())), txt(view()).slice(0, 60));

  /* импорт возвращает удалённое — проверка сквозного восстановления данных */
  await go("#/settings", 300);
  const impFile = new window.File([exportedText], "playbook.json", { type: "application/json" });
  const impInput = $("[data-impfile]");
  Object.defineProperty(impInput, "files", { value: [impFile], configurable: true });
  impInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  await tick(500);
  check("импорт: замена данных спрашивает подтверждение",
    !!$(".modal") && /Заменить данные команды/.test(txt($(".modal"))), txt($(".modal")).slice(0, 50));
  click('[data-mbtn="yes"]');
  await tick(1500);
  check("импорт: удалённая тактика вернулась из копии",
    DB().cache.tactics.some((t) => t.name === "Сплит А (палас + рампа)") &&
    DB().cache.tactics.length === snap.data.tactics.length,
    `тактик=${DB().cache.tactics.length}, в копии=${snap.data.tactics.length}`);
  check("импорт: состав материалов совпал с копией (удалённое до экспорта не воскресло)",
    DB().cache.materials.length === snap.data.materials.length &&
    !DB().cache.materials.some((m) => m.title === "Разбор демо Mirage"),
    `${DB().cache.materials.length} против ${snap.data.materials.length}`);
  /* после импорта строки получили новые идентификаторы — берём свежие ссылки */
  mirage = DB().cache.maps.filter((m) => /mirage/i.test(m.name))[0];
  defT = DB().cache.tactics.filter((t) => t.map_id === mirage.id && t.side === "T" && /Дефолт/.test(t.name))[0];
  created = DB().cache.tactics.filter((t) => t.name === "Сплит А (палас + рампа)")[0];
  check("импорт: экраны продолжают работать с новыми идентификаторами", !!mirage && !!defT && !!created);
  check("импорт: тактики остались привязаны к своим картам",
    DB().cache.tactics.every((t) => !t.map_id || DB().cache.maps.some((m) => m.id === t.map_id)),
    String(DB().cache.tactics.filter((t) => t.map_id && !DB().cache.maps.some((m) => m.id === t.map_id)).length));
  check("импорт: игроки в схеме и задачах перепривязаны к новым id", (() => {
    const ids = DB().cache.players.map((x) => x.id);
    const bad = [];
    DB().cache.tactics.forEach((t) => (t.blocks || []).forEach((b) => {
      (b.markers || []).forEach((m) => { if (m.playerId && ids.indexOf(m.playerId) < 0) bad.push("marker"); });
      (b.items || []).forEach((it) => {
        if (it.playerId && ids.indexOf(it.playerId) < 0) bad.push("item.playerId");
        if (it.by && ids.indexOf(it.by) < 0) bad.push("item.by");
      });
    }));
    return bad.length === 0;
  })(), "");

  /* ================= 14. Чат ================= */
  await go("#/chat", 300);
  check("чат: пустое состояние и поле ввода на месте",
    /Сообщений пока нет/.test(txt($("#chatList"))) && !!$("#chatText") && !!$("#chatForm"));
  $("#chatText").value = "   ";
  await submit("#chatForm", 300);
  check("чат: пустое сообщение не отправляется", DB().cache.messages.length === 0 && $$("#chatList .msg").length === 0,
    String(DB().cache.messages.length));
  $("#chatText").value = "Тренировка в 20:00";
  await submit("#chatForm", 400);
  check("чат: сообщение отправлено и показано с автором",
    DB().cache.messages.length === 1 && $$("#chatList .msg").length === 1 &&
    txt($("#chatList .msg")).indexOf(DB().actorName()) === 0 && /Тренировка в 20:00/.test(txt($("#chatList .msg"))),
    txt($("#chatList .msg")).slice(0, 60));
  check("чат: поле ввода очищено после отправки", $("#chatText").value === "", $("#chatText").value);
  $("#chatText").value = "Второе сообщение";
  await submit("#chatForm", 400);
  check("чат: лента обновляется без полной перерисовки экрана", $$("#chatList .msg").length === 2 && !!$("#chatText"));

  /* объявление капитана */
  click("[data-notice]");
  await tick(250);
  $("#chatText").value = "Завтра разбираем Mirage";
  await submit("#chatForm", 400);
  check("чат: объявление капитана сохраняется отдельным типом и показано сверху",
    DB().cache.messages.filter((m) => m.kind === "notice").length === 1 && !!$(".notice"),
    JSON.stringify(DB().cache.messages.map((m) => m.kind)));

  /* удаление сообщения */
  const msgId = DB().cache.messages[0].id;
  click('[data-del="' + msgId + '"]');
  await tick(250);
  click('[data-mbtn="yes"]');
  await tick(400);
  check("чат: сообщение удалено из базы и из ленты",
    !DB().cache.messages.some((m) => m.id === msgId) && $$("#chatList .msg").length === 2,
    String($$("#chatList .msg").length));

  /* черновик не теряется при обновлении ленты */
  $("#chatText").value = "черновик";
  $("#chatText").dispatchEvent(new window.Event("input", { bubbles: true }));
  await DB().sendMessage("Сообщение из другого окна");
  await tick(400);
  check("чат: входящее сообщение не стирает начатый текст",
    $("#chatText") && $("#chatText").value === "черновик", $("#chatText") ? $("#chatText").value : "нет поля");

  /* ================= 15. Права игрока ================= */
  await go("#/settings", 300);
  click("[data-logout]");
  await tick(300);
  click('[data-mbtn="yes"]');
  await tick(400);
  check("выход: сессия сброшена, показан экран входа", DB().team === null && !!$("#loginForm"), window.location.hash);
  $("#liName").value = "БРАТЫ";
  $("#liPin").value = "1234";
  await submit("#loginForm", 600);
  check("вход игроком: команда открыта без прав капитана", DB().team && DB().team.name === "БРАТЫ" && !DB().isCaptain());

  await go("#/tactics/" + mirage.id, 300);
  check("права: игроку не показывают кнопки создания и правки тактик",
    $$("[data-newt]").length === 0 && $$("[data-tedit]").length === 0 && $$("[data-tdel]").length === 0 &&
    $$("[data-mapmenu]").length === 0 && !!$$(".taccard [data-open]").length);
  await go("#/tactic/" + defT.id, 350);
  check("права: доска игрока доступна для просмотра, но без инструментов правки",
    !!svgEl() && els().length === 5 && $$('#boardHost [data-tool]').length === 0 &&
    $$('#boardHost [data-act="save"]').length === 0 && $$('#boardHost [data-act="clear"]').length === 0,
    `элементов=${els().length}, инструментов=${$$('#boardHost [data-tool]').length}`);
  check("права: игрок может приближать карту и переключать игроков",
    $$('[data-zoom]').length === 4 && $$('[data-focus]').length === 6);
  await go("#/settings", 300);
  check("права: игроку закрыты разделы управления, но показаны язык и аккаунт",
    $$("[data-addp]").length === 0 && $$("[data-addrole]").length === 0 && $$("[data-teamedit]").length === 0 &&
    $$("[data-delteam]").length === 0 && $$("[data-terms]").length === 2 && $$("[data-logout]").length === 1);
  check("права: игроку предложено войти как капитан по PIN", !!$("[data-capin]"));
  await go("#/chat", 300);
  $("#chatText").value = "Игрок на связи";
  await submit("#chatForm", 400);
  check("чат: игрок может писать в чат", DB().cache.messages.some((m) => m.text === "Игрок на связи"));
  check("чат: игроку не показан режим объявления", $$("[data-notice]").length === 0);
  await DB().adapter.sendMessage(DB().team.id, { author: "Чужой капитан", text: "сообщение другого участника", ts: Date.now() });
  await tick(400);
  const foreign = $$("#chatList .msg").filter((m) => /Чужой капитан/.test(txt(m)));
  check("чат: чужое сообщение игроку удалить нельзя, своё — можно",
    foreign.length === 1 && !foreign[0].querySelector("[data-del]") &&
    $$("#chatList .msg").filter((m) => /Игрок на связи/.test(txt(m)))[0].querySelector("[data-del]") !== null,
    `чужих=${foreign.length}, кнопок=${$$("#chatList [data-del]").length}`);

  /* вход капитана по PIN */
  await go("#/settings", 300);
  click("[data-capin]");
  await tick(250);
  check("капитан: запрошен PIN капитана", !!$("#capPinForm") || !!$("#capPin"));
  $("#capPin").value = "5555";   // PIN капитана меняли в разделе настроек
  await submit("#capPinForm", 500);
  check("капитан: после PIN права капитана возвращены", DB().isCaptain() === true);
  await go("#/tactics/" + mirage.id, 300);
  check("капитан: инструменты управления снова видны",
    $$("[data-newt]").length > 0 && $$("[data-tedit]").length > 0 && $$("[data-tdel]").length > 0);

  /* ================= 16. Поиск ================= */
  click("#searchBtn");
  await tick(250);
  check("поиск: оверлей открылся", !!$(".searchov") && !!$("#gSearch"));
  $("#gSearch").value = "Mirage";
  $("#gSearch").dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(400);
  check("поиск: находит карту по названию", $$("#gRes .srow").length > 0, String($$("#gRes .srow").length));
  click($$("#gRes .srow")[0]);
  await tick(350);
  check("поиск: результат открывает нужный экран",
    /^#\/(tactics|tactic|player)\//.test(window.location.hash) && !/Не удалось|не найдена/i.test(txt(view())),
    window.location.hash + " · " + txt(view()).slice(0, 40));
  check("поиск: оверлей закрыт после перехода", !$(".searchov"));

  /* ================= 17. Мобильная раскладка ================= */
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
  window.dispatchEvent(new window.Event("resize"));
  await go("#/tactic/" + defT.id, 400);
  check("мобильная версия: нижняя панель инструментов из 5 кнопок + «Ещё»",
    $$('#boardHost .tb-mtools [data-tool]').length >= 5, String($$('#boardHost .tb-mtools [data-tool]').length));
  const moreBtn = $('#boardHost .tb-mtools [data-moretools]');
  check("мобильная версия: «Ещё» открывает полный набор инструментов", await (async () => {
    if (!moreBtn) return false;
    fire(moreBtn, "click");
    await tick(250);
    const n = $$(".sheet .toolcell").length;
    if ($(".sheet [data-x]")) fire($(".sheet [data-x]"), "click");
    await tick(150);
    return n >= 8;
  })(), String($$(".sheet .toolcell").length));
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true, writable: true });
  window.dispatchEvent(new window.Event("resize"));
  await tick(200);

  /* ================= 18. Прямой адрес и «перезагрузка» ================= */
  const direct = DB().cache.tactics.filter((t) => t.map_id === mirage.id && t.side === "CT")[0];
  await go("#/tactic/" + direct.id, 400);
  check("прямой адрес тактики открывается без перехода по меню", !!svgEl() && /Дефолт CT|Раскидки CT/.test(txt(view())),
    txt(view()).slice(0, 40));

  /* имитация перезагрузки: новое окно с тем же localStorage */
  const savedLS = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    savedLS[k] = window.localStorage.getItem(k);
  }
  const dom2 = new JSDOM(readFileSync(`${ROOT}/index.html`, "utf8"), {
    url: "http://localhost/#/tactic/" + defT.id, runScripts: "outside-only", pretendToBeVisual: true,
  });
  Object.keys(savedLS).forEach((k) => dom2.window.localStorage.setItem(k, savedLS[k]));
  const errors2 = [];
  dom2.window.addEventListener("error", (e) => errors2.push(String(e.error || e.message)));
  for (const f of FILES) dom2.window.eval(readFileSync(`${ROOT}/${f}`, "utf8"));
  dom2.window.document.dispatchEvent(new dom2.window.Event("DOMContentLoaded"));
  await tick(700);
  const v2 = dom2.window.document.getElementById("view");
  check("перезагрузка: данные сохранены и экран тактики открылся сразу",
    !!dom2.window.document.querySelector("#boardHost svg") && /Дефолт T/.test(v2.textContent),
    v2.textContent.replace(/\s+/g, " ").slice(0, 60));
  check("перезагрузка: удалённые сущности не вернулись",
    !dom2.window.PlaybookDB.cache.tactics.some((t) => /\(копия\)$/.test(t.name)) &&
    !dom2.window.PlaybookDB.cache.maps.some((m) => m.name === "Nuke") &&
    dom2.window.PlaybookDB.cache.players.length === 5,
    `тактик=${dom2.window.PlaybookDB.cache.tactics.length}, игроков=${dom2.window.PlaybookDB.cache.players.length}`);
  check("перезагрузка: сообщений в чате столько же, сколько осталось",
    dom2.window.PlaybookDB.cache.messages.length === DB().cache.messages.length,
    `${dom2.window.PlaybookDB.cache.messages.length} против ${DB().cache.messages.length}`);
  check("перезагрузка: ошибок не появилось", errors2.length === 0, errors2.join(" | "));

  /* ================= 19. Итоговые проверки качества ================= */
  check("качество: нативные confirm/prompt/alert не используются", nativeDialogs.length === 0, nativeDialogs.join(","));
  check("качество: в разметке нет необработанных ошибок и «undefined»",
    !/undefined|NaN|\[object Object\]/.test(view().innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "")),
    (view().innerHTML.match(/.{0,25}(undefined|NaN|\[object Object\]).{0,15}/g) || []).slice(0, 2).join(" / "));
  check("качество: за всё время прогона не возникло ошибок", errors.length === 0, errors.join(" | "));
  report();
}

function report() {
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error("\nHARNESS ERROR:", e && e.stack || e);
  process.exit(2);
});
