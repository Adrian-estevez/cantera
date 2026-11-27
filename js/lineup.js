// Sistemas de juego, colocación del once y dibujo del campo
import { esc, fmtRating, ratingClass, initials } from "./utils.js";

// x: 0 izquierda → 100 derecha · y: 0 portería rival (arriba) → 100 portería propia (abajo)
const S = (l, g, x, y) => ({ l, g, x, y });
const GK = S("POR", "G", 50, 91);
const DEF4 = [S("LD", "D", 85, 67), S("DFC", "D", 63, 71), S("DFC", "D", 37, 71), S("LI", "D", 15, 67)];
const DEF3 = [S("DFC", "D", 74, 70), S("DFC", "D", 50, 73), S("DFC", "D", 26, 70)];

export const FORMATIONS = {
  "4-3-3": [GK, ...DEF4, S("MC", "M", 70, 50), S("MCD", "M", 50, 55), S("MC", "M", 30, 50), S("ED", "F", 80, 24), S("DC", "F", 50, 18), S("EI", "F", 20, 24)],
  "4-4-2": [GK, ...DEF4, S("MD", "M", 84, 46), S("MC", "M", 61, 50), S("MC", "M", 39, 50), S("MI", "M", 16, 46), S("DC", "F", 62, 20), S("DC", "F", 38, 20)],
  "4-2-3-1": [GK, ...DEF4, S("MCD", "M", 62, 57), S("MCD", "M", 38, 57), S("ED", "M", 82, 35), S("MCO", "M", 50, 37), S("EI", "M", 18, 35), S("DC", "F", 50, 16)],
  "4-1-4-1": [GK, ...DEF4, S("MCD", "M", 50, 58), S("MD", "M", 84, 40), S("MC", "M", 61, 43), S("MC", "M", 39, 43), S("MI", "M", 16, 40), S("DC", "F", 50, 16)],
  "4-3-1-2": [GK, ...DEF4, S("MC", "M", 70, 55), S("MCD", "M", 50, 59), S("MC", "M", 30, 55), S("MCO", "M", 50, 38), S("DC", "F", 62, 18), S("DC", "F", 38, 18)],
  "3-5-2": [GK, ...DEF3, S("CAD", "M", 88, 46), S("MC", "M", 67, 51), S("MCD", "M", 50, 57), S("MC", "M", 33, 51), S("CAI", "M", 12, 46), S("DC", "F", 62, 20), S("DC", "F", 38, 20)],
  "3-4-3": [GK, ...DEF3, S("MD", "M", 85, 48), S("MC", "M", 61, 52), S("MC", "M", 39, 52), S("MI", "M", 15, 48), S("ED", "F", 78, 23), S("DC", "F", 50, 18), S("EI", "F", 22, 23)],
  "5-3-2": [GK, S("CAD", "D", 90, 63), S("DFC", "D", 70, 74), S("DFC", "D", 50, 77), S("DFC", "D", 30, 74), S("CAI", "D", 10, 63), S("MC", "M", 70, 48), S("MCD", "M", 50, 53), S("MC", "M", 30, 48), S("DC", "F", 62, 20), S("DC", "F", 38, 20)],
  // Fútbol 8 y fútbol 7 (categorías pequeñas)
  "F8 · 3-3-1": [GK, ...DEF3, S("MD", "M", 78, 48), S("MC", "M", 50, 51), S("MI", "M", 22, 48), S("DC", "F", 50, 20)],
  "F8 · 3-2-2": [GK, ...DEF3, S("MC", "M", 64, 50), S("MC", "M", 36, 50), S("DC", "F", 64, 22), S("DC", "F", 36, 22)],
  "F7 · 3-2-1": [GK, ...DEF3, S("MC", "M", 64, 48), S("MC", "M", 36, 48), S("DC", "F", 50, 20)],
  "F7 · 2-3-1": [GK, S("DFC", "D", 66, 72), S("DFC", "D", 34, 72), S("MD", "M", 80, 47), S("MC", "M", 50, 50), S("MI", "M", 20, 47), S("DC", "F", 50, 20)],
  "F7 · 3-3": [GK, ...DEF3, S("ED", "F", 78, 30), S("DC", "F", 50, 25), S("EI", "F", 22, 30)],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = "4-3-3";

const GROUP = { Portero: "G", Defensa: "D", Centrocampista: "M", Delantero: "F" };
export const groupOf = (p) => GROUP[p?.position] || null;
const DETAIL = [
  [/lateral izq|carrilero izq/, ["LI", "CAI"]], [/lateral der|carrilero der/, ["LD", "CAD"]], [/central|libero|líbero/, ["DFC"]],
  [/pivote|mediocentro defensivo|medio defensivo/, ["MCD"]], [/mediapunta|enganche/, ["MCO"]], [/interior|mediocentro|centrocampista|volante/, ["MC", "MCD"]],
  [/extremo der|banda der|medio der/, ["ED", "MD"]], [/extremo izq|banda izq|medio izq/, ["EI", "MI"]],
  [/delantero|punta|ariete|9/, ["DC"]], [/portero/, ["POR"]],
];
export function detailLabels(p) {
  const d = String(p?.detail_position || "").toLowerCase();
  if (!d) return p?.position === "Portero" ? ["POR"] : [];
  const hit = DETAIL.find(([re]) => re.test(d));
  return hit ? hit[1] : [];
}

export function defaultFormation(category) {
  const c = String(category || "").toLowerCase();
  if (/benjam|prebenjam|alev[ií]n/.test(c)) return "F7 · 3-2-1";
  return DEFAULT_FORMATION;
}

// Coloca a los titulares en los huecos del sistema.
// Respeta slots ya guardados si caben; al resto los coloca por su posición (portero, defensa…).
export function arrange(rows, formation, playerById) {
  const slots = FORMATIONS[formation] || FORMATIONS[DEFAULT_FORMATION];
  const out = rows.map((r) => ({ ...r }));
  const starters = out.filter((r) => r.starter);
  const taken = new Array(slots.length).fill(null);
  const pending = [];
  for (const r of starters) {
    if (Number.isInteger(r.slot) && r.slot >= 0 && r.slot < slots.length && !taken[r.slot]) taken[r.slot] = r;
    else pending.push(r);
  }
  // 1º por demarcación exacta, 2º por línea (portero, defensa…), 3º donde quede hueco
  for (const pass of ["detail", "group", "any"]) {
    for (const r of [...pending]) {
      const p = playerById(r.player_id);
      const g = groupOf(p), labels = detailLabels(p);
      const i = slots.findIndex((s, k) => !taken[k] && (pass === "any" || (pass === "group" ? s.g === g : labels.includes(s.l))));
      if (i === -1) continue;
      taken[i] = r;
      pending.splice(pending.indexOf(r), 1);
    }
  }
  taken.forEach((r, i) => r && (r.slot = i));
  // si sobran titulares (el sistema tiene menos huecos), pasan al banquillo
  pending.forEach((r) => { r.starter = false; r.slot = null; });
  out.filter((r) => !r.starter).forEach((r) => (r.slot = null));
  return { slots, bySlot: taken, bench: out.filter((r) => !r.starter), rows: out };
}

export const shortName = (p) => {
  if (p.nickname) return p.nickname;
  const w = String(p.name || "").trim().split(/\s+/);
  return w.length > 1 ? w[1] : w[0] || "";
};

const BALL = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#fff" stroke="#111" stroke-width="1.2"/><path d="M8 4.2l2.6 1.9-1 3.1H6.4l-1-3.1z" fill="#111"/></svg>`;
const STAR = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.4 3.8 13.8l1-4.6L1.3 6l4.7-.5z" fill="currentColor"/></svg>`;

function token(r, p, opts) {
  const badges = [];
  if (r && r.goals > 0) badges.push(`<span class="tk-b goal" title="${r.goals} gol${r.goals > 1 ? "es" : ""}">${BALL}${r.goals > 1 ? `<i>${r.goals}</i>` : ""}</span>`);
  if (r && r.assists > 0) badges.push(`<span class="tk-b asis" title="${r.assists} asistencia${r.assists > 1 ? "s" : ""}">A${r.assists > 1 ? r.assists : ""}</span>`);
  if (r && r.yellow > 0) badges.push(`<span class="tk-c y" title="Amarilla"></span>`);
  if (r && r.red > 0) badges.push(`<span class="tk-c r" title="Roja"></span>`);
  if (r && r._in != null) badges.push(`<span class="tk-b sub" title="Entró en el ${r._in}'">${r._in}'</span>`);
  const photo = opts.photo(p);
  const rated = r && r.rating != null && r.rating !== "";
  return `<span class="tk-shirt">${photo ? `<img src="${esc(photo)}" alt="">` : `<b>${esc(p.dorsal ?? initials(p.name))}</b>`}
      ${rated ? `<span class="tk-rate ${ratingClass(r.rating)}">${fmtRating(r.rating)}</span>` : ""}
      ${opts.mvp === p.id ? `<span class="tk-mvp" title="MVP">${STAR}</span>` : ""}</span>
    <span class="tk-name">${photo && p.dorsal != null ? `<small>${esc(p.dorsal)}</small> ` : ""}${esc(shortName(p))}</span>
    ${badges.length ? `<span class="tk-badges">${badges.join("")}</span>` : ""}`;
}

// HTML del campo. opts: { editable, mode, mvp, photo(p) }
export function pitchHTML(arr, playerById, opts) {
  const { slots, bySlot, bench } = arr;
  const action = opts.editable ? (opts.mode === "rate" ? "rate" : opts.mode === "live" ? "live" : "pick") : null;
  const pitch = slots.map((s, i) => {
    const r = bySlot[i];
    const p = r && playerById(r.player_id);
    const style = `left:${s.x}%;top:${s.y}%`;
    if (!p) {
      return action === "pick"
        ? `<button class="tk empty" style="${style}" data-act="slot-pick" data-slot="${i}" aria-label="Elegir ${s.l}"><span class="tk-shirt"><b>+</b></span><span class="tk-name">${s.l}</span></button>`
        : `<span class="tk empty ghost" style="${style}"><span class="tk-shirt"><b></b></span><span class="tk-name">${s.l}</span></span>`;
    }
    const inner = token(r, p, opts);
    if (action === "pick") return `<button class="tk" style="${style}" data-act="slot-pick" data-slot="${i}" aria-label="Cambiar ${esc(p.name)}">${inner}</button>`;
    if (action === "rate") return `<button class="tk" style="${style}" data-act="rate" data-pid="${esc(p.id)}" aria-label="Puntuar a ${esc(p.name)}">${inner}</button>`;
    if (action === "live") return `<button class="tk" style="${style}" data-act="live-player" data-pid="${esc(p.id)}" aria-label="Acciones para ${esc(p.name)}">${inner}</button>`;
    return `<a class="tk" style="${style}" href="#/jugador/${esc(p.id)}">${inner}</a>`;
  }).join("");

  const benchHTML = bench.map((r) => {
    const p = playerById(r.player_id);
    if (!p) return "";
    const rated = r.rating != null && r.rating !== "";
    const label = `<span class="bn-num">${esc(p.dorsal ?? "")}</span><span class="bn-name">${esc(p.name)}</span>
      ${r.minutes ? `<span class="bn-min">${esc(r.minutes)}'</span>` : ""}${r.goals ? `<span class="bn-g">${BALL}${r.goals > 1 ? r.goals : ""}</span>` : ""}
      ${opts.mvp === p.id ? `<span class="tk-mvp inline">${STAR}</span>` : ""}
      ${rated ? `<span class="rt ${ratingClass(r.rating)}">${fmtRating(r.rating)}</span>` : ""}`;
    if (action === "pick") return `<span class="bn">${label}<button class="x" data-act="bench-remove" data-pid="${esc(p.id)}" aria-label="Quitar a ${esc(p.name)} de la convocatoria">×</button></span>`;
    if (action === "rate") return `<button class="bn" data-act="rate" data-pid="${esc(p.id)}">${label}</button>`;
    if (action === "live") return `<button class="bn" data-act="live-player" data-pid="${esc(p.id)}" data-bench="1">${label}</button>`;
    return `<a class="bn" href="#/jugador/${esc(p.id)}">${label}</a>`;
  }).join("");

  return { pitch: `<div class="pitch${opts.editable ? " editing" : ""}"><div class="pitch-lines" aria-hidden="true"><i class="half"></i><i class="circle"></i><i class="box pt"></i><i class="box pb"></i><i class="six pt"></i><i class="six pb"></i></div>${pitch}</div>`, bench: benchHTML };
}
