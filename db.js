/* ============================================================
   PlaybookDB — единый слой данных командного плейбука.
   Два адаптера с одинаковым API:
   - LocalAdapter  — работает всегда, данные в браузере + sync между вкладками;
   - SupabaseAdapter — облако + realtime, включается при наличии конфигурации.
   Устройство хранит только сессию, избранное и offline-кэш последнего плейбука.
   ============================================================ */
(function () {
  "use strict";

  const TABLES = ["players", "maps", "tactics", "materials", "templates", "activity", "messages"];
  // Таблицы с ручным порядком: новую строку всегда ставим в конец списка,
  // иначе у капитана и у игроков список отсортируется по-разному.
  const POS_TABLES = ["players", "maps", "tactics", "materials"];
  const LS_DB = "cs2db-v2";
  const LS_SESS = "cs2sess-v2";
  const LS_PREF = "cs2pref-v2";
  const LS_CFG = "cs2cfg-v1";
  const LS_CACHE = "cs2cache-v1";
  const HAS_WINDOW = typeof window !== "undefined";
  const HAS_LS = (function () {
    try { return typeof localStorage !== "undefined" && !!localStorage.getItem; } catch (e) { return false; }
  })();

  function uid(prefix) {
    return (prefix || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  function mem(store, key, fallback) {
    try {
      const raw = store.getItem(key);
      return raw ? JSON.parse(raw) : clone(fallback);
    } catch (e) { return clone(fallback); }
  }
  function randomSalt() {
    try {
      const bytes = new Uint8Array(12);
      (HAS_WINDOW ? window.crypto : require("crypto").webcrypto).getRandomValues(bytes);
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }
  async function sha256hex(text) {
    try {
      const subtle = HAS_WINDOW ? window.crypto.subtle : require("crypto").webcrypto.subtle;
      const TE = HAS_WINDOW ? window.TextEncoder : TextEncoder;
      const digest = await subtle.digest("SHA-256", new TE().encode(text));
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
      for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return "fb" + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
    }
  }
  function err(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }
  function normName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }
  /* Роль из JWT-подписи ключа. anon public key безопасен, service_role — нет. */
  function jwtRole(key) {
    try {
      const part = String(key || "").split(".")[1];
      if (!part) return "";
      let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
      if (base64.length % 4) base64 += "=".repeat(4 - (base64.length % 4));
      const json = b64Decode(base64);
      return JSON.parse(json).role || "";
    } catch (e) { return ""; }
  }
  function b64Decode(base64) {
    if (HAS_WINDOW && typeof window.atob === "function") return window.atob(base64);
    if (typeof atob === "function") return atob(base64);
    return Buffer.from(base64, "base64").toString("binary");
  }

  /* ================= LocalAdapter ================= */
  function LocalAdapter() {
    this.name = "local";
    this.listeners = [];
    this.db = HAS_LS ? mem(localStorage, LS_DB, null) : null;
    if (!this.db) this.db = { teams: [], data: {} };
    if (HAS_WINDOW && window.addEventListener) {
      window.addEventListener("storage", (ev) => {
        if (ev.key !== LS_DB || !ev.newValue) return;
        try {
          this.db = JSON.parse(ev.newValue);
          this.emit({ type: "data", table: "*", origin: "remote" });
        } catch (e) {}
      });
    }
  }
  LocalAdapter.prototype.persist = function () {
    if (HAS_LS) { try { localStorage.setItem(LS_DB, JSON.stringify(this.db)); } catch (e) {} }
  };
  LocalAdapter.prototype.on = function (cb) { this.listeners.push(cb); };
  LocalAdapter.prototype.emit = function (evt) { this.listeners.forEach((cb) => { try { cb(evt); } catch (e) {} }); };
  LocalAdapter.prototype.findTeam = function (name) {
    const want = normName(name).toLowerCase();
    return this.db.teams.find((t) => normName(t.name).toLowerCase() === want) || null;
  };
  LocalAdapter.prototype.bucket = function (teamId) {
    if (!this.db.data[teamId]) this.db.data[teamId] = {};
    const b = this.db.data[teamId];
    // Команды, созданные до появления новых таблиц: доводим корзину до полного набора.
    TABLES.forEach((t) => { if (!b[t]) b[t] = []; });
    return b;
  };

  LocalAdapter.prototype.createTeam = async function (input) {
    const name = normName(input.name);
    if (!name) throw err("BAD_INPUT", "Введите название команды");
    if (this.findTeam(name)) throw err("NAME_TAKEN", "Такое название уже занято");
    if (String(input.pin).length < 4) throw err("BAD_INPUT", "PIN команды: минимум 4 символа");
    if (String(input.captainPin).length < 4) throw err("BAD_INPUT", "PIN капитана: минимум 4 символа");
    const team = {
      id: uid("team"), name,
      salt: randomSalt(),
      pinHash: await sha256hex(randomSalt() + "x"),
      captainPinHash: "",
      captainName: normName(input.captain) || "Капитан",
      settings: { allowSwitchPlayer: true, sections: null },
      createdAt: Date.now(),
    };
    team.pinHash = await sha256hex(team.salt + "::" + input.pin);
    team.captainPinHash = await sha256hex(team.salt + "::cap::" + input.captainPin);
    this.db.teams.push(team);
    this.bucket(team.id);
    this.persist();
    this.emit({ type: "data", table: "*", origin: "local" });
    return { team: this.publicTeam(team), role: "captain" };
  };
  LocalAdapter.prototype.publicTeam = function (team) {
    return { id: team.id, name: team.name, captainName: team.captainName, settings: clone(team.settings), createdAt: team.createdAt };
  };
  LocalAdapter.prototype.login = async function (input) {
    const team = this.findTeam(input.name);
    if (!team) throw err("NO_TEAM", "Команда не найдена");
    const hash = await sha256hex(team.salt + "::" + input.pin);
    if (hash !== team.pinHash) throw err("BAD_PIN", "Неверный PIN");
    return { team: this.publicTeam(team), role: "player" };
  };
  LocalAdapter.prototype.claimCaptain = async function (teamId, pin) {
    const team = this.db.teams.find((t) => t.id === teamId);
    if (!team) throw err("NO_TEAM", "Команда не найдена");
    const hash = await sha256hex(team.salt + "::cap::" + pin);
    if (hash !== team.captainPinHash) throw err("BAD_PIN", "Неверный PIN капитана");
    return { role: "captain" };
  };
  LocalAdapter.prototype.setPin = async function (teamId, kind, newPin) {
    const team = this.db.teams.find((t) => t.id === teamId);
    if (!team) throw err("NO_TEAM", "Команда не найдена");
    if (String(newPin).length < 4) throw err("BAD_INPUT", "Минимум 4 символа");
    if (kind === "team") team.pinHash = await sha256hex(team.salt + "::" + newPin);
    else if (kind === "captain") team.captainPinHash = await sha256hex(team.salt + "::cap::" + newPin);
    else throw err("BAD_INPUT", "Неизвестный тип PIN");
    this.persist();
    this.emit({ type: "data", table: "*", origin: "local" });
  };
  LocalAdapter.prototype.updateTeam = async function (teamId, patch) {
    const team = this.db.teams.find((t) => t.id === teamId);
    if (!team) throw err("NO_TEAM", "Команда не найдена");
    if (patch.name != null) {
      const name = normName(patch.name);
      if (!name) throw err("BAD_INPUT", "Пустое название");
      const dup = this.findTeam(name);
      if (dup && dup.id !== teamId) throw err("NAME_TAKEN", "Название занято");
      team.name = name;
    }
    if (patch.captainName != null) team.captainName = normName(patch.captainName);
    if (patch.settings != null) team.settings = Object.assign({}, team.settings, patch.settings);
    this.persist();
    this.emit({ type: "data", table: "*", origin: "local" });
    return this.publicTeam(team);
  };
  LocalAdapter.prototype.deleteTeam = async function (teamId) {
    this.db.teams = this.db.teams.filter((t) => t.id !== teamId);
    delete this.db.data[teamId];
    this.persist();
    this.emit({ type: "data", table: "*", origin: "local" });
  };
  LocalAdapter.prototype.list = async function (table, teamId) {
    const rows = (this.bucket(teamId)[table] || []).slice();
    rows.sort((a, b) => (table === "activity" ? (b.ts - a.ts) : table === "messages" ? (a.ts - b.ts) : ((a.pos || 0) - (b.pos || 0))));
    return clone(rows);
  };
  LocalAdapter.prototype.get = async function (table, teamId, id) {
    return clone((this.bucket(teamId)[table] || []).find((r) => r.id === id) || null);
  };
  LocalAdapter.prototype.save = async function (table, teamId, obj) {
    const rows = this.bucket(teamId)[table];
    const now = Date.now();
    let row = obj.id ? rows.find((r) => r.id === obj.id) : null;
    if (!row) {
      const maxPos = rows.reduce((m, r) => Math.max(m, r.pos || 0), 0);
      row = Object.assign({ id: uid(table.slice(0, 2)), team_id: teamId, pos: maxPos + 1 }, clone(obj));
      if (POS_TABLES.indexOf(table) >= 0) row.pos = maxPos + 1;
      rows.push(row);
    } else {
      Object.keys(obj).forEach((k) => { if (k !== "id" && k !== "team_id") row[k] = clone(obj[k]); });
    }
    row.updated_at = now;
    this.persist();
    this.emit({ type: "data", table, origin: "local", id: row.id });
    return clone(row);
  };
  LocalAdapter.prototype.del = async function (table, teamId, id, silent) {
    const bucket = this.bucket(teamId);
    bucket[table] = (bucket[table] || []).filter((r) => r.id !== id);
    // Каскад: удаление карты отвязывает тактики и материалы.
    if (table === "maps") {
      (bucket.tactics || []).forEach((t) => { if (t.map_id === id) { t.map_id = null; t.updated_at = Date.now(); } });
      (bucket.materials || []).forEach((m) => { if (m.map_id === id) { m.map_id = null; m.updated_at = Date.now(); } });
    }
    this.persist();
    if (!silent) this.emit({ type: "data", table, origin: "local", id });
  };
  LocalAdapter.prototype.reorder = async function (table, teamId, ids) {
    const rows = this.bucket(teamId)[table] || [];
    ids.forEach((id, i) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.pos = i + 1;
    });
    this.persist();
    this.emit({ type: "data", table, origin: "local" });
  };
  LocalAdapter.prototype.log = async function (teamId, actor, text, ref) {
    const bucket = this.bucket(teamId);
    bucket.activity.unshift({ id: uid("ac"), team_id: teamId, actor: actor || "", text, ref_kind: (ref && ref.kind) || "", ref_id: (ref && ref.id) || "", ts: Date.now() });
    bucket.activity = bucket.activity.slice(0, 60);
    this.persist();
    this.emit({ type: "data", table: "activity", origin: "local" });
  };
  LocalAdapter.prototype.uploadImage = async function (teamId, file) {
    if (!file || file.size > 1200 * 1024) throw err("TOO_BIG", "Без облака — файл до 1.2 МБ. Подключите Supabase для больших файлов.");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { url: dataUrl };
  };

  /* ================= SupabaseAdapter (облако + realtime) ================= */
  function SupabaseAdapter(config) {
    this.name = "cloud";
    this.config = config;
    this.client = null;
    this.listeners = [];
    this.channels = [];
    this.teamId = null;
  }
  SupabaseAdapter.prototype.on = function (cb) { this.listeners.push(cb); };
  SupabaseAdapter.prototype.emit = function (evt) { this.listeners.forEach((cb) => { try { cb(evt); } catch (e) {} }); };
  SupabaseAdapter.prototype.loadLib = function () {
    if (HAS_WINDOW && window.supabase && window.supabase.createClient) return Promise.resolve();
    if (!HAS_WINDOW) return Promise.reject(err("NO_LIB", "Supabase доступен только в браузере"));
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(err("NO_LIB", "Не загрузилась библиотека Supabase"));
      document.head.appendChild(s);
    });
  };
  SupabaseAdapter.prototype.init = async function () {
    await this.loadLib();
    this.client = window.supabase.createClient(this.config.url, this.config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    const { data } = await this.client.auth.getSession();
    if (!data.session) {
      const res = await this.client.auth.signInAnonymously();
      if (res.error) throw err("AUTH", "Supabase: включите Anonymous sign-ins (см. SETUP.md)");
    }
  };
  function rpcErr(e, fallback) {
    const msg = (e && e.message) || "";
    if (msg.indexOf("NO_TEAM") >= 0) throw err("NO_TEAM", "Команда не найдена");
    if (msg.indexOf("BAD_PIN") >= 0) throw err("BAD_PIN", "Неверный PIN");
    if (msg.indexOf("NAME_TAKEN") >= 0) throw err("NAME_TAKEN", "Такое название уже занято");
    if (msg.indexOf("BAD_INPUT") >= 0) throw err("BAD_INPUT", "Проверьте введённые данные");
    if (msg.indexOf("DENIED") >= 0 || msg.indexOf("NOT_MEMBER") >= 0) throw err("DENIED", "Нет прав");
    throw err("CLOUD", fallback || ("Ошибка облака: " + msg));
  }
  SupabaseAdapter.prototype.createTeam = async function (input) {
    const { data, error } = await this.client.rpc("team_create", {
      p_name: normName(input.name), p_pin: String(input.pin),
      p_captain: normName(input.captain) || "Капитан", p_captain_pin: String(input.captainPin),
    });
    if (error) rpcErr(error);
    return { team: this.pub(data), role: "captain" };
  };
  SupabaseAdapter.prototype.login = async function (input) {
    const { data, error } = await this.client.rpc("team_login", { p_name: normName(input.name), p_pin: String(input.pin) });
    if (error) rpcErr(error);
    return { team: this.pub(data), role: data.role || "player" };
  };
  SupabaseAdapter.prototype.claimCaptain = async function (teamId, pin) {
    const { data, error } = await this.client.rpc("claim_captain", { p_team_id: teamId, p_pin: String(pin) });
    if (error) rpcErr(error, "Неверный PIN капитана");
    return { role: (data && data.role) || "captain" };
  };
  SupabaseAdapter.prototype.setPin = async function (teamId, kind, newPin) {
    const { error } = await this.client.rpc("team_set_pin", { p_team_id: teamId, p_kind: kind, p_new: String(newPin) });
    if (error) rpcErr(error);
  };
  SupabaseAdapter.prototype.updateTeam = async function (teamId, patch) {
    const row = {};
    if (patch.name != null) row.name = normName(patch.name);
    if (patch.captainName != null) row.captain_name = normName(patch.captainName);
    if (patch.settings != null) {
      const cur = await this.client.from("teams").select("settings").eq("id", teamId).single();
      row.settings = Object.assign({}, (cur.data && cur.data.settings) || {}, patch.settings);
    }
    const { data, error } = await this.client.from("teams").update(row).eq("id", teamId).select().single();
    if (error) rpcErr(error);
    return this.pub(data);
  };
  SupabaseAdapter.prototype.deleteTeam = async function (teamId) {
    const { error } = await this.client.from("teams").delete().eq("id", teamId);
    if (error) rpcErr(error);
  };
  SupabaseAdapter.prototype.pub = function (t) {
    return { id: t.id, name: t.name, captainName: t.captain_name || "", settings: t.settings || {}, createdAt: t.created_at ? Date.parse(t.created_at) : 0 };
  };
  SupabaseAdapter.prototype.enter = function (teamId) {
    this.leave();
    this.teamId = teamId;
    const self = this;
    TABLES.forEach((table) => {
      const ch = self.client.channel("team:" + teamId + ":" + table)
        .on("postgres_changes", { event: "*", schema: "public", table, filter: "team_id=eq." + teamId }, () => {
          self.emit({ type: "data", table, origin: "remote" });
        })
        .subscribe();
      self.channels.push(ch);
    });
  };
  SupabaseAdapter.prototype.leave = function () {
    const self = this;
    this.channels.forEach((ch) => { try { self.client.removeChannel(ch); } catch (e) {} });
    this.channels = [];
    this.teamId = null;
  };
  SupabaseAdapter.prototype.list = async function (table, teamId) {
    const orderCol = (table === "activity" || table === "messages") ? "ts" : (table === "templates" ? "created_at" : "pos");
    const { data, error } = await this.client.from(table).select("*").eq("team_id", teamId)
      .order(orderCol, { ascending: table === "activity" ? false : true })
      .limit(table === "activity" ? 60 : table === "messages" ? 400 : 1000);
    if (error) rpcErr(error);
    return data || [];
  };
  SupabaseAdapter.prototype.get = async function (table, teamId, id) {
    const { data, error } = await this.client.from(table).select("*").eq("team_id", teamId).eq("id", id).single();
    if (error) return null;
    return data;
  };
  SupabaseAdapter.prototype.nextPos = async function (table, teamId) {
    const { data } = await this.client.from(table).select("pos").eq("team_id", teamId).order("pos", { ascending: false }).limit(1);
    return (((data && data[0]) || {}).pos || 0) + 1;
  };
  SupabaseAdapter.prototype.save = async function (table, teamId, obj) {
    const row = clone(obj);
    delete row.id;
    row.team_id = teamId;
    let res;
    if (obj.id) res = await this.client.from(table).update(row).eq("id", obj.id).eq("team_id", teamId).select().single();
    else {
      // pos считает сервер-клиент: в таблицах с ручным порядком новая строка идёт в конец.
      if (POS_TABLES.indexOf(table) >= 0) row.pos = await this.nextPos(table, teamId);
      res = await this.client.from(table).insert(row).select().single();
    }
    if (res.error) rpcErr(res.error);
    this.emit({ type: "data", table, origin: "local", id: res.data.id });
    return res.data;
  };
  SupabaseAdapter.prototype.del = async function (table, teamId, id, silent) {
    const { error } = await this.client.from(table).delete().eq("id", id).eq("team_id", teamId);
    if (error) rpcErr(error);
    if (!silent) this.emit({ type: "data", table, origin: "local", id });
  };
  SupabaseAdapter.prototype.reorder = async function (table, teamId, ids) {
    // Пакетно: по одному update на строку (списки короткие).
    for (let i = 0; i < ids.length; i++) {
      const { error } = await this.client.from(table).update({ pos: i + 1 }).eq("id", ids[i]).eq("team_id", teamId);
      if (error) rpcErr(error);
    }
    this.emit({ type: "data", table, origin: "local" });
  };
  SupabaseAdapter.prototype.log = async function (teamId, actor, text, ref) {
    await this.client.from("activity").insert({
      team_id: teamId, actor: actor || "", text,
      ref_kind: (ref && ref.kind) || "", ref_id: (ref && ref.id) || "",
    });
    this.emit({ type: "data", table: "activity", origin: "local" });
  };
  SupabaseAdapter.prototype.uploadImage = async function (teamId, file) {
    if (!file || file.size > 8 * 1024 * 1024) throw err("TOO_BIG", "Файл до 8 МБ");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = teamId + "/" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const { error } = await this.client.storage.from("team-files").upload(path, file, { upsert: false });
    if (error) rpcErr(error, "Не загрузилось в хранилище");
    const { data } = await this.client.storage.from("team-files").createSignedUrl(path, 31536000);
    return { url: data.signedUrl, path };
  };

  /* ================= DB facade ================= */
  function readJSON(key, fallback) {
    if (!HAS_LS) return clone(fallback);
    return mem(localStorage, key, fallback);
  }
  function writeJSON(key, value) {
    if (!HAS_LS) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DB = {
    TABLES,
    adapter: null,
    cloudTried: false,
    team: null,
    role: "player",
    online: HAS_WINDOW ? (typeof navigator !== "undefined" ? navigator.onLine !== false : true) : true,
    listeners: [],
    cache: { players: [], maps: [], tactics: [], materials: [], templates: [], activity: [], messages: [] },
    cacheLoaded: false,

    on(cb) { this.listeners.push(cb); },
    emit(evt) { this.listeners.forEach((cb) => { try { cb(evt); } catch (e) {} }); },
    mode() { return this.adapter ? this.adapter.name : "local"; },
    isCaptain() { return this.role === "captain"; },

    cloudConfig() {
      let cfg = null;
      if (HAS_WINDOW && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey &&
          window.SUPABASE_CONFIG.url.indexOf("xxxx") < 0) cfg = window.SUPABASE_CONFIG;
      if (!cfg) {
        const override = readJSON(LS_CFG, null);
        if (override && override.url && override.anonKey) cfg = override;
      }
      if (cfg && this.keyRole(cfg.anonKey) === "service_role") {
        // Секретный ключ обходит RLS: с ним любой посетитель сайта получил бы доступ ко всем командам.
        return Object.assign({}, cfg, { unsafe: true });
      }
      return cfg;
    },
    keyRole(key) {
      const k = String(key || "");
      // Новый формат ключей Supabase: sb_publishable_… (в браузер можно) и sb_secret_… (нельзя).
      if (k.indexOf("sb_secret_") === 0) return "service_role";
      if (k.indexOf("sb_publishable_") === 0) return "publishable";
      // Старый формат: JWT с ролью anon / service_role.
      return jwtRole(k);
    },
    setCloudOverride(cfg) { writeJSON(LS_CFG, cfg); },
    clearCloudOverride() { if (HAS_LS) { try { localStorage.removeItem(LS_CFG); } catch (e) {} } },

    async init() {
      const local = new LocalAdapter();
      const cfg = this.cloudConfig();
      if (cfg && cfg.unsafe) {
        // Отказываемся подключаться: секретный ключ открыл бы чужие команды всем посетителям.
        this.adapter = local;
        this.cloudTried = true;
        this.emit({ type: "status", cloudError: "В конфигурации service_role key. Нужен anon public key (Settings → API)." });
      } else if (cfg && HAS_WINDOW) {
        try {
          const cloud = new SupabaseAdapter(cfg);
          await cloud.init();
          cloud.on((e) => this.emit(e));
          this.adapter = cloud;
          this.cloudTried = true;
        } catch (e) {
          this.adapter = local; // облако недоступно — работаем локально
          this.emit({ type: "status", cloudError: (e && e.message) || "cloud" });
        }
      } else {
        this.adapter = local;
      }
      local.on ? null : null;
      if (this.adapter.name === "local") this.adapter.on((e) => this.emit(e));
      if (HAS_WINDOW && window.addEventListener) {
        window.addEventListener("online", () => { this.online = true; this.emit({ type: "status" }); this.refresh(); });
        window.addEventListener("offline", () => { this.online = false; this.emit({ type: "status" }); });
      }
      // Восстановление сессии.
      const sess = readJSON(LS_SESS, null);
      if (sess && sess.teamId) {
        try {
          const ok = await this.restore(sess);
          if (!ok) this.clearSession();
        } catch (e) { this.clearSession(); }
      }
    },

    async restore(sess) {
      if (this.mode() === "cloud") {
        const { data } = await this.adapter.client.from("memberships").select("role").eq("team_id", sess.teamId).single();
        if (!data) return false;
        const t = await this.adapter.client.from("teams").select("*").eq("id", sess.teamId).single();
        if (!t.data) return false;
        this.team = this.adapter.pub(t.data);
        this.role = data.role || "player";
      } else {
        const team = this.adapter.db.teams.find((x) => x.id === sess.teamId);
        if (!team) return false;
        this.team = this.adapter.publicTeam(team);
        this.role = sess.role === "captain" ? "captain" : "player";
      }
      this.adapter.enter && this.adapter.enter(this.team.id);
      await this.refresh();
      return true;
    },
    persistSession() {
      if (this.team) writeJSON(LS_SESS, { teamId: this.team.id, role: this.role, teamName: this.team.name });
    },
    clearSession() {
      this.team = null; this.role = "player"; this.cacheLoaded = false;
      if (this.adapter && this.adapter.leave) this.adapter.leave();
      if (HAS_LS) { try { localStorage.removeItem(LS_SESS); } catch (e) {} }
    },

    async createTeam(input, seedFn) {
      const res = await this.adapter.createTeam(input);
      this.team = res.team; this.role = "captain";
      this.adapter.enter && this.adapter.enter(this.team.id);
      this.persistSession();
      if (seedFn) { try { await seedFn(this.team.id); } catch (e) {} }
      await this.refresh();
      this.emit({ type: "team" });
      return res;
    },
    async login(input) {
      const res = await this.adapter.login(input);
      this.team = res.team; this.role = res.role === "captain" ? "captain" : "player";
      this.adapter.enter && this.adapter.enter(this.team.id);
      this.persistSession();
      await this.refresh();
      this.emit({ type: "team" });
      return res;
    },
    async loginCaptain(pin) {
      const res = await this.adapter.claimCaptain(this.team.id, pin);
      this.role = "captain";
      this.persistSession();
      this.emit({ type: "team" });
      return res;
    },
    logout() {
      this.clearSession();
      this.cache = { players: [], maps: [], tactics: [], materials: [], templates: [], activity: [], messages: [] };
      this.emit({ type: "team" });
    },

    async refresh(table) {
      if (!this.team) return;
      const tables = table && table !== "*" ? [table] : TABLES;
      // Пока капитан держит несохранённый черновик схемы, тактики из базы не
      // перечитываем: рабочий объект доски живёт в кэше и не должен подменяться.
      const skip = (t) => t === "tactics" && typeof this.draftGuard === "function" && this.draftGuard();
      // Офлайн в облачном режиме: отдаём кэш.
      if (this.mode() === "cloud" && !this.online) {
        const snap = readJSON(LS_CACHE, null);
        if (snap && snap.teamId === this.team.id) {
          TABLES.forEach((t) => { this.cache[t] = snap.data[t] || []; });
          this.cacheLoaded = true;
        }
        return;
      }
      for (const t of tables) {
        if (skip(t)) continue;
        try { this.cache[t] = await this.adapter.list(t, this.team.id); }
        catch (e) {
          if (this.mode() === "cloud") {
            const snap = readJSON(LS_CACHE, null);
            if (snap && snap.teamId === this.team.id) this.cache[t] = snap.data[t] || [];
          }
        }
      }
      this.cacheLoaded = true;
      if (this.mode() === "cloud") writeJSON(LS_CACHE, { teamId: this.team.id, ts: Date.now(), data: this.cache });
    },

    async save(table, obj) {
      if (this.mode() === "cloud" && !this.online) throw err("OFFLINE", "Нет соединения");
      const row = await this.adapter.save(table, this.team.id, obj);
      await this.refresh(table);
      return row;
    },
    async del(table, id) {
      if (this.mode() === "cloud" && !this.online) throw err("OFFLINE", "Нет соединения");
      await this.adapter.del(table, this.team.id, id);
      await this.refresh(table === "maps" ? "*" : table);
    },
    async reorder(table, ids) {
      if (this.mode() === "cloud" && !this.online) throw err("OFFLINE", "Нет соединения");
      await this.adapter.reorder(table, this.team.id, ids);
      await this.refresh(table);
    },
    /** Массовая очистка таблиц (капитанский сброс содержимого): удаляем без штормa событий. */
    async purge(tables) {
      if (!this.team) return;
      for (const t of tables) {
        const rows = (this.cache[t] || []).slice();
        for (const r of rows) {
          try { await this.adapter.del(t, this.team.id, r.id, true); } catch (e) {}
        }
      }
      await this.refresh("*");
      this.emit({ type: "data", table: "*", origin: "local" });
    },
    async log(text, ref) {
      try { await this.adapter.log(this.team.id, this.actorName(), text, ref); } catch (e) {}
      await this.refresh("activity");
    },
    actorName() {
      const prefs = readJSON(LS_PREF, {});
      const me = (prefs.myPlayer || {})[(this.team || {}).id || ""];
      if (me) {
        const p = this.cache.players.find((x) => x.id === me);
        if (p) return p.name;
      }
      return this.isCaptain() ? ((this.team && this.team.captainName) || "Капитан") : "Игрок";
    },

    /* --- device-local: мой профиль и избранное --- */
    prefs() { return readJSON(LS_PREF, { myPlayer: {}, favs: {} }); },
    myPlayerId() {
      if (!this.team) return null;
      return (this.prefs().myPlayer || {})[this.team.id] || null;
    },
    setMyPlayer(playerId) {
      const p = this.prefs();
      p.myPlayer = p.myPlayer || {};
      if (playerId) p.myPlayer[this.team.id] = playerId; else delete p.myPlayer[this.team.id];
      writeJSON(LS_PREF, p);
    },
    favs() {
      if (!this.team) return [];
      return ((this.prefs().favs || {})[this.team.id]) || [];
    },
    isFav(kind, id) { return this.favs().some((f) => f.kind === kind && f.id === id); },
    toggleFav(kind, id, title) {
      const p = this.prefs();
      p.favs = p.favs || {};
      const list = p.favs[this.team.id] || [];
      const i = list.findIndex((f) => f.kind === kind && f.id === id);
      if (i >= 0) list.splice(i, 1);
      else list.unshift({ kind, id, title: String(title || "").slice(0, 60), ts: Date.now() });
      p.favs[this.team.id] = list.slice(0, 60);
      writeJSON(LS_PREF, p);
      this.emit({ type: "favs" });
    },

    /* --- самопроверка облака: что подключено, а что нет --- */
    async diagnose() {
      const out = [];
      const add = (name, ok, detail, fix) => out.push({ name, ok, detail: detail || "", fix: fix || "" });
      const cfg = this.cloudConfig();
      if (!cfg) {
        add("Ключи проекта", false, "не найдены — сайт работает локально",
          "Скопируйте supabase-config.example.js в supabase-config.js и вставьте Project URL и anon key (SETUP.md, шаг 4).");
        return out;
      }
      if (cfg.unsafe) {
        add("Ключи проекта", false, "вставлен секретный ключ (sb_secret_… или service_role) — его нельзя публиковать",
          "Нужен публичный ключ для браузера: publishable (sb_publishable_…) или legacy anon public (eyJ…). Взять здесь: Supabase → кнопка Connect или Settings → API Keys. Секретный ключ обходит RLS и открыл бы данные команды всем посетителям сайта.");
        return out;
      }
      add("Ключи проекта", true, cfg.url);
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\b/i.test(cfg.url) || /supabase\.com\/dashboard/i.test(cfg.url)) {
        add("Адрес проекта", false, "похоже, вставлен не Project URL",
          "Нужен адрес вида https://ваш-проект.supabase.co — его показывает кнопка Connect в проекте или Settings → API Keys. Адрес страницы дашборда (supabase.com/dashboard/…) не подойдёт.");
      }
      if (!HAS_WINDOW || !window.supabase) {
        add("Библиотека supabase-js", false, "не загрузилась с CDN", "Проверьте интернет и блокировщики, затем перезагрузите страницу.");
        return out;
      }
      const client = this.adapter && this.adapter.client;
      if (this.mode() !== "cloud" || !client) {
        add("Подключение к базе", false, "облачный режим не включился",
          "Проверьте URL и anon key. Частая причина — выключенный Anonymous sign-ins в Supabase.");
        return out;
      }
      add("Подключение к базе", true, "облачный режим активен");

      try {
        const { data } = await client.auth.getSession();
        const sess = data && data.session;
        add("Анонимный вход", !!sess, sess ? "сессия устройства активна" : "сессии нет",
          sess ? "" : "Supabase → Authentication → Sign In / Up → включите Allow anonymous sign-ins.");
      } catch (e) {
        add("Анонимный вход", false, (e && e.message) || "ошибка",
          "Включите Allow anonymous sign-ins в Supabase.");
      }

      const missing = [];
      for (const t of TABLES) {
        try {
          const { error } = await client.from(t).select("id").limit(1);
          if (error) missing.push(t);
        } catch (e) { missing.push(t); }
      }
      add("Таблицы базы", missing.length === 0,
        missing.length ? "нет доступа: " + missing.join(", ") : "все " + TABLES.length + " на месте",
        missing.length ? "Примените supabase-schema.sql: SQL Editor → New query → вставить целиком → Run (SETUP.md, шаг 3)." : "");

      try {
        const { error } = await client.rpc("team_login", { p_name: "__check__" + Date.now(), p_pin: "0000" });
        const msg = (error && error.message) || "";
        const exists = msg.indexOf("NO_TEAM") >= 0;
        add("Серверная проверка PIN", exists, exists ? "функция team_login отвечает" : (msg || "нет ответа"),
          exists ? "" : "Примените supabase-schema.sql целиком — в нём серверные функции входа.");
      } catch (e) {
        add("Серверная проверка PIN", false, (e && e.message) || "", "Примените supabase-schema.sql целиком.");
      }

      try {
        const { error } = await client.storage.from("team-files").list("", { limit: 1 });
        const notFound = error && /not_?found/i.test(error.message || "");
        add("Хранилище файлов", !notFound,
          notFound ? "корзина team-files не создана" : (error ? "доступ ограничен RLS — это нормально" : "корзина на месте"),
          notFound ? "Примените supabase-schema.sql целиком — он создаёт корзину team-files." : "");
      } catch (e) {
        add("Хранилище файлов", false, (e && e.message) || "", "");
      }

      const status = await new Promise((resolve) => {
        let done = false;
        const fin = (s) => { if (!done) { done = true; resolve(s); } };
        let ch = null;
        try {
          ch = client.channel("check:" + Date.now());
          const timer = setTimeout(() => fin("TIMEOUT"), 6000);
          ch.subscribe((s) => {
            if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") { clearTimeout(timer); fin(s); }
          });
        } catch (e) { fin("ERROR"); return; }
        setTimeout(() => { try { client.removeChannel(ch); } catch (e) {} }, 8000);
      });
      add("Живые обновления (Realtime)", status === "SUBSCRIBED",
        status === "SUBSCRIBED" ? "канал подписан" : "статус: " + status,
        status === "SUBSCRIBED" ? "" : "Проверьте, что проект не на паузе; таблицы должны быть в публикации supabase_realtime (это делает supabase-schema.sql).");

      if (!this.team) {
        add("Вход в команду", false, "устройство ещё не вошло в команду",
          "Войдите названием команды и PIN — после этого правки начнут синхронизироваться.");
        return out;
      }
      try {
        await this.refresh("tactics");
        add("Чтение данных команды", true, "прочитано тактик: " + (this.cache.tactics || []).length);
      } catch (e) {
        add("Чтение данных команды", false, (e && e.message) || "", "Проверьте, что вошли в команду уже после применения схемы.");
      }
      if (this.isCaptain()) {
        try {
          await this.adapter.log(this.team.id, "проверка связи", "проверка связи: правки синхронизируются", null);
          add("Запись правок", true, "тестовая запись ушла в журнал команды");
        } catch (e) {
          add("Запись правок", false, (e && e.message) || "",
            "Проверьте, что PIN капитана введён: Управление → «Ввести PIN капитана».");
        }
      } else {
        add("Права на запись", true, "вы вошли как игрок: пишет капитан, вам правки приходят сами");
      }
      return out;
    },

    /* --- поиск по кэшу --- */
    search(q) {
      const query = String(q || "").trim().toLowerCase();
      if (query.length < 2) return [];
      const out = [];
      const push = (kind, id, title, sub) => out.push({ kind, id, title, sub });
      this.cache.tactics.forEach((t) => {
        const map = this.cache.maps.find((m) => m.id === t.map_id);
        const hay = (t.name + " " + (t.category || "") + " " + (t.description || "") + " " + (map ? map.name : "")).toLowerCase();
        if (hay.indexOf(query) >= 0) push("tactic", t.id, t.name, (map ? map.name + " · " : "") + (t.side || "") + (t.category ? " · " + t.category : ""));
        (t.blocks || []).forEach((b) => {
          (b.markers || []).forEach((mk) => {
            const pname = mk.playerId ? ((this.cache.players.find((p) => p.id === mk.playerId) || {}).name || "") : "";
            const mtext = ((mk.label || "") + " " + (mk.note || "") + " " + pname).toLowerCase();
            if (mtext.indexOf(query) >= 0) push("tactic", t.id, ((mk.label || pname || "Маркер") + " — " + t.name), (map ? map.name + " · " : "") + t.name);
          });
          (b.items || []).forEach((it) => {
            const kindAlias = { smoke: "smoke смоук смок", molly: "molly molotov молик молотов", flash: "flash флеш флешка" }[it.kind] || "";
            const text = ((it.task || "") + " " + (it.name || "") + " " + (it.note || "") + " " + (it.text || "") + " " + (it.title || "") + " " + kindAlias).toLowerCase();
            if (text.indexOf(query) >= 0) push("tactic", t.id, (it.name || it.task || it.title || "Пункт") + " — " + t.name, (map ? map.name + " · " : "") + t.name);
          });
        });
      });
      this.cache.players.forEach((p) => {
        if ((p.name + " " + (p.role || "") + " " + (p.positions || []).join(" ") + " " + (p.notes || "")).toLowerCase().indexOf(query) >= 0)
          push("player", p.id, p.name, p.role || "Игрок");
      });
      this.cache.maps.forEach((m) => {
        if (m.name.toLowerCase().indexOf(query) >= 0) push("map", m.id, m.name, "Карта");
      });
      this.cache.materials.forEach((m) => {
        if ((m.title + " " + (m.description || "")).toLowerCase().indexOf(query) >= 0)
          push("material", m.id, m.title, "Материал");
      });
      return out.slice(0, 40);
    },
  };

  if (HAS_WINDOW) window.PlaybookDB = DB;
  if (typeof module !== "undefined" && module.exports) module.exports = DB;
})();
