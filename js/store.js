// Capa de datos: Supabase en producción, localStorage en modo demo
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { uid, blobToDataURL } from "./utils.js";

const DEFAULT_SETTINGS = {
  id: 1,
  club_name: "Mi Club",
  site_title: "La Cantera",
  season: "2026/27",
  primary_color: "#0a3a8c",
  accent_color: "#ffd400",
  categories: ["Juvenil A", "Juvenil B", "Cadete A", "Cadete B", "Infantil A", "Alevín A"],
  instagram: "futbolconadrix",
  private_mode: false,
  allow_signup: true,
  logo_url: null,
};

const PLAYER_FIELDS = ["name", "nickname", "dorsal", "position", "detail_position", "foot", "birth_date", "birth_place",
  "nationality", "height_cm", "previous_clubs", "category", "status", "photo_url", "bio", "featured"];
const MATCH_FIELDS = ["match_date", "kickoff_time", "category", "competition", "rival", "venue", "formation", "goals_for", "goals_against", "notes", "mvp_id"];
const LINEUP_FIELDS = ["player_id", "starter", "slot", "minutes", "goals", "assists", "yellow", "red", "rating", "note"];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] === undefined ? null : o[k]]));

// ------------------------------------------------------------------ Supabase
function supabaseStore(sb) {
  const must = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    mode: "supabase",
    async me() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      const { data: prof } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
      return { id: u.id, email: u.email, name: prof?.display_name || u.email.split("@")[0], role: prof?.role || "usuario", blocked: !!prof?.blocked };
    },
    async signIn(email, password) {
      must(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password, name) {
      const data = must(await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: location.origin } }));
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error("User already registered");
      return { needsConfirm: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async resetPassword(email) {
      must(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin }));
    },
    async updatePassword(password) {
      must(await sb.auth.updateUser({ password }));
    },
    async updateMyName(name) {
      must(await sb.rpc("update_my_name", { new_name: name }));
    },
    onRecovery(cb) {
      sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") cb(); });
    },
    async listUsers() {
      return must(await sb.rpc("admin_list_users")) || [];
    },
    async updateUser(id, patch) {
      must(await sb.from("profiles").update(patch).eq("id", id));
    },
    async deleteUser(id) {
      must(await sb.rpc("admin_delete_user", { target: id }));
    },
    async loadAll() {
      const [s, p, m, mp, n] = await Promise.all([
        sb.from("settings").select("*").eq("id", 1).maybeSingle(),
        sb.from("players").select("*").order("dorsal", { ascending: true, nullsFirst: false }),
        sb.from("matches").select("*").order("match_date", { ascending: false }),
        sb.from("match_players").select("*"),
        sb.from("scout_notes").select("*").order("note_date", { ascending: false }),
      ]);
      const ev = await sb.from("match_events").select("*");
      return {
        events: ev.error ? [] : ev.data || [],
        settings: { ...DEFAULT_SETTINGS, ...(must(s) || {}) },
        players: must(p) || [],
        matches: must(m) || [],
        matchPlayers: must(mp) || [],
        notes: must(n) || [],
      };
    },
    async savePlayer(p) {
      const row = { ...pick(p, PLAYER_FIELDS), updated_at: new Date().toISOString() };
      if (p.id) return must(await sb.from("players").update(row).eq("id", p.id).select().single());
      return must(await sb.from("players").insert(row).select().single());
    },
    async deletePlayer(id) {
      must(await sb.from("players").delete().eq("id", id));
    },
    async saveBaseStats(list) {
      for (const x of list) {
        const { id, ...vals } = x;
        must(await sb.from("players").update(vals).eq("id", id));
      }
    },
    async saveMatch(m, lineup) {
      const row = pick(m, MATCH_FIELDS);
      const saved = m.id
        ? must(await sb.from("matches").update(row).eq("id", m.id).select().single())
        : must(await sb.from("matches").insert(row).select().single());
      must(await sb.from("match_players").delete().eq("match_id", saved.id));
      if (lineup.length)
        must(await sb.from("match_players").insert(lineup.map((l) => ({ ...pick(l, LINEUP_FIELDS), match_id: saved.id }))));
      return saved;
    },
    async deleteMatch(id) {
      must(await sb.from("matches").delete().eq("id", id));
    },
    // ---- directo
    async updateMatch(id, patch) {
      must(await sb.from("matches").update(patch).eq("id", id));
    },
    async upsertLineupRow(match_id, player_id, patch) {
      const upd = must(await sb.from("match_players").update(patch).eq("match_id", match_id).eq("player_id", player_id).select());
      if (!upd || !upd.length) must(await sb.from("match_players").insert({ match_id, player_id, starter: false, goals: 0, assists: 0, yellow: 0, red: 0, ...patch }));
    },
    async addEvent(e) {
      return must(await sb.from("match_events").insert(e).select().single());
    },
    async deleteEvent(id) {
      must(await sb.from("match_events").delete().eq("id", id));
    },
    realtime: false,
    subscribe(cb) {
      try {
        const ch = sb.channel("cantera-live");
        for (const table of ["matches", "match_players", "match_events"])
          ch.on("postgres_changes", { event: "*", schema: "public", table }, () => cb());
        ch.subscribe((st) => { this.realtime = st === "SUBSCRIBED"; });
      } catch (e) { console.warn("Realtime no disponible", e); }
    },
    async saveNote(n) {
      const row = { player_id: n.player_id, note_date: n.note_date, tag: n.tag || null, body: n.body };
      return must(await sb.from("scout_notes").insert(row).select().single());
    },
    async deleteNote(id) {
      must(await sb.from("scout_notes").delete().eq("id", id));
    },
    async saveSettings(s) {
      const row = { ...s, id: 1, updated_at: new Date().toISOString() };
      return must(await sb.from("settings").upsert(row).select().single());
    },
    async uploadPhoto(blob, folder = "players") {
      const png = blob.type === "image/png";
      const path = `${folder}/${uid()}.${png ? "png" : "jpg"}`;
      must(await sb.storage.from("photos").upload(path, blob, { contentType: png ? "image/png" : "image/jpeg", upsert: false }));
      return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
    },
  };
}

// ------------------------------------------------------------------ Demo
const KEY = "cantera_demo_v1";
const AUTH_KEY = "cantera_demo_user";

function seed() {
  const P = (o) => ({ id: uid(), nickname: null, detail_position: null, nationality: "España", photo_url: null,
    status: "Activo", featured: false, previous_clubs: [], bio: "", created_at: new Date().toISOString(), ...o });
  const players = [
    P({ name: "Hugo Martín Rey", dorsal: 1, position: "Portero", foot: "Diestro", birth_date: "2008-03-14", birth_place: "Las Palmas de Gran Canaria", height_cm: 188, category: "Juvenil A", previous_clubs: ["UD Tamaraceite", "CD Huracán"], bio: "Muy ágil bajo palos y buen juego con el pie." }),
    P({ name: "Daniel Suárez Vega", dorsal: 4, position: "Defensa", detail_position: "Central", foot: "Diestro", birth_date: "2008-07-02", birth_place: "Telde", height_cm: 184, category: "Juvenil A", previous_clubs: ["CD Telde"] }),
    P({ name: "Iker Medina Ojeda", dorsal: 3, position: "Defensa", detail_position: "Lateral izquierdo", foot: "Zurdo", birth_date: "2009-01-21", birth_place: "Arucas", height_cm: 172, category: "Juvenil A", previous_clubs: ["CD Arucas"] }),
    P({ name: "Adrián Cabrera León", nickname: "Cabre", dorsal: 8, position: "Centrocampista", detail_position: "Mediocentro", foot: "Diestro", birth_date: "2008-11-09", birth_place: "Santa Lucía de Tirajana", height_cm: 176, category: "Juvenil A", previous_clubs: ["UD Vecindario", "CF Unión Viera"], featured: true, bio: "Capitán. Lee el juego como nadie y llega desde segunda línea." }),
    P({ name: "Yeremay Santana Pérez", dorsal: 10, position: "Centrocampista", detail_position: "Mediapunta", foot: "Zurdo", birth_date: "2009-05-30", birth_place: "Gáldar", height_cm: 170, category: "Juvenil A", previous_clubs: ["CD Gáldar"], featured: true, bio: "Desborde y último pase. El más seguido de la categoría." }),
    P({ name: "Marco Alonso Díaz", dorsal: 9, position: "Delantero", detail_position: "Delantero centro", foot: "Diestro", birth_date: "2008-09-18", birth_place: "Las Palmas de Gran Canaria", height_cm: 181, category: "Juvenil A", previous_clubs: ["UD Las Coloradas", "CD Firgas"] }),
    P({ name: "Aitor Ramírez Sosa", dorsal: 7, position: "Delantero", detail_position: "Extremo derecho", foot: "Zurdo", birth_date: "2009-12-03", birth_place: "Ingenio", height_cm: 168, category: "Juvenil A", previous_clubs: ["AD Carrizal"] }),
    P({ name: "Pablo Hernández Gil", dorsal: 6, position: "Centrocampista", detail_position: "Pivote", foot: "Diestro", birth_date: "2011-02-11", birth_place: "Teror", height_cm: 171, category: "Cadete A", previous_clubs: ["CD Teror"], featured: true, bio: "Cadete de primer año que ya entrena con el juvenil." }),
    P({ name: "Nauzet Quintana Ruiz", dorsal: 11, position: "Delantero", foot: "Diestro", birth_date: "2011-06-25", birth_place: "Agüimes", height_cm: 166, category: "Cadete A", previous_clubs: [] }),
  ];
  const id = (d) => players.find((p) => p.dorsal === d && p.category === "Juvenil A").id;
  const matches = [];
  const matchPlayers = [];
  const add = (m, rows) => {
    const mm = { id: uid(), category: "Juvenil A", competition: "División de Honor · Grupo 4", created_at: new Date().toISOString(), ...m };
    matches.push(mm);
    rows.forEach(([d, min, g, a, r, note, starter = true, y = 0]) =>
      matchPlayers.push({ match_id: mm.id, player_id: id(d), starter, minutes: min, goals: g, assists: a, yellow: y, red: 0, rating: r, note }));
  };
  add({ match_date: "2026-11-22", rival: "CD Tenerife", venue: "Local", goals_for: 3, goals_against: 1, notes: "Partidazo del equipo. Presión alta durante 70 minutos y mucha personalidad con balón.", mvp_id: id(10) },
    [[1, 90, 0, 0, 7.0, "Parada clave al 60'"], [4, 90, 0, 0, 7.0, ""], [3, 90, 0, 1, 7.5, "Asistencia en el 2-0"], [8, 90, 1, 0, 8.0, "Gol de cabeza"], [10, 85, 1, 1, 9.0, "Imparable por dentro"], [9, 78, 1, 0, 7.5, ""], [7, 12, 0, 1, 6.5, "", false]]);
  add({ match_date: "2026-11-15", rival: "UD San Fernando", venue: "Visitante", goals_for: 1, goals_against: 1, notes: "Campo difícil. Faltó acierto arriba.", mvp_id: id(8) },
    [[1, 90, 0, 0, 6.5, ""], [4, 90, 0, 0, 6.0, "", true, 1], [3, 70, 0, 0, 6.0, ""], [8, 90, 0, 1, 7.5, "Lo intentó todo"], [10, 90, 0, 0, 6.0, "Muy vigilado"], [9, 90, 1, 0, 7.0, ""], [7, 20, 0, 0, 5.5, "", false]]);
  add({ match_date: "2026-11-08", rival: "CD Laguna", venue: "Local", goals_for: 4, goals_against: 0, notes: "Goleada y portería a cero.", mvp_id: id(9) },
    [[1, 90, 0, 0, 7.0, ""], [4, 90, 1, 0, 7.5, ""], [3, 90, 0, 1, 7.0, ""], [8, 80, 0, 1, 7.0, ""], [10, 90, 1, 2, 8.5, ""], [9, 75, 2, 0, 9.0, "Doblete"], [7, 15, 0, 0, 6.5, "", false]]);
  add({ match_date: "2026-11-01", rival: "UD Las Palmas C", venue: "Visitante", goals_for: 0, goals_against: 2, notes: "Derbi duro. Mucho que aprender.", mvp_id: id(1) },
    [[1, 90, 0, 0, 7.5, "Evitó una goleada"], [4, 90, 0, 0, 5.5, ""], [3, 90, 0, 0, 5.0, ""], [8, 90, 0, 0, 6.0, ""], [10, 60, 0, 0, 5.5, ""], [9, 90, 0, 0, 5.0, ""], [7, 30, 0, 0, 6.0, "", false]]);
  add({ match_date: "2026-11-29", kickoff_time: "11:30", rival: "CD Mensajero", venue: "Local", goals_for: null, goals_against: null, notes: "Partido clave para seguir arriba.", mvp_id: null }, []);
  const notes = [
    { id: uid(), player_id: id(10), note_date: "2026-11-23", tag: "Noticia", body: "Convocado con la selección canaria sub-18.", created_at: new Date().toISOString() },
    { id: uid(), player_id: id(10), note_date: "2026-11-10", tag: "A mejorar", body: "Tiene que mejorar la toma de decisiones cuando el rival le dobla.", created_at: new Date().toISOString() },
    { id: uid(), player_id: id(8), note_date: "2026-11-16", tag: "Fortaleza", body: "Liderazgo enorme. Ordena al equipo en salida de balón.", created_at: new Date().toISOString() },
  ];
  return { settings: { ...DEFAULT_SETTINGS }, players, matches, matchPlayers, notes };
}

function demoStore() {
  const read = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.players) return s;
    } catch {}
    const s = seed();
    write(s);
    return s;
  };
  const write = (s) => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { throw new Error("No hay espacio en el navegador (prueba con fotos más pequeñas)"); }
  };
  const USERS_KEY = "cantera_demo_users";
  const readUsers = () => {
    try { const u = JSON.parse(localStorage.getItem(USERS_KEY)); if (Array.isArray(u)) return u; } catch {}
    const now = new Date().toISOString();
    const u = [
      { id: "u-admin", email: "admin@demo.es", display_name: "Adrix", role: "admin", blocked: false, created_at: now, last_sign_in_at: now, confirmed: true },
      { id: "u-colab", email: "colaborador@demo.es", display_name: "Colaborador", role: "colaborador", blocked: false, created_at: now, last_sign_in_at: null, confirmed: true },
      { id: "u-fan", email: "aficionado@demo.es", display_name: "Aficionado", role: "usuario", blocked: false, created_at: now, last_sign_in_at: null, confirmed: true },
    ];
    writeUsers(u);
    return u;
  };
  const writeUsers = (u) => { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch {} };
  let current = null;
  try { current = localStorage.getItem(AUTH_KEY); } catch {}
  const setCurrent = (id) => { current = id; try { id ? localStorage.setItem(AUTH_KEY, id) : localStorage.removeItem(AUTH_KEY); } catch {} };
  const adminsLeft = (users, exceptId) => users.filter((x) => x.role === "admin" && !x.blocked && x.id !== exceptId).length;
  return {
    mode: "demo",
    async me() {
      const u = readUsers().find((x) => x.id === current);
      return u ? { id: u.id, email: u.email, name: u.display_name, role: u.role, blocked: u.blocked } : null;
    },
    async signIn(email, password) {
      if (!email || !password) throw new Error("Escribe email y contraseña");
      const users = readUsers();
      let u = users.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
      if (!u) throw new Error("Invalid login credentials");
      u.last_sign_in_at = new Date().toISOString();
      writeUsers(users);
      setCurrent(u.id);
    },
    async signUp(email, password, name) {
      const users = readUsers();
      if (users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error("User already registered");
      const u = { id: uid(), email, display_name: name || email.split("@")[0], role: users.some((x) => x.role === "admin") ? "usuario" : "admin",
        blocked: false, created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString(), confirmed: true };
      users.push(u);
      writeUsers(users);
      setCurrent(u.id);
      return { needsConfirm: false };
    },
    async signOut() { setCurrent(null); },
    async resetPassword() {},
    async updatePassword() {},
    async updateMyName(name) {
      const users = readUsers(); const u = users.find((x) => x.id === current);
      if (u) { u.display_name = name; writeUsers(users); }
    },
    onRecovery() {},
    async listUsers() { return readUsers().sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async updateUser(id, patch) {
      const users = readUsers(); const u = users.find((x) => x.id === id);
      if (!u) return;
      const next = { ...u, ...patch };
      if (u.role === "admin" && !u.blocked && (next.role !== "admin" || next.blocked) && !adminsLeft(users, id)) throw new Error("Debe quedar al menos un administrador");
      Object.assign(u, patch); writeUsers(users);
    },
    async deleteUser(id) {
      if (id === current) throw new Error("No puedes eliminar tu propia cuenta");
      writeUsers(readUsers().filter((x) => x.id !== id));
    },
    async loadAll() {
      const s = read();
      s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
      s.events = s.events || [];
      return structuredClone(s);
    },
    async savePlayer(p) {
      const s = read();
      const row = { ...pick(p, PLAYER_FIELDS), id: p.id || uid() };
      const i = s.players.findIndex((x) => x.id === row.id);
      i >= 0 ? (s.players[i] = { ...s.players[i], ...row }) : s.players.push(row);
      write(s);
      return row;
    },
    async saveBaseStats(list) {
      const s = read();
      for (const x of list) { const p = s.players.find((y) => y.id === x.id); if (p) Object.assign(p, x); }
      write(s);
    },
    async deletePlayer(id) {
      const s = read();
      s.players = s.players.filter((p) => p.id !== id);
      s.matchPlayers = s.matchPlayers.filter((a) => a.player_id !== id);
      s.notes = s.notes.filter((n) => n.player_id !== id);
      s.matches.forEach((m) => { if (m.mvp_id === id) m.mvp_id = null; });
      write(s);
    },
    async saveMatch(m, lineup) {
      const s = read();
      const row = { ...pick(m, MATCH_FIELDS), id: m.id || uid() };
      const i = s.matches.findIndex((x) => x.id === row.id);
      i >= 0 ? (s.matches[i] = { ...s.matches[i], ...row }) : s.matches.push(row);
      s.matchPlayers = s.matchPlayers.filter((a) => a.match_id !== row.id)
        .concat(lineup.map((l) => ({ ...pick(l, LINEUP_FIELDS), match_id: row.id })));
      write(s);
      return row;
    },
    async updateMatch(id, patch) {
      const s = read(); const m = s.matches.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
      write(s);
    },
    async upsertLineupRow(match_id, player_id, patch) {
      const s = read();
      const r = s.matchPlayers.find((x) => x.match_id === match_id && x.player_id === player_id);
      if (r) Object.assign(r, patch);
      else s.matchPlayers.push({ match_id, player_id, starter: false, slot: null, minutes: null, goals: 0, assists: 0, yellow: 0, red: 0, rating: null, note: null, ...patch });
      write(s);
    },
    async addEvent(e) {
      const s = read(); s.events = s.events || [];
      const row = { ...e, id: uid(), created_at: new Date().toISOString() };
      s.events.push(row); write(s); return row;
    },
    async deleteEvent(id) {
      const s = read(); s.events = (s.events || []).filter((e) => e.id !== id); write(s);
    },
    realtime: false,
    subscribe(cb) { window.addEventListener("storage", (e) => { if (e.key === KEY) cb(); }); },
    async deleteMatch(id) {
      const s = read();
      s.matches = s.matches.filter((m) => m.id !== id);
      s.events = (s.events || []).filter((e) => e.match_id !== id);
      s.matchPlayers = s.matchPlayers.filter((a) => a.match_id !== id);
      write(s);
    },
    async saveNote(n) {
      const s = read();
      const row = { ...n, id: uid(), created_at: new Date().toISOString() };
      s.notes.push(row);
      write(s);
      return row;
    },
    async deleteNote(id) {
      const s = read();
      s.notes = s.notes.filter((n) => n.id !== id);
      write(s);
    },
    async saveSettings(st) {
      const s = read();
      s.settings = { ...s.settings, ...st };
      write(s);
      return s.settings;
    },
    async uploadPhoto(blob) { return blobToDataURL(blob); },
    reset() {
      try { localStorage.removeItem(KEY); localStorage.removeItem(USERS_KEY); } catch {}
    },
  };
}

export async function createStore() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    return supabaseStore(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return demoStore();
}
