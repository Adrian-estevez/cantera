import { createStore } from "./store.js";
import { HANDLE } from "./config.js";
import { esc, age, fmtDate, fmtRating, ratingClass, result, initials, num, today, resizeImage, playerStats, periodStats } from "./utils.js";
import { randomFrase, playerCard, matchCard, lineupCard, matchdayCard, scoreCard, goalCard, mvpCard, rankingCard, idealCard, compareCard, toStory, canvasToBlob, playerCaption, matchCaption, lineupCaption } from "./share.js";
import { FORMATIONS, FORMATION_NAMES, arrange, pitchHTML, defaultFormation, groupOf, detailLabels } from "./lineup.js";
import { isLive, clockLabel, clockMinute, defaultHalf, eventsOf, currentXI, computeMinutes, scoreAt, ICONS, eventText, eventPost } from "./live.js";

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
// escudos [izquierda, derecha] para el marcador
function crests(m) {
  const club = safeImg(S.data.settings.logo_url), riv = safeImg(m.rival_logo_url);
  const img = (src, name) => src ? `<img class="bcrest" src="${esc(src)}" alt="">` : `<span class="bcrest ini" aria-hidden="true">${esc(initials(name))}</span>`;
  const c = img(club, S.data.settings.club_name), r = img(riv, m.rival);
  return m.venue === "Visitante" ? [r, c] : [c, r];
}
const boardRow = (m, scoreCls = "") => {
  const [a, b] = teams(m), [ca, cb] = crests(m);
  return `<span class="board-row"><span class="board-team">${ca}<span>${esc(a)}</span></span><span class="board-score${scoreCls}">${esc(scoreText(m))}</span><span class="board-team r">${cb}<span>${esc(b)}</span></span></span>`;
};
const rivalLogoFor = (name) => {
  const n = String(name || "").trim().toLowerCase();
  const hit = S.data.matches.filter((m) => m.rival_logo_url && String(m.rival).trim().toLowerCase() === n).sort((a, b) => (b.match_date || "").localeCompare(a.match_date || ""))[0];
  return hit ? hit.rival_logo_url : null;
};

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

function confirmBox2(title, text, yes) {
  return new Promise((res) => {
    modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="actions"><button class="btn ghost" data-c="0">Cancelar</button><button class="btn" data-c="1">${esc(yes)}</button></div>`);
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
  if (S.cardCur) { URL.revokeObjectURL(S.cardCur.post); S.cardCur.story && URL.revokeObjectURL(S.cardCur.story); }
  S.cardCur = { canvas, filename, post: URL.createObjectURL(await canvasToBlob(canvas)), story: null };
  showCard("post");
}
async function showCard(fmt) {
  const c = S.cardCur;
  if (fmt === "story" && !c.story) c.story = URL.createObjectURL(await canvasToBlob(await toStory(c.canvas, S.data.settings)));
  const url = fmt === "story" ? c.story : c.post;
  const name = fmt === "story" ? c.filename.replace(/\.png$/, "-story.png") : c.filename;
  modal(`<h2>Imagen lista</h2>
    <div class="seg fmt" role="tablist" aria-label="Formato"><button role="tab" class="${fmt === "post" ? "on" : ""}" data-act="card-fmt" data-v="post">Post 4:5</button><button role="tab" class="${fmt === "story" ? "on" : ""}" data-act="card-fmt" data-v="story">Story 9:16</button></div>
    <img class="preview ${fmt}" src="${url}" alt="Vista previa de la tarjeta">
    ${c.regen ? `<p class="regen"><button class="btn small ghost" data-act="card-regen">Cambiar la frase</button></p>` : ""}
    <div class="actions"><button class="btn ghost" data-act="close">Cerrar</button><a class="btn" href="${url}" download="${esc(name)}">Descargar PNG</a></div>`, true);
}

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ------------------------------------------------------------ theme + header
function applyTheme() {
  const s = S.data.settings;
  const r = document.documentElement.style;
  r.setProperty("--club", s.primary_color || "#0f5132");
  r.setProperty("--accent", s.accent_color || "#f2c230");
  document.title = `${s.site_title} · ${s.club_name}`;
  document.querySelector("meta[name=theme-color]")?.setAttribute("content", s.primary_color || "#0a3a8c");
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
  $("#nav-content").hidden = !canEdit();
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
  const liveM = d.matches.find((m) => isLive(m));
  const next = upcoming[0];
  const active = d.players.filter((p) => p.status !== "Baja");

  const ranked = active.map((p) => ({ p, st: playerStats(p.id, d) }));
  const scorers = ranked.filter((x) => x.st.goals > 0).sort((a, b) => b.st.goals - a.st.goals || b.st.assists - a.st.assists).slice(0, 5);
  const best = ranked.filter((x) => x.st.avg != null && x.st.pj >= 2).sort((a, b) => b.st.avg - a.st.avg).slice(0, 5);
  const featured = active.filter((p) => p.featured);

  const nextCard = next
    ? `<a class="board" href="#/partido/${esc(next.id)}">
        <span class="board-tag">Próximo partido · ${esc(m_meta(next))}</span>
        ${boardRow(next, " time")}
        <span class="board-foot">${esc(fmtDate(next.match_date, true))}${next.competition ? ` · ${esc(next.competition)}` : ""}</span><span class="board-foot"><b>${lineupRows(next.id).some((r) => r.starter) ? "Ver el once" : "Once por confirmar"}</b></span>
      </a>`
    : "";
  const liveCard = liveM
    ? `<a class="board" href="#/partido/${esc(liveM.id)}">
        <span class="board-tag"><span class="livebadge"><i></i>En directo</span> ${esc(m_meta(liveM))}</span>
        ${boardRow(liveM)}
        <span class="board-foot"><b class="clock" data-clock="${esc(liveM.id)}">${esc(clockLabel(liveM))}</b> · Sigue el minuto a minuto</span>
      </a>`
    : "";
  const lastCard = liveCard || nextCard || (last
    ? `<a class="board" href="#/partido/${esc(last.id)}">
        <span class="board-tag">Último partido · ${esc(m_meta(last))}</span>
        ${boardRow(last)}
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
  ${(d.standings || []).length ? `<section class="band tight"><div class="panel home-st" id="home-st" hidden></div></section>` : ""}
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
    <span class="mscore res-${isLive(m) ? "L" : r}">${esc(scoreText(m))}${isLive(m) ? `<small data-clock="${esc(m.id)}">${esc(clockLabel(m))}</small>` : ""}</span></a>`;
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
          ${canEdit() ? `<button class="btn" data-act="card-player" data-id="${esc(id)}">Tarjeta para redes</button>
          <button class="btn ghost" data-act="copy-player" data-id="${esc(id)}">Copiar texto</button>` : ""}
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
  const live = isLive(m);
  const evs = eventsOf(S.data, id);
  const ed = canEdit();
  const mode = (S.lmode && S.lmode[id]) || (live && ed ? "live" : pend ? "pick" : "rate");
  const base = arrange(lineupRows(id), formation, player);
  const arr = live || mode === "live" ? currentXI(base, evs) : base;
  const { pitch, bench } = pitchHTML(arr, player, { editable: ed, mode, mvp: m.mvp_id, photo: (p) => safeImg(p.photo_url) });
  const hasLineup = arr.rows.length > 0;
  const foot = live
    ? `<span class="livebadge"><i></i>En directo</span> <b class="clock" data-clock="${esc(id)}">${esc(clockLabel(m))}</b> · ${esc(m.venue)}`
    : pend
    ? `<span class="res res-P">Próximo partido</span> ${esc(fmtDate(m.match_date, true))}${m.kickoff_time ? ` · ${esc(m.kickoff_time)} h` : ""} · ${esc(m.stadium || m.venue)}`
    : `<span class="res res-${r}">${RES_LABEL[r]}</span> ${esc(fmtDate(m.match_date, true))} · ${esc(m.stadium || m.venue)}`;
  const rated = arr.rows.filter((x) => x.rating != null && x.rating !== "");
  const avg = rated.length ? rated.reduce((s, x) => s + Number(x.rating), 0) / rated.length : null;
  return `
  <section class="hero band">
    <a class="back light" href="#/partidos">← Partidos</a>
    <div class="board big">
      <span class="board-tag">${esc([m.category, m.competition].filter(Boolean).join(" · "))}</span>
      ${boardRow(m, pend ? " time" : "")}
      <span class="board-foot">${foot}</span>
    </div>
    <div class="tools center">
      ${ed ? `<button class="btn accent" data-act="card-menu" data-id="${esc(id)}">Tarjetas para redes</button>` : ""}
      ${ed ? `<button class="btn ghost-light" data-act="copy-match" data-id="${esc(id)}">Copiar texto</button>` : ""}
      ${ed ? `<button class="btn ghost-light" data-act="edit-match" data-id="${esc(id)}">${pend ? "Poner resultado" : "Editar datos"}</button>` : ""}${isAdmin() ? `<button class="btn ghost-light" data-act="del-match" data-id="${esc(id)}">Eliminar</button>` : ""}
    </div>
  </section>
  <section class="band matchday">
    <div class="pitch-wrap">
      ${ed ? `<div class="lbar">
        <div class="seg" role="tablist" aria-label="Modo">
          <button role="tab" aria-selected="${mode === "pick"}" class="${mode === "pick" ? "on" : ""}" data-act="lmode" data-id="${esc(id)}" data-v="pick">Alineación</button>
          <button role="tab" aria-selected="${mode === "rate"}" class="${mode === "rate" ? "on" : ""}" data-act="lmode" data-id="${esc(id)}" data-v="rate">Puntuar</button>
          <button role="tab" aria-selected="${mode === "live"}" class="${mode === "live" ? "on" : ""} seg-live" data-act="lmode" data-id="${esc(id)}" data-v="live">${live ? `<i class="dot"></i>` : ""}Directo</button>
        </div>
        <label class="fsel">Sistema<select id="formation-sel" data-id="${esc(id)}">${FORMATION_NAMES.map((f) => `<option ${f === formation ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
      </div>
      <p class="lhelp">${mode === "pick" ? "Toca una posición del campo para elegir al jugador. Toca a uno ya colocado para cambiarlo o mandarlo al banquillo." : mode === "live" ? "Modo directo: toca a un jugador para apuntarle un gol, una tarjeta o un cambio." : "Toca a cualquier jugador (también del banquillo) para ponerle nota, goles, asistencias y tarjetas."}</p>` : `<p class="lhelp">${live ? "Once actual en el campo" : esc(formation)}</p>`}
      ${ed && mode === "live" ? `<div class="live-m">${livePanel(m)}</div>` : ""}
      ${hasLineup || ed ? pitch : `<div class="panel"><p class="empty">Todavía no se ha publicado el once de este partido.</p></div>`}
    </div>
    <aside class="side">
      ${ed && mode === "live" ? `<div class="live-d">${livePanel(m)}</div>` : ""}
      ${evs.length || live || (ed && mode === "live") ? `<div class="panel"><div class="panel-h"><h2>Minuto a minuto</h2>${live ? `<span class="livebadge sm"><i></i>Se actualiza solo</span>` : ""}</div>${timelineHTML(m, evs, ed && mode === "live")}</div>` : ""}
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
    <label>Estadio de casa <small>(se pone solo en los partidos como local)</small><input name="home_stadium" value="${esc(s.home_stadium || "")}"></label>
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
    <div class="rival-row"><span class="logo-prev sm" id="rival-prev">${safeImg(m.rival_logo_url) ? `<img src="${esc(safeImg(m.rival_logo_url))}" alt="Escudo del rival">` : `<span class="crest-ph">Escudo</span>`}</span>
      <div class="rival-ctl"><label class="btn ghost small filebtn">${m.rival_logo_url ? "Cambiar escudo" : "Subir escudo o foto del rival"}<input type="file" name="rival_logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
      ${m.rival_logo_url ? `<label class="check"><input type="checkbox" name="remove_rival_logo"> Quitar</label>` : ""}
      <p class="muted small" id="rival-hint">${m.rival_logo_url ? "" : "Opcional. Si ya jugasteis contra este rival, se usa su escudo automáticamente."}</p></div></div>
    <div class="frow"><label class="grow">Rival *<input name="rival" list="rivals-dl" autocomplete="off" value="${esc(m.rival || "")}" required></label>
    <datalist id="rivals-dl">${[...new Set(S.data.matches.map((x) => x.rival).filter(Boolean))].sort().map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
    <label>Campo<select name="venue" id="mf-venue">${opts(["Local", "Visitante", "Neutral"], m.venue || "Local")}</select></label></div>
    <label>Estadio<input name="stadium" id="mf-stadium" value="${esc(m.id ? m.stadium || "" : (m.venue || "Local") === "Local" ? S.data.settings.home_stadium || "" : "")}" placeholder="Nombre del campo o estadio" list="stadiums-dl"></label>
    <datalist id="stadiums-dl">${[...new Set([S.data.settings.home_stadium, ...S.data.matches.map((x) => x.stadium)].filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
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
  // estadio automático: en casa el de Ajustes; fuera, el último usado contra ese rival
  const autoStadium = () => {
    const st = $("#mf-stadium"), v = $("#mf-venue").value, home = S.data.settings.home_stadium || "";
    if (st.dataset.touched) return;
    if (v === "Local") st.value = home;
    else { const r = normTxt($("#matchform [name=rival]").value); const prev = S.data.matches.filter((x) => x.stadium && x.venue !== "Local" && normTxt(x.rival) === r).sort((a, b) => (b.match_date || "").localeCompare(a.match_date || ""))[0]; st.value = prev ? prev.stadium : ""; }
  };
  $("#mf-stadium").addEventListener("input", (e) => { e.target.dataset.touched = "1"; });
  $("#mf-venue").addEventListener("change", () => { if ($("#mf-stadium").value === (S.data.settings.home_stadium || "") ) delete $("#mf-stadium").dataset.touched; autoStadium(); });
  $("#matchform [name=rival]").addEventListener("change", autoStadium);
  $("#matchform [name=rival]").addEventListener("input", (e) => {
    const f = $("#matchform [name=rival_logo]"); if (f.files.length || m.rival_logo_url) return;
    const src = safeImg(rivalLogoFor(e.target.value));
    $("#rival-prev").innerHTML = src ? `<img src="${esc(src)}" alt="Escudo del rival">` : `<span class="crest-ph">Escudo</span>`;
    $("#rival-hint").textContent = src ? "Escudo reutilizado de un partido anterior." : "Opcional. Si ya jugasteis contra este rival, se usa su escudo automáticamente.";
  });
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


// ------------------------------------------------------------ clasificación
const STCACHE = new Map();
const normTxt = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
async function fetchStandings(league, season, force = false) {
  const k = `${league}-${season}`, c = STCACHE.get(k);
  if (!force && c && Date.now() - c.t < 10 * 60e3) return c.data;
  let r, j;
  try { r = await fetch(`/api/football?type=standings&league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`); j = await r.json(); }
  catch { throw new Error("La clasificación automática no está disponible. Comprueba que la carpeta «api» está subida a GitHub."); }
  if (!r.ok) throw new Error(j.error === "no_key" ? "Falta la clave de API-Football en Vercel (variable APIFOOTBALL_KEY)." : j.message || "No se pudo cargar la clasificación.");
  STCACHE.set(k, { t: Date.now(), data: j });
  return j;
}
async function searchLeagues(q) {
  let r, j;
  try { r = await fetch(`/api/football?type=leagues&search=${encodeURIComponent(q)}`); j = await r.json(); }
  catch { throw new Error("La búsqueda automática no está disponible. Comprueba que la carpeta «api» está subida a GitHub."); }
  if (!r.ok) throw new Error(j.error === "no_key" ? "Falta la clave de API-Football en Vercel (variable APIFOOTBALL_KEY)." : j.message || "No se pudo buscar.");
  return j.leagues || [];
}
function manualTable(rows) {
  return (rows || []).filter((r) => r.team).map((r) => {
    const n = (k) => Math.max(0, Number(r[k]) || 0);
    const g = n("g"), e = n("e"), p = n("p");
    return { team: r.team, pj: n("pj") || g + e + p, g, e, p, gf: n("gf"), gc: n("gc"), gd: n("gf") - n("gc"), pts: 3 * g + e };
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)).map((r, i) => ({ ...r, rank: i + 1 }));
}
function isOurs(name, cfg) {
  if (cfg && cfg.team_name) return name === cfg.team_name;
  const c = normTxt(S.data.settings.club_name);
  return !!c && normTxt(name).includes(c);
}
function standingsTable(rows, cfg, compact = false) {
  if (!rows.length) return `<p class="empty">La clasificación está vacía.</p>`;
  const zone = (d) => (/promot|ascen|champ|play|campe/i.test(d || "") ? "z-up" : /releg|desc/i.test(d || "") ? "z-down" : "");
  const form = (f) => String(f || "").slice(-5).split("").map((c) => `<i class="fm fm-${c}" title="${{ W: "Victoria", D: "Empate", L: "Derrota" }[c] || ""}">${{ W: "V", D: "E", L: "D" }[c] || ""}</i>`).join("");
  const hasForm = !compact && rows.some((r) => r.form);
  return `<div class="scroll"><table class="stand${compact ? " compact" : ""}"><thead><tr><th class="n">#</th><th>Equipo</th><th class="n">PJ</th>${compact ? "" : `<th class="n">G</th><th class="n">E</th><th class="n">P</th><th class="n c-gf">GF</th><th class="n c-gf">GC</th>`}<th class="n">DG</th><th class="n">Pts</th>${hasForm ? `<th class="c-form">Racha</th>` : ""}</tr></thead><tbody>
    ${rows.map((r) => `<tr class="${isOurs(r.team, cfg) ? "ours" : ""} ${zone(r.desc)}"><td class="n rk">${r.rank}</td>
      <td><span class="st-team">${r.logo && /^https:\/\//.test(r.logo) ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ""}<span>${esc(r.team)}</span></span></td>
      <td class="n">${r.pj}</td>${compact ? "" : `<td class="n">${r.g}</td><td class="n">${r.e}</td><td class="n">${r.p}</td><td class="n c-gf">${r.gf}</td><td class="n c-gf">${r.gc}</td>`}
      <td class="n">${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="n pts">${r.pts}</td>${hasForm ? `<td class="c-form">${form(r.form)}</td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}
async function rowsFor(cfg, force) {
  if (cfg.source === "manual") return { rows: manualTable(cfg.rows), meta: `Actualizada a mano el ${fmtDate(String(cfg.updated_at || "").slice(0, 10))}` };
  const j = await fetchStandings(cfg.league_id, cfg.season, force);
  const g = j.groups[cfg.group_index] || j.groups[0] || [];
  const t = new Date(j.fetched_at || Date.now());
  return { rows: g, group: g[0]?.group, meta: `Se actualiza sola · datos de API-Football · consultado a las ${t.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` };
}

function viewStandings() {
  const list = S.data.standings || [];
  const cats = list.map((x) => x.category);
  const cur = cats.includes(S.stcat) ? S.stcat : cats[0];
  S.stcat = cur;
  return `<section class="band page-h"><div class="row-between"><h1>Clasificación</h1>${isAdmin() ? `<button class="btn" data-act="st-config" data-id="${esc(cur || "")}">Configurar</button>` : ""}</div>
    ${cats.length > 1 ? `<div class="chips">${cats.map((c) => `<button class="chip ${c === cur ? "on" : ""}" data-act="st-cat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}</section>
  <section class="band tight"><div class="panel" id="st-box">${cur ? `<p class="muted">Cargando clasificación…</p>` : `<p class="empty">Todavía no hay ninguna clasificación configurada.</p>${isAdmin() ? `<button class="btn" data-act="st-config" data-id="">Configurar la primera</button>` : ""}`}</div></section>`;
}
async function loadStandingsBox() {
  const box = $("#st-box"), cfg = (S.data.standings || []).find((x) => x.category === S.stcat);
  if (!box || !cfg) return;
  try {
    const { rows, meta, group } = await rowsFor(cfg);
    if (!$("#st-box")) return;
    box.innerHTML = `<div class="st-head">${cfg.league_logo && /^https:\/\//.test(cfg.league_logo) ? `<img src="${esc(cfg.league_logo)}" alt="">` : ""}<div><h2>${esc(cfg.league_name || cfg.category)}</h2><p class="muted small">${esc([cfg.category, group, cfg.season ? `Temporada ${cfg.season}/${String(cfg.season + 1).slice(2)}` : null].filter(Boolean).join(" · "))}</p></div></div>
      ${standingsTable(rows, cfg)}
      <p class="muted small st-meta">${esc(meta)}${isAdmin() && cfg.source === "manual" ? ` <button class="btn small accent st-photo-btn" data-act="st-photo" data-id="${esc(cfg.category)}">Actualizar con una foto</button>` : ""}</p>
      ${rows.some((r) => r.desc) ? `<p class="st-legend"><span class="lgi"><span class="lg-up"></span> Ascenso / fase final</span><span class="lgi"><span class="lg-down"></span> Descenso</span></p>` : ""}`;
  } catch (e) {
    box.innerHTML = `<h2>${esc(cfg.league_name || cfg.category)}</h2><p class="err">${isAdmin() ? esc(e.message) : "La clasificación no está disponible ahora mismo. Vuelve a intentarlo en un rato."}</p>`;
  }
}
async function loadHomeStanding() {
  const box = $("#home-st"); if (!box) return;
  const cfg = (S.data.standings || [])[0]; if (!cfg) return;
  try {
    const { rows } = await rowsFor(cfg);
    const i = Math.max(0, rows.findIndex((r) => isOurs(r.team, cfg)));
    const from = Math.max(0, Math.min(i - 2, rows.length - 5));
    const me = rows[i];
    if (!$("#home-st")) return;
    box.innerHTML = `<div class="panel-h"><h2>Clasificación</h2><a href="#/clasificacion">Ver completa</a></div>
      ${me && isOurs(me.team, cfg) ? `<p class="st-pos"><b>${me.rank}º</b> con <b>${me.pts}</b> puntos <span class="muted small">· ${esc(cfg.category)}</span></p>` : ""}
      ${standingsTable(rows.slice(from, from + 5), cfg, true)}`;
    box.hidden = false;
  } catch { box.hidden = true; }
}

// ---- configuración (admin)
function stConfig(cat) {
  const cats = S.data.settings.categories;
  const c = cat || cats[0];
  const cfg = (S.data.standings || []).find((x) => x.category === c);
  S.stEdit = cfg ? structuredClone(cfg) : { category: c, source: "api", rows: [], group_index: 0 };
  S.stWarnAck = false;
  S.stLeagues = S.stLeagues || {};
  renderStConfig();
}
function renderStConfig() {
  const c = S.stEdit, exists = (S.data.standings || []).some((x) => x.category === c.category);
  const cats = [...new Set([...S.data.settings.categories, ...(S.data.standings || []).map((x) => x.category)])];
  const manualRows = (c.rows && c.rows.length ? c.rows : [{}, {}, {}]);
  const teamNames = manualTable(c.rows).map((r) => r.team);
  modal(`<h2>Configurar clasificación</h2>
    <div class="form">
      <label>Categoría<select id="stc-cat">${cats.map((x) => `<option ${x === c.category ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <div class="seg" role="tablist"><button class="${c.source === "api" ? "on" : ""}" data-act="stc-src" data-v="api">Automática</button><button class="${c.source === "manual" ? "on" : ""}" data-act="stc-src" data-v="manual">Manual</button></div>
      ${c.source === "api" ? `
        <p class="muted small">Busca la liga de tu equipo. Solo aparecen ligas de España que tenga API-Football. Si la tuya no sale, usa el modo manual.</p>
        <div class="frow"><input id="stc-q" placeholder="Ej.: Segunda Federación, Tercera, Juvenil" value="${esc(S.stQ || "")}"><button type="button" class="btn ghost" data-act="stc-search">Buscar</button><button type="button" class="btn ghost" data-act="stc-search" data-all="1">Ver todas</button></div>
        <div id="stc-res" class="stc-res">${c.league_id ? `<p class="small">Liga elegida: <b>${esc(c.league_name || "")}</b></p>` : ""}</div>
        <div id="stc-sel"></div>`
      : `
        <p class="muted small">Sube una captura de la tabla o escribe cada equipo. Los puntos (3 por victoria y 1 por empate), la diferencia de goles y el orden se calculan solos.</p>
        <div class="stm-photo"><label class="btn accent filebtn">Subir foto o captura de la clasificación<input type="file" id="stc-photo" accept="image/*" hidden></label>
          <span class="muted small" id="stc-photo-msg">Haz una captura de la tabla (web de la federación, una app…) y la web la lee sola.</span></div>
        ${manualRows.some((r) => r.check) ? `<p class="stm-warn">Revisa las filas marcadas en rojo: algún número no se leyó bien (PJ tiene que ser G + E + P).</p>` : ""}
        <div class="scroll"><table class="stm"><thead><tr><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th></th></tr></thead><tbody id="stm-body">
          ${manualRows.map((r) => { const warn = r.team && (r.check || (r.pj !== "" && r.pj != null && Number(r.pj) !== (Number(r.g) || 0) + (Number(r.e) || 0) + (Number(r.p) || 0))); return `<tr class="stm-row${warn ? " warn" : ""}" data-check="${warn ? 1 : 0}"><td><input name="team" value="${esc(r.team || "")}" placeholder="Nombre del equipo"></td>${["pj", "g", "e", "p", "gf", "gc"].map((k) => `<td><input name="${k}" type="number" min="0" inputmode="numeric" value="${esc(r[k] ?? "")}"></td>`).join("")}<td><button type="button" class="x" data-act="stm-del" aria-label="Quitar equipo">×</button></td></tr>`; }).join("")}
        </tbody></table></div>
        <div class="frow"><button type="button" class="btn ghost small" data-act="stm-add">+ Añadir equipo</button></div>
        <details class="stm-paste"><summary>Pegar la tabla desde Excel o desde la web de la federación</summary>
          <p class="muted small">Una fila por equipo con el nombre y sus números. Detecto el orden habitual (PJ, G, E, P, GF, GC). Revisa el resultado antes de guardar.</p>
          <textarea id="stc-paste" rows="5" placeholder="1  CD Ejemplo  12  8  2  2  25  10  26"></textarea>
          <button type="button" class="btn ghost small" data-act="stc-paste">Importar filas</button></details>
        <label>Tu equipo en la tabla<select id="stc-team"><option value="">— Detectar por el nombre del club —</option>${teamNames.map((t) => `<option ${t === c.team_name ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`}
    </div>
    <div class="actions">${exists ? `<button class="btn ghost danger-t" data-act="stc-del">Quitar esta clasificación</button>` : ""}<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="stc-save">Guardar</button></div>`, true);
  $("#stc-cat").addEventListener("change", (e) => { collectManual(); stConfig(e.target.value); });
  if (c.source === "api" && c.league_id) renderStSel();
}
function collectManual() {
  const c = S.stEdit; if (!c || c.source !== "manual" || !$("#stm-body")) return;
  c.rows = [...document.querySelectorAll("#stm-body .stm-row")].map((tr) => {
    const o = {}; tr.querySelectorAll("input").forEach((i) => (o[i.name] = i.name === "team" ? i.value.trim() : i.value === "" ? "" : Number(i.value)));
    if (tr.dataset.check === "1") o.check = true;
    return o;
  }).filter((r) => r.team || ["pj", "g", "e", "p", "gf", "gc"].some((k) => r[k] !== ""));
  const t = $("#stc-team"); if (t) c.team_name = t.value || null;
}
function parsePasted(text) {
  // Lee filas pegadas o sacadas de una foto. Entiende columnas en cualquier orden, goles "30:9",
  // racha con letras y escudos (ruido). Marca con check:true las filas que conviene revisar.
  const PREFIX = new Set(["CD", "UD", "CF", "CP", "AD", "SD", "RC", "CA", "UE", "FC", "CE", "SC", "AT", "RCD", "UB", "UP", "AC"]);
  const numTok = (t) => /^[+\-−–«“"']?\d+$/.test(t) || /^\d+:\d+$/.test(t) || /^[+\-−–]$/.test(t);
  const parsed = String(text || "").split(/\r?\n/).map((raw) => {
    let l = raw.replace(/\t/g, " ").replace(/[|·•()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
    if (!l || !/\d/.test(l)) return null;
    if (/\b(PTS|DIFF|GLS|Últimas|Ultimas|Equipo|Clasificaci)/i.test(l) && !/\d+\s*:\s*\d+/.test(l)) return null;
    let suspicious = false;
    l = l.replace(/(?<=\d)[Oo](?=\d|\b)/g, "0").replace(/\b[Oo](?=\d)/g, "0").replace(/(?<=\d)[lI](?=\d|\b)/g, "1");
    l = l.replace(/(\d)\.(\d)/g, "$1 $2").replace(/(\d)[.,](?=\s|$)/g, "$1").replace(/(\d)\s*[:;]\s*(\d)/g, "$1:$2");
    l = l.replace(/(\d)[xX%](\d)/g, (m, a1, b1) => { suspicious = true; return `${a1}:${b1}`; });
    let toks = l.split(" ").filter(Boolean);
    if (toks.length && /^\d+$/.test(toks[0]) && toks.length > 1) toks = toks.slice(1);   // posición
    const first = toks.findIndex((t, i) => i > 0 && numTok(t) && toks.slice(0, i).some((x) => /\p{L}{2,}/u.test(x)));
    if (first === -1) return null;
    let name = toks.slice(0, first);
    while (name.length > 1 && (/[^\p{L}.'’-]/u.test(name[0]) || (name[0].length <= 2 && !PREFIX.has(name[0])))) name = name.slice(1);
    while (name.length > 1 && !PREFIX.has(name[name.length - 1]) && /^([WDLVEP]{1,5}|[A-ZÁÉ]{2}|[^\p{L}]+)$/u.test(name[name.length - 1])) name = name.slice(0, -1);
    let team = name.join(" ").replace(/^[^\p{L}]+/u, "").trim();
    if (!team || !/\p{L}{2,}/u.test(team)) return null;
    team = team.charAt(0).toUpperCase() + team.slice(1);
    team = team.replace(/\b(CD|UD|CF|CP|CA|AD|SD|RC|UE|FC|CE|SC)(?=[A-ZÁÉÍÓÚ][a-záéíóúñ])/g, "$1 ");
    // números de la fila (se descartan letras de la racha y basura)
    const nums = [];
    const tail = toks.slice(first);
    for (let ti = 0; ti < tail.length; ti++) {
      const t = tail[ti];
      // 1-2 caracteres basura entre dos números = cifra mal leída (hueco)
      if (!numTok(t) && t.length <= 2 && ti > 0 && ti < tail.length - 1 && numTok(tail[ti - 1]) && numTok(tail[ti + 1])) { nums.push({ v: null, raw: "", sign: null, hole: true }); continue; }
      if (/^\d+:\d+$/.test(t)) { const [x, y] = t.split(":").map(Number); nums.push({ gls: [x, y] }); continue; }
      const m = t.match(/^([+\-−–«“"']?)(\d+)$/);
      if (m) { const sign = m[1] === "+" ? 1 : /[-−–]/.test(m[1]) ? -1 : m[1] ? 0 : null; nums.push({ v: Number(m[2]), raw: m[2], sign }); continue; }
      if (/^[+\-−–]$/.test(t)) nums.push({ v: null, sign: t === "+" ? 1 : -1, raw: "" });
    }
    return { team, nums, suspicious };
  }).filter(Boolean);

  const exactWins = (nums) => {
    const plain = nums.map((n, i) => ({ ...n, i })).filter((n) => (n.v != null || n.hole) && !n.gls);
    const out = [];
    for (let k = 0; k + 3 < plain.length; k++) {
      const [a, b, c, d] = plain.slice(k, k + 4);
      if ([a, b, c, d].some((x) => x.v == null)) continue;
      if (a.v === b.v + c.v + d.v && a.v > 0 && a.v <= 60) out.push({ k, pj: a.v, w: b.v, d: c.v, l: d.v, end: d.i, exact: true });
    }
    return out;
  };
  const findWindow = (nums, pjHint, kModal) => {
    const plain = nums.map((n, i) => ({ ...n, i })).filter((n) => (n.v != null || n.hole) && !n.gls);
    const ex = exactWins(nums);
    const atModal = ex.find((x) => x.k === kModal);
    if (atModal) return atModal;
    // en la posición habitual de la tabla: deducir un hueco o un valor imposible
    if (pjHint && plain.length > kModal + 3) {
      const q = plain.slice(kModal, kModal + 4);
      let [pj, w, d, l] = q.map((x) => x.v);
      const holes = [pj, w, d, l].filter((x) => x == null).length;
      if (holes === 1) {
        if (pj == null) pj = w + d + l; else if (w == null) w = pj - d - l; else if (d == null) d = pj - w - l; else l = pj - w - d;
        if ([pj, w, d, l].every((x) => x >= 0) && Math.abs(pj - pjHint) <= 2) return { pj, w, d, l, end: q[3].i, exact: false };
      } else if (holes === 0 && pj === pjHint) {
        const bad = [w, d, l].filter((x) => x > pj).length;
        if (bad === 1) { if (w > pj) w = pj - d - l; else if (d > pj) d = pj - w - l; else l = pj - w - d; if ([w, d, l].every((x) => x >= 0)) return { pj, w, d, l, end: q[3].i, exact: false }; }
      }
    }
    if (ex.length) return { ...ex[0], exact: ex[0].k === kModal || !pjHint ? ex[0].exact : false };
    if (pjHint) for (let k = 0; k + 3 < plain.length; k++) {
      const [, b, c, d] = plain.slice(k, k + 4);
      const sum = b.v + c.v + d.v;
      if (sum >= pjHint - 2 && sum <= pjHint && b.v <= 60 && c.v <= 60 && d.v <= 60) return { pj: sum, w: b.v, d: c.v, l: d.v, end: d.i, exact: false };
    }
    return null;
  };
  const kv = {}; parsed.forEach((r) => { const ex = exactWins(r.nums); if (ex.length === 1) kv[ex[0].k] = (kv[ex[0].k] || 0) + 1; });
  const kModal = Object.keys(kv).length ? Number(Object.entries(kv).sort((a, b) => b[1] - a[1])[0][0]) : 0;
  const exactPJ = parsed.map((r) => findWindow(r.nums, null, kModal)).filter((w) => w && w.exact).map((w) => w.pj);
  const freq = {}; exactPJ.forEach((x) => (freq[x] = (freq[x] || 0) + 1));
  const pjModal = exactPJ.length ? Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]) : null;

  return parsed.map(({ team, nums, suspicious }) => {
    const w = findWindow(nums, pjModal, kModal);
    if (!w) return { team, pj: "", g: "", e: "", p: "", gf: "", gc: "", check: true };
    let check = !w.exact || suspicious;
    const rest = nums.slice(w.end + 1);
    // diferencia de goles: número con signo (o "0") justo después
    const max = Math.max(60, 5 * w.pj);
    const hasColon = rest.some((n) => n.gls);
    if (!hasColon && rest[0] && rest[1] && rest[0].sign === null && rest[1].sign === null && rest[0].v != null && rest[1].v != null && rest[0].v <= max && rest[1].v <= max) {
      // columnas GF y GC separadas
      const gf2 = rest[0].v, gc2 = rest[1].v;
      const d2 = rest[2] && rest[2].v != null && (rest[2].sign === 1 || rest[2].sign === -1) ? rest[2].sign * rest[2].v : null;
      if (d2 != null && gf2 - gc2 !== d2) check = true;
      const lastP = [...rest].reverse().find((n) => n.v != null && !n.gls);
      if (lastP && rest.indexOf(lastP) > 1 && lastP !== rest[2] && lastP.v !== 3 * w.w + w.d) check = true;
      return { team, pj: w.pj, g: w.w, e: w.d, p: w.l, gf: gf2, gc: gc2, check };
    }
    let diff = null, diffSignKnown = false, gi = 0;
    if (rest[0] && !rest[0].gls && (rest[0].sign !== null || rest[0].v === 0 || (rest[1] && rest[1].v != null && rest[1].v > max))) {
      diff = rest[0].v; diffSignKnown = rest[0].sign === 1 || rest[0].sign === -1 || rest[0].v === 0;
      if (diff != null && rest[0].sign === -1) diff = -diff;
      gi = 1;
    }
    // goles a favor / en contra
    let gf = "", gc = "", gIdx = -1;
    for (let j = gi; j < rest.length; j++) {
      const n = rest[j];
      if (n.gls) { [gf, gc] = n.gls; gIdx = j; if (diff != null && diffSignKnown && gf - gc !== diff) check = true; break; }
      if (n.v != null && n.raw.length >= 2) {
        const opts = [];
        for (let c = 1; c < n.raw.length; c++) {
          const A = n.raw.slice(0, c), B = n.raw.slice(c);
          if ((A.length > 1 && A[0] === "0") || (B.length > 1 && B[0] === "0")) continue;
          const x = Number(A), y = Number(B);
          if (x <= max && y <= max) opts.push([x, y]);
        }
        const exact = opts.find(([x, y]) => diff != null && (diffSignKnown ? x - y === diff : Math.abs(x - y) === diff));
        const pick = exact || (opts.length === 1 ? opts[0] : null);
        if (pick) { [gf, gc] = pick; if (!exact) check = true; }
        gIdx = j;
        break;
      }
    }
    if (gf === "" || gc === "") check = true;
    // puntos (último número de la fila) para comprobar
    const last = [...rest].reverse().find((n) => n.v != null && !n.gls);
    if (last && rest.indexOf(last) > gIdx && last.v !== 3 * w.w + w.d) check = true;
    return { team, pj: w.pj, g: w.w, e: w.d, p: w.l, gf, gc, check };
  });
}

// Combina varias lecturas de la misma tabla: fila a fila se queda con la que cuadra
function mergeReadings(list) {
  const key = (t) => normTxt(t).replace(/[^a-z]/g, "");
  const bigr = (x) => { const k = key(x), out = new Set(); for (let i = 0; i < k.length - 1; i++) out.add(k.slice(i, i + 2)); return out; };
  const sim = (a, b) => { const A = bigr(a), B = bigr(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => B.has(x) && n++); return (2 * n) / (A.size + B.size); };
  const base = list.slice().sort((a, b) => b.length - a.length)[0] || [];
  const nums = (r) => [r.pj, r.g, r.e, r.p, r.gf, r.gc].join(",");
  return base.map((row) => {
    const group = [row];
    list.forEach((L) => { if (L === base) return; let best = null, bs = 0.5; L.forEach((r) => { const v = sim(r.team, row.team); if (v > bs) { bs = v; best = r; } }); if (best) group.push(best); });
    const good = group.filter((r) => !r.check && r.pj !== "" && r.gf !== "" && r.gc !== "");
    const pool = good.length ? good : group.filter((r) => r.pj !== "");
    const count = {}; pool.forEach((r) => (count[nums(r)] = (count[nums(r)] || 0) + 1));
    const top = pool.length ? Object.entries(count).sort((a, b) => b[1] - a[1])[0][0] : null;
    const chosen = top ? pool.find((r) => nums(r) === top) : row;
    const names = {}; group.forEach((r) => (names[r.team] = (names[r.team] || 0) + 1 + (r.team.includes(" ") ? 0.5 : 0)));
    const team = Object.entries(names).sort((a, b) => b[1] - a[1])[0][0];
    return { ...chosen, team, check: !good.length || chosen.check };
  });
}

// Lee una foto o captura de la clasificación (OCR en el propio navegador, sin claves)
let tessLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessLoading) tessLoading = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    sc.onload = () => res(window.Tesseract);
    sc.onerror = () => { tessLoading = null; rej(new Error("No se pudo cargar el lector de imágenes. Revisa tu conexión.")); };
    document.head.appendChild(sc);
  });
  return tessLoading;
}
function loadImageEl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => reject(new Error("La imagen no es válida."));
    img.src = url;
  });
}
// variantes: escala y binarizado distintos (cada una acierta en filas distintas)
function prepareVariant(img, width, threshold) {
  const scale = Math.min(4, Math.max(1, width / img.width));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) { const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = g; sum += g; }
  const dark = sum / (px.length / 4) < 128;
  let mn = 255, mx = 0;
  for (let i = 0; i < px.length; i += 4) { let g = px[i]; if (dark) g = 255 - g; px[i] = g; if (g < mn) mn = g; if (g > mx) mx = g; }
  const r = Math.max(1, mx - mn);
  for (let i = 0; i < px.length; i += 4) {
    let g = ((px[i] - mn) * 255) / r;
    if (threshold) g = g > threshold ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}
async function readStandingsPhoto(file, onProgress) {
  const T = await loadTesseract();
  const img = await loadImageEl(file);
  const variants = [[2700, 0], [2700, 150], [1800, 0]];
  let step = 0;
  const worker = await T.createWorker("spa", 1, { logger: (m) => { if (m.status === "recognizing text") onProgress(Math.round(((step + m.progress) / variants.length) * 100)); } });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    const texts = [];
    for (const [w, th] of variants) { const { data } = await worker.recognize(prepareVariant(img, w, th)); texts.push(data.text); step++; }
    return texts;
  } finally { await worker.terminate(); }
}

async function renderStSel(force) {
  const c = S.stEdit, box = $("#stc-sel"); if (!box) return;
  const L = S.stLeagues[c.league_id];
  const seasons = L ? L.seasons.slice().sort((a, b) => b.year - a.year) : (c.season ? [{ year: c.season, standings: true }] : []);
  box.innerHTML = `<p class="muted small">Cargando…</p>`;
  try {
    const j = await fetchStandings(c.league_id, c.season, force);
    const groups = j.groups || [];
    if (!groups.length) throw new Error("Esta liga no tiene clasificación disponible para esa temporada.");
    if (c.group_index >= groups.length) c.group_index = 0;
    const rows = groups[c.group_index];
    if (!c.team_name) { const hit = rows.find((r) => isOurs(r.team, {})); if (hit) c.team_name = hit.team; }
    box.innerHTML = `<div class="frow">
      <label>Temporada<select id="stc-season">${seasons.map((s) => `<option value="${s.year}" ${s.year === c.season ? "selected" : ""}>${s.year}/${String(s.year + 1).slice(2)}${s.current ? " (actual)" : ""}${s.standings ? "" : " · sin tabla"}</option>`).join("")}</select></label>
      ${groups.length > 1 ? `<label>Grupo<select id="stc-group">${groups.map((g, i) => `<option value="${i}" ${i === c.group_index ? "selected" : ""}>${esc(g[0]?.group || `Grupo ${i + 1}`)}</option>`).join("")}</select></label>` : ""}
      <label>Tu equipo<select id="stc-team-api">${rows.map((r) => `<option ${r.team === c.team_name ? "selected" : ""}>${esc(r.team)}</option>`).join("")}</select></label></div>
      <p class="muted small">Vista previa (${rows.length} equipos):</p>${standingsTable(rows.slice(0, 6), c, true)}`;
  } catch (e) {
    box.innerHTML = `${seasons.length ? `<label>Temporada<select id="stc-season">${seasons.map((s) => `<option value="${s.year}" ${s.year === c.season ? "selected" : ""}>${s.year}/${String(s.year + 1).slice(2)}${s.current ? " (actual)" : ""}</option>`).join("")}</select></label>` : ""}
      <p class="err">${esc(e.message)}</p>${/plan|access|season/i.test(e.message) ? `<p class="muted small">Tu plan de API-Football no incluye esa temporada. Puedes probar otra temporada, subir de plan en API-Football o usar el modo manual.</p>` : ""}`;
  }
  $("#stc-season")?.addEventListener("change", (e) => { c.season = Number(e.target.value); c.group_index = 0; c.team_name = null; renderStSel(); });
  $("#stc-group")?.addEventListener("change", (e) => { c.group_index = Number(e.target.value); c.team_name = null; renderStSel(); });
  $("#stc-team-api")?.addEventListener("change", (e) => { c.team_name = e.target.value; });
}

// ------------------------------------------------------------ instalar como app
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || isIOS();
let deferredPrompt = null;
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function updateInstallUI() {
  const can = !isStandalone() && (deferredPrompt || isMobile());
  $("#foot-install").hidden = !can;
  const snoozed = Number(lsGet("cantera_install_snooze") || 0) > Date.now();
  const show = can && isMobile() && !snoozed && (deferredPrompt || isIOS());
  $("#install-bar").hidden = !show;
  if (show && isIOS() && !deferredPrompt) { $("#ib-msg").textContent = "Pulsa Compartir y luego «Añadir a pantalla de inicio»."; $("#ib-btn").textContent = "Cómo"; }
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; if (S.data) updateInstallUI(); });
window.addEventListener("appinstalled", () => { deferredPrompt = null; updateInstallUI(); toast("¡App instalada! Ya la tienes en tu pantalla de inicio"); });
async function doInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    deferredPrompt = null;
    if (outcome !== "accepted") lsSet("cantera_install_snooze", String(Date.now() + 14 * 864e5));
    updateInstallUI();
    return;
  }
  const ios = isIOS();
  modal(`<h2>Instalar La Cantera</h2>
    <p class="muted">Tendrás un icono en tu pantalla de inicio y se abrirá a pantalla completa, como una app.</p>
    <ol class="steps">${ios
      ? `<li>Abre esta web en <b>Safari</b>.</li><li>Pulsa el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elige <b>Añadir a pantalla de inicio</b> y pulsa <b>Añadir</b>.</li>`
      : `<li>Abre esta web en <b>Chrome</b>.</li><li>Pulsa el menú <span class="kbd">⋮</span> de arriba a la derecha.</li><li>Elige <b>Instalar aplicación</b> (o <b>Añadir a pantalla de inicio</b>).</li>`}</ol>
    <div class="actions"><button class="btn" data-act="close">Entendido</button></div>`);
}

// ------------------------------------------------------------ crear contenido
const STAT_OPTS = [["goals", "Goles", "Máximos goleadores"], ["assists", "Asistencias", "Máximos asistentes"], ["ga", "Goles + asistencias", "Goles + asistencias"], ["avg", "Nota media", "Mejores notas"], ["mvps", "Veces MVP", "Más veces MVP"], ["minutes", "Minutos", "Más minutos"], ["pj", "Partidos jugados", "Más partidos"]];
const PERIODS = [["season", "Toda la temporada"], ["week", "Última jornada"], ["month", "Este mes"], ["prevmonth", "Mes pasado"], ["custom", "Fechas a elegir"]];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function periodRange(v, cat, from, to) {
  const d = new Date(), iso = (x) => x.toISOString().slice(0, 10);
  if (v === "week") {
    const played = S.data.matches.filter((m) => result(m) !== "P" && (!cat || m.category === cat)).map((m) => m.match_date).sort();
    const last = played[played.length - 1];
    if (!last) return { from: null, to: null, label: "Última jornada", season: false };
    const f = new Date(last + "T00:00:00"); f.setDate(f.getDate() - 6);
    return { from: iso(f), to: last, label: `Jornada del ${fmtDate(last)}`, season: false };
  }
  if (v === "month" || v === "prevmonth") {
    const y = d.getFullYear(), mo = d.getMonth() - (v === "prevmonth" ? 1 : 0);
    const f = new Date(Date.UTC(y, mo, 1)), t = new Date(Date.UTC(y, mo + 1, 0));
    return { from: iso(f), to: iso(t), label: `Mes de ${MONTHS_ES[f.getUTCMonth()]}`, season: false };
  }
  if (v === "custom") return { from: from || null, to: to || null, label: `${from ? fmtDate(from) : "Inicio"} – ${to ? fmtDate(to) : "hoy"}`, season: false };
  return { from: null, to: null, label: `Temporada ${S.data.settings.season}`, season: true };
}
// estadísticas por jugador en el periodo (la temporada incluye las cifras previas)
function statsFor(range, cat) {
  const players = S.data.players.filter((p) => p.status !== "Baja" && (!cat || p.category === cat));
  const per = range.season ? null : periodStats(S.data, range.from, range.to, cat || null).stats;
  return players.map((p) => {
    if (range.season) { const st = playerStats(p.id, S.data); return { p, pj: st.pj, goals: st.goals, assists: st.assists, minutes: st.minutes, avg: st.avg, rn: st.apps.filter((a) => a.rating != null && a.rating !== "").length, mvps: st.mvps, cards: st.yellow + st.red }; }
    const x = per.get(p.id) || { pj: 0, goals: 0, assists: 0, minutes: 0, avg: null, rn: 0, mvps: 0 };
    return { p, ...x, cards: 0 };
  });
}
const catOpts = (sel) => `<option value="">Toda la cantera</option>` + [...new Set([...S.data.settings.categories, ...S.data.players.map((p) => p.category).filter(Boolean)])].map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("");
const periodFields = (def = "season") => `<label>Periodo<select name="period" class="period-sel">${PERIODS.map(([v, l]) => `<option value="${v}" ${v === def ? "selected" : ""}>${l}</option>`).join("")}</select></label>
  <div class="frow custom" hidden><label>Desde<input type="date" name="from"></label><label>Hasta<input type="date" name="to"></label></div>`;

function viewContent() {
  if (!canEdit()) return notFound("Esta sección es para el administrador y los colaboradores.");
  const ps = S.data.players.filter((p) => p.status !== "Baja").sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.dorsal ?? 999) - (b.dorsal ?? 999));
  const pOpts = (sel) => ps.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(p.dorsal ?? "–")} · ${esc(p.name)} (${esc(p.category || "—")})</option>`).join("");
  return `<section class="band page-h"><h1>Crear contenido</h1>
    <p class="lede-s">Genera tarjetas listas para publicar. Todas (también las de jugadores y partidos) se pueden descargar como <b>post 4:5</b> o <b>story 9:16</b>.</p></section>
  <section class="band tight cx-grid">
    <form class="panel cx form" id="cx-rank">
      <div class="cx-h"><span class="cx-ic">1</span><div><h2>Ranking</h2><p class="muted small">Goleadores, asistentes, mejores notas…</p></div></div>
      <label>Estadística<select name="stat">${STAT_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
      <div class="frow"><label>Categoría<select name="cat">${catOpts("")}</select></label><label class="w-s">Cuántos<select name="n"><option>5</option><option>10</option></select></label></div>
      ${periodFields()}
      <button class="btn">Generar tarjeta</button>
    </form>
    <form class="panel cx form" id="cx-ideal">
      <div class="cx-h"><span class="cx-ic">2</span><div><h2>Once ideal</h2><p class="muted small">Te propongo el once con mejor nota media y lo retocas.</p></div></div>
      <div class="frow"><label>Categoría<select name="cat">${catOpts(S.data.settings.categories[0])}</select></label>
      <label>Sistema<select name="formation">${FORMATION_NAMES.map((f) => `<option>${esc(f)}</option>`).join("")}</select></label></div>
      ${periodFields("week")}
      <button class="btn ghost">Proponer once</button>
      <div id="ideal-slots"></div>
    </form>
    <form class="panel cx form" id="cx-cmp">
      <div class="cx-h"><span class="cx-ic">3</span><div><h2>Cara a cara</h2><p class="muted small">Compara a dos jugadores con barras.</p></div></div>
      <label>Jugador 1<select name="a">${pOpts(ps[0]?.id)}</select></label>
      <label>Jugador 2<select name="b">${pOpts(ps[1]?.id)}</select></label>
      ${periodFields()}
      <button class="btn">Generar tarjeta</button>
    </form>
  </section>`;
}

function proposeIdeal(form) {
  const fd = new FormData(form);
  const cat = fd.get("cat"), formation = fd.get("formation");
  const range = periodRange(fd.get("period"), cat, fd.get("from"), fd.get("to"));
  const list = statsFor(range, cat).filter((x) => x.avg != null).sort((a, b) => b.avg - a.avg || b.goals - a.goals);
  const slots = FORMATIONS[formation], used = new Set();
  // 1º demarcación exacta (el mejor de cada puesto), 2º misma línea, 3º sin posición
  const pick = slots.map(() => "");
  for (const pass of ["detail", "group", "none"]) {
    slots.forEach((sl, i) => {
      if (pick[i]) return;
      const c = list.find((x) => !used.has(x.p.id) && (pass === "detail" ? detailLabels(x.p).includes(sl.l) : pass === "group" ? groupOf(x.p) === sl.g : !groupOf(x.p)));
      if (c) { used.add(c.p.id); pick[i] = c.p.id; }
    });
  }
  const all = statsFor(range, cat).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  const opt = (sel) => `<option value="">— Vacío —</option>` + all.map((x) => `<option value="${esc(x.p.id)}" ${x.p.id === sel ? "selected" : ""}>${x.avg != null ? fmtRating(x.avg) : "–"} · ${esc(x.p.name)}${x.p.position ? ` (${esc(POS_SHORT[x.p.position] || "")})` : ""}</option>`).join("");
  $("#ideal-slots").innerHTML = `<p class="muted small">${esc(range.label)} · ${list.length ? `${list.length} jugadores con nota` : "nadie tiene notas en este periodo"}. Cambia lo que quieras:</p>
    <div class="ideal-list">${slots.map((sl, i) => `<label class="ideal-row"><span class="pos-tag pos-${({ G: 0, D: 1, M: 2, F: 3 })[sl.g]}">${esc(sl.l)}</span><select data-slot="${i}">${opt(pick[i])}</select></label>`).join("")}</div>
    <button type="button" class="btn" data-act="ideal-card">Generar tarjeta</button>`;
  S.idealCtx = { formation, range, cat };
}

// ------------------------------------------------------------ directo
const pname = (id) => { const p = player(id); return p ? p.name : "Jugador"; };
function liveMinuteDefault(m) {
  const h = m.half_minutes || defaultHalf(m.category);
  return clockMinute(m) ?? (m.live_status === "descanso" ? h : m.live_status === "final" ? 2 * h : 0);
}
function timelineHTML(m, evs, editable) {
  if (!evs.length) return `<p class="empty">${isLive(m) ? "Aún no ha pasado nada." : "Sin eventos registrados."}</p>`;
  const rival = m.rival;
  return `<ol class="tl-live">${evs.slice().reverse().map((e) => {
    const [gf, ga] = scoreAt(evs, e);
    const sc = ["gol", "gol_rival"].includes(e.type) ? `<span class="tl-sc">${m.venue === "Visitante" ? `${ga}-${gf}` : `${gf}-${ga}`}</span>` : "";
    return `<li class="ev ev-${esc(e.type)}"><span class="ev-min">${e.minute != null ? esc(e.minute) + "'" : ""}</span><span class="ev-ic">${ICONS[e.type] || ICONS.nota}</span>
      <span class="ev-tx">${eventText(e, pname, rival)} ${sc}</span>
      ${editable ? `<span class="ev-act">${e.type === "gol" ? `<button class="link" data-act="card-goal" data-id="${esc(e.id)}">Tarjeta</button>` : ""}<button class="link" data-act="ev-copy" data-id="${esc(e.id)}">Copiar</button>${e.type !== "estado" ? `<button class="x" data-act="ev-del" data-id="${esc(e.id)}" aria-label="Borrar evento">×</button>` : ""}</span>` : ""}</li>`;
  }).join("")}</ol>`;
}
function livePanel(m) {
  const st = m.live_status;
  const half = m.half_minutes || defaultHalf(m.category);
  const status = isLive(m) ? `<span class="livebadge"><i></i>En directo</span> <b class="clock" data-clock="${esc(m.id)}">${esc(clockLabel(m))}</b>`
    : st === "final" ? `<span class="res res-${result(m)}">Final</span>` : `<span class="muted">Sin empezar</span>`;
  const adj = `<button class="btn small ghost" data-act="live-adj" data-id="${esc(m.id)}" data-d="-1" aria-label="Restar un minuto">−1'</button><button class="btn small ghost" data-act="live-adj" data-id="${esc(m.id)}" data-d="1" aria-label="Sumar un minuto">+1'</button>`;
  const ctl = !st ? `<label class="halfsel">Minutos por parte<input type="number" class="live-half" min="10" max="60" value="${half}" inputmode="numeric"></label><button class="btn accent" data-act="live-start" data-id="${esc(m.id)}">Empezar partido</button>`
    : st === "primera" ? `<button class="btn" data-act="live-break" data-id="${esc(m.id)}">Descanso</button>${adj}`
    : st === "descanso" ? `<button class="btn accent" data-act="live-second" data-id="${esc(m.id)}">Empezar 2ª parte</button>`
    : st === "segunda" ? `<button class="btn danger" data-act="live-final" data-id="${esc(m.id)}">Final del partido</button>${adj}`
    : `<button class="btn small ghost" data-act="live-reopen" data-id="${esc(m.id)}">Reabrir directo</button>`;
  const actions = [["gol", "Gol nuestro"], ["gol_rival", "Gol rival"], ["amarilla", "Amarilla"], ["roja", "Roja"], ["cambio", "Cambio"], ["nota", "Comentario"]];
  return `<div class="panel live-ctl">
    <div class="live-top">${status}</div>
    <div class="live-btns">${ctl}</div>
    ${st ? `<div class="live-acts">${actions.map(([t, l]) => `<button class="lact lact-${t}" data-act="live-ev" data-id="${esc(m.id)}" data-type="${t}">${ICONS[t]}<span>${l}</span></button>`).join("")}</div>
    <p class="lhelp">También puedes tocar a un jugador del campo para apuntarle un gol, una tarjeta o cambiarlo.</p>` : `<p class="lhelp">Al empezar, el marcador se pone 0-0 y el reloj corre solo. Tus seguidores lo verán en directo.</p>`}
  </div>`;
}

function liveXI(m) {
  const arr = arrange(lineupRows(m.id), formationOf(m), player);
  return currentXI(arr, eventsOf(S.data, m.id));
}

function eventModal(mid, type, pid = null) {
  const m = match(mid);
  const xi = liveXI(m);
  const onPitch = xi.bySlot.filter(Boolean).map((r) => player(r.player_id)).filter(Boolean);
  const bench = xi.bench.map((r) => player(r.player_id)).filter(Boolean);
  const all = [...onPitch, ...bench];
  const opt = (list, sel, empty) => (empty ? `<option value="">${esc(empty)}</option>` : "") + list.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(p.dorsal ?? "–")} · ${esc(p.name)}</option>`).join("");
  const title = { gol: "Gol nuestro", gol_rival: `Gol de ${m.rival}`, amarilla: "Tarjeta amarilla", roja: "Tarjeta roja", cambio: "Cambio", nota: "Comentario" }[type];
  const fields = {
    gol: `<label>Goleador<select name="player_id">${opt(onPitch, pid, "Sin especificar")}</select></label>
          <label>Asistencia<select name="player2_id">${opt(onPitch, null, "Sin asistencia")}</select></label>`,
    gol_rival: `<label>Detalle <small>(opcional)</small><input name="body" maxlength="80" placeholder="Ej.: de penalti"></label>`,
    amarilla: `<label>Jugador<select name="player_id" required>${opt(all, pid, "Elige jugador")}</select></label>`,
    roja: `<label>Jugador<select name="player_id" required>${opt(all, pid, "Elige jugador")}</select></label>`,
    cambio: `<label>Sale<select name="player_id" required>${opt(onPitch, onPitch.some((p) => p.id === pid) ? pid : null, "Elige quién sale")}</select></label>
          <label>Entra<select name="player2_id" required>${opt(bench, bench.some((p) => p.id === pid) ? pid : null, bench.length ? "Elige quién entra" : "No hay suplentes convocados")}</select></label>`,
    nota: `<label>Comentario<input name="body" maxlength="140" required placeholder="Ej.: ocasión clarísima de Yeremay"></label>`,
  }[type];
  modal(`<h2>${esc(title)}</h2>
    <form id="eventform" class="form" data-mid="${esc(mid)}" data-type="${esc(type)}">
      ${fields}
      <label class="w-s">Minuto<input type="number" name="minute" min="0" max="130" inputmode="numeric" value="${esc(liveMinuteDefault(m))}"></label>
      <div class="actions"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn">Apuntar</button></div>
    </form>`);
}

function playerSheet(mid, pid, fromBench) {
  const p = player(pid);
  const btn = (t, l) => `<button class="lact lact-${t}" data-act="live-ev" data-id="${esc(mid)}" data-type="${t}" data-pid="${esc(pid)}">${ICONS[t]}<span>${l}</span></button>`;
  modal(`<div class="rate-h">${avatar(p, "sm")}<div><h2>${esc(p.name)}</h2><p class="muted small">${fromBench ? "En el banquillo" : "En el campo"}</p></div></div>
    <div class="live-acts sheet">${fromBench ? btn("cambio", "Sale al campo") + btn("amarilla", "Amarilla") + btn("roja", "Roja")
      : btn("gol", "Gol") + btn("amarilla", "Amarilla") + btn("roja", "Roja") + btn("cambio", "Sustituir")}</div>
    <div class="actions"><button class="btn ghost" data-act="close">Cerrar</button></div>`);
}

// aplica (sign=1) o deshace (sign=-1) los efectos de un evento en el marcador y las estadísticas
async function applyEvent(m, ev, sign) {
  const rows = lineupRows(m.id);
  const row = (pid) => rows.find((r) => r.player_id === pid);
  const inc = async (pid, f, cap) => {
    if (!pid) return;
    let v = Math.max(0, (Number(row(pid)?.[f]) || 0) + sign);
    if (cap) v = Math.min(cap, v);
    await S.store.upsertLineupRow(m.id, pid, { [f]: v });
  };
  if (ev.type === "gol") {
    await S.store.updateMatch(m.id, { goals_for: Math.max(0, (Number(m.goals_for) || 0) + sign) });
    await inc(ev.player_id, "goals");
    await inc(ev.player2_id, "assists");
  }
  if (ev.type === "gol_rival") await S.store.updateMatch(m.id, { goals_against: Math.max(0, (Number(m.goals_against) || 0) + sign) });
  if (ev.type === "amarilla") await inc(ev.player_id, "yellow", 2);
  if (ev.type === "roja" && ev.player_id) await S.store.upsertLineupRow(m.id, ev.player_id, { red: sign > 0 ? 1 : 0 });
  if (ev.type === "cambio" && sign > 0 && ev.player2_id && !row(ev.player2_id)) await S.store.upsertLineupRow(m.id, ev.player2_id, { starter: false });
}

async function liveStatus(m, patch, label, minute) {
  return run(async () => {
    await S.store.updateMatch(m.id, patch);
    if (label) await S.store.addEvent({ match_id: m.id, type: "estado", minute, body: label });
  }, label || "Actualizado");
}


function cardMenu(mid) {
  const m = match(mid), evs = eventsOf(S.data, mid), live = isLive(m), pend = result(m) === "P" && !live;
  const hasLineup = lineupRows(mid).some((r) => r.starter);
  const item = (kind, title, sub, extra = "") => `<button class="cm" data-act="card-make" data-id="${esc(mid)}" data-kind="${kind}" ${extra}><b>${title}</b><span>${sub}</span></button>`;
  const goals = evs.filter((e) => e.type === "gol");
  const groups = [];
  groups.push(["Antes del partido", [
    item("previa", "Día de partido", `Rival, fecha${m.kickoff_time ? ", hora" : ""} y campo`),
    hasLineup ? item("once", "Once inicial", "El once sobre el campo, sin notas") : "",
  ]]);
  if (live || evs.length) groups.push([live ? "En directo" : "Durante el partido", [
    item("marcador", live ? (m.live_status === "descanso" ? "Descanso" : `Marcador en directo (${clockLabel(m)})`) : "Marcador con goles", "Resultado con goleadores y minutos"),
    ...goals.map((e) => item("gol", `¡Gol! ${e.minute != null ? e.minute + "'" : ""}`, e.player_id ? pname(e.player_id) : "Gol", `data-ev="${esc(e.id)}"`)),
  ]]);
  if (!pend && !live) groups.push(["Después del partido", [
    item("final", "Resultado final", evs.some((e) => e.type === "gol" || e.type === "gol_rival") ? "Marcador con goleadores y minutos" : "Marcador, MVP y mejores notas"),
    hasLineup ? item("notas", "Notas del partido", "El once con la nota de cada jugador") : "",
    m.mvp_id && player(m.mvp_id) ? item("mvp", "MVP del partido", pname(m.mvp_id)) : "",
  ]]);
  modal(`<h2>Tarjetas del partido</h2><p class="muted">Elige una. Después podrás descargarla como post o story.</p>
    ${groups.map(([t, items]) => items.filter(Boolean).length ? `<h3>${t}</h3><div class="cm-list">${items.filter(Boolean).join("")}</div>` : "").join("")}
    <div class="actions"><button class="btn ghost" data-act="close">Cerrar</button></div>`);
}
async function makeMatchCard(mid, kind, evId) {
  const m = match(mid), evs = eventsOf(S.data, mid), f = `${m.match_date}-${slug(m.rival)}`;
  if (kind === "previa") {
    const frase = randomFrase(S.lastFrase); S.lastFrase = frase;
    await downloadCanvas(await matchdayCard(m, S.data, frase), `${f}-previa.png`);
    S.cardCur.regen = { mid, kind: "previa" };
    showCard("post");
    return;
  }
  if (kind === "once" || kind === "notas") {
    const mm = kind === "once" ? { ...m, goals_for: null, goals_against: null } : m;
    const data = kind === "once" ? { ...S.data, matchPlayers: S.data.matchPlayers.map((r) => (r.match_id === mid ? { ...r, rating: null, goals: 0 } : r)) } : S.data;
    return downloadCanvas(await lineupCard(mm, data), `${f}-${kind}.png`);
  }
  if (kind === "marcador") {
    const label = isLive(m) ? (m.live_status === "descanso" ? "Descanso" : `En directo · ${clockLabel(m)}`) : result(m) === "P" ? "Marcador" : "Final";
    return downloadCanvas(await scoreCard(m, S.data, evs, label), `${f}-marcador.png`);
  }
  if (kind === "final") {
    if (evs.some((e) => e.type === "gol" || e.type === "gol_rival")) return downloadCanvas(await scoreCard(m, S.data, evs, "Final"), `${f}-final.png`);
    return downloadCanvas(await matchCard(m, S.data), `${f}-final.png`);
  }
  if (kind === "gol") { const ev = evs.find((e) => e.id === evId); if (ev) return downloadCanvas(await goalCard(m, S.data, ev, evs), `${f}-gol-${ev.minute ?? ""}.png`); }
  if (kind === "mvp") return downloadCanvas(await mvpCard(m, S.data), `${f}-mvp.png`);
}

// ---- refresco en tiempo real
let refreshTimer = null;
function softRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { await reload(); } catch { return; }
    const a = document.activeElement;
    if ($("#modal").open || (a && main.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { S.pendingRender = true; return; }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }, 350);
}
function tickClocks() {
  document.querySelectorAll("[data-clock]").forEach((el) => { const m = match(el.dataset.clock); if (m) el.textContent = clockLabel(m); });
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
    const msg = /kickoff_time|formation|'slot'|slot column|logo_url|rival_logo_url|standings|stadium|home_stadium|base_(pj|goals|assists|yellow|red)|match_events|live_status|live_started_at|half_minutes/i.test(e.message || "") ? "Falta ejecutar en Supabase el SQL de actualización (mira las instrucciones)" : e.message;
    toast(msg || "Algo ha fallado", true);
    return false;
  }
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (/^(card-|copy-|ev-copy|ideal-card)/.test(act) && !canEdit()) return;
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
    case "live-player": { const mid = location.hash.split("/")[2]; playerSheet(mid, el.dataset.pid, !!el.dataset.bench); break; }
    case "live-ev": closeModal(); eventModal(id, el.dataset.type, el.dataset.pid || null); break;
    case "live-start": {
      const m = match(id), half = Math.max(10, Math.min(60, Number(el.closest(".live-ctl")?.querySelector(".live-half")?.value) || defaultHalf(m.category)));
      await liveStatus(m, { live_status: "primera", live_started_at: new Date().toISOString(), half_minutes: half, goals_for: m.goals_for ?? 0, goals_against: m.goals_against ?? 0 }, "Empieza el partido", 0);
      break;
    }
    case "live-break": { const m = match(id); await liveStatus(m, { live_status: "descanso" }, "Descanso", clockMinute(m)); break; }
    case "live-second": { const m = match(id); await liveStatus(m, { live_status: "segunda", live_started_at: new Date().toISOString() }, "Empieza la 2ª parte", m.half_minutes || 45); break; }
    case "live-final": {
      const m = match(id);
      if (!(await confirmBox2("¿Terminar el partido?", "Se calcularán los minutos jugados de cada uno según los cambios. Después podrás poner las notas.", "Sí, final"))) break;
      const total = 2 * (m.half_minutes || 45);
      const mins = computeMinutes(lineupRows(id), eventsOf(S.data, id), total);
      const ok = await run(async () => {
        for (const r of lineupRows(id)) if (r.minutes == null) await S.store.upsertLineupRow(id, r.player_id, { minutes: mins[r.player_id] ?? 0 });
        await S.store.updateMatch(id, { live_status: "final" });
        await S.store.addEvent({ match_id: id, type: "estado", minute: Math.max(total, clockMinute(m) || 0), body: "Final del partido" });
      }, "Final. Ahora puedes poner las notas");
      if (ok) { S.lmode = { ...(S.lmode || {}), [id]: "rate" }; render(); }
      break;
    }
    case "live-reopen": {
      const m = match(id);
      const fin = eventsOf(S.data, id).filter((e) => e.type === "estado" && e.body === "Final del partido");
      await run(async () => { await S.store.updateMatch(id, { live_status: "segunda" }); for (const e of fin) await S.store.deleteEvent(e.id); }, "Directo reabierto");
      break;
    }
    case "live-adj": {
      const m = match(id); if (!m.live_started_at) break;
      const t = new Date(m.live_started_at).getTime() - Number(el.dataset.d) * 60000;
      await run(() => S.store.updateMatch(id, { live_started_at: new Date(t).toISOString() }), `Reloj: ${clockLabel({ ...m, live_started_at: new Date(t).toISOString() })}`);
      break;
    }
    case "ev-del": {
      const ev = (S.data.events || []).find((e) => e.id === id); if (!ev) break;
      const m = match(ev.match_id);
      if (await confirmBox("Se borrará este evento y se deshará su efecto en el marcador y las estadísticas."))
        await run(async () => { await applyEvent(m, ev, -1); await S.store.deleteEvent(id); }, "Evento borrado");
      break;
    }
    case "ev-copy": {
      const ev = (S.data.events || []).find((e) => e.id === id); if (!ev) break;
      const m = match(ev.match_id), s = S.data.settings;
      copyText(eventPost(ev, { name: (pid) => { const p = player(pid); return p ? (p.nickname || p.name) : ""; }, club: s.club_name, rival: m.rival, home: m.venue !== "Visitante", events: eventsOf(S.data, m.id), handle: HANDLE, tag: "#" + slug(s.club_name).replace(/-/g, "") }));
      break;
    }
    case "card-fmt": showCard(el.dataset.v); break;
    case "card-regen": { const r = S.cardCur?.regen; if (r) await makeMatchCard(r.mid, r.kind); break; }
    case "st-cat": S.stcat = el.dataset.v; render(); break;
    case "st-config": stConfig(id); break;
    case "st-photo": stConfig(id); setTimeout(() => $("#stc-photo")?.click(), 50); break;
    case "stc-src": collectManual(); S.stEdit.source = el.dataset.v; renderStConfig(); break;
    case "stm-add": collectManual(); S.stEdit.rows = [...(S.stEdit.rows || []), {}]; renderStConfig(); break;
    case "stm-del": el.closest("tr").remove(); break;
    case "stc-paste": {
      collectManual();
      const rows = parsePasted($("#stc-paste").value);
      if (!rows.length) { toast("No he reconocido ninguna fila. Revisa el formato.", true); break; }
      S.stEdit.rows = [...(S.stEdit.rows || []).filter((r) => r.team), ...rows];
      renderStConfig(); toast(`${rows.length} equipos importados. Revísalos antes de guardar`);
      break;
    }
    case "stc-search": {
      const q = el.dataset.all ? "" : $("#stc-q").value.trim(); S.stQ = q;
      const box = $("#stc-res"); box.innerHTML = `<p class="muted small">Buscando…</p>`;
      try {
        const ls = await searchLeagues(q);
        ls.forEach((l) => (S.stLeagues[l.id] = l));
        box.innerHTML = ls.length ? ls.map((l) => {
          const cur = l.seasons.find((x) => x.current) || l.seasons[l.seasons.length - 1];
          return `<button type="button" class="stc-l ${l.id === S.stEdit.league_id ? "on" : ""}" data-act="stc-pick" data-id="${l.id}">${l.logo && /^https:\/\//.test(l.logo) ? `<img src="${esc(l.logo)}" alt="">` : ""}<span><b>${esc(l.name)}</b><small>${cur ? `Temporada ${cur.year}/${String(cur.year + 1).slice(2)} · ${cur.standings ? "con clasificación" : "sin clasificación"}` : ""}</small></span></button>`;
        }).join("") : `<p class="muted small">No he encontrado ligas de España con ese nombre en API-Football. Prueba con otras palabras (en inglés o sin tildes) o usa el modo manual.</p>`;
      } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      break;
    }
    case "stc-pick": {
      const l = S.stLeagues[Number(id)]; if (!l) break;
      const withSt = l.seasons.filter((x) => x.standings);
      const cur = l.seasons.find((x) => x.current && x.standings) || withSt[withSt.length - 1] || l.seasons.find((x) => x.current) || l.seasons[l.seasons.length - 1];
      Object.assign(S.stEdit, { league_id: l.id, league_name: l.name, league_logo: l.logo, season: cur ? cur.year : null, group_index: 0, team_name: null });
      document.querySelectorAll(".stc-l").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
      renderStSel();
      break;
    }
    case "stc-save": {
      collectManual();
      const c = S.stEdit;
      if (c.source === "api" && (!c.league_id || !c.season)) { toast("Busca y elige una liga", true); break; }
      if (c.source === "manual" && !manualTable(c.rows).length) { toast("Añade al menos un equipo", true); break; }
      const pend = c.source === "manual" ? (c.rows || []).filter((r) => r.team && (r.check || r.gf === "" || r.gc === "" || Number(r.pj) !== (Number(r.g) || 0) + (Number(r.e) || 0) + (Number(r.p) || 0))).length : 0;
      if (pend && !S.stWarnAck) { S.stWarnAck = true; el.textContent = "Guardar igualmente"; toast(`Quedan ${pend} fila${pend === 1 ? "" : "s"} en rojo sin revisar. Revísalas o pulsa «Guardar igualmente»`, true); break; }
      S.stWarnAck = false;
      const row = { category: c.category, source: c.source, league_id: c.source === "api" ? c.league_id : null, season: c.source === "api" ? c.season : null,
        league_name: c.source === "api" ? c.league_name : c.league_name || c.category, league_logo: c.source === "api" ? c.league_logo : null,
        group_index: c.group_index || 0, team_name: c.team_name || null, rows: c.source === "manual" ? c.rows.map(({ check, ...r }) => r) : [] };
      closeModal();
      S.stcat = c.category;
      await run(() => S.store.saveStanding(row), "Clasificación guardada");
      break;
    }
    case "stc-del": {
      const cat = S.stEdit.category;
      if (await confirmBox(`Se quitará la clasificación de ${cat}.`)) await run(() => S.store.deleteStanding(cat), "Clasificación quitada");
      break;
    }
    case "card-menu": cardMenu(id); break;
    case "card-make": await makeMatchCard(id, el.dataset.kind, el.dataset.ev); break;
    case "card-goal": { const ev = (S.data.events || []).find((e) => e.id === id); if (ev) await makeMatchCard(ev.match_id, "gol", id); break; }
    case "install": doInstall(); break;
    case "install-dismiss": lsSet("cantera_install_snooze", String(Date.now() + 14 * 864e5)); updateInstallUI(); break;
    case "ideal-card": {
      const ctx = S.idealCtx; if (!ctx) break;
      const st = new Map(statsFor(ctx.range, ctx.cat).map((x) => [x.p.id, x]));
      const bySlot = [...document.querySelectorAll("#ideal-slots select")].map((sel) => sel.value ? { player_id: sel.value, rating: st.get(sel.value)?.avg != null ? Math.round(st.get(sel.value).avg * 10) / 10 : null, goals: st.get(sel.value)?.goals || 0 } : null);
      if (!bySlot.some(Boolean)) { toast("Elige al menos un jugador", true); break; }
      const card = await idealCard(S.data, { formation: ctx.formation, bySlot, kicker: ctx.cat || "Toda la cantera", title: "Once ideal", label: ctx.range.label, note: `Nota media del periodo · elegido por ${HANDLE}` });
      downloadCanvas(card, `once-ideal-${slug(ctx.range.label)}.png`);
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
  if (e.target.closest && e.target.closest("#stm-body .stm-row")) {
    const tr = e.target.closest(".stm-row"); tr.dataset.check = "0"; tr.classList.remove("warn");
    if (!document.querySelector("#stm-body .stm-row.warn")) $(".stm-warn")?.remove();
    return;
  }
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
  if (e.target.classList.contains("period-sel")) {
    const c = e.target.closest("form").querySelector(".custom"); if (c) c.hidden = e.target.value !== "custom";
    return;
  }
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
  if (e.target.id === "stc-photo" && e.target.files[0]) {
    const file = e.target.files[0], msg = $("#stc-photo-msg");
    msg.textContent = "Preparando el lector… (la primera vez tarda unos segundos)";
    try {
      const text = await readStandingsPhoto(file, (pct) => { const m = $("#stc-photo-msg"); if (m) m.textContent = `Leyendo la imagen… ${pct}%`; });
      const rows = mergeReadings(text.map((t) => parsePasted(t)).filter((r) => r.length));
      if (!rows.length) { const m = $("#stc-photo-msg"); if (m) m.textContent = "No he podido leer equipos en esa imagen. Prueba con una captura más nítida, solo de la tabla."; return; }
      collectManual();
      S.stEdit.rows = rows;
      renderStConfig();
      toast(`${rows.length} equipos leídos de la foto. Revisa los números antes de guardar`);
    } catch (err) { const m = $("#stc-photo-msg"); if (m) m.textContent = err.message; }
    return;
  }
  if (e.target.name === "rival_logo" && e.target.files[0]) {
    $("#rival-prev").innerHTML = `<img src="${URL.createObjectURL(e.target.files[0])}" alt="Nuevo escudo">`;
  }
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
        let rival_logo_url = old ? old.rival_logo_url || null : null;
        const rf = fd.get("rival_logo");
        if (fd.get("remove_rival_logo")) rival_logo_url = null;
        if (rf && rf.size) rival_logo_url = await S.store.uploadPhoto(await resizeImage(rf, 400, 0.92, "image/png"), "rivals");
        else if (!rival_logo_url && !fd.get("remove_rival_logo")) rival_logo_url = rivalLogoFor(fd.get("rival"));
        const data = {
          rival_logo_url, stadium: (fd.get("stadium") || "").trim() || null,
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
    if (f.id === "cx-rank") {
      const stat = fd.get("stat"), cat = fd.get("cat"), n = Number(fd.get("n")) || 5;
      const range = periodRange(fd.get("period"), cat, fd.get("from"), fd.get("to"));
      const val = (x) => stat === "ga" ? x.goals + x.assists : x[stat];
      const minPj = range.season ? 2 : 1;
      const list = statsFor(range, cat).filter((x) => stat === "avg" ? x.avg != null && x.rn >= minPj : val(x) > 0)
        .sort((a, b) => (val(b) ?? 0) - (val(a) ?? 0) || b.pj - a.pj).slice(0, n);
      const sub = (x) => stat === "avg" ? `${x.rn} partido${x.rn === 1 ? "" : "s"} puntuado${x.rn === 1 ? "" : "s"}`
        : stat === "ga" ? `${x.goals} goles · ${x.assists} asist.` : [`${x.pj} PJ`, cat ? null : x.p.category].filter(Boolean).join(" · ");
      const meta = STAT_OPTS.find((o) => o[0] === stat);
      const card = await rankingCard(S.data, { kicker: cat || "Toda la cantera", title: meta[2], label: range.label,
        rows: list.map((x) => ({ p: x.p, value: stat === "avg" ? fmtRating(x.avg) : val(x), sub: sub(x) })) });
      downloadCanvas(card, `ranking-${stat}-${slug(range.label)}.png`);
    }
    if (f.id === "cx-ideal") proposeIdeal(f);
    if (f.id === "cx-cmp") {
      const a = player(fd.get("a")), b = player(fd.get("b"));
      if (!a || !b || a.id === b.id) toast("Elige dos jugadores distintos", true);
      else {
        const range = periodRange(fd.get("period"), null, fd.get("from"), fd.get("to"));
        const all = new Map(statsFor(range, null).map((x) => [x.p.id, x]));
        const A = all.get(a.id), B = all.get(b.id);
        const rows = [["Partidos", "pj"], ["Minutos", "minutes"], ["Goles", "goals"], ["Asistencias", "assists"], ["Nota media", "avg"], ["MVP", "mvps"]]
          .map(([label, k]) => k === "avg" ? { label, a: A.avg ?? 0, b: B.avg ?? 0, fa: fmtRating(A.avg), fb: fmtRating(B.avg) } : { label, a: A[k] || 0, b: B[k] || 0 });
        if (range.season) rows.push({ label: "Tarjetas", a: A.cards || 0, b: B.cards || 0, lowerIsBetter: true });
        downloadCanvas(await compareCard(S.data, a, b, rows, range.label), `cara-a-cara-${slug(shortNameOf(a.id))}-${slug(shortNameOf(b.id))}.png`);
      }
    }
    if (f.id === "eventform") {
      const m = match(f.dataset.mid), type = f.dataset.type;
      const ev = { match_id: m.id, type, minute: num(fd.get("minute")), player_id: fd.get("player_id") || null, player2_id: fd.get("player2_id") || null, body: (fd.get("body") || "").trim() || null };
      if (type === "cambio" && (!ev.player_id || !ev.player2_id)) { toast("Elige quién sale y quién entra", true); }
      else if (ev.player2_id && ev.player2_id === ev.player_id) { toast("El asistente no puede ser el goleador", true); }
      else {
        closeModal();
        const msg = { gol: `¡Gol${ev.player_id ? " de " + shortNameOf(ev.player_id) : ""}!`, gol_rival: `Gol de ${m.rival}`, amarilla: `Amarilla a ${shortNameOf(ev.player_id)}`, roja: `Roja a ${shortNameOf(ev.player_id)}`, cambio: `Entra ${shortNameOf(ev.player2_id)}`, nota: "Comentario apuntado" }[type];
        await run(async () => { await S.store.addEvent(ev); await applyEvent(m, ev, 1); }, msg);
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
        allow_signup: !!fd.get("allow_signup"), private_mode: !!fd.get("private_mode"), home_stadium: (fd.get("home_stadium") || "").trim() || null,
      }); }, "Ajustes guardados");
    }
  } finally {
    btn && document.body.contains(btn) && (btn.disabled = false);
  }
});

$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
$("#modal").addEventListener("close", () => { if (S.pendingRender) { S.pendingRender = false; const y = window.scrollY; render(); window.scrollTo(0, y); } });

// ------------------------------------------------------------ router
function render() {
  const h = location.hash.replace(/^#\/?/, "");
  const [route, id] = h.split("/");
  const views = { "": viewHome, jugadores: viewPlayers, partidos: viewMatches, ajustes: viewSettings, usuarios: viewUsers, estadisticas: viewStats, contenido: viewContent, clasificacion: viewStandings };
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
  if (route === "clasificacion") loadStandingsBox();
  if (route === "") loadHomeStanding();
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
    S.store.subscribe(() => softRefresh());
    updateInstallUI();
    setInterval(tickClocks, 10000);
    setInterval(() => {
      if (document.visibilityState !== "visible" || S.store.realtime) return;
      if (S.data.matches.some((m) => isLive(m))) softRefresh();
    }, 20000);
  } catch (e) {
    console.error(e);
    window.__canteraOk = true;
    const msg = /relation .* does not exist|schema cache|Could not find the table/i.test(e.message) ? `${e.message} → Falta ejecutar supabase/schema.sql en el SQL Editor.`
      : /Invalid API key|No API key|JWT/i.test(e.message) ? `${e.message} → La clave de js/config.js no es correcta.` : e.message;
    main.innerHTML = `<section class="band"><div class="panel"><h1>No se pudo cargar la web</h1><p>${esc(msg)}</p>
      <p class="muted">Revisa la configuración de Supabase en <code>js/config.js</code> y que hayas ejecutado <code>supabase/schema.sql</code>.</p></div></section>`;
  }
})();
