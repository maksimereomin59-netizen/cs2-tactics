/* Генератор схематичных радаров для карт, у которых нет официального радара.
   Читает зоны и связи из data.js и рисует векторную «тренерскую» схему в тех же
   координатах 0–100, что и доска: маркеры тактик ложатся на подписи зон.
   Запуск: node tools/make-radars.mjs [slug …] (без аргументов — все карты со схемой). */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const code = readFileSync(resolve(ROOT, "data.js"), "utf8");
const sandboxWindow = {};
new Function("window", code)(sandboxWindow);
const BASE = sandboxWindow.TACTICS_BASE;

const SCHEMATIC = ["inferno", "nuke", "overpass", "anubis"];
const only = process.argv.slice(2);
const keys = (only.length ? only : SCHEMATIC).filter((k) => BASE.maps[k]);

const KIND_STYLE = {
  tspawn: { fill: "rgba(240,180,41,.10)", stroke: "rgba(240,180,41,.45)", text: "#f0b429" },
  ctspawn: { fill: "rgba(90,169,255,.10)", stroke: "rgba(90,169,255,.45)", text: "#5aa9ff" },
  siteA: { fill: "rgba(240,180,41,.16)", stroke: "rgba(240,180,41,.7)", text: "#ffd166" },
  siteB: { fill: "rgba(90,169,255,.16)", stroke: "rgba(90,169,255,.7)", text: "#8ec5ff" },
  route: { fill: "#151d29", stroke: "#2a3648", text: "#93a3b5" },
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Ширина бокса — не меньше ширины подписи, чтобы текст не вылезал. */
function zoneW(z) {
  const isSite = z.kind === "siteA" || z.kind === "siteB";
  const charW = isSite ? 2.7 * 0.66 : 2.1 * 0.66;
  return Math.max(z.w, z.name.length * charW + 2.4);
}
function zoneShapes(map) {
  let g = "";
  for (const z of map.zones) {
    const st = KIND_STYLE[z.kind] || KIND_STYLE.route;
    const w = zoneW(z);
    const x = z.x - w / 2, y = z.y - z.h / 2;
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${z.h}" rx="1.6" fill="${st.fill}" stroke="${st.stroke}" stroke-width="0.35"/>`;
  }
  return g;
}
function zoneLabels(map) {
  let g = "";
  for (const z of map.zones) {
    const st = KIND_STYLE[z.kind] || KIND_STYLE.route;
    const isSite = z.kind === "siteA" || z.kind === "siteB";
    g += `<text x="${z.x}" y="${z.y + (isSite ? 0.9 : 0.8)}" text-anchor="middle" font-size="${isSite ? 2.7 : 2.1}" font-weight="${isSite ? 800 : 600}" fill="${st.text}">${esc(z.name)}</text>`;
  }
  return g;
}
function linkLines(map) {
  const byId = {};
  map.zones.forEach((z) => { byId[z.id] = z; });
  let g = "";
  for (const [a, b] of map.links) {
    const za = byId[a], zb = byId[b];
    if (!za || !zb) continue;
    g += `<line x1="${za.x}" y1="${za.y}" x2="${zb.x}" y2="${zb.y}" stroke="#233146" stroke-width="0.7" stroke-dasharray="1.4 1.2"/>`;
  }
  return g;
}
function gridBg() {
  let g = "";
  for (let i = 10; i < 100; i += 10) {
    g += `<line x1="${i}" y1="0" x2="${i}" y2="100" stroke="#111926" stroke-width="0.25"/>`;
    g += `<line x1="0" y1="${i}" x2="100" y2="${i}" stroke="#111926" stroke-width="0.25"/>`;
  }
  return g;
}

for (const key of keys) {
  const map = BASE.maps[key];
  const inner =
    `<rect width="100" height="100" fill="#0d1218"/>` +
    gridBg() +
    linkLines(map) +
    zoneShapes(map) +
    zoneLabels(map);

  const radar =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" font-family="Inter, 'Segoe UI', Arial, sans-serif">` +
    inner +
    `</svg>\n`;

  const card =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" font-family="Inter, 'Segoe UI', Arial, sans-serif">` +
    inner +
    `<rect width="100" height="100" fill="url(#vg)"/>` +
    `<defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="rgba(8,11,16,.82)"/><stop offset=".35" stop-color="rgba(8,11,16,.12)"/>` +
    `<stop offset=".7" stop-color="rgba(8,11,16,.05)"/><stop offset="1" stop-color="rgba(8,11,16,.55)"/>` +
    `</linearGradient></defs>` +
    `<text x="4" y="9" font-size="6" font-weight="800" fill="#eef2f7" letter-spacing=".4">${esc(map.name)}</text>` +
    `<text x="4" y="13.6" font-size="2.6" font-weight="600" fill="#8fa0b3">схема для тактик · CS2</text>` +
    `</svg>\n`;

  mkdirSync(resolve(ROOT, "assets/maps/cards"), { recursive: true });
  writeFileSync(resolve(ROOT, `assets/maps/${key}.svg`), radar);
  writeFileSync(resolve(ROOT, `assets/maps/cards/${key}.svg`), card);
  console.log("written", key, `(${map.zones.length} zones, ${map.links.length} links)`);
}
