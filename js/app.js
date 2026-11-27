import { createStore } from "./store.js";
import { HANDLE } from "./config.js";
import { esc, age, fmtDate, fmtRating, ratingClass, result, initials, num, today, resizeImage, playerStats } from "./utils.js";
import { playerCard, matchCard, lineupCard, canvasToBlob, playerCaption, matchCaption, lineupCaption } from "./share.js";
import { FORMATIONS, FORMATION_NAMES, arrange, pitchHTML, defaultFormation, groupOf } from "./lineup.js";

const POSITIONS = ["Portero", "Defensa", "Centrocampista", "Delantero"];
const FEET = ["Diestro", "Zurdo", "Ambidiestro"];
const STATUSES = ["Activo", "Lesionado", "Cedido", "Primer equipo", "Baja"];
const NOTE_TAGS = ["Fortaleza", "A mejorar", "Noticia", "Lesión", "Seguimiento"];
const RES_LABEL = { V: "Victoria", E: "Empate", D: "Derrota", P: "Pendiente" };

const S = { store: null, data: null, me: null, filters: { cat: "", pos: "", q: "", status: "Activo", mcat: "" } };
const $ = (sel, el = document) => el.querySelector(sel);
const canEdit = () => !!S.me && !S.me.blocked && (S.me.role === "admin" || S.me.role === "colaborador");
const isAdmin = () => !!S.me && !S.me.blocked && S.me.role === "admin";
const ROLES = { usuario: "Usuario", colaborador: "Colaborador", admin: "Admin" };
const ROLE_HELP = { usuario: "Solo puede mirar", colaborador: "Añade y edita jugadores, partidos y notas", admin: "Control total y gestión de usuarios" };
const main = $("#main");

// ------------------------------------------------------------ helpers
const safeImg = (u) => (typeof u === "string" && (/^https:\/\//.test(u) || /^data:image\//.test(u)) ? u : "");
const player = (id) => S.data.players.find((p) => p.id === id);
const match = (id) => S.data.matches.find((m) => m.id === id);
const shortNameOf = (pid) => { const p = player(pid); return p ? (p.nickname || p.name.split(" ")[0]) : ""; };
const opts = (list, sel, empty) =>
  (empty != null ? `<option value="">${esc(empty)}</option>` : "") +
  list.map((v) => `<option ${v === sel ? "selected" : ""}>${esc(v)}</option>`).join("");

function avatar(p, cls = "") {
  const src = safeImg(p.photo_url);
  return src
    ? `<img class="ava ${cls}" src="${esc(src)}" alt="" loading="lazy">`
    : `<span class="ava ava-empty ${cls}" aria-hidden="true">${esc(initials(p.name))}</span>`;
}
function scoreText(m) {
  if (result(m) === "P") return m.kickoff_time || "VS";
  return m.venue === "Visitante" ? `${m.goals_against}-${m.goals_for}` : `${m.goals_for}-${m.goals_against}`;
}
function teams(m) {
  const c = S.data.settings.club_name;
  return m.venue === "Visitante" ? [m.rival, c] : [c, m.rival];
}

function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = "toast"), 2800);
}

function modal(html, wide = false) {
  const d = $("#modal");
  $("#modal-body").innerHTML = html;
  d.classList.toggle("wide", wide);
  if (!d.open) d.showModal();
  const f = d.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
  f && f.focus();
}
const closeModal = () => $("#modal").open && $("#modal").close();

function confirmBox(text) {
  return new Promise((res) => {
    modal(`<h2>¿Seguro?</h2><p>${esc(text)}</p>
      <div class="actions"><button class="btn ghost" data-c="0">Cancelar</button><button class="btn danger" data-c="1">Sí, eliminar</button></div>`);
    $("#modal-body").addEventListener("click", function h(e) {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      $("#modal-body").removeEventListener("click", h);
      closeModal();
      res(b.dataset.c === "1");
    });
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Texto copiado. ¡A publicar!");
  } catch {
    modal(`<h2>Texto para redes</h2><p class="muted">Selecciónalo y cópialo:</p><textarea class="copybox" rows="14" readonly>${esc(text)}</textarea>
      <div class="actions"><button class="btn" data-act="close">Cerrar</button></div>`);
    $(".copybox").select();
  }
}

async function downloadCanvas(canvas, filename) {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  modal(`<h2>Imagen lista</h2><img class="preview" src="${url}" alt="Vista previa de la tarjeta">
    <div class="actions"><button class="btn ghost" data-act="close">Cerrar</button><a class="btn" href="${url}" download="${esc(filename)}">Descargar PNG</a></div>`, true);
}

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ------------------------------------------------------------ theme + header
function applyTheme() {
  const s = S.data.settings;
  const r = document.documentElement.style;
  r.setProperty("--club", s.primary_color || "#0f5132");
  r.setProperty("--accent", s.accent_color || "#f2c230");
  document.title = `${s.site_title} · ${s.club_name}`;
  $("#brand-name").textContent = s.site_title;
  $("#brand-club").textContent = s.club_name;
  const logo = safeImg(s.logo_url);
  const crest = $("#crest");
  if (logo) { crest.className = "crest-logo"; crest.innerHTML = `<img src="${esc(logo)}" alt="">`; }
  else { crest.className = "crest"; crest.textContent = initials(s.club_name); }
  const fav = document.querySelector("link[rel=icon]");
  if (fav) { fav.href = logo || "favicon.svg"; fav.type = logo ? (logo.includes(".png") || logo.startsWith("data:image/png") ? "image/png" : "image/jpeg") : "image/svg+xml"; }
  $("#foot-handle").textContent = HANDLE;
  $("#foot-season").textContent = `Temporada ${s.season}`;
}
function renderAuth() {
  const box = $("#auth");
  if (S.me) {
    box.innerHTML = `<button class="userbtn" data-act="account" aria-label="Mi cuenta"><span class="ava ava-empty xs">${esc(initials(S.me.name))}</span><span class="userbtn-t"><b>${esc(S.me.name)}</b><small>${esc(ROLES[S.me.role] || "")}</small></span></button>`;
  } else {
    box.innerHTML = `<button class="btn small ghost-light" data-act="login">Entrar</button>${S.data.settings.allow_signup !== false ? `<button class="btn small accent" data-act="signup">Registrarse</button>` : ""}`;
  }
  document.body.classList.toggle("is-admin", canEdit());
  $("#nav-settings").hidden = !isAdmin();
  $("#nav-users").hidden = !isAdmin();
  $("#demo-banner").hidden = S.store.mode !== "demo";
}

// ------------------------------------------------------------ views
function viewHome() {
  const d = S.data, s = d.settings;
  const played = d.matches.filter((m) => result(m) !== "P");
  const count = (r) => played.filter((m) => result(m) === r).length;
  const gf = played.reduce((a, m) => a + Number(m.goals_for || 0), 0);
  const ga = played.reduce((a, m) => a + Number(m.goals_against || 0), 0);
  const last = played[0];
  const upcoming = d.matches.filter((m) => result(m) === "P" && m.match_date >= today())
    .sort((a, b) => (a.match_date + (a.kickoff_time || "")).localeCompare(b.match_date + (b.kickoff_time || "")));
  const next = upcoming[0];
  const active = d.players.filter((p) => p.status !== "Baja");

  const ranked = active.map((p) => ({ p, st: playerStats(p.id, d) }));
  const scorers = ranked.filter((x) => x.st.goals > 0).sort((a, b) => b.st.goals - a.st.goals || b.st.assists - a.st.assists).slice(0, 5);
  const best = ranked.filter((x) => x.st.avg != null && x.st.pj >= 2).sort((a, b) => b.st.avg - a.st.avg).slice(0, 5);
  const featured = active.filter((p) => p.featured);

  const nextCard = next
    ? `<a class="board" href="#/partido/${esc(next.id)}">
        <span class="board-tag">Próximo partido · ${esc(m_meta(next))}</span>
        <span class="board-row"><span class="board-team">${esc(teams(next)[0])}</span><span class="board-score time">${esc(scoreText(next))}</span><span class="board-team r">${esc(teams(next)[1])}</span></span>
        <span class="board-foot">${esc(fmtDate(next.match_date, true))}${next.competition ? ` · ${esc(next.competition)}` : ""}</span><span class="board-foot"><b>${lineupRows(next.id).some((r) => r.starter) ? "Ver el once" : "Once por confirmar"}</b></span>
      </a>`
    : "";
  const lastCard = nextCard || (last
    ? `<a class="board" href="#/partido/${esc(last.id)}">
        <span class="board-tag">Último partido · ${esc(m_meta(last))}</span>
        <span class="board-row"><span class="board-team">${esc(teams(last)[0])}</span><span class="board-score">${esc(scoreText(last))}</span><span class="board-team r">${esc(teams(last)[1])}</span></span>
        <span class="board-foot"><span class="res res-${result(last)}">${RES_LABEL[result(last)]}</span>${last.mvp_id && player(last.mvp_id) ? ` MVP: <b>${esc(player(last.mvp_id).name)}</b>` : ""}</span>
      </a>`
    : `<div class="board empty-board"><span class="board-tag">Aún no hay partidos</span><span class="board-score">0-0</span>${canEdit() ? `<button class="btn" data-act="new-match">Añadir el primero</button>` : ""}</div>`);

  return `
  <section class="hero band">
    <div class="hero-in">
      <div class="hero-text">
        <p class="kicker">${esc(s.club_name)} · Temporada ${esc(s.season)}</p>
        <h1>${esc(s.site_title)}</h1>
        <p class="lede">Fichas, partidos, notas e historial de los canteranos, actualizados jornada a jornada.</p>
        <div class="kpis">
          <div><b>${active.length}</b><span>Jugadores</span></div>
          <div><b>${played.length}</b><span>Partidos</span></div>
          <div><b>${count("V")}-${count("E")}-${count("D")}</b><span>V-E-D</span></div>
          <div><b>${gf}:${ga}</b><span>Goles</span></div>
        </div>
      </div>
      ${lastCard}
    </div>
  </section>
  <section class="band grid3">
    <div class="panel">
      ${upcoming.length ? `<div class="panel-h"><h2>Próximos</h2><a href="#/partidos">Ver todos</a></div>${upcoming.slice(0, 3).map(matchRow).join("")}<div class="panel-h sp"><h2>Últimos resultados</h2></div>` : `<div class="panel-h"><h2>Últimos resultados</h2><a href="#/partidos">Ver todos</a></div>`}
      ${played.slice(0, 5).map(matchRow).join("") || `<p class="empty">Sin resultados todavía.</p>`}
    </div>
    <div class="panel">
      <div class="panel-h"><h2>Goleadores</h2></div>
      ${scorers.map((x, i) => rankRow(x.p, i, `${x.st.goals}`, `${x.st.assists} asist.`)).join("") || `<p class="empty">Nadie ha marcado aún.</p>`}
    </div>
    <div class="panel">
      <div class="panel-h"><h2>Mejor nota media</h2><span class="muted small">mín. 2 partidos</span></div>
      ${best.map((x, i) => rankRow(x.p, i, fmtRating(x.st.avg), `${x.st.pj} PJ`, ratingClass(x.st.avg))).join("") || `<p class="empty">Faltan valoraciones.</p>`}
    </div>
  </section>
  ${featured.length ? `<section class="band alt"><div class="panel-h"><h2>Jugadores a seguir</h2><a href="#/jugadores">Toda la plantilla</a></div>
    <div class="cards">${featured.map(playerCardHTML).join("")}</div></section>` : ""}`;
}
const m_meta = (m) => [m.category, fmtDate(m.match_date)].filter(Boolean).join(" · ");

function rankRow(p, i, big, small, cls = "") {
  return `<a class="rank" href="#/jugador/${esc(p.id)}"><span class="pos">${i + 1}</span>${avatar(p, "sm")}
    <span class="rank-name"><b>${esc(p.name)}</b><span>${esc(p.category || "")}</span></span>
    <span class="rank-val ${cls}"><b>${esc(big)}</b><span>${esc(small)}</span></span></a>`;
}

function matchRow(m) {
  const r = result(m);
  const [a, b] = teams(m);
  return `<a class="mrow" href="#/partido/${esc(m.id)}">
    <span class="mdate">${esc(fmtDate(m.match_date))}<small>${esc(m.category || "")}</small></span>
    <span class="mteams"><span>${esc(a)}</span><span>${esc(b)}</span></span>
    <span class="mscore res-${r}">${esc(scoreText(m))}</span></a>`;
}

function playerCardHTML(p) {
  const a = age(p.birth_date);
  return `<a class="pcard" href="#/jugador/${esc(p.id)}">
    <span class="pcard-img">${avatar(p, "lg")}<span class="pcard-num">${esc(p.dorsal ?? "")}</span>
      ${p.status && p.status !== "Activo" ? `<span class="status st-${slug(p.status)}">${esc(p.status)}</span>` : ""}</span>
    <span class="pcard-body"><b>${esc(p.name)}</b>
    <span>${esc([p.detail_position || p.position, p.category].filter(Boolean).join(" · "))}</span>
    <span class="muted">${a != null ? `${a} años` : ""}${p.birth_place ? ` · ${esc(p.birth_place)}` : ""}</span></span></a>`;
}

function viewPlayers() {
  const d = S.data, f = S.filters;
  const q = f.q.trim().toLowerCase();
  const list = d.players
    .filter((p) => (!f.cat || p.category === f.cat) && (!f.pos || p.position === f.pos) && (!f.status || p.status === f.status))
    .filter((p) => !q || [p.name, p.nickname, p.birth_place, ...(p.previous_clubs || [])].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.dorsal ?? 999) - (b.dorsal ?? 999));
  const cats = [...new Set([...d.settings.categories, ...d.players.map((p) => p.category).filter(Boolean)])];
  return `
  <section class="band page-h">
    <div class="row-between"><h1>Plantilla</h1>${canEdit() ? `<button class="btn" data-act="new-player">+ Nuevo jugador</button>` : ""}</div>
    <div class="filters">
      <div class="chips" role="group" aria-label="Categoría">
        <button class="chip ${!f.cat ? "on" : ""}" data-act="fcat" data-v="">Todas</button>
        ${cats.map((c) => `<button class="chip ${f.cat === c ? "on" : ""}" data-act="fcat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}
      </div>
      <div class="frow">
        <input type="search" id="fq" placeholder="Buscar por nombre, lugar o club anterior" value="${esc(f.q)}" aria-label="Buscar">
        <select id="fpos" aria-label="Posición">${opts(POSITIONS, f.pos, "Todas las posiciones")}</select>
        <select id="fstatus" aria-label="Estado">${opts(STATUSES, f.status, "Todos los estados")}</select>
      </div>
    </div>
  </section>
  <section class="band tight">
    <p class="muted small">${list.length} jugador${list.length === 1 ? "" : "es"}</p>
    <div class="cards">${list.map(playerCardHTML).join("") || `<p class="empty">No hay jugadores con esos filtros.${canEdit() ? " Añade uno con el botón de arriba." : ""}</p>`}</div>
  </section>`;
}

function viewPlayer(id) {
  const p = player(id);
  if (!p) return notFound("Este jugador no existe o fue eliminado.");
  const d = S.data, st = playerStats(id, d), a = age(p.birth_date);
  const notes = d.notes.filter((n) => n.player_id === id).sort((x, y) => (y.note_date || "").localeCompare(x.note_date || ""));
  const facts = [
    ["Edad", a != null ? `${a} años` : null],
    ["Nacimiento", [fmtDate(p.birth_date), p.birth_place].filter(Boolean).join(" · ") || null],
    ["Nacionalidad", p.nationality],
    ["Posición", [p.position, p.detail_position].filter(Boolean).join(" · ") || null],
    ["Pie", p.foot],
    ["Altura", p.height_cm ? `${p.height_cm} cm` : null],
    ["Categoría", p.category],
    ["Estado", p.status],
  ].filter((x) => x[1]);
  return `
  <section class="band profile">
    <a class="back" href="#/jugadores">← Plantilla</a>
    <div class="prof">
      <div class="prof-photo">${avatar(p, "xl")}<span class="prof-num">${esc(p.dorsal ?? "")}</span></div>
      <div class="prof-info">
        <p class="kicker">${esc(p.category || "")}${p.featured ? " · A seguir" : ""}</p>
        <h1>${esc(p.name)}</h1>
        ${p.nickname ? `<p class="nick">«${esc(p.nickname)}»</p>` : ""}
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        ${p.previous_clubs?.length ? `<div class="clubs"><span class="muted small">Trayectoria</span><ol>${p.previous_clubs.map((c) => `<li>${esc(c)}</li>`).join("")}<li class="now">${esc(d.settings.club_name)}</li></ol></div>` : ""}
        ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
        <div class="tools">
          <button class="btn" data-act="card-player" data-id="${esc(id)}">Tarjeta para redes</button>
          <button class="btn ghost" data-act="copy-player" data-id="${esc(id)}">Copiar texto</button>
          ${canEdit() ? `<button class="btn ghost" data-act="edit-player" data-id="${esc(id)}">Editar</button>` : ""}${isAdmin() ? `<button class="btn ghost danger-t" data-act="del-player" data-id="${esc(id)}">Eliminar</button>` : ""}
        </div>
      </div>
    </div>
  </section>
  <section class="band alt">
    <div class="statgrid">
      ${[["PJ", st.pj], ["Titular", st.starts], ["Minutos", st.minutes], ["Goles", st.goals], ["Asist.", st.assists], ["Nota media", fmtRating(st.avg), ratingClass(st.avg)], ["MVP", st.mvps], ["Tarjetas", `${st.yellow}A · ${st.red}R`]]
        .map(([k, v, c]) => `<div class="stat ${c || ""}"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}
    </div>
    ${st.hasBase ? `<p class="muted small basenote">Incluye cifras previas apuntadas a mano: ${st.base.pj} PJ, ${st.base.goals} goles, ${st.base.assists} asist., ${st.base.yellow} TA, ${st.base.red} TR.</p>` : ""}
    ${st.apps.some((x) => x.rating != null && x.rating !== "") ? `<div class="panel chart-panel"><div class="panel-h"><h2>Evolución de notas</h2><span class="muted small">últimos 12 partidos</span></div><div class="fig" id="trend"></div></div>` : ""}
  </section>
  <section class="band two">
    <div class="panel">
      <div class="panel-h"><h2>Historial de partidos</h2></div>
      ${st.apps.length ? `<table class="stack hist"><thead><tr><th>Fecha</th><th>Rival</th><th>Res.</th><th class="n">Min</th><th class="n">G</th><th class="n">A</th><th class="n">Nota</th><th>Comentario</th></tr></thead><tbody>
        ${st.apps.map((x) => { const m = x.match, r = result(m); return `<tr>
          <td class="nw"><a href="#/partido/${esc(m.id)}">${esc(fmtDate(m.match_date))}</a></td>
          <td><a href="#/partido/${esc(m.id)}">${m.venue === "Visitante" ? "@ " : "vs "}${esc(m.rival)}</a>${m.mvp_id === id ? ` <span class="mvp">MVP</span>` : ""}</td>
          <td><span class="res res-${r}">${esc(scoreText(m))}</span></td>
          <td class="n">${esc(x.minutes ?? "")}${x.starter ? "" : "<small> sup.</small>"}</td><td class="n">${esc(x.goals || "")}</td><td class="n">${esc(x.assists || "")}</td>
          <td class="n"><span class="rt ${ratingClass(x.rating)}">${fmtRating(x.rating)}</span></td><td>${esc(x.note || "")}${x.yellow ? ` <span class="card-y" title="Amarilla"></span>` : ""}${x.red ? ` <span class="card-r" title="Roja"></span>` : ""}</td></tr>`; }).join("")}
        </tbody></table>` : `<p class="empty">Todavía no ha jugado ningún partido registrado.</p>`}
    </div>
    <div class="panel">
      <div class="panel-h"><h2>Informes y notas</h2></div>
      ${canEdit() ? `<form class="noteform" id="noteform" data-id="${esc(id)}">
        <div class="frow"><input type="date" name="note_date" value="${today()}" aria-label="Fecha"><select name="tag" aria-label="Etiqueta">${opts(NOTE_TAGS, "", "Sin etiqueta")}</select></div>
        <textarea name="body" rows="3" placeholder="Observación, valoración, noticia…" required></textarea>
        <button class="btn small">Añadir nota</button></form>` : ""}
      <ul class="timeline">${notes.map((n) => `<li><span class="tl-date">${esc(fmtDate(n.note_date))}</span>${n.tag ? `<span class="tag tag-${slug(n.tag)}">${esc(n.tag)}</span>` : ""}
        <p>${esc(n.body)}</p>${canEdit() ? `<button class="link danger-t" data-act="del-note" data-id="${esc(n.id)}">Borrar</button>` : ""}</li>`).join("")}</ul>
      ${notes.length ? "" : `<p class="empty">Sin informes todavía.</p>`}
    </div>
  </section>`;
}

function drawTrend(id) {
  const box = $("#trend");
  if (!box) return;
  const pts = playerStats(id, S.data).apps.filter((x) => x.rating != null && x.rating !== "").slice(0, 12).reverse();
  const draw = () => {
    const W = box.clientWidth, H = box.clientHeight, narrow = W < 520;
    const pl = 34, pr = 16, pt = 18, pb = narrow ? 22 : 40;
    const x = (i) => pl + (pts.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (pts.length - 1));
    const y = (v) => pt + (1 - v / 10) * (H - pt - pb);
    const grid = [0, 5, 10].map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${v}</text>`).join("");
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.rating)}`).join("");
    const area = pts.length > 1 ? `<path d="${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z" class="area"/>` : "";
    const dots = pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.rating)}" r="5" class="dot"><title>${esc(p.match.rival)} · ${fmtRating(p.rating)}</title></circle>
      <text x="${x(i)}" y="${y(p.rating) - 11}" text-anchor="middle" class="val">${fmtRating(p.rating)}</text>
      ${narrow ? "" : `<text x="${x(i)}" y="${H - 14}" text-anchor="${pts.length > 1 && i === 0 ? "start" : pts.length > 1 && i === pts.length - 1 ? "end" : "middle"}" class="ax">${esc(String(p.match.rival).slice(0, 10))}</text>`}`).join("");
    box.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Evolución de notas">${grid}${area}<path d="${line}" class="ln"/>${dots}</svg>`;
  };
  const ro = new ResizeObserver(draw);
  ro.observe(box);
}

function viewMatches() {
  const d = S.data, f = S.filters;
  const list = d.matches.filter((m) => !f.mcat || m.category === f.mcat);
  const upcoming = list.filter((m) => result(m) === "P").sort((a, b) => (a.match_date + (a.kickoff_time || "")).localeCompare(b.match_date + (b.kickoff_time || "")));
  const played = list.filter((m) => result(m) !== "P");
  const cats = [...new Set([...d.settings.categories, ...d.matches.map((m) => m.category).filter(Boolean)])];
  return `
  <section class="band page-h">
    <div class="row-between"><h1>Partidos</h1>${canEdit() ? `<button class="btn" data-act="new-match">+ Nuevo partido</button>` : ""}</div>
    <div class="chips" role="group" aria-label="Categoría">
      <button class="chip ${!f.mcat ? "on" : ""}" data-act="fmcat" data-v="">Todas</button>
      ${cats.map((c) => `<button class="chip ${f.mcat === c ? "on" : ""}" data-act="fmcat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}
    </div>
  </section>
  <section class="band tight two-eq">
    <div class="panel"><div class="panel-h"><h2>Próximos</h2></div>${upcoming.map(matchRow).join("") || `<p class="empty">No hay partidos programados.${canEdit() ? " Crea el siguiente con «+ Nuevo partido»." : ""}</p>`}</div>
    <div class="panel"><div class="panel-h"><h2>Jugados</h2></div>${played.map(matchRow).join("") || `<p class="empty">Aún no hay resultados.</p>`}</div>
  </section>`;
}

const lineupRows = (mid) => S.data.matchPlayers.filter((x) => x.match_id === mid).map((x) => ({ ...x }));
const formationOf = (m) => (m.formation && FORMATIONS[m.formation] ? m.formation : defaultFormation(m.category));

function viewMatch(id) {
  const m = match(id);
  if (!m) return notFound("Este partido no existe o fue eliminado.");
  const r = result(m), pend = r === "P", [a, b] = teams(m);
  const formation = formationOf(m);
  const arr = arrange(lineupRows(id), formation, player);
  const ed = canEdit();
  const mode = (S.lmode && S.lmode[id]) || (pend ? "pick" : "rate");
  const { pitch, bench } = pitchHTML(arr, player, { editable: ed, mode, mvp: m.mvp_id, photo: (p) => safeImg(p.photo_url) });
  const hasLineup = arr.rows.length > 0;
  const foot = pend
    ? `<span class="res res-P">Próximo partido</span> ${esc(fmtDate(m.match_date, true))}${m.kickoff_time ? ` · ${esc(m.kickoff_time)} h` : ""} · ${esc(m.venue)}`
    : `<span class="res res-${r}">${RES_LABEL[r]}</span> ${esc(fmtDate(m.match_date, true))} · ${esc(m.venue)}`;
  const rated = arr.rows.filter((x) => x.rating != null && x.rating !== "");
  const avg = rated.length ? rated.reduce((s, x) => s + Number(x.rating), 0) / rated.length : null;
  return `
  <section class="hero band">
    <a class="back light" href="#/partidos">← Partidos</a>
    <div class="board big">
      <span class="board-tag">${esc([m.category, m.competition].filter(Boolean).join(" · "))}</span>
      <span class="board-row"><span class="board-team">${esc(a)}</span><span class="board-score${pend ? " time" : ""}">${esc(scoreText(m))}</span><span class="board-team r">${esc(b)}</span></span>
      <span class="board-foot">${foot}</span>
    </div>
    <div class="tools center">
      ${hasLineup ? `<button class="btn accent" data-act="card-lineup" data-id="${esc(id)}">${pend ? "Tarjeta del once" : "Tarjeta con notas"}</button>` : ""}
      ${pend ? "" : `<button class="btn ${hasLineup ? "ghost-light" : "accent"}" data-act="card-match" data-id="${esc(id)}">Tarjeta del resultado</button>`}
      <button class="btn ghost-light" data-act="copy-match" data-id="${esc(id)}">Copiar texto</button>
      ${ed ? `<button class="btn ghost-light" data-act="edit-match" data-id="${esc(id)}">${pend ? "Poner resultado" : "Editar datos"}</button>` : ""}${isAdmin() ? `<button class="btn ghost-light" data-act="del-match" data-id="${esc(id)}">Eliminar</button>` : ""}
    </div>
  </section>
  <section class="band matchday">
    <div class="pitch-wrap">
      ${ed ? `<div class="lbar">
        <div class="seg" role="tablist" aria-label="Modo">
          <button role="tab" aria-selected="${mode === "pick"}" class="${mode === "pick" ? "on" : ""}" data-act="lmode" data-id="${esc(id)}" data-v="pick">Alineación</button>
          <button role="tab" aria-selected="${mode === "rate"}" class="${mode === "rate" ? "on" : ""}" data-act="lmode" data-id="${esc(id)}" data-v="rate">Puntuar</button>
        </div>
        <label class="fsel">Sistema<select id="formation-sel" data-id="${esc(id)}">${FORMATION_NAMES.map((f) => `<option ${f === formation ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
      </div>
      <p class="lhelp">${mode === "pick" ? "Toca una posición del campo para elegir al jugador. Toca a uno ya colocado para cambiarlo o mandarlo al banquillo." : "Toca a cualquier jugador (también del banquillo) para ponerle nota, goles, asistencias y tarjetas."}</p>` : `<p class="lhelp">${esc(formation)}</p>`}
      ${hasLineup || ed ? pitch : `<div class="panel"><p class="empty">Todavía no se ha publicado el once de este partido.</p></div>`}
    </div>
    <aside class="side">
      <div class="panel">
        <div class="panel-h"><h2>Banquillo</h2>${ed && mode === "pick" ? `<span class="row-gap"><button class="btn small ghost" data-act="bench-add" data-id="${esc(id)}">+ Añadir</button><button class="btn small ghost" data-act="call-all" data-id="${esc(id)}">Convocar categoría</button></span>` : ""}</div>
        <div class="bench">${bench || `<p class="empty">${ed && mode === "pick" ? "Añade suplentes o convoca a toda la categoría." : "Sin suplentes."}</p>`}</div>
      </div>
      ${!pend && avg != null ? `<div class="panel teamavg"><span>Nota media del equipo</span><b class="rt ${ratingClass(avg)}">${fmtRating(avg)}</b><small class="muted">${rated.length} jugadores puntuados</small></div>` : ""}
      ${m.mvp_id && player(m.mvp_id) ? `<a class="mvpbox" href="#/jugador/${esc(m.mvp_id)}">${avatar(player(m.mvp_id), "sm")}<span><small>MVP del partido</small><b>${esc(player(m.mvp_id).name)}</b></span></a>` : ""}
      <div class="panel"><div class="panel-h"><h2>${pend ? "Previa" : "Crónica y valoración"}</h2></div>
        ${m.notes ? `<p class="chron">${esc(m.notes)}</p>` : `<p class="empty">${pend ? "Sin previa todavía." : "Sin crónica."}</p>`}
      </div>
    </aside>
  </section>`;
}

// ------------------------------------------------------------ estadísticas
const POS_ORDER = { Portero: 0, Defensa: 1, Centrocampista: 2, Delantero: 3 };
const POS_SHORT = { Portero: "POR", Defensa: "DEF", Centrocampista: "MED", Delantero: "DEL" };
const POS_GROUP = ["Porteros", "Defensas", "Centrocampistas", "Delanteros", "Sin posición"];
const posIdx = (p) => POS_ORDER[p.position] ?? 4;
const SCOLS = [["pos", "Pos"], ["dorsal", "#"], ["name", "Jugador"], ["pj", "PJ"], ["minutes", "Min"], ["goals", "Goles", "G"], ["assists", "Asist.", "A"], ["yellow", "TA"], ["red", "TR"], ["avg", "Nota"], ["mvps", "MVP"]];
const BASE = [["base_pj", "PJ", "pj"], ["base_goals", "Goles", "goals"], ["base_assists", "Asist.", "assists"], ["base_yellow", "TA", "yellow"], ["base_red", "TR", "red"]];

function viewStats() {
  const d = S.data, f = S.filters;
  const cat = f.scat ?? "";
  const sort = S.ssort || { k: "pos", dir: 1 };
  const editing = canEdit() && S.sedit;
  const cats = [...new Set([...d.settings.categories, ...d.players.map((p) => p.category).filter(Boolean)])];
  const list = d.players.filter((p) => p.status !== "Baja" && (!cat || p.category === cat))
    .map((p) => ({ p, st: playerStats(p.id, d) }));
  const val = (x, k) => k === "name" ? x.p.name : k === "dorsal" ? (x.p.dorsal ?? 999) : k === "pos" ? posIdx(x.p) * 1000 + (x.p.dorsal ?? 999) : (x.st[k] ?? -1);
  list.sort((a, b) => {
    const va = val(a, sort.k), vb = val(b, sort.k);
    const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return c * sort.dir || (b.st.goals - a.st.goals) || a.p.name.localeCompare(b.p.name);
  });
  // separadores por línea cuando se ordena por posición
  const grouped = sort.k === "pos";
  const withGroups = (cols, rowFn) => { let last = null; return list.map((x) => {
    const g = posIdx(x.p);
    const head = grouped && g !== last ? `<tr class="grp"><td colspan="${cols}">${POS_GROUP[g]}</td></tr>` : "";
    last = g; return head + rowFn(x);
  }).join(""); };
  const z = (v) => (v ? v : `<span class="zero">0</span>`);
  const tot = list.reduce((t, x) => { ["pj", "goals", "assists", "yellow", "red"].forEach((k) => (t[k] += x.st[k])); return t; }, { pj: 0, goals: 0, assists: 0, yellow: 0, red: 0 });
  const chips = `<div class="chips" role="group" aria-label="Categoría">
      <button class="chip ${!cat ? "on" : ""}" data-act="fscat" data-v="">Todas</button>
      ${cats.map((c) => `<button class="chip ${cat === c ? "on" : ""}" data-act="fscat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;

  if (editing) {
    return `<section class="band page-h">
      <div class="row-between"><h1>Cifras previas</h1></div>
      <p class="lede-s">Escribe lo que lleva cada jugador <b>en los partidos que no vas a registrar en la web</b>. Se suma automáticamente a lo que apunte en los partidos que sí registres (el número pequeño gris). No cambia nada más.</p>
      ${chips}
    </section>
    <section class="band tight"><form id="baseform" class="panel">
      <table class="stack base"><thead><tr><th>Jugador</th>${BASE.map(([, l]) => `<th class="n">${l}</th>`).join("")}</tr></thead><tbody>
      ${withGroups(6, ({ p, st }) => `<tr data-id="${esc(p.id)}"><td><span class="who">${avatar(p, "xs")}<span><small>${esc(p.dorsal ?? "")}</small> ${esc(p.name)}</span></span></td>
        ${BASE.map(([k, l, rk]) => `<td class="n"><input type="number" min="0" max="999" inputmode="numeric" name="${k}" value="${esc(Number(p[k]) || 0)}" aria-label="${l} previos de ${esc(p.name)}" data-orig="${esc(Number(p[k]) || 0)}">${st.reg[rk] ? `<small class="plus" title="En partidos registrados">+${st.reg[rk]}</small>` : ""}</td>`).join("")}</tr>`) || `<tr><td>No hay jugadores en esta categoría.</td></tr>`}
      </tbody></table>
      <div class="savebar"><span class="muted" id="base-count">Sin cambios</span><button type="button" class="btn ghost" data-act="sedit-off">Cancelar</button><button class="btn">Guardar cifras</button></div>
    </form></section>`;
  }

  const th = (k, l, sh) => `<th class="${["name", "pos"].includes(k) ? "" : "n"} c-${k}"><button class="sortb ${sort.k === k ? "on" : ""}" data-act="ssort" data-v="${k}" aria-label="Ordenar por ${l}">${sh ? `<span class="lg">${l}</span><span class="sh">${sh}</span>` : l}${sort.k === k ? (sort.dir < 0 ? "↓" : "↑") : ""}</button></th>`;
  return `<section class="band page-h">
    <div class="row-between"><h1>Estadísticas</h1>${canEdit() ? `<button class="btn" data-act="sedit-on">Editar cifras previas</button>` : ""}</div>
    <div class="kpis-wrap"><div class="kpis light">
      <div><b>${tot.goals}</b><span>Goles</span></div><div><b>${tot.assists}</b><span>Asistencias</span></div>
      <div><b>${tot.yellow}</b><span>Amarillas</span></div><div><b>${tot.red}</b><span>Rojas</span></div>
    </div></div>
    ${chips}
  </section>
  <section class="band tight"><div class="panel">
    ${sort.k !== "pos" ? `<button class="btn small ghost resort" data-act="ssort-pos">Volver a ordenar por posición</button>` : ""}
    <div class="scroll"><table class="stats"><thead><tr>${SCOLS.map(([k, l, sh]) => th(k, l, sh)).join("")}</tr></thead><tbody>
    ${withGroups(11, ({ p, st }) => `<tr>
      <td class="c-pos"><span class="pos-tag pos-${posIdx(p)}">${esc(POS_SHORT[p.position] || "–")}</span></td>
      <td class="n dim c-dorsal">${esc(p.dorsal ?? "")}</td>
      <td><a class="who" href="#/jugador/${esc(p.id)}">${avatar(p, "xs")}<span>${esc(p.name)}<small class="muted cat"> ${esc(p.category || "")}</small></span></a></td>
      <td class="n">${z(st.pj)}</td><td class="n dim c-minutes">${z(st.minutes)}</td>
      <td class="n strong">${z(st.goals)}</td><td class="n">${z(st.assists)}</td>
      <td class="n">${st.yellow ? `<span class="card-y"></span> ${st.yellow}` : z(0)}</td><td class="n">${st.red ? `<span class="card-r"></span> ${st.red}` : z(0)}</td>
      <td class="n">${st.avg != null ? `<span class="rt ${ratingClass(st.avg)}">${fmtRating(st.avg)}</span>` : `<span class="zero">–</span>`}</td><td class="n c-mvps">${z(st.mvps)}</td></tr>`) || `<tr><td colspan="11" class="empty">No hay jugadores en esta categoría.</td></tr>`}
    </tbody></table></div>
    <p class="muted small">Incluye las cifras previas apuntadas a mano y los partidos registrados en la web. Minutos y nota solo cuentan partidos registrados.</p>
  </div></section>`;
}

function viewSettings() {
  if (!isAdmin()) return notFound("Solo el administrador puede ver esta sección.");
  const s = S.data.settings;
  return `<section class="band page-h"><h1>Ajustes</h1></section>
  <section class="band tight"><form id="settingsform" class="panel form narrow">
    <div class="logo-row"><span class="logo-prev" id="logo-prev">${safeImg(s.logo_url) ? `<img src="${esc(safeImg(s.logo_url))}" alt="Logo actual">` : `<span class="crest big">${esc(initials(s.club_name))}</span>`}</span>
      <div><b>Logo de la web</b><p class="muted small">PNG con fondo transparente queda mejor. Se ve en la cabecera, en la pestaña del navegador y en las tarjetas para redes.</p>
      <div class="frow"><label class="btn ghost small filebtn">Subir logo<input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
      ${s.logo_url ? `<label class="check"><input type="checkbox" name="remove_logo"> Quitar logo</label>` : ""}</div></div></div>
    <label>Nombre del club<input name="club_name" value="${esc(s.club_name)}" required></label>
    <label>Título de la web<input name="site_title" value="${esc(s.site_title)}" required></label>
    <label>Temporada<input name="season" value="${esc(s.season)}"></label>
    <div class="frow"><label>Color principal<input type="color" name="primary_color" value="${esc(s.primary_color)}"></label>
    <label>Color de acento<input type="color" name="accent_color" value="${esc(s.accent_color)}"></label></div>
    <label>Categorías <small>(separadas por comas)</small><input name="categories" value="${esc(s.categories.join(", "))}"></label>
    <label class="check"><input type="checkbox" name="allow_signup" ${s.allow_signup !== false ? "checked" : ""}> Mostrar el botón de registro</label>
    <label class="check"><input type="checkbox" name="private_mode" ${s.private_mode ? "checked" : ""}> Web privada: solo los usuarios registrados pueden ver el contenido</label>
    <div class="actions"><button class="btn">Guardar ajustes</button></div>
  </form>
  <div class="panel narrow"><h2>Copia de seguridad</h2><p class="muted">Descarga todos los datos en un archivo JSON.</p>
    <button class="btn ghost" data-act="export">Exportar datos</button>
    ${S.store.mode === "demo" ? `<button class="btn ghost danger-t" data-act="reset-demo">Restablecer datos de ejemplo</button>` : ""}</div></section>`;
}

const notFound = (msg) => `<section class="band"><div class="panel"><h1>Vaya…</h1><p>${esc(msg)}</p><a class="btn" href="#/">Volver al inicio</a></div></section>`;

// ------------------------------------------------------------ forms
function playerForm(p = {}) {
  const cats = S.data.settings.categories;
  modal(`<h2>${p.id ? "Editar jugador" : "Nuevo jugador"}</h2>
  <form id="playerform" class="form" data-id="${esc(p.id || "")}">
    <div class="photo-row"><span id="ph-prev">${avatar({ name: p.name || "?", photo_url: p.photo_url }, "lg")}</span>
      <label class="btn ghost small filebtn">Subir foto<input type="file" name="photo" accept="image/*" hidden></label>
      ${p.photo_url ? `<label class="check"><input type="checkbox" name="remove_photo"> Quitar foto</label>` : ""}</div>
    <div class="frow"><label class="grow">Nombre completo *<input name="name" value="${esc(p.name || "")}" required></label>
    <label class="w-s">Dorsal<input name="dorsal" type="number" min="0" max="99" value="${esc(p.dorsal ?? "")}"></label></div>
    <div class="frow"><label>Apodo<input name="nickname" value="${esc(p.nickname || "")}"></label>
    <label>Categoría<select name="category">${opts(cats.includes(p.category) || !p.category ? cats : [...cats, p.category], p.category, "—")}</select></label></div>
    <div class="frow"><label>Posición<select name="position">${opts(POSITIONS, p.position, "—")}</select></label>
    <label>Demarcación<input name="detail_position" value="${esc(p.detail_position || "")}" placeholder="Lateral izquierdo, mediapunta…"></label></div>
    <div class="frow"><label>Fecha de nacimiento<input type="date" name="birth_date" value="${esc(p.birth_date || "")}"></label>
    <label>Lugar de nacimiento<input name="birth_place" value="${esc(p.birth_place || "")}"></label></div>
    <div class="frow"><label>Nacionalidad<input name="nationality" value="${esc(p.nationality || "")}"></label>
    <label>Pie<select name="foot">${opts(FEET, p.foot, "—")}</select></label>
    <label class="w-s">Altura (cm)<input type="number" name="height_cm" min="100" max="230" value="${esc(p.height_cm ?? "")}"></label></div>
    <label>Clubes anteriores <small>(uno por línea, del más antiguo al más reciente)</small><textarea name="previous_clubs" rows="3">${esc((p.previous_clubs || []).join("\n"))}</textarea></label>
    <div class="frow"><label>Estado<select name="status">${opts(STATUSES, p.status || "Activo")}</select></label>
    <label class="check"><input type="checkbox" name="featured" ${p.featured ? "checked" : ""}> Jugador a seguir (sale en portada)</label></div>
    <label>Descripción / perfil<textarea name="bio" rows="3" placeholder="Cómo juega, qué le hace especial…">${esc(p.bio || "")}</textarea></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn">Guardar</button></div>
  </form>`, true);
}

function matchForm(m = {}) {
  const cats = S.data.settings.categories;
  const isNew = !m.id;
  const cat = m.category || S.filters.mcat || cats[0];
  modal(`<h2>${isNew ? "Nuevo partido" : result(m) === "P" ? "Poner resultado / editar" : "Editar partido"}</h2>
  ${isNew ? `<p class="muted">Créalo antes de jugarse. Después podrás montar el once en el campo y, al terminar, poner el resultado y las notas.</p>` : ""}
  <form id="matchform" class="form" data-id="${esc(m.id || "")}">
    <div class="frow"><label class="grow">Rival *<input name="rival" value="${esc(m.rival || "")}" required></label>
    <label>Campo<select name="venue">${opts(["Local", "Visitante", "Neutral"], m.venue || "Local")}</select></label></div>
    <div class="frow"><label>Fecha *<input type="date" name="match_date" value="${esc(m.match_date || today())}" required></label>
    <label class="w-s">Hora<input type="time" name="kickoff_time" value="${esc(m.kickoff_time || "")}"></label>
    <label>Categoría<select name="category" id="mf-cat">${opts(cats.includes(cat) || !cat ? cats : [...cats, cat], cat)}</select></label></div>
    <div class="frow"><label class="grow">Competición<input name="competition" value="${esc(m.competition || "")}" placeholder="Liga, Copa, amistoso…"></label>
    <label>Sistema<select name="formation" id="mf-formation">${FORMATION_NAMES.map((f) => `<option ${f === formationOf({ ...m, category: cat }) ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label></div>
    <fieldset class="resbox"><legend>Resultado <small>(déjalo vacío si aún no se ha jugado)</small></legend>
      <div class="frow"><label class="w-s">Goles nuestros<input type="number" name="goals_for" min="0" inputmode="numeric" value="${esc(m.goals_for ?? "")}"></label>
      <label class="w-s">Goles rival<input type="number" name="goals_against" min="0" inputmode="numeric" value="${esc(m.goals_against ?? "")}"></label></div>
    </fieldset>
    <label>${isNew ? "Previa / notas" : "Crónica y valoraciones importantes"}<textarea name="notes" rows="3">${esc(m.notes || "")}</textarea></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn">${isNew ? "Crear y montar el once" : "Guardar"}</button></div>
  </form>`, true);
  if (isNew) $("#mf-cat").addEventListener("change", (e) => { $("#mf-formation").value = defaultFormation(e.target.value); });
}

// ---------- once interactivo
async function saveLineup(m, rows, msg) {
  const formation = formationOf(m);
  const arr = arrange(rows, formation, player);
  return run(() => S.store.saveMatch({ ...m, formation }, arr.rows), msg);
}
const newRow = (pid, starter, slot = null) => ({ player_id: pid, starter, slot, minutes: null, goals: 0, assists: 0, yellow: 0, red: 0, rating: null, note: null });

function pickerModal(mid, slot) {
  const m = match(mid);
  const formation = formationOf(m);
  const arr = arrange(lineupRows(mid), formation, player);
  const s = slot === "" ? null : FORMATIONS[formation][Number(slot)];
  const occ = s ? arr.bySlot[Number(slot)] : null;
  const inLineup = new Set(arr.rows.map((r) => r.player_id));
  const G = { G: "Portero", D: "Defensa", M: "Centrocampista", F: "Delantero" };
  const score = (p) => (p.category === m.category ? 0 : 2) + (s && groupOf(p) === s.g ? 0 : 1);
  const item = (p, where) => `<button class="pk" data-act="pick-player" data-mid="${esc(mid)}" data-slot="${esc(slot)}" data-pid="${esc(p.id)}" data-q="${esc((p.name + " " + (p.dorsal ?? "") + " " + (p.nickname || "")).toLowerCase())}">
    ${avatar(p, "sm")}<span class="pk-t"><b>${esc(p.dorsal ?? "–")} · ${esc(p.name)}</b><small>${esc([p.detail_position || p.position, p.category, where].filter(Boolean).join(" · "))}</small></span></button>`;
  const benchP = arr.bench.map((r) => player(r.player_id)).filter(Boolean);
  const onPitch = s ? arr.rows.filter((r) => r.starter && r.slot !== Number(slot)).map((r) => player(r.player_id)).filter(Boolean) : [];
  const rest = S.data.players.filter((p) => !inLineup.has(p.id) && p.status !== "Baja").sort((a, b) => score(a) - score(b) || (a.dorsal ?? 999) - (b.dorsal ?? 999));
  modal(`<h2>${s ? `Elegir ${esc(s.l)}${G[s.g] ? ` <small class="muted">(${G[s.g]})</small>` : ""}` : "Añadir al banquillo"}</h2>
    ${occ ? `<div class="pk-occ"><span>Ahora: <b>${esc(player(occ.player_id)?.name || "")}</b></span>
      <button class="btn small ghost" data-act="slot-bench" data-mid="${esc(mid)}" data-slot="${esc(slot)}">Mandar al banquillo</button>
      <button class="btn small ghost danger-t" data-act="slot-clear" data-mid="${esc(mid)}" data-slot="${esc(slot)}">Quitar</button></div>` : ""}
    <input type="search" id="pick-q" placeholder="Buscar por nombre o dorsal" aria-label="Buscar jugador">
    <div class="pk-list">
      ${benchP.length && s ? `<h3>En el banquillo</h3>${benchP.map((p) => item(p, "Suplente")).join("")}` : ""}
      ${onPitch.length ? `<h3>Ya en el campo <small class="muted">(se intercambian)</small></h3>${onPitch.map((p) => item(p, "Titular")).join("")}` : ""}
      <h3>Plantilla</h3>${rest.map((p) => item(p, "")).join("") || `<p class="empty">No quedan jugadores disponibles.</p>`}
    </div>
    <div class="actions"><button class="btn ghost" data-act="close">Cerrar</button></div>`);
  $("#pick-q").focus();
}

function rateModal(mid, pid) {
  const m = match(mid), p = player(pid);
  const r = lineupRows(mid).find((x) => x.player_id === pid);
  if (!r || !p) return;
  const quick = [4, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10];
  const mins = r.minutes ?? (r.starter ? 90 : "");
  const stepper = (f, label) => `<div class="stp"><span>${label}</span><button type="button" data-act="cnt" data-f="${f}" data-d="-1" aria-label="Menos ${label}">−</button><output id="o-${f}">${Number(r[f]) || 0}</output><button type="button" data-act="cnt" data-f="${f}" data-d="1" aria-label="Más ${label}">+</button><input type="hidden" name="${f}" value="${Number(r[f]) || 0}"></div>`;
  modal(`<div class="rate-h">${avatar(p, "sm")}<div><h2>${esc(p.name)}</h2><p class="muted small">${esc([p.dorsal != null ? "#" + p.dorsal : null, r.starter ? "Titular" : "Suplente", p.position].filter(Boolean).join(" · "))}</p></div></div>
  <form id="rateform" class="form" data-mid="${esc(mid)}" data-pid="${esc(pid)}">
    <div class="rate-big"><button type="button" data-act="rate-step" data-d="-0.5" aria-label="Bajar nota">−</button>
      <output id="rate-val" class="${ratingClass(r.rating)}">${fmtRating(r.rating)}</output>
      <button type="button" data-act="rate-step" data-d="0.5" aria-label="Subir nota">+</button></div>
    <input type="hidden" name="rating" value="${esc(r.rating ?? "")}">
    <div class="rate-quick">${quick.map((v) => `<button type="button" data-act="rate-set" data-v="${v}" class="${Number(r.rating) === v ? "on" : ""}">${v}</button>`).join("")}<button type="button" data-act="rate-set" data-v="" class="clear">Sin nota</button></div>
    <div class="stps">${stepper("goals", "Goles")}${stepper("assists", "Asist.")}
      <label class="mins">Minutos<input type="number" name="minutes" min="0" max="130" inputmode="numeric" value="${esc(mins)}"></label></div>
    <div class="frow chk">
      <label class="check"><input type="checkbox" name="yellow" ${r.yellow ? "checked" : ""}> <span class="card-y"></span> Amarilla</label>
      <label class="check"><input type="checkbox" name="red" ${r.red ? "checked" : ""}> <span class="card-r"></span> Roja</label>
      <label class="check"><input type="checkbox" name="mvp" ${m.mvp_id === pid ? "checked" : ""}> MVP del partido</label>
    </div>
    <label>Comentario<input name="note" value="${esc(r.note || "")}" placeholder="Ej.: gol de falta, imperial en defensa…" maxlength="140"></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn">Guardar</button></div>
  </form>`);
}

// ------------------------------------------------------------ cuentas y usuarios
const AUTH_ERR = {
  "Invalid login credentials": "Email o contraseña incorrectos",
  "User already registered": "Ese email ya está registrado. Prueba a entrar o recupera tu contraseña.",
  "Email not confirmed": "Aún no has confirmado tu email. Revisa tu bandeja de entrada (y spam).",
  "Password should be at least 6 characters.": "La contraseña debe tener al menos 6 caracteres",
  "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres",
  "New password should be different from the old password.": "La contraseña nueva debe ser distinta a la anterior",
};
function authError(e) {
  const m = e?.message || String(e);
  if (AUTH_ERR[m]) return AUTH_ERR[m];
  if (/rate limit/i.test(m)) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  if (/valid email|invalid format/i.test(m)) return "Ese email no es válido";
  return m;
}

async function afterAuth(first = false) {
  S.me = await S.store.me();
  if (S.me?.blocked) {
    await S.store.signOut();
    S.me = null;
    modal(`<h2>Cuenta bloqueada</h2><p>Tu cuenta ha sido bloqueada por el administrador.</p><div class="actions"><button class="btn" data-act="close">Cerrar</button></div>`);
  }
  await reload();
  renderAuth();
  if (!first && location.hash.match(/usuarios|ajustes/) && !isAdmin()) location.hash = "#/";
  render();
}

function authModal(kind) {
  const demo = S.store.mode === "demo"
    ? `<p class="note">Modo demo. Cuentas de prueba: <b>admin@demo.es</b>, <b>colaborador@demo.es</b> o <b>aficionado@demo.es</b>, con cualquier contraseña. También puedes registrarte.</p>` : "";
  const signupOpen = S.data.settings.allow_signup !== false;
  if (kind === "login")
    modal(`<h2>Entrar</h2>${demo}
      <form id="loginform" class="form"><label>Email<input type="email" name="email" autocomplete="username" required></label>
      <label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
      <p class="err" hidden></p>
      <div class="actions"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn">Entrar</button></div></form>
      <p class="alt-links"><button class="link" data-act="forgot">¿Olvidaste tu contraseña?</button>${signupOpen ? ` · <button class="link" data-act="signup">Crear una cuenta</button>` : ""}</p>`);
  if (kind === "signup")
    modal(`<h2>Crear cuenta</h2><p class="muted">Con tu cuenta podrás seguir la cantera${S.data.settings.private_mode ? ", que es solo para registrados" : ""}.</p>
      <form id="signupform" class="form"><label>Nombre o apodo<input name="name" maxlength="60" autocomplete="nickname" required></label>
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <div class="frow"><label>Contraseña<input type="password" name="password" minlength="6" autocomplete="new-password" required></label>
      <label>Repítela<input type="password" name="password2" minlength="6" autocomplete="new-password" required></label></div>
      <p class="err" hidden></p>
      <div class="actions"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn">Crear cuenta</button></div></form>
      <p class="alt-links">¿Ya tienes cuenta? <button class="link" data-act="login">Entrar</button></p>`);
  if (kind === "forgot")
    modal(`<h2>Recuperar contraseña</h2><p class="muted">Te enviaremos un enlace para crear una contraseña nueva.</p>
      <form id="forgotform" class="form"><label>Email<input type="email" name="email" autocomplete="email" required></label>
      <p class="err" hidden></p>
      <div class="actions"><button type="button" class="btn ghost" data-act="login">Volver</button><button class="btn">Enviar enlace</button></div></form>`);
}

function newPasswordModal() {
  modal(`<h2>Nueva contraseña</h2>
    <form id="newpassform" class="form"><div class="frow"><label>Contraseña nueva<input type="password" name="password" minlength="6" autocomplete="new-password" required></label>
    <label>Repítela<input type="password" name="password2" minlength="6" autocomplete="new-password" required></label></div>
    <p class="err" hidden></p><div class="actions"><button class="btn">Guardar contraseña</button></div></form>`);
}

function accountModal() {
  const m = S.me;
  modal(`<h2>Mi cuenta</h2>
    <p class="acct"><span class="ava ava-empty sm">${esc(initials(m.name))}</span><span><b>${esc(m.email)}</b><br><span class="rolebadge role-${esc(m.role)}">${esc(ROLES[m.role])}</span> <span class="muted small">${esc(ROLE_HELP[m.role])}</span></span></p>
    <form id="accountform" class="form"><label>Nombre o apodo<input name="name" maxlength="60" value="${esc(m.name)}" required></label>
    <div class="frow"><label>Nueva contraseña <small>(opcional)</small><input type="password" name="password" minlength="6" autocomplete="new-password"></label>
    <label>Repítela<input type="password" name="password2" minlength="6" autocomplete="new-password"></label></div>
    <p class="err" hidden></p>
    <div class="actions"><button type="button" class="btn ghost danger-t" data-act="logout">Cerrar sesión</button><button class="btn">Guardar</button></div></form>`);
}

function viewGate() {
  const s = S.data.settings;
  return `<section class="hero band gate"><div class="gate-in">
    <p class="kicker">${esc(s.club_name)} · Temporada ${esc(s.season)}</p>
    <h1>${esc(s.site_title)}</h1>
    <p class="lede">Fichas, partidos, notas e historial de los canteranos. Entra o crea tu cuenta para verlo todo.</p>
    <div class="tools"><button class="btn accent" data-act="login">Entrar</button>${s.allow_signup !== false ? `<button class="btn ghost-light" data-act="signup">Crear cuenta</button>` : ""}</div>
  </div></section>`;
}

function viewUsers() {
  if (!isAdmin()) return notFound("Solo el administrador puede ver esta sección.");
  return `<section class="band page-h"><div class="row-between"><h1>Usuarios</h1><span class="muted" id="ucount"></span></div>
    <div class="filters"><div class="chips" id="uchips"></div>
    <div class="frow"><input type="search" id="uq" placeholder="Buscar por nombre o email" aria-label="Buscar usuarios" value="${esc(S.uq || "")}"></div></div>
    <dl class="roles-help">${Object.keys(ROLES).map((r) => `<div><dt><span class="rolebadge role-${r}">${ROLES[r]}</span></dt><dd>${ROLE_HELP[r]}</dd></div>`).join("")}</dl>
  </section>
  <section class="band tight"><div class="panel" id="ulist"><p class="muted">Cargando usuarios…</p></div></section>`;
}

async function loadUsers() {
  try {
    S.users = await S.store.listUsers();
    renderUsers();
  } catch (e) {
    const el = $("#ulist");
    if (el) el.innerHTML = `<p class="err">${esc(authError(e))}</p>`;
  }
}

function renderUsers() {
  const box = $("#ulist");
  if (!box || !S.users) return;
  const f = S.ufilter || "", q = (S.uq || "").toLowerCase();
  const counts = { "": S.users.length, admin: 0, colaborador: 0, usuario: 0, blocked: 0 };
  S.users.forEach((u) => { counts[u.role]++; if (u.blocked) counts.blocked++; });
  $("#uchips").innerHTML = [["", "Todos"], ["admin", "Admins"], ["colaborador", "Colaboradores"], ["usuario", "Usuarios"], ["blocked", "Bloqueados"]]
    .map(([v, l]) => `<button class="chip ${f === v ? "on" : ""}" data-act="ufilter" data-v="${v}">${l} <small>${counts[v]}</small></button>`).join("");
  $("#ucount").textContent = `${S.users.length} registrado${S.users.length === 1 ? "" : "s"}`;
  const list = S.users
    .filter((u) => !f || (f === "blocked" ? u.blocked : u.role === f))
    .filter((u) => !q || `${u.display_name} ${u.email}`.toLowerCase().includes(q));
  box.innerHTML = list.length ? `<table class="stack users"><thead><tr><th>Usuario</th><th>Rol</th><th>Registro</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead><tbody>
    ${list.map((u) => { const self = u.id === S.me.id; return `<tr class="${u.blocked ? "is-blocked" : ""}">
      <td><span class="who"><span class="ava ava-empty xs">${esc(initials(u.display_name || u.email))}</span><span><b>${esc(u.display_name || "—")}</b>${self ? ` <small class="muted">(tú)</small>` : ""}<br><small class="muted">${esc(u.email)}</small></span></span></td>
      <td><select class="role-sel" data-id="${esc(u.id)}" aria-label="Rol de ${esc(u.email)}">${Object.keys(ROLES).map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLES[r]}</option>`).join("")}</select></td>
      <td class="nw">${esc(fmtDate(String(u.created_at || "").slice(0, 10)))}</td>
      <td class="nw">${u.last_sign_in_at ? esc(fmtDate(String(u.last_sign_in_at).slice(0, 10))) : `<span class="muted">Nunca</span>`}</td>
      <td>${u.blocked ? `<span class="rolebadge role-blocked">Bloqueado</span>` : u.confirmed === false ? `<span class="muted small">Sin confirmar email</span>` : `<span class="muted small">Activo</span>`}</td>
      <td class="uact">${self ? "" : `<div class="uact-in"><button class="btn small ghost" data-act="user-block" data-id="${esc(u.id)}">${u.blocked ? "Desbloquear" : "Bloquear"}</button><button class="btn small ghost danger-t" data-act="user-del" data-id="${esc(u.id)}">Eliminar</button></div>`}</td></tr>`; }).join("")}
    </tbody></table>` : `<p class="empty">No hay usuarios con ese filtro.</p>`;
  const heads = [...box.querySelectorAll("thead th")].map((th) => th.textContent);
  box.querySelectorAll("tbody tr").forEach((tr) => [...tr.cells].forEach((c, i) => (c.dataset.l = heads[i] || "")));
}

async function userOp(fn, msg) {
  try {
    await fn();
    toast(msg);
  } catch (e) {
    toast(authError(e), true);
  }
  await loadUsers();
  const me = await S.store.me();
  if (!me || me.role !== S.me.role) await afterAuth();
}

// ------------------------------------------------------------ actions
async function reload() {
  S.data = await S.store.loadAll();
  applyTheme();
}

async function run(fn, okMsg) {
  try {
    await fn();
    await reload();
    renderAuth();
    render();
    okMsg && toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    const msg = /kickoff_time|formation|'slot'|slot column|logo_url|base_(pj|goals|assists|yellow|red)/i.test(e.message || "") ? "Falta ejecutar en Supabase el SQL de actualización (mira las instrucciones)" : e.message;
    toast(msg || "Algo ha fallado", true);
    return false;
  }
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case "close": closeModal(); break;
    case "login": authModal("login"); break;
    case "signup": authModal("signup"); break;
    case "forgot": authModal("forgot"); break;
    case "account": accountModal(); break;
    case "logout":
      await S.store.signOut(); S.me = null; closeModal(); await afterAuth(); toast("Sesión cerrada"); break;
    case "role-help": break;
    case "user-del": {
      const u = S.users.find((x) => x.id === id);
      if (u && (await confirmBox(`Se eliminará la cuenta de ${u.email}. Podrá volver a registrarse si el registro está abierto.`)))
        await userOp(() => S.store.deleteUser(id), "Usuario eliminado");
      break;
    }
    case "user-block": {
      const u = S.users.find((x) => x.id === id);
      if (u) await userOp(() => S.store.updateUser(id, { blocked: !u.blocked }), u.blocked ? "Usuario desbloqueado" : "Usuario bloqueado");
      break;
    }
    case "ufilter": S.ufilter = el.dataset.v; renderUsers(); break;
    case "fcat": S.filters.cat = el.dataset.v; render(); break;
    case "fmcat": S.filters.mcat = el.dataset.v; render(); break;
    case "fscat": S.filters.scat = el.dataset.v; render(); break;
    case "ssort": { const k = el.dataset.v, cur = S.ssort || { k: "pos", dir: 1 }; S.ssort = { k, dir: cur.k === k ? -cur.dir : (["name", "dorsal", "pos"].includes(k) ? 1 : -1) }; render(); break; }
    case "ssort-pos": S.ssort = { k: "pos", dir: 1 }; render(); break;
    case "sedit-on": S.sedit = true; render(); break;
    case "sedit-off": S.sedit = false; render(); break;
    case "new-player": playerForm(); break;
    case "edit-player": playerForm(player(id)); break;
    case "del-player":
      if (await confirmBox(`Se eliminará a ${player(id).name} y todas sus actuaciones y notas.`))
        (await run(() => S.store.deletePlayer(id), "Jugador eliminado")) && (location.hash = "#/jugadores");
      break;
    case "new-match": matchForm(); break;
    case "edit-match": matchForm(match(id)); break;
    case "del-match":
      if (await confirmBox(`Se eliminará el partido contra ${match(id).rival} y sus notas.`))
        (await run(() => S.store.deleteMatch(id), "Partido eliminado")) && (location.hash = "#/partidos");
      break;
    case "del-note":
      if (await confirmBox("Se borrará esta nota.")) await run(() => S.store.deleteNote(id), "Nota borrada");
      break;
    case "lmode": S.lmode = { ...(S.lmode || {}), [id]: el.dataset.v }; render(); break;
    case "slot-pick": pickerModal(location.hash.split("/")[2], el.dataset.slot); break;
    case "bench-add": pickerModal(id, ""); break;
    case "rate": rateModal(location.hash.split("/")[2], el.dataset.pid); break;
    case "pick-player": case "slot-bench": case "slot-clear": {
      const mid = el.dataset.mid, m = match(mid), slot = el.dataset.slot === "" ? null : Number(el.dataset.slot);
      const rows = arrange(lineupRows(mid), formationOf(m), player).rows;
      const occ = slot == null ? null : rows.find((r) => r.starter && r.slot === slot);
      if (act === "pick-player") {
        const pid = el.dataset.pid, ex = rows.find((r) => r.player_id === pid);
        if (slot == null) { if (!ex) rows.push(newRow(pid, false)); }
        else if (ex && ex.starter) { if (occ) occ.slot = ex.slot; ex.slot = slot; }
        else {
          if (occ) { occ.starter = false; occ.slot = null; }
          if (ex) { ex.starter = true; ex.slot = slot; } else rows.push(newRow(pid, true, slot));
        }
      } else if (occ && act === "slot-bench") { occ.starter = false; occ.slot = null; }
      else if (occ && act === "slot-clear") rows.splice(rows.indexOf(occ), 1);
      closeModal();
      await saveLineup(m, rows);
      break;
    }
    case "bench-remove": {
      const mid = location.hash.split("/")[2], m = match(mid);
      await saveLineup(m, lineupRows(mid).filter((r) => r.player_id !== el.dataset.pid));
      break;
    }
    case "call-all": {
      const m = match(id), rows = lineupRows(id), inIds = new Set(rows.map((r) => r.player_id));
      const add = S.data.players.filter((p) => p.category === m.category && p.status === "Activo" && !inIds.has(p.id)).sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999));
      if (!add.length) { toast(`No hay más jugadores activos en ${m.category || "esta categoría"}`); break; }
      await saveLineup(m, rows.concat(add.map((p) => newRow(p.id, false))), `${add.length} convocados al banquillo`);
      break;
    }
    case "rate-set": case "rate-step": {
      const inp = $("#rateform [name=rating]");
      let v = act === "rate-set" ? el.dataset.v : (num(inp.value) ?? 6) + Number(el.dataset.d);
      if (v !== "") v = Math.min(10, Math.max(0, Math.round(Number(v) * 2) / 2));
      inp.value = v;
      const o = $("#rate-val"); o.textContent = fmtRating(v); o.className = ratingClass(v);
      document.querySelectorAll(".rate-quick button").forEach((b) => b.classList.toggle("on", b.dataset.v !== "" && Number(b.dataset.v) === v));
      break;
    }
    case "cnt": {
      const f = el.dataset.f, inp = $(`#rateform [name=${f}]`);
      inp.value = Math.max(0, (Number(inp.value) || 0) + Number(el.dataset.d));
      $(`#o-${f}`).textContent = inp.value;
      break;
    }
    case "card-lineup": {
      const m = match(id);
      downloadCanvas(await lineupCard(m, S.data), `${m.match_date}-once-${slug(m.rival)}.png`);
      break;
    }
    case "copy-player": copyText(playerCaption(player(id), S.data)); break;
    case "copy-match": { const m = match(id); copyText(result(m) === "P" ? lineupCaption(m, S.data) : matchCaption(m, S.data)); break; }
    case "card-player": {
      const p = player(id);
      downloadCanvas(await playerCard(p, S.data), `${slug(p.name)}.png`);
      break;
    }
    case "card-match": {
      const m = match(id);
      downloadCanvas(await matchCard(m, S.data), `${m.match_date}-${slug(m.rival)}.png`);
      break;
    }
    case "export": {
      const blob = new Blob([JSON.stringify(S.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `cantera-backup-${today()}.json`;
      a.click();
      break;
    }
    case "reset-demo":
      if (await confirmBox("Se borrarán tus cambios y volverán los datos de ejemplo.")) { S.store.reset(); await run(async () => {}, "Datos restablecidos"); }
      break;
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "uq") { S.uq = e.target.value; renderUsers(); return; }
  if (e.target.closest && e.target.closest("#baseform")) {
    const n = [...document.querySelectorAll("#baseform tbody tr[data-id]")].filter((tr) => [...tr.querySelectorAll("input")].some((i) => String(Math.max(0, Math.floor(num(i.value) ?? 0))) !== i.dataset.orig)).length;
    $("#base-count").textContent = n ? `${n} jugador${n === 1 ? "" : "es"} con cambios` : "Sin cambios";
    e.target.closest("tr").classList.toggle("changed", [...e.target.closest("tr").querySelectorAll("input")].some((i) => String(Math.max(0, Math.floor(num(i.value) ?? 0))) !== i.dataset.orig));
    return;
  }
  if (e.target.id === "pick-q") {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".pk").forEach((b) => (b.hidden = !!q && !b.dataset.q.includes(q)));
    return;
  }
  if (e.target.id === "fq") {
    S.filters.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const f = $("#fq"); f.focus(); f.setSelectionRange(pos, pos);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "formation-sel") {
    const m = { ...match(e.target.dataset.id), formation: e.target.value };
    await saveLineup(m, lineupRows(m.id).map((r) => ({ ...r, slot: null })), `Sistema ${m.formation}`);
    return;
  }
  if (e.target.classList.contains("role-sel")) {
    const id = e.target.dataset.id, role = e.target.value, u = S.users.find((x) => x.id === id);
    if (role === "admin" && !(await confirmBox(`${u.email} tendrá control total, incluida la gestión de usuarios.`).then((ok) => ok))) { renderUsers(); return; }
    await userOp(() => S.store.updateUser(id, { role }), `Ahora es ${ROLES[role]}`);
    return;
  }
  if (e.target.id === "fpos") { S.filters.pos = e.target.value; render(); }
  if (e.target.id === "fstatus") { S.filters.status = e.target.value; render(); }
  if (e.target.name === "logo" && e.target.files[0]) {
    $("#logo-prev").innerHTML = `<img src="${URL.createObjectURL(e.target.files[0])}" alt="Nuevo logo">`;
  }
  if (e.target.name === "photo" && e.target.files[0]) {
    const url = URL.createObjectURL(e.target.files[0]);
    $("#ph-prev").innerHTML = `<img class="ava lg" src="${url}" alt="">`;
  }
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, fd = new FormData(f);
  const btn = f.querySelector("button:not([type=button])");
  btn && (btn.disabled = true);
  try {
    if (f.id === "loginform" || f.id === "signupform" || f.id === "forgotform" || f.id === "newpassform" || f.id === "accountform") {
      const err = f.querySelector(".err");
      try {
        if (f.id === "loginform") {
          await S.store.signIn(fd.get("email").trim(), fd.get("password"));
          closeModal(); await afterAuth();
          S.me && toast(`Hola, ${S.me.name}`);
        }
        if (f.id === "signupform") {
          if (fd.get("password") !== fd.get("password2")) throw new Error("Las contraseñas no coinciden");
          const r = await S.store.signUp(fd.get("email").trim(), fd.get("password"), fd.get("name").trim());
          if (r.needsConfirm) {
            modal(`<h2>Revisa tu email</h2><p>Te hemos enviado un enlace a <b>${esc(fd.get("email"))}</b> para confirmar tu cuenta. Después podrás entrar.</p>
              <div class="actions"><button class="btn" data-act="close">Entendido</button></div>`);
          } else { closeModal(); await afterAuth(); toast("Cuenta creada. ¡Bienvenido!"); }
        }
        if (f.id === "forgotform") {
          await S.store.resetPassword(fd.get("email").trim());
          modal(`<h2>Revisa tu email</h2><p>Si existe una cuenta con ese email, recibirás un enlace para crear una contraseña nueva.</p>
            <div class="actions"><button class="btn" data-act="close">Entendido</button></div>`);
        }
        if (f.id === "newpassform") {
          if (fd.get("password") !== fd.get("password2")) throw new Error("Las contraseñas no coinciden");
          await S.store.updatePassword(fd.get("password"));
          closeModal(); toast("Contraseña actualizada");
        }
        if (f.id === "accountform") {
          const name = fd.get("name").trim();
          if (name && name !== S.me.name) await S.store.updateMyName(name);
          if (fd.get("password")) {
            if (fd.get("password") !== fd.get("password2")) throw new Error("Las contraseñas no coinciden");
            await S.store.updatePassword(fd.get("password"));
          }
          closeModal(); await afterAuth(); toast("Cuenta actualizada");
        }
      } catch (e2) {
        if (err) { err.textContent = authError(e2); err.hidden = false; } else toast(authError(e2), true);
      }
    }
    if (f.id === "playerform") {
      const old = f.dataset.id ? player(f.dataset.id) : {};
      let photo_url = old.photo_url || null;
      if (fd.get("remove_photo")) photo_url = null;
      const file = fd.get("photo");
      const ok = await run(async () => {
        if (file && file.size) photo_url = await S.store.uploadPhoto(await resizeImage(file));
        const saved = await S.store.savePlayer({
          id: f.dataset.id || undefined,
          name: fd.get("name").trim(), nickname: fd.get("nickname").trim() || null, dorsal: num(fd.get("dorsal")),
          category: fd.get("category") || null, position: fd.get("position") || null, detail_position: fd.get("detail_position").trim() || null,
          birth_date: fd.get("birth_date") || null, birth_place: fd.get("birth_place").trim() || null, nationality: fd.get("nationality").trim() || null,
          foot: fd.get("foot") || null, height_cm: num(fd.get("height_cm")),
          previous_clubs: fd.get("previous_clubs").split(/\n|,/).map((s) => s.trim()).filter(Boolean),
          status: fd.get("status"), featured: !!fd.get("featured"), bio: fd.get("bio").trim() || null, photo_url,
        });
        closeModal();
        location.hash = `#/jugador/${saved.id}`;
      }, "Jugador guardado");
      if (!ok) btn.disabled = false;
    }
    if (f.id === "matchform") {
      const old = f.dataset.id ? match(f.dataset.id) : null;
      const ok = await run(async () => {
        const data = {
          id: f.dataset.id || undefined, match_date: fd.get("match_date"), kickoff_time: fd.get("kickoff_time") || null, category: fd.get("category"),
          competition: fd.get("competition").trim() || null, rival: fd.get("rival").trim(), venue: fd.get("venue"), formation: fd.get("formation"),
          goals_for: num(fd.get("goals_for")), goals_against: num(fd.get("goals_against")),
          notes: fd.get("notes").trim() || null, mvp_id: old ? old.mvp_id : null,
        };
        let rows = old ? lineupRows(old.id) : [];
        if (old && old.formation !== data.formation) rows = rows.map((r) => ({ ...r, slot: null }));
        rows = arrange(rows, formationOf(data), player).rows;
        const saved = await S.store.saveMatch(data, rows);
        closeModal();
        if (!old) S.lmode = { ...(S.lmode || {}), [saved.id]: "pick" };
        else if (old && result(old) === "P" && result(data) !== "P") S.lmode = { ...(S.lmode || {}), [saved.id]: "rate" };
        location.hash = `#/partido/${saved.id}`;
      }, old ? "Partido guardado" : "Partido creado. Ahora monta el once");
      if (!ok) btn.disabled = false;
    }
    if (f.id === "baseform") {
      const changes = [...f.querySelectorAll("tbody tr[data-id]")].map((tr) => {
        const out = { id: tr.dataset.id }; let changed = false;
        tr.querySelectorAll("input").forEach((i) => { const v = Math.max(0, Math.floor(num(i.value) ?? 0)); out[i.name] = v; if (String(v) !== i.dataset.orig) changed = true; });
        return changed ? out : null;
      }).filter(Boolean);
      if (!changes.length) { S.sedit = false; render(); toast("No había cambios"); }
      else {
        const ok = await run(() => S.store.saveBaseStats(changes), `Guardado: ${changes.length} jugador${changes.length === 1 ? "" : "es"}`);
        if (ok) { S.sedit = false; render(); }
      }
    }
    if (f.id === "rateform") {
      const mid = f.dataset.mid, pid = f.dataset.pid, m = { ...match(mid) };
      const rows = lineupRows(mid), r = rows.find((x) => x.player_id === pid);
      Object.assign(r, { rating: num(fd.get("rating")), goals: num(fd.get("goals")) ?? 0, assists: num(fd.get("assists")) ?? 0,
        minutes: num(fd.get("minutes")), yellow: fd.get("yellow") ? 1 : 0, red: fd.get("red") ? 1 : 0, note: fd.get("note").trim() || null });
      if (fd.get("mvp")) m.mvp_id = pid; else if (m.mvp_id === pid) m.mvp_id = null;
      closeModal();
      await saveLineup(m, rows, `${shortNameOf(pid)}: ${fmtRating(r.rating)}`);
    }
    if (f.id === "noteform") {
      await run(() => S.store.saveNote({ player_id: f.dataset.id, note_date: fd.get("note_date") || today(), tag: fd.get("tag"), body: fd.get("body").trim() }), "Nota añadida");
    }
    if (f.id === "settingsform") {
      const logoFile = fd.get("logo");
      await run(async () => {
        let logo_url = S.data.settings.logo_url || null;
        if (fd.get("remove_logo")) logo_url = null;
        if (logoFile && logoFile.size) logo_url = await S.store.uploadPhoto(await resizeImage(logoFile, 512, 0.92, "image/png"), "logos");
        await S.store.saveSettings({ logo_url,
        club_name: fd.get("club_name").trim(), site_title: fd.get("site_title").trim(), season: fd.get("season").trim(),
        primary_color: fd.get("primary_color"), accent_color: fd.get("accent_color"),
        categories: fd.get("categories").split(",").map((s) => s.trim()).filter(Boolean),
        allow_signup: !!fd.get("allow_signup"), private_mode: !!fd.get("private_mode"),
      }); }, "Ajustes guardados");
    }
  } finally {
    btn && document.body.contains(btn) && (btn.disabled = false);
  }
});

$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

// ------------------------------------------------------------ router
function render() {
  const h = location.hash.replace(/^#\/?/, "");
  const [route, id] = h.split("/");
  const views = { "": viewHome, jugadores: viewPlayers, partidos: viewMatches, ajustes: viewSettings, usuarios: viewUsers, estadisticas: viewStats };
  let html;
  if (S.data.settings.private_mode && !S.me) html = viewGate();
  else if (route === "jugador") html = viewPlayer(id);
  else if (route === "partido") html = viewMatch(id);
  else html = (views[route] || (() => notFound("Página no encontrada.")))();
  main.innerHTML = html;
  document.querySelectorAll(".nav a").forEach((a) => {
    const r = a.getAttribute("href").replace(/^#\/?/, "");
    a.classList.toggle("on", r === route || (r === "jugadores" && route === "jugador") || (r === "partidos" && route === "partido"));
  });
  if (route === "jugador") drawTrend(id);
  if (route === "usuarios" && isAdmin()) loadUsers();
  // etiquetas para tablas apiladas en móvil
  main.querySelectorAll("table.stack").forEach((t) => {
    const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent);
    t.querySelectorAll("tbody tr").forEach((tr) => [...tr.cells].forEach((c, i) => (c.dataset.l = heads[i] || "")));
  });
}

window.addEventListener("hashchange", () => {
  if (!location.hash.includes("estadisticas")) S.sedit = false; render(); window.scrollTo(0, 0); });

(async () => {
  try {
    const timeout = (ms, what) => new Promise((_, rej) => setTimeout(() => rej(new Error(what)), ms));
    S.store = await Promise.race([createStore(), timeout(12000, "No se pudo cargar la librería de Supabase (revisa tu conexión o un bloqueador de anuncios).")]);
    await reload();
    S.store.onRecovery(() => newPasswordModal());
    await Promise.race([afterAuth(true), timeout(12000, "Supabase no responde. Comprueba que SUPABASE_URL en js/config.js es correcta y que el proyecto no está pausado.")]);
    window.__canteraOk = true;
  } catch (e) {
    console.error(e);
    window.__canteraOk = true;
    const msg = /relation .* does not exist|schema cache|Could not find the table/i.test(e.message) ? `${e.message} → Falta ejecutar supabase/schema.sql en el SQL Editor.`
      : /Invalid API key|No API key|JWT/i.test(e.message) ? `${e.message} → La clave de js/config.js no es correcta.` : e.message;
    main.innerHTML = `<section class="band"><div class="panel"><h1>No se pudo cargar la web</h1><p>${esc(msg)}</p>
      <p class="muted">Revisa la configuración de Supabase en <code>js/config.js</code> y que hayas ejecutado <code>supabase/schema.sql</code>.</p></div></section>`;
  }
})();
