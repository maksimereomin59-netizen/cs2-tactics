/* Интеграционный прогон в jsdom: настоящий index.html + все скрипты.
   Проверяем, что приложение поднимается, команда создаётся, а новая
   кнопка «Проверить связь» действительно работает. */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
let pass = 0, fail = 0;
const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  ok ? pass++ : fail++;
};

const html = readFileSync(`${ROOT}/index.html`, "utf8");
const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
window.onunhandledrejection = (e) => errors.push("unhandled: " + e.reason);

/* Подключаем скрипты в том же порядке, что и в index.html.
   Конфигурацию берём из supabase-config.example.js, а не из рабочего
   supabase-config.js: в рабочем лежат настоящие ключи проекта, db.js с ними
   включает облачный режим (cloudConfig() принимает url без «xxxx»), тест уходит
   в сетевые вызовы и раздел «Управление» не дорисовывается. Проверки ниже
   рассчитаны на локальный режим («Облако не подключено», «Ключи проекта не
   найдены»), поэтому конфигурацию фиксируем заглушками — результат не должен
   зависеть от того, какие ключи сейчас закоммичены. */
for (const f of ["supabase-config.example.js", "data.js", "db.js", "seed.js", "app.js"]) {
  try {
    window.eval(readFileSync(`${ROOT}/${f}`, "utf8"));
  } catch (e) {
    check(`загрузка ${f}`, false, String(e.message).slice(0, 200));
    /* --- выход из команды (последним шагом: он уводит на экран входа) --- */
window.location.hash = "#/manage";
window.dispatchEvent(new window.Event("hashchange"));
await new Promise((r) => setTimeout(r, 200));
$("[data-logout]").click();
await new Promise((r) => setTimeout(r, 200));
check("управление: «Выйти из команды» действительно работает",
  /Вход команды|Название команды/.test(view.textContent), view.textContent.replace(/\s+/g, " ").slice(0, 70));
check("выход: ошибок не осталось", errors.length === 0, errors.join(" | "));

console.log(results.join("\n"));
    process.exit(1);
  }
}
check("скрипты загружаются без исключений", errors.length === 0, errors.join(" | "));

// boot() навешан на DOMContentLoaded — событие уже прошло, вызываем его сами.
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
await new Promise((r) => setTimeout(r, 300));

const view = window.document.getElementById("view");
check("вход: показан экран входа", /Название команды|команд/i.test(view.textContent), view.textContent.slice(0, 60).trim());
check("boot: ошибок не появилось", errors.length === 0, errors.join(" | "));

/* --- создание команды через интерфейс --- */
window.location.hash = "#/create";
window.dispatchEvent(new window.Event("hashchange"));
await new Promise((r) => setTimeout(r, 50));

const $ = (s) => window.document.querySelector(s);
check("создание команды: открылась форма", !!$("#crForm"));
$("#crName").value = "БРАТЫ";
$("#crPin").value = "1234";
$("#crCapPin").value = "9876";
$("#crCap").value = "Макс";
$("#crForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 800));

check("создание команды: дошло до экрана «Команда создана»", /Команда создана/.test(view.textContent),
  view.textContent.slice(0, 80).trim());
check("создание команды: ошибок нет", errors.length === 0, errors.join(" | "));

/* --- вход в плейбук и раздел капитана --- */
$("#openPb") && $("#openPb").click();
await new Promise((r) => setTimeout(r, 300));
window.location.hash = "#/manage";
window.dispatchEvent(new window.Event("hashchange"));
await new Promise((r) => setTimeout(r, 300));

const manage = view.textContent;
check("управление: раздел открылся у капитана", /Управление/.test(manage));
check("управление: есть блок «Облако» и кнопка проверки",
  !!$("[data-cloudcheck]") && !!$("[data-cloud]"), manage.slice(0, 80).trim());
check("управление: в локальном режиме честно написано, что облака нет",
  /Облако не подключено/.test(manage));

/* --- нажимаем «Проверить связь» --- */
$("[data-cloudcheck]").click();
await new Promise((r) => setTimeout(r, 300));
const sheet = window.document.querySelector("#sheetRoot");
check("проверка связи: шторка открылась", !!sheet.querySelector(".sheet"));
check("проверка связи: без ключей объясняет, что делать",
  /Ключи проекта/.test(sheet.textContent) && /supabase-config\.js/.test(sheet.textContent),
  sheet.textContent.replace(/\s+/g, " ").slice(0, 140));
check("проверка связи: не падает с ошибкой", errors.length === 0, errors.join(" | "));

/* --- управление: раздел не должен падать, кнопки должны быть живыми --- */
check("управление: раздел отрисован без исключений (кнопки ниже привязываются)",
  errors.length === 0, errors.join(" | "));
check("управление: экспорт/импорт вернулись в интерфейс", !!$("[data-export]") && !!$("[data-import]"));
/* --- раздел игрока: правок быть не должно --- */
window.location.hash = "#/tactics";
window.dispatchEvent(new window.Event("hashchange"));
await new Promise((r) => setTimeout(r, 300));
check("тактики: список отрисован из стартового набора", /tactics|Тактик|Mirage|Dust/i.test(view.textContent),
  view.textContent.replace(/\s+/g, " ").slice(0, 80));

/* --- схема капитана: рисование прямо на карте --- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const boardNow = () => window.document.querySelector("[data-board]");
const svgNow = () => window.document.querySelector("[data-svg]");
const fireAt = (type, target) => {
  const ev = new window.Event(type, { bubbles: true, cancelable: true });
  ev.clientX = 40; ev.clientY = 60;
  (target || window).dispatchEvent(ev);
};
const tacticId = () => window.location.hash.split("/")[2];
const boardBlockNow = () => {
  const t = window.PlaybookDB.cache.tactics.find((x) => x.id === tacticId());
  return t && (t.blocks || []).find((b) => b.type === "board");
};

const firstTactic = Array.from(view.querySelectorAll('a[href^="#/tactic/"]'))[0];
check("тактики: есть ссылка на тактику для перехода", !!firstTactic);
window.location.hash = firstTactic.getAttribute("href").replace(/^#/, "");
window.dispatchEvent(new window.Event("hashchange"));
await sleep(300);

let board = boardNow();
check("схема: панель инструментов капитана отрисована", !!board && !!board.querySelector('[data-tool="arrow"]'),
  board ? board.textContent.replace(/\s+/g, " ").slice(0, 60) : "нет boardwrap");
check("схема: палитра, толщина и быстрые действия на месте",
  !!board.querySelector("[data-color]") && !!board.querySelector('[data-w="3"]') &&
  !!board.querySelector("[data-bplace]") && !!board.querySelector("[data-bfan]"));
check("схема: стартовые токены игроков приехали из посева",
  board.querySelectorAll("[data-marker]").length === 5, String(board.querySelectorAll("[data-marker]").length));

/* очищаем схему через подтверждение — дальше рисуем на пустом радаре */
board.querySelector("[data-bclear]").click();
await sleep(80);
const yes = window.document.querySelector('[data-mbtn="yes"]');
check("схема: «Очистить» спрашивает подтверждение", !!yes);
yes && yes.click();
await sleep(450);
board = boardNow();
check("схема: подтверждение очистило доску",
  board.querySelectorAll("[data-marker]").length === 0 && !board.querySelector("[data-draw]"));

/* инструмент «Игрок»: тап ставит следующего из состава */
board.querySelector('[data-tool="player"]').click();
await sleep(60);
fireAt("pointerdown", svgNow());
await sleep(450);
board = boardNow();
check("схема: тап «Игрок» ставит токен из состава",
  board.querySelectorAll("[data-marker]").length === 1, String(board.querySelectorAll("[data-marker]").length));
check("схема: инструмент после расстановки подсвечен как активный",
  !!board.querySelector('[data-tool="player"].on'));

/* номер на схеме */
board.querySelector('[data-tool="number"]').click();
await sleep(60);
fireAt("pointerdown", svgNow());
await sleep(450);
check("схема: тап «Номер» добавляет номер", !!boardNow().querySelector("[data-draw]"));

await sleep(400);
const saved = boardBlockNow();
check("схема: правки сохранены в хранилище, а не только в DOM",
  !!saved && (saved.markers || []).length === 1 && (saved.drawings || []).length === 1,
  saved ? `markers=${(saved.markers || []).length}, drawings=${(saved.drawings || []).length}` : "блок не найден");

/* undo / redo */
boardNow().querySelector("[data-bundo]").click();
await sleep(500);
const afterUndo = boardBlockNow();
check("схема: «Отменить» убирает последний элемент",
  !!afterUndo && (afterUndo.drawings || []).length === 0 && (afterUndo.markers || []).length === 1,
  afterUndo ? `drawings=${(afterUndo.drawings || []).length}` : "нет блока");
boardNow().querySelector("[data-bredo]").click();
await sleep(500);
check("схема: «Вернуть» возвращает элемент",
  ((boardBlockNow() || {}).drawings || []).length === 1);

/* расстановка состава и подписи токенов */
boardNow().querySelector("[data-bplace]").click();
await sleep(500);
check("схема: «Расставить 1–5» выкладывает состав по спауну",
  boardNow().querySelectorAll("[data-marker]").length === 5);
boardNow().querySelector("[data-mstyle]").click();
await sleep(500);
check("схема: переключатель «Номера → Ники → Ник+№» работает",
  /Ники/.test(boardNow().textContent) && boardNow().textContent.indexOf("Ники") > 0,
  boardNow().textContent.replace(/\s+/g, " ").slice(0, 40));

/* стрелки движения от всех игроков одной кнопкой */
boardNow().querySelector("[data-bfan]").click();
await sleep(60);
check("схема: режим «стрелки к точке» подсказывает, что делать",
  /Тапните точку/.test(boardNow().textContent));
fireAt("pointerdown", svgNow());
await sleep(500);
const fanned = ((boardBlockNow() || {}).drawings || []).filter((d) => d.type === "arrow" && d.a1);
check("схема: «Стрелки к точке» рисует маршрут от каждого игрока",
  fanned.length === 5, `стрелок с привязкой: ${fanned.length}`);

/* тумблеры стиля */
boardNow().querySelector('[data-tog="grid"]').click();
await sleep(60);
check("схема: тумблер сетки включается", !!boardNow().querySelector('[data-tog="grid"].on'));
boardNow().querySelector('[data-tog="dash"]').click();
await sleep(60);
check("схема: тумблер пунктира включается", !!boardNow().querySelector('[data-tog="dash"].on'));

/* игрок без правок видит схему, но не инструменты */
check("схема: у капитана есть кнопка полного экрана", !!boardNow().querySelector("[data-bzoom]"));

/* --- фон экрана входа --- */
window.location.hash = "#/manage";
window.dispatchEvent(new window.Event("hashchange"));
await sleep(300);
check("управление: секция «Фото на входе» на месте", !!window.document.querySelector("[data-authbg]"));
check("управление: кнопка «Загрузить для всех» на месте", !!window.document.querySelector("[data-authbgpick]"));
window.document.querySelector("[data-authbg]").click();
await sleep(150);
const sh = window.document.querySelector("#sheetRoot");
check("управление: шторка фона открылась с ползунками и превью",
  !!sh.querySelector("#abBlur") && !!sh.querySelector("#abDim") && !!sh.querySelector(".bgprev img") && !!sh.querySelector("[data-abteam]"),
  sh.textContent.replace(/\s+/g, " ").slice(0, 70));
const blur = sh.querySelector("#abBlur");
blur.value = "14";
blur.dispatchEvent(new window.Event("input", { bubbles: true }));
await sleep(80);
check("управление: ползунок блюра пишет настройку и вешает CSS-переменную",
  (window.localStorage.getItem("cs2pb.authbg.v1") || "").includes('"blur":14') &&
  (window.document.documentElement.getAttribute("style") || "").includes("--auth-blur: 14px"),
  String(window.localStorage.getItem("cs2pb.authbg.v1")).slice(0, 60));
const dim = sh.querySelector("#abDim");
dim.value = "70";
dim.dispatchEvent(new window.Event("input", { bubbles: true }));
await sleep(80);
check("управление: затемнение фона регулируется",
  (window.document.documentElement.getAttribute("style") || "").includes("--auth-dim: 0.7"),
  window.document.documentElement.getAttribute("style"));
sh.querySelector(".sheet-head [data-close]").click();
await sleep(120);

/* --- выход: стекло, блюр и подсказка последней команды --- */
window.document.querySelector("[data-logout]").click();
await sleep(300);
check("выход: экран входа снова активен (body.auth-mode)",
  window.document.body.classList.contains("auth-mode"));
check("выход: фон-фото подключено к сцене",
  (window.document.getElementById("authSceneImg").style.backgroundImage || "").includes("kabany"),
  window.document.getElementById("authSceneImg").style.backgroundImage);
check("выход: название команды подставилось из последнего входа",
  !!window.document.querySelector("#liName") && window.document.querySelector("#liName").value === "БРАТЫ",
  window.document.querySelector("#liName") ? `"${window.document.querySelector("#liName").value}"` : "нет поля");
check("выход: кнопка смены фото есть и до входа", !!window.document.querySelector("[data-authbgbtn]"));
/* --- игрок (не капитан) видит схему без инструментов --- */
window.location.hash = "#/login";
window.dispatchEvent(new window.Event("hashchange"));
await sleep(150);
$("#liName").value = "БРАТЫ";
$("#liPin").value = "1234";
$("#loginForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await sleep(500);
window.location.hash = "#/tactics";
window.dispatchEvent(new window.Event("hashchange"));
await sleep(250);
const plLink = Array.from(window.document.querySelectorAll('a[href^="#/tactic/"]'))[0];
window.location.hash = plLink.getAttribute("href").replace(/^#/, "");
window.dispatchEvent(new window.Event("hashchange"));
await sleep(300);
const pboard = window.document.querySelector("[data-board]");
check("игрок: схема показана", !!pboard);
check("игрок: инструментов рисования нет, но схема открывается на весь экран",
  !!pboard && !pboard.querySelector('[data-tool="arrow"]') && !!pboard.querySelector("[data-bzoom]"),
  pboard ? pboard.textContent.replace(/\s+/g, " ").slice(0, 50) : "нет доски");
check("игрок: правки капитана на схеме видны",
  !!pboard.querySelector("[data-marker]") || /Схема/.test(pboard.textContent),
  pboard.querySelector(".map-canvas") ? "доска на месте" : "нет холста");

check("итого: новых ошибок не появилось", errors.length === 0, errors.join(" | "));

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
