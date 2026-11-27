// Herramientas de contenido: tarjetas PNG (1080x1350, formato Instagram) y textos para redes
import { HANDLE } from "./config.js";
import { age, fmtDate, fmtRating, initials, playerStats, result } from "./utils.js";
import { arrange, defaultFormation, FORMATIONS, shortName } from "./lineup.js";

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
  const scorers = lineup.filter((a) => a.goals > 0).map((a) => `${pmap.get(a.player_id).name}${a.goals > 1 ? ` x${a.goals}` : ""}`);
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

  // campo
  const px = 60, py = 280, pw = W - 120, ph = 820;
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
  arr.slots.forEach((sl, i) => {
    const r = arr.bySlot[i];
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
    if (m.mvp_id === p.id) {
      ctx.fillStyle = s.accent_color; ctx.font = `700 22px ${HEAD}`;
      roundRect(ctx, x - 86, y - 56, 62, 30, 7); ctx.fill();
      ctx.fillStyle = "#111"; ctx.fillText("MVP", x - 55, y - 40);
    }
  });

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
