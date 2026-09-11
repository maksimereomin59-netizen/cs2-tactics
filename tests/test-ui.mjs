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

// Подключаем скрипты в том же порядке, что и в index.html.
for (const f of ["supabase-config.js", "data.js", "db.js", "seed.js", "app.js"]) {
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

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
