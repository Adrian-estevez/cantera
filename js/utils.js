// Utilidades generales
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2));

export function age(birth) {
  if (!birth) return null;
  const b = new Date(birth + "T00:00:00");
  if (isNaN(b)) return null;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtDate(d, long = false) {
  if (!d) return "";
  const x = new Date(d + "T00:00:00");
  if (isNaN(x)) return d;
  return long
    ? x.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : `${x.getDate()} ${MONTHS[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function initials(name) {
  return String(name || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export const fmtRating = (r) => (r == null || r === "" || isNaN(r) ? "–" : Number(r).toFixed(1));

export function ratingClass(r) {
  if (r == null || r === "" || isNaN(r)) return "r-none";
  r = Number(r);
  if (r >= 8) return "r-top";
  if (r >= 6.5) return "r-good";
  if (r >= 5) return "r-ok";
  return "r-low";
}

export function result(m) {
  if (m.goals_for == null || m.goals_against == null || m.goals_for === "" || m.goals_against === "") return "P";
  const a = Number(m.goals_for), b = Number(m.goals_against);
  return a > b ? "V" : a < b ? "D" : "E";
}

export function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

// Reduce una imagen antes de subirla (máx. 800px, JPEG)
export function resizeImage(file, max = 800, quality = 0.85, type = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), type, quality);
    };
    img.onerror = () => reject(new Error("Imagen no válida"));
    img.src = url;
  });
}

export const blobToDataURL = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

// Estadísticas de un jugador a partir de sus actuaciones
export function playerStats(pid, data) {
  const byMatch = new Map(data.matches.map((m) => [m.id, m]));
  const apps = data.matchPlayers
    .filter((a) => a.player_id === pid && byMatch.has(a.match_id))
    .map((a) => ({ ...a, match: byMatch.get(a.match_id) }))
    .sort((x, y) => (y.match.match_date || "").localeCompare(x.match.match_date || ""));
  const rated = apps.filter((a) => a.rating != null && a.rating !== "");
  const sum = (k) => apps.reduce((s, a) => s + (Number(a[k]) || 0), 0);
  return {
    apps,
    pj: apps.length,
    starts: apps.filter((a) => a.starter).length,
    minutes: sum("minutes"),
    goals: sum("goals"),
    assists: sum("assists"),
    yellow: sum("yellow"),
    red: sum("red"),
    avg: rated.length ? rated.reduce((s, a) => s + Number(a.rating), 0) / rated.length : null,
    mvps: data.matches.filter((m) => m.mvp_id === pid).length,
  };
}
