// Herramientas de contenido: tarjetas PNG (1080x1350, formato Instagram) y textos para redes
import { HANDLE } from "./config.js";
import { age, fmtDate, fmtRating, initials, playerStats, result } from "./utils.js";
import { arrange, defaultFormation, FORMATIONS, shortName } from "./lineup.js";
import { scoreAt, clockLabel } from "./live.js";

const W = 1080, H = 1350;
const HEAD = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const BODY = "'Barlow', Arial, sans-serif";

function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

function shade(hex, f) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

function base(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(s.primary_color, 0.08));
  g.addColorStop(1, shade(s.primary_color, -0.55));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // líneas de campo
  ctx.strokeStyle = "rgba(255,255,255,.07)";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(W / 2, H + 120, 420, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H - 300); ctx.lineTo(W, H - 300); ctx.stroke();
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.035)";
    ctx.fillRect(0, i * 150, W, 150);
  }
}

function header(ctx, s, label, logo) {
  let x = 96;
  if (logo) {
    const sc = Math.min(84 / logo.width, 84 / logo.height);
    const w = logo.width * sc, h = logo.height * sc;
    ctx.drawImage(logo, 60 + (84 - w) / 2, 50 + (84 - h) / 2, w, h);
    x = 164;
  } else {
    ctx.fillStyle = s.accent_color;
    ctx.fillRect(60, 60, 14, 64);
  }
  ctx.fillStyle = "#fff";
  ctx.font = `700 34px ${HEAD}`;
  ctx.textBaseline = "top";
  ctx.fillText(`${s.site_title} · ${s.club_name}`.toUpperCase(), x, 58);
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = `500 28px ${BODY}`;
  ctx.fillText(label, x, 98);
}

function footer(ctx, s) {
  ctx.fillStyle = s.accent_color;
  ctx.fillRect(0, H - 96, W, 96);
  ctx.fillStyle = "#111";
  ctx.font = `700 40px ${HEAD}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(HANDLE.toUpperCase(), 60, H - 48);
  ctx.textAlign = "right";
  ctx.font = `600 30px ${HEAD}`;
  ctx.fillText(`TEMPORADA ${s.season}`, W - 60, H - 48);
  ctx.textAlign = "left";
}

function fitText(ctx, text, maxW, size, weight = 700, font = HEAD) {
  let sz = size;
  do { ctx.font = `${weight} ${sz}px ${font}`; sz -= 2; } while (ctx.measureText(text).width > maxW && sz > 20);
}

function stat(ctx, x, y, w, value, label, accent) {
  ctx.fillStyle = "rgba(0,0,0,.28)";
  roundRect(ctx, x, y, w, 150, 18); ctx.fill();
  ctx.fillStyle = accent || "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `700 76px ${HEAD}`;
  ctx.fillText(String(value), x + w / 2, y + 16);
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.font = `600 26px ${BODY}`;
  ctx.fillText(label.toUpperCase(), x + w / 2, y + 106);
  ctx.textAlign = "left";
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function ready() {
  try { await document.fonts.load(`700 40px ${HEAD}`); await document.fonts.load(`500 20px ${BODY}`); } catch {}
}

export async function playerCard(p, data) {
  await ready();
  const s = data.settings;
  const st = playerStats(p.id, data);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, "Ficha de jugador", await loadImg(s.logo_url));

  // foto
  const img = await loadImg(p.photo_url);
  const px = 60, py = 160, pw = W - 120, ph = 640;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 28); ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(px, py, pw, ph);
  if (img) {
    const sc = Math.max(pw / img.width, ph / img.height);
    const iw = img.width * sc, ih = img.height * sc;
    ctx.drawImage(img, px + (pw - iw) / 2, py + (ph - ih) * 0.25, iw, ih);
  } else {
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.font = `700 320px ${HEAD}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initials(p.name), W / 2, py + ph / 2);
    ctx.textAlign = "left";
  }
  const g = ctx.createLinearGradient(0, py + ph - 280, 0, py + ph);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.8)");
  ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
  ctx.restore();

  // dorsal
  if (p.dorsal != null && p.dorsal !== "") {
    ctx.fillStyle = s.accent_color;
    ctx.font = `700 210px ${HEAD}`;
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(String(p.dorsal), W - 90, py + 10);
    ctx.textAlign = "left";
  }
  // nombre
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  fitText(ctx, p.name.toUpperCase(), pw - 60, 92);
  ctx.fillText(p.name.toUpperCase(), px + 32, py + ph - 70);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `500 34px ${BODY}`;
  const a = age(p.birth_date);
  const sub = [p.detail_position || p.position, p.category, a != null ? `${a} años` : null].filter(Boolean).join(" · ");
  ctx.fillText(sub, px + 32, py + ph - 24);

  // stats
  const sy = py + ph + 40, gap = 20, sw = (pw - gap * 3) / 4;
  stat(ctx, px, sy, sw, st.pj, "Partidos");
  stat(ctx, px + (sw + gap), sy, sw, st.goals, "Goles");
  stat(ctx, px + (sw + gap) * 2, sy, sw, st.assists, "Asist.");
  stat(ctx, px + (sw + gap) * 3, sy, sw, fmtRating(st.avg), "Nota media", s.accent_color);

  // origen
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.font = `500 30px ${BODY}`;
  ctx.textBaseline = "top";
  const origin = [p.birth_place ? `Nacido en ${p.birth_place}` : null,
    p.previous_clubs?.length ? `Procede de ${p.previous_clubs[p.previous_clubs.length - 1]}` : null].filter(Boolean).join("  ·  ");
  fitText(ctx, origin, pw, 30, 500, BODY);
  ctx.fillText(origin, px, sy + 182);
  footer(ctx, s);
  return c;
}

export async function matchCard(m, data) {
  await ready();
  const s = data.settings;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, [m.category, m.competition].filter(Boolean).join(" · ") || "Resultado", await loadImg(s.logo_url));

  const home = m.venue !== "Visitante";
  const left = home ? s.club_name : m.rival, right = home ? m.rival : s.club_name;
  const gl = home ? m.goals_for : m.goals_against, gr = home ? m.goals_against : m.goals_for;
  const r = result(m);
  ctx.textBaseline = "top";
  ctx.fillStyle = s.accent_color;
  ctx.font = `700 44px ${HEAD}`;
  ctx.textAlign = "center";
  ctx.fillText({ V: "VICTORIA", E: "EMPATE", D: "DERROTA", P: "PRÓXIMO PARTIDO" }[r], W / 2, 190);

  // marcador
  ctx.fillStyle = "rgba(0,0,0,.3)";
  roundRect(ctx, 60, 260, W - 120, 300, 28); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 200px ${HEAD}`;
  ctx.textBaseline = "middle";
  ctx.fillText(r === "P" ? "VS" : `${gl} – ${gr}`, W / 2, 416);
  ctx.textBaseline = "top";
  ctx.font = `700 46px ${HEAD}`;
  fitText(ctx, left.toUpperCase(), 440, 46);
  ctx.textAlign = "left";
  ctx.fillText(left.toUpperCase(), 100, 600);
  fitText(ctx, right.toUpperCase(), 440, 46);
  ctx.textAlign = "right";
  ctx.fillText(right.toUpperCase(), W - 100, 600);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = `500 30px ${BODY}`;
  ctx.fillText(fmtDate(m.match_date, true), W / 2, 664);

  // notas
  const pmap = new Map(data.players.map((p) => [p.id, p]));
  const lineup = data.matchPlayers.filter((a) => a.match_id === m.id && a.rating != null && a.rating !== "" && pmap.has(a.player_id))
    .sort((a, b) => b.rating - a.rating).slice(0, m.mvp_id ? 4 : 5);
  ctx.textAlign = "left";
  let y = 740;
  if (m.mvp_id && pmap.has(m.mvp_id)) {
    ctx.fillStyle = s.accent_color;
    roundRect(ctx, 60, y, W - 120, 96, 18); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `700 34px ${HEAD}`;
    ctx.textBaseline = "middle";
    ctx.fillText("MVP", 92, y + 48);
    ctx.font = `700 46px ${HEAD}`;
    ctx.fillText(pmap.get(m.mvp_id).name.toUpperCase(), 180, y + 48);
    y += 124;
  }
  ctx.textBaseline = "middle";
  lineup.forEach((a) => {
    const p = pmap.get(a.player_id);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    roundRect(ctx, 60, y, W - 120, 78, 14); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = `700 36px ${HEAD}`;
    ctx.fillText(p.dorsal != null ? String(p.dorsal) : "", 92, y + 39);
    ctx.fillStyle = "#fff";
    const extra = [a.goals ? `${a.goals} gol${a.goals > 1 ? "es" : ""}` : "", a.assists ? `${a.assists} asist.` : ""].filter(Boolean).join(" · ");
    const line = p.name + (extra ? "  ·  " + extra : "");
    fitText(ctx, line, W - 360, 38, 600);
    ctx.fillText(line, 160, y + 39);
    ctx.textAlign = "right";
    ctx.fillStyle = s.accent_color;
    ctx.font = `700 46px ${HEAD}`;
    ctx.fillText(fmtRating(a.rating), W - 92, y + 39);
    ctx.textAlign = "left";
    y += 90;
  });
  footer(ctx, s);
  return c;
}

export function canvasToBlob(c) {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo generar la imagen"))), "image/png"));
}

// ---------------- Textos para redes
const tag = (t) => "#" + String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "");

export function playerCaption(p, data) {
  const s = data.settings, st = playerStats(p.id, data);
  const a = age(p.birth_date);
  const last = st.apps[0];
  const lines = [
    `🔎 CANTERA ${s.club_name.toUpperCase()} | ${p.name}${p.dorsal != null && p.dorsal !== "" ? ` (${p.dorsal})` : ""}`,
    "",
    `⚽ ${[p.detail_position || p.position, p.category].filter(Boolean).join(" · ")}`,
    a != null ? `🎂 ${a} años` : null,
    p.birth_place ? `📍 ${p.birth_place}` : null,
    p.previous_clubs?.length ? `🔁 Clubes anteriores: ${p.previous_clubs.join(", ")}` : null,
    "",
    `📊 Temporada ${s.season}: ${st.pj} PJ · ${st.minutes}' · ${st.goals} goles · ${st.assists} asist. · Nota media ${fmtRating(st.avg)}${st.mvps ? ` · ${st.mvps} MVP` : ""}`,
    last ? `🕒 Último partido: vs ${last.match.rival} (${fmtDate(last.match.match_date)}) → nota ${fmtRating(last.rating)}${last.note ? ` · ${last.note}` : ""}` : null,
    p.bio ? `\n💬 ${p.bio}` : null,
    "",
    `¿Lo conocías? Te leo 👇`,
    "",
    [tag("cantera"), tag(s.club_name), tag(p.category), tag("futbolbase"), tag(HANDLE.replace("@", ""))].join(" "),
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function matchCaption(m, data) {
  const s = data.settings;
  const pmap = new Map(data.players.map((p) => [p.id, p]));
  const lineup = data.matchPlayers.filter((a) => a.match_id === m.id && pmap.has(a.player_id));
  const r = result(m);
  const home = m.venue !== "Visitante";
  const score = r === "P" ? "vs" : home ? `${m.goals_for}-${m.goals_against}` : `${m.goals_against}-${m.goals_for}`;
  const title = home ? `${s.club_name} ${score} ${m.rival}` : `${m.rival} ${score} ${s.club_name}`;
  const evGoals = (data.events || []).filter((e) => e.match_id === m.id && e.type === "gol").sort((x, y) => (x.minute ?? 0) - (y.minute ?? 0));
  const byScorer = new Map();
  evGoals.forEach((e) => { const k = e.player_id && pmap.has(e.player_id) ? pmap.get(e.player_id).name : "Gol"; byScorer.set(k, [...(byScorer.get(k) || []), e.minute != null ? `${e.minute}'` : ""]); });
  const scorers = evGoals.length
    ? [...byScorer].map(([n, mins]) => `${n} ${mins.filter(Boolean).join(", ")}`.trim())
    : lineup.filter((a) => a.goals > 0).map((a) => `${pmap.get(a.player_id).name}${a.goals > 1 ? ` x${a.goals}` : ""}`);
  const rated = lineup.filter((a) => a.rating != null && a.rating !== "").sort((a, b) => b.rating - a.rating);
  const lines = [
    `${{ V: "✅", E: "🤝", D: "❌", P: "📅" }[r]} ${m.category ? m.category.toUpperCase() + " | " : ""}${title}`,
    m.competition ? `🏆 ${m.competition}` : null,
    `🗓️ ${fmtDate(m.match_date, true)}`,
    "",
    scorers.length ? `⚽ Goles: ${scorers.join(", ")}` : null,
    m.mvp_id && pmap.has(m.mvp_id) ? `⭐ MVP: ${pmap.get(m.mvp_id).name}` : null,
    rated.length ? `\n📊 Notas:\n${rated.map((a) => `${pmap.get(a.player_id).name} ${fmtRating(a.rating)}${a.note ? ` – ${a.note}` : ""}`).join("\n")}` : null,
    m.notes ? `\n📝 ${m.notes}` : null,
    "",
    `¿Qué nota le pones tú al equipo? 👇`,
    "",
    [tag("cantera"), tag(s.club_name), tag(m.category), tag("futbolbase"), tag(HANDLE.replace("@", ""))].join(" "),
  ];
  return lines.filter((l) => l !== null).join("\n");
}

// ---------------- Once inicial sobre el campo
function ratingColor(r, accent) {
  if (r == null || r === "") return null;
  r = Number(r);
  return r >= 8 ? accent : r >= 6.5 ? "#3ccf6d" : r >= 5 ? "#e8eef0" : "#ff6b5b";
}

function drawPitch(ctx, s, slots, bySlot, pmap, mvpId, box) {
  const { px, py, pw, ph } = box;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 24); ctx.clip();
  for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? "#2f8a3e" : "#33964a"; ctx.fillRect(px, py + (i * ph) / 10, pw, ph / 10 + 1); }
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 4;
  ctx.strokeRect(px + 20, py + 20, pw - 40, ph - 40);
  ctx.beginPath(); ctx.moveTo(px + 20, py + ph / 2); ctx.lineTo(px + pw - 20, py + ph / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 90, 0, Math.PI * 2); ctx.stroke();
  const bw = pw * 0.5, bh = ph * 0.14, sw = pw * 0.24, sh = ph * 0.055;
  ctx.strokeRect(px + (pw - bw) / 2, py + 20, bw, bh); ctx.strokeRect(px + (pw - bw) / 2, py + ph - 20 - bh, bw, bh);
  ctx.strokeRect(px + (pw - sw) / 2, py + 20, sw, sh); ctx.strokeRect(px + (pw - sw) / 2, py + ph - 20 - sh, sw, sh);
  ctx.restore();

  // jugadores
  slots.forEach((sl, i) => {
    const r = bySlot[i];
    const p = r && pmap.get(r.player_id);
    const x = px + (sl.x / 100) * pw, y = py + 70 + ((sl.y - 16) / 76) * (ph - 190);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fillStyle = p ? s.primary_color : "rgba(255,255,255,.18)"; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = p ? s.accent_color : "rgba(255,255,255,.5)"; ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `700 40px ${HEAD}`;
    ctx.fillText(p ? String(p.dorsal ?? initials(p.name)) : sl.l, x, y + 2);
    if (!p) return;
    // nombre
    const name = shortName(p).toUpperCase();
    ctx.font = `700 30px ${HEAD}`;
    const tw = Math.min(ctx.measureText(name).width + 22, 220);
    ctx.fillStyle = "rgba(0,0,0,.72)";
    roundRect(ctx, x - tw / 2, y + 48, tw, 38, 8); ctx.fill();
    ctx.fillStyle = "#fff";
    fitText(ctx, name, 200, 30);
    ctx.fillText(name, x, y + 68);
    // nota
    const col = ratingColor(r.rating, s.accent_color);
    if (col) {
      ctx.fillStyle = col;
      roundRect(ctx, x + 20, y - 56, 66, 40, 10); ctx.fill();
      ctx.fillStyle = "#111"; ctx.font = `700 30px ${HEAD}`;
      ctx.fillText(fmtRating(r.rating), x + 53, y - 35);
    }
    if (r.goals > 0) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - 40, y + 26, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111"; ctx.font = `700 21px ${HEAD}`; ctx.fillText(r.goals > 1 ? String(r.goals) : "G", x - 40, y + 27);
    }
    if (mvpId === p.id) {
      ctx.fillStyle = s.accent_color; ctx.font = `700 22px ${HEAD}`;
      roundRect(ctx, x - 86, y - 56, 62, 30, 7); ctx.fill();
      ctx.fillStyle = "#111"; ctx.fillText("MVP", x - 55, y - 40);
    }
  });

}

export async function lineupCard(m, data) {
  await ready();
  const s = data.settings;
  const pmap = new Map(data.players.map((p) => [p.id, p]));
  const formation = m.formation && FORMATIONS[m.formation] ? m.formation : defaultFormation(m.category);
  const arr = arrange(data.matchPlayers.filter((x) => x.match_id === m.id), formation, (id) => pmap.get(id));
  const pend = result(m) === "P";
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, [m.category, m.competition].filter(Boolean).join(" · ") || (pend ? "Once inicial" : "Notas"), await loadImg(s.logo_url));

  // título
  const home = m.venue !== "Visitante";
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = s.accent_color;
  ctx.font = `700 40px ${HEAD}`;
  ctx.fillText(pend ? "ONCE INICIAL" : "NOTAS DEL PARTIDO", 60, 158);
  ctx.fillStyle = "#fff";
  const vs = pend ? `vs ${m.rival}`.toUpperCase()
    : (home ? `${s.club_name} ${m.goals_for}-${m.goals_against} ${m.rival}` : `${m.rival} ${m.goals_against}-${m.goals_for} ${s.club_name}`).toUpperCase();
  fitText(ctx, vs, W - 120, 60);
  ctx.fillText(vs, 60, 200);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.font = `500 28px ${BODY}`;
  ctx.fillText(`${fmtDate(m.match_date)}${m.kickoff_time ? " · " + m.kickoff_time + " h" : ""} · ${formation}`, W - 60, 166);
  ctx.textAlign = "left";

  drawPitch(ctx, s, arr.slots, arr.bySlot, pmap, m.mvp_id, { px: 60, py: 280, pw: W - 120, ph: 820 });

  // banquillo
  const bench = arr.bench.map((r) => ({ r, p: pmap.get(r.player_id) })).filter((x) => x.p);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `600 28px ${BODY}`;
  const bl = bench.length ? "Banquillo: " + bench.map(({ r, p }) => `${shortName(p)}${!pend && r.rating != null && r.rating !== "" ? " " + fmtRating(r.rating) : ""}`).join(" · ") : "";
  if (bl) { fitText(ctx, bl, W - 120, 28, 600, BODY); ctx.fillText(bl, 60, 1120); }
  footer(ctx, s);
  return c;
}

export function lineupCaption(m, data) {
  const s = data.settings;
  const pmap = new Map(data.players.map((p) => [p.id, p]));
  const formation = m.formation && FORMATIONS[m.formation] ? m.formation : defaultFormation(m.category);
  const arr = arrange(data.matchPlayers.filter((x) => x.match_id === m.id), formation, (id) => pmap.get(id));
  const lines = { G: [], D: [], M: [], F: [] };
  arr.slots.forEach((sl, i) => { const r = arr.bySlot[i]; const p = r && pmap.get(r.player_id); if (p) lines[sl.g].push(p.name); });
  const home = m.venue !== "Visitante";
  const bench = arr.bench.map((r) => pmap.get(r.player_id)).filter(Boolean).map((p) => p.name);
  return [
    `📋 ONCE ${m.category ? m.category.toUpperCase() + " " : ""}| ${home ? `${s.club_name} vs ${m.rival}` : `${m.rival} vs ${s.club_name}`}`,
    `🗓️ ${fmtDate(m.match_date, true)}${m.kickoff_time ? ` · ${m.kickoff_time} h` : ""}${m.competition ? `\n🏆 ${m.competition}` : ""}`,
    "",
    `🧱 Sistema: ${formation}`,
    lines.G.length ? `🧤 ${lines.G.join(", ")}` : null,
    lines.D.length ? `🛡️ ${lines.D.join(", ")}` : null,
    lines.M.length ? `⚙️ ${lines.M.join(", ")}` : null,
    lines.F.length ? `🎯 ${lines.F.join(", ")}` : null,
    bench.length ? `\n🔁 Banquillo: ${bench.join(", ")}` : null,
    m.notes ? `\n📝 ${m.notes}` : null,
    "",
    "¿Cambiarías algo? Te leo 👇",
    "",
    [tag("cantera"), tag(s.club_name), tag(m.category), tag("onceinicial"), tag(HANDLE.replace("@", ""))].join(" "),
  ].filter((l) => l !== null).join("\n");
}

// ---------------- Tarjetas de contenido
function avatarCircle(ctx, img, p, s, x, y, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = s.primary_color; ctx.fill();
  ctx.clip();
  if (img) {
    const sc = Math.max((2 * r) / img.width, (2 * r) / img.height);
    const iw = img.width * sc, ih = img.height * sc;
    ctx.drawImage(img, x - iw / 2, y - r - (ih - 2 * r) * 0.15, iw, ih);
  } else {
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = `700 ${Math.round(r * 0.8)}px ${HEAD}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.dorsal != null ? String(p.dorsal) : initials(p.name), x, y + 2);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(3, r / 14); ctx.strokeStyle = s.accent_color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

function titleBlock(ctx, s, kicker, title) {
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = s.accent_color; ctx.font = `700 40px ${HEAD}`;
  ctx.fillText(kicker.toUpperCase(), 60, 158);
  ctx.fillStyle = "#fff";
  fitText(ctx, title.toUpperCase(), W - 120, 64);
  ctx.fillText(title.toUpperCase(), 60, 200);
}

// rows: [{ p, value, sub }]
export async function rankingCard(data, { kicker, title, label, rows }) {
  await ready();
  const s = data.settings;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, label, await loadImg(s.logo_url));
  titleBlock(ctx, s, kicker, title);
  const imgs = await Promise.all(rows.map((r) => loadImg(r.p.photo_url)));
  const top = 300, bottom = H - 130;
  const rh = Math.min(170, (bottom - top) / Math.max(rows.length, 1));
  rows.forEach((r, i) => {
    const y = top + i * rh, first = i === 0;
    ctx.fillStyle = first ? s.accent_color : "rgba(0,0,0,.25)";
    roundRect(ctx, 60, y + 4, W - 120, rh - 10, 16); ctx.fill();
    const mid = y + rh / 2;
    const ink = first ? "#111" : "#fff";
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.fillStyle = first ? "#111" : "rgba(255,255,255,.55)";
    ctx.font = `700 ${Math.round(rh * 0.42)}px ${HEAD}`;
    ctx.fillText(String(i + 1), 112, mid + 2);
    const ar = Math.round(rh * 0.34);
    avatarCircle(ctx, imgs[i], r.p, s, 160 + ar, mid, ar);
    ctx.textAlign = "left";
    const nx = 160 + ar * 2 + 24;
    ctx.fillStyle = ink;
    fitText(ctx, r.p.name.toUpperCase(), W - nx - 230, Math.round(rh * 0.3));
    ctx.fillText(r.p.name.toUpperCase(), nx, mid - (r.sub ? rh * 0.12 : 0));
    if (r.sub) {
      ctx.fillStyle = first ? "rgba(0,0,0,.65)" : "rgba(255,255,255,.7)";
      ctx.font = `500 ${Math.round(rh * 0.18)}px ${BODY}`;
      ctx.fillText(r.sub, nx, mid + rh * 0.2);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = first ? "#111" : s.accent_color;
    ctx.font = `700 ${Math.round(rh * 0.5)}px ${HEAD}`;
    ctx.fillText(String(r.value), W - 92, mid + 2);
  });
  if (!rows.length) { ctx.fillStyle = "#fff"; ctx.font = `500 34px ${BODY}`; ctx.textAlign = "center"; ctx.fillText("Sin datos en este periodo", W / 2, 600); }
  footer(ctx, s);
  return c;
}

// bySlot: [{ player_id, rating, goals } | null]
export async function idealCard(data, { formation, bySlot, kicker, title, label, note }) {
  await ready();
  const s = data.settings;
  const pmap = new Map(data.players.map((p) => [p.id, p]));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, label, await loadImg(s.logo_url));
  titleBlock(ctx, s, kicker, title);
  ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `500 28px ${BODY}`;
  ctx.fillText(formation, W - 60, 166);
  drawPitch(ctx, s, FORMATIONS[formation], bySlot, pmap, null, { px: 60, py: 280, pw: W - 120, ph: 820 });
  if (note) { ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = `500 26px ${BODY}`; fitText(ctx, note, W - 120, 26, 500, BODY); ctx.fillText(note, 60, 1120); }
  footer(ctx, s);
  return c;
}

export async function compareCard(data, a, b, rows, label) {
  await ready();
  const s = data.settings;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, label, await loadImg(s.logo_url));
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = s.accent_color; ctx.font = `700 46px ${HEAD}`;
  ctx.fillText("CARA A CARA", W / 2, 160);
  const [ia, ib] = await Promise.all([loadImg(a.photo_url), loadImg(b.photo_url)]);
  const cy = 360, r = 120;
  avatarCircle(ctx, ia, a, s, 280, cy, r);
  avatarCircle(ctx, ib, b, s, W - 280, cy, r);
  ctx.fillStyle = "#fff"; ctx.font = `700 64px ${HEAD}`; ctx.textBaseline = "middle";
  ctx.fillText("VS", W / 2, cy);
  const nameAt = (p, x) => {
    ctx.textBaseline = "top"; ctx.fillStyle = "#fff";
    const n = shortName(p).toUpperCase();
    fitText(ctx, n, 400, 50); ctx.fillText(n, x, cy + r + 24);
    ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.font = `500 26px ${BODY}`;
    const sub = [p.dorsal != null ? "#" + p.dorsal : null, p.detail_position || p.position, age(p.birth_date) != null ? age(p.birth_date) + " años" : null].filter(Boolean).join(" · ");
    fitText(ctx, sub, 420, 26, 500, BODY); ctx.fillText(sub, x, cy + r + 84);
  };
  nameAt(a, 280); nameAt(b, W - 280);
  // filas
  const top = 640, rh = Math.min(84, (H - 140 - top) / rows.length);
  rows.forEach((row, i) => {
    const y = top + i * rh, mid = y + rh / 2;
    const va = row.a ?? 0, vb = row.b ?? 0, mx = Math.max(va, vb, 0.0001);
    const better = row.lowerIsBetter ? (va < vb ? "a" : vb < va ? "b" : "") : (va > vb ? "a" : vb > va ? "b" : "");
    ctx.fillStyle = "rgba(0,0,0,.22)"; roundRect(ctx, 60, y + 6, W - 120, rh - 12, 12); ctx.fill();
    const bw = 190, gap = 120;
    ctx.fillStyle = "rgba(255,255,255,.12)";
    roundRect(ctx, W / 2 - gap - bw, mid - 7, bw, 14, 7); ctx.fill();
    roundRect(ctx, W / 2 + gap, mid - 7, bw, 14, 7); ctx.fill();
    if (va > 0) { ctx.fillStyle = better === "a" ? s.accent_color : "rgba(255,255,255,.55)"; const w = (bw * va) / mx; roundRect(ctx, W / 2 - gap - w, mid - 7, w, 14, 7); ctx.fill(); }
    if (vb > 0) { ctx.fillStyle = better === "b" ? s.accent_color : "rgba(255,255,255,.55)"; const w = (bw * vb) / mx; roundRect(ctx, W / 2 + gap, mid - 7, w, 14, 7); ctx.fill(); }
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `600 26px ${BODY}`; ctx.textAlign = "center";
    ctx.fillText(row.label, W / 2, mid + 1);
    ctx.font = `700 40px ${HEAD}`;
    ctx.textAlign = "left"; ctx.fillStyle = better === "a" ? s.accent_color : "#fff"; ctx.fillText(row.fa ?? String(va), 92, mid + 2);
    ctx.textAlign = "right"; ctx.fillStyle = better === "b" ? s.accent_color : "#fff"; ctx.fillText(row.fb ?? String(vb), W - 92, mid + 2);
  });
  footer(ctx, s);
  return c;
}

// Convierte una tarjeta 4:5 en story 9:16 (1080×1920)
export async function toStory(card, settings) {
  await ready();
  const s = settings, SH = 1920;
  const c = document.createElement("canvas"); c.width = W; c.height = SH;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, shade(s.primary_color, -0.2)); g.addColorStop(1, shade(s.primary_color, -0.7));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, SH);
  const sc = 0.92, cw = W * sc, ch = H * sc, cx = (W - cw) / 2, cy = 300;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  roundRect(ctx, cx, cy, cw, ch, 34); ctx.fillStyle = "#000"; ctx.fill();
  ctx.restore();
  ctx.save(); roundRect(ctx, cx, cy, cw, ch, 34); ctx.clip(); ctx.drawImage(card, cx, cy, cw, ch); ctx.restore();
  const logo = await loadImg(s.logo_url);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (logo) { const k = Math.min(110 / logo.width, 110 / logo.height); ctx.drawImage(logo, W / 2 - (logo.width * k) / 2, 150 - (logo.height * k) / 2, logo.width * k, logo.height * k); }
  else { ctx.fillStyle = s.accent_color; ctx.font = `700 54px ${HEAD}`; ctx.fillText(`${s.site_title}`.toUpperCase(), W / 2, 150); }
  ctx.fillStyle = "#fff"; ctx.font = `700 50px ${HEAD}`;
  ctx.fillText(HANDLE.toUpperCase(), W / 2, cy + ch + 140);
  ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = `500 30px ${BODY}`;
  ctx.fillText(`${s.site_title} · ${s.club_name}`, W / 2, cy + ch + 196);
  return c;
}


// ---------------- Tarjetas de partido
function crest(ctx, s, logo, label, x, y, r, isClub) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = isClub ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.92)"; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = isClub ? s.accent_color : "rgba(255,255,255,.4)"; ctx.stroke();
  if (logo) {
    const k = Math.min((r * 1.35) / logo.width, (r * 1.35) / logo.height);
    ctx.drawImage(logo, x - (logo.width * k) / 2, y - (logo.height * k) / 2, logo.width * k, logo.height * k);
  } else {
    ctx.fillStyle = isClub ? "#fff" : "#1b2430";
    ctx.font = `700 ${Math.round(r * 0.7)}px ${HEAD}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initials(label), x, y + 3);
  }
  ctx.restore();
}
function teamName(ctx, name, x, y, maxW) {
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  const t = String(name).toUpperCase();
  fitText(ctx, t, maxW, 46);
  ctx.fillText(t, x, y);
}
const sides = (m, s) => (m.venue === "Visitante" ? [{ n: m.rival, club: false }, { n: s.club_name, club: true }] : [{ n: s.club_name, club: true }, { n: m.rival, club: false }]);

// Previa: día de partido
export async function matchdayCard(m, data) {
  await ready();
  const s = data.settings;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  const logo = await loadImg(s.logo_url);
  header(ctx, s, [m.category, m.competition].filter(Boolean).join(" · ") || "Próximo partido", logo);
  const rlogo = await loadImg(m.rival_logo_url);
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = s.accent_color; fitText(ctx, "DÍA DE PARTIDO", W - 140, 120);
  ctx.fillText("DÍA DE PARTIDO", W / 2, 180);
  const [a, b] = sides(m, s);
  crest(ctx, s, a.club ? logo : rlogo, a.n, 280, 520, 130, a.club);
  crest(ctx, s, b.club ? logo : rlogo, b.n, W - 280, 520, 130, b.club);
  ctx.fillStyle = "#fff"; ctx.font = `700 90px ${HEAD}`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText("VS", W / 2, 520);
  teamName(ctx, a.n, 280, 680, 400);
  teamName(ctx, b.n, W - 280, 680, 400);
  // datos
  ctx.fillStyle = "rgba(0,0,0,.3)"; roundRect(ctx, 60, 800, W - 120, 330, 26); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = s.accent_color; ctx.font = `700 150px ${HEAD}`;
  ctx.fillText(m.kickoff_time || "HOY", W / 2, 818);
  ctx.fillStyle = "#fff"; ctx.font = `600 40px ${BODY}`;
  const d = fmtDate(m.match_date, true);
  ctx.fillText(d.charAt(0).toUpperCase() + d.slice(1), W / 2, 990);
  ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `500 32px ${BODY}`;
  ctx.fillText(m.venue === "Local" ? "Jugamos en casa" : m.venue === "Visitante" ? "Jugamos fuera" : "Campo neutral", W / 2, 1050);
  footer(ctx, s);
  return c;
}

// Marcador con goles y minutos (directo, descanso o final)
export async function scoreCard(m, data, events, stateLabel) {
  await ready();
  const s = data.settings;
  const pmap = new Map(data.players.map((p) => [p.id, p]));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  const logo = await loadImg(s.logo_url);
  header(ctx, s, [m.category, m.competition].filter(Boolean).join(" · ") || "Marcador", logo);
  const rlogo = await loadImg(m.rival_logo_url);
  const [a, b] = sides(m, s);
  const home = m.venue !== "Visitante";
  const gl = home ? m.goals_for : m.goals_against, gr = home ? m.goals_against : m.goals_for;
  // estado
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const live = /directo/i.test(stateLabel);
  ctx.font = `700 40px ${HEAD}`;
  const tw = ctx.measureText(stateLabel.toUpperCase()).width + 60;
  ctx.fillStyle = live ? "#d8261b" : s.accent_color;
  roundRect(ctx, W / 2 - tw / 2, 170, tw, 64, 14); ctx.fill();
  ctx.fillStyle = live ? "#fff" : "#111";
  ctx.fillText(stateLabel.toUpperCase(), W / 2, 204);
  // escudos y marcador
  crest(ctx, s, a.club ? logo : rlogo, a.n, 200, 420, 100, a.club);
  crest(ctx, s, b.club ? logo : rlogo, b.n, W - 200, 420, 100, b.club);
  ctx.fillStyle = "#fff"; ctx.font = `700 210px ${HEAD}`;
  ctx.fillText(`${gl ?? 0}-${gr ?? 0}`, W / 2, 430);
  teamName(ctx, a.n, 200, 540, 290);
  teamName(ctx, b.n, W - 200, 540, 290);
  // goles con minuto
  const goals = events.filter((e) => e.type === "gol" || e.type === "gol_rival");
  ctx.fillStyle = "rgba(0,0,0,.28)"; roundRect(ctx, 60, 660, W - 120, 470, 24); ctx.fill();
  if (!goals.length) {
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = `500 36px ${BODY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(events.length ? "Sin goles todavía" : "Partido sin eventos registrados", W / 2, 895);
  } else {
    const room = stateLabel === "Final" && m.mvp_id ? 330 : 430;
    const rh = Math.min(76, room / goals.length);
    goals.slice(0, stateLabel === "Final" && m.mvp_id ? 6 : 8).forEach((e, i) => {
      const y = 690 + i * rh + rh / 2;
      const ours = e.type === "gol";
      const leftSide = ours === home; // goles del equipo de la izquierda a la izquierda
      const who = ours ? (e.player_id && pmap.get(e.player_id) ? pmap.get(e.player_id).name : s.club_name) : m.rival;
      const txt = `${who}${ours && e.player2_id && pmap.get(e.player2_id) ? ` (${shortName(pmap.get(e.player2_id))})` : ""}`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = s.accent_color; ctx.font = `700 ${Math.round(rh * 0.5)}px ${HEAD}`;
      ctx.textAlign = "center"; ctx.fillText(e.minute != null ? `${e.minute}'` : "", W / 2, y);
      ctx.fillStyle = ours ? "#fff" : "rgba(255,255,255,.7)"; ctx.font = `600 ${Math.round(rh * 0.42)}px ${BODY}`;
      if (leftSide) { ctx.textAlign = "right"; fitText(ctx, txt, W / 2 - 160, Math.round(rh * 0.42), 600, BODY); ctx.fillText(txt, W / 2 - 70, y); }
      else { ctx.textAlign = "left"; fitText(ctx, txt, W / 2 - 160, Math.round(rh * 0.42), 600, BODY); ctx.fillText(txt, W / 2 + 70, y); }
    });
  }
  if (stateLabel === "Final" && m.mvp_id && pmap.has(m.mvp_id)) {
    const mr = data.matchPlayers.find((x) => x.match_id === m.id && x.player_id === m.mvp_id);
    ctx.fillStyle = s.accent_color; roundRect(ctx, 90, 1030, W - 180, 76, 14); ctx.fill();
    ctx.fillStyle = "#111"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `700 30px ${HEAD}`; ctx.fillText("MVP", 120, 1069);
    const n = pmap.get(m.mvp_id).name.toUpperCase();
    fitText(ctx, n, W - 480, 40); ctx.fillText(n, 200, 1069);
    if (mr && mr.rating != null && mr.rating !== "") { ctx.textAlign = "right"; ctx.font = `700 44px ${HEAD}`; ctx.fillText(fmtRating(mr.rating), W - 120, 1070); }
  }
  footer(ctx, s);
  return c;
}

// ¡GOL! al momento
export async function goalCard(m, data, ev, events) {
  await ready();
  const s = data.settings;
  const p = data.players.find((x) => x.id === ev.player_id);
  const ast = data.players.find((x) => x.id === ev.player2_id);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, [m.category, m.competition].filter(Boolean).join(" · ") || "Gol", await loadImg(s.logo_url));
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = s.accent_color; fitText(ctx, "¡GOOOL!", W - 140, 190);
  ctx.fillText("¡GOOOL!", W / 2, 160);
  if (p) avatarCircle(ctx, await loadImg(p.photo_url), p, s, W / 2, 580, 190);
  else { ctx.beginPath(); ctx.arc(W / 2, 580, 190, 0, Math.PI * 2); ctx.fillStyle = s.primary_color; ctx.fill(); }
  // minuto
  if (ev.minute != null) {
    ctx.fillStyle = s.accent_color; ctx.beginPath(); ctx.arc(W / 2 + 160, 430, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111"; ctx.font = `700 64px ${HEAD}`; ctx.textBaseline = "middle"; ctx.fillText(`${ev.minute}'`, W / 2 + 160, 434);
  }
  ctx.textBaseline = "top"; ctx.fillStyle = "#fff";
  const name = (p ? p.name : s.club_name).toUpperCase();
  fitText(ctx, name, W - 120, 84); ctx.fillText(name, W / 2, 800);
  if (ast) { ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = `500 36px ${BODY}`; ctx.fillText(`Asistencia de ${ast.name}`, W / 2, 900); }
  const [gf, ga] = scoreAt(events, ev);
  const home = m.venue !== "Visitante";
  const line = home ? `${s.club_name} ${gf}-${ga} ${m.rival}` : `${m.rival} ${ga}-${gf} ${s.club_name}`;
  ctx.fillStyle = "rgba(0,0,0,.35)"; roundRect(ctx, 60, 980, W - 120, 130, 22); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
  fitText(ctx, line.toUpperCase(), W - 180, 64); ctx.fillText(line.toUpperCase(), W / 2, 1047);
  footer(ctx, s);
  return c;
}

// MVP del partido
export async function mvpCard(m, data) {
  await ready();
  const s = data.settings;
  const p = data.players.find((x) => x.id === m.mvp_id);
  const r = data.matchPlayers.find((x) => x.match_id === m.id && x.player_id === m.mvp_id) || {};
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  base(ctx, s);
  header(ctx, s, [m.category, m.competition].filter(Boolean).join(" · ") || "MVP", await loadImg(s.logo_url));
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = s.accent_color; fitText(ctx, "MVP DEL PARTIDO", W - 140, 120);
  ctx.fillText("MVP DEL PARTIDO", W / 2, 175);
  avatarCircle(ctx, await loadImg(p.photo_url), p, s, W / 2, 530, 200);
  if (r.rating != null && r.rating !== "") {
    ctx.fillStyle = s.accent_color; roundRect(ctx, W / 2 + 110, 330, 170, 100, 22); ctx.fill();
    ctx.fillStyle = "#111"; ctx.font = `700 76px ${HEAD}`; ctx.textBaseline = "middle"; ctx.fillText(fmtRating(r.rating), W / 2 + 195, 383);
  }
  ctx.textBaseline = "top"; ctx.fillStyle = "#fff";
  fitText(ctx, p.name.toUpperCase(), W - 120, 84); ctx.fillText(p.name.toUpperCase(), W / 2, 760);
  ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `500 34px ${BODY}`;
  ctx.fillText([p.dorsal != null ? "#" + p.dorsal : null, p.detail_position || p.position].filter(Boolean).join(" · "), W / 2, 856);
  const stats = [["Goles", r.goals || 0], ["Asist.", r.assists || 0], ["Minutos", r.minutes ?? "–"]];
  const sw = (W - 120 - 40) / 3;
  stats.forEach(([l, v], i) => stat(ctx, 60 + i * (sw + 20), 920, sw, v, l));
  const home = m.venue !== "Visitante";
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `600 32px ${BODY}`; ctx.textAlign = "center";
  ctx.fillText((home ? `${s.club_name} ${m.goals_for}-${m.goals_against} ${m.rival}` : `${m.rival} ${m.goals_against}-${m.goals_for} ${s.club_name}`), W / 2, 1100);
  footer(ctx, s);
  return c;
}
