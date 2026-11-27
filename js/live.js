// Directo: reloj, eventos, once actual y minutos jugados
import { esc } from "./utils.js";

export const LIVE_STATES = ["primera", "descanso", "segunda"];
export const isLive = (m) => !!m && LIVE_STATES.includes(m.live_status);
export const STATUS_LABEL = { primera: "1ª parte", descanso: "Descanso", segunda: "2ª parte", final: "Final" };

export function defaultHalf(category) {
  const c = String(category || "").toLowerCase();
  if (/prebenjam/.test(c)) return 20;
  if (/benjam/.test(c)) return 25;
  if (/alev/.test(c)) return 30;
  if (/infantil/.test(c)) return 35;
  if (/cadete/.test(c)) return 40;
  return 45;
}

// minuto actual del reloj (1, 2, 3…), null si está parado
export function clockMinute(m, now = Date.now()) {
  if (!m || !m.live_started_at || !["primera", "segunda"].includes(m.live_status)) return null;
  const el = Math.max(0, Math.floor((now - new Date(m.live_started_at).getTime()) / 60000)) + 1;
  return m.live_status === "primera" ? el : (m.half_minutes || 45) + el;
}

export function clockLabel(m) {
  if (!m) return "";
  if (m.live_status === "descanso") return "Descanso";
  if (m.live_status === "final") return "Final";
  const min = clockMinute(m);
  if (min == null) return "";
  const h = m.half_minutes || 45;
  const cap = m.live_status === "primera" ? h : 2 * h;
  return min > cap ? `${cap}+${min - cap}'` : `${min}'`;
}

export const eventsOf = (data, mid) =>
  (data.events || []).filter((e) => e.match_id === mid)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));

// Once que está ahora en el campo (aplica los cambios en orden)
export function currentXI(arr, events) {
  const bySlot = arr.bySlot.slice();
  let bench = arr.bench.slice();
  const out = [];
  for (const e of events.filter((x) => x.type === "cambio")) {
    const i = bySlot.findIndex((r) => r && r.player_id === e.player_id);
    if (i === -1) continue;
    const inRow = bench.find((r) => r.player_id === e.player2_id) || { player_id: e.player2_id, starter: false, goals: 0, assists: 0, yellow: 0, red: 0 };
    out.push({ ...bySlot[i], _out: e.minute });
    bySlot[i] = { ...inRow, _in: e.minute };
    bench = bench.filter((r) => r.player_id !== e.player2_id);
  }
  return { ...arr, bySlot, bench, out };
}

// Minutos jugados por cada jugador de la convocatoria al terminar
export function computeMinutes(rows, events, total) {
  const inAt = {}, outAt = {};
  for (const e of events.filter((x) => x.type === "cambio")) {
    if (e.player_id) outAt[e.player_id] = e.minute ?? total;
    if (e.player2_id) inAt[e.player2_id] = e.minute ?? 0;
  }
  const res = {};
  for (const r of rows) {
    const start = r.starter ? 0 : inAt[r.player_id];
    if (start == null) { res[r.player_id] = 0; continue; }
    const end = Math.min(outAt[r.player_id] ?? total, total);
    res[r.player_id] = Math.max(0, end - Math.min(start, total));
  }
  return res;
}

// marcador acumulado hasta un evento (incluido)
export function scoreAt(events, ev) {
  let gf = 0, ga = 0;
  for (const e of events) {
    if (e.type === "gol") gf++;
    if (e.type === "gol_rival") ga++;
    if (e.id === ev.id) break;
  }
  return [gf, ga];
}

export const ICONS = {
  gol: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#fff" stroke="#111" stroke-width="1.2"/><path d="M8 4.2l2.6 1.9-1 3.1H6.4l-1-3.1z" fill="#111"/></svg>`,
  gol_rival: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#9aa59f" stroke="#555" stroke-width="1.2"/><path d="M8 4.2l2.6 1.9-1 3.1H6.4l-1-3.1z" fill="#444"/></svg>`,
  amarilla: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="2" width="8" height="12" rx="1.5" fill="#f5c400"/></svg>`,
  roja: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="2" width="8" height="12" rx="1.5" fill="#d8261b"/></svg>`,
  cambio: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2v9H2.5L6 14.5 9.5 11H7V2z" fill="#d8261b"/><path d="M11 14V5h2.5L10 1.5 6.5 5H9v9z" fill="#15a34a"/></svg>`,
  nota: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12v8H6l-3 3v-3H2z" fill="currentColor" opacity=".7"/></svg>`,
  estado: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4v4.5l3 1.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
};

export function eventText(e, name, rival) {
  const n = (id) => (id ? name(id) : "");
  switch (e.type) {
    case "gol": return `Gol${e.player_id ? ` de <b>${esc(n(e.player_id))}</b>` : ""}${e.player2_id ? ` <span class="muted">(asist. ${esc(n(e.player2_id))})</span>` : ""}`;
    case "gol_rival": return `Gol de ${esc(rival)}${e.body ? ` <span class="muted">· ${esc(e.body)}</span>` : ""}`;
    case "amarilla": return `Amarilla a <b>${esc(n(e.player_id))}</b>`;
    case "roja": return `Roja a <b>${esc(n(e.player_id))}</b>`;
    case "cambio": return `Entra <b>${esc(n(e.player2_id))}</b>, sale ${esc(n(e.player_id))}`;
    case "estado": return `<b>${esc(e.body || "")}</b>`;
    default: return esc(e.body || "");
  }
}

// texto corto para publicar al momento en redes
export function eventPost(e, ctx) {
  const { name, club, rival, home, events, handle, tag } = ctx;
  const [gf, ga] = scoreAt(events, e);
  const score = home ? `${club} ${gf}-${ga} ${rival}` : `${rival} ${ga}-${gf} ${club}`;
  const min = e.minute != null ? `${e.minute}'` : "";
  const n = (id) => (id ? name(id) : "");
  let t;
  switch (e.type) {
    case "gol": t = `⚽ ¡GOOOL! ${min}${e.player_id ? ` | ${n(e.player_id)}` : ""}${e.player2_id ? ` (asist. ${n(e.player2_id)})` : ""}\n${score}`; break;
    case "gol_rival": t = `${min} | Gol de ${rival}.\n${score}`; break;
    case "amarilla": t = `🟨 ${min} | Amarilla para ${n(e.player_id)}`; break;
    case "roja": t = `🟥 ${min} | Roja para ${n(e.player_id)}`; break;
    case "cambio": t = `🔁 ${min} | Entra ${n(e.player2_id)} por ${n(e.player_id)}`; break;
    case "estado": t = `⏱️ ${e.body} | ${score}`; break;
    default: t = `${min} | ${e.body || ""}`;
  }
  return `${t}\n\n${tag} ${handle}`.trim();
}
