// Función de Vercel: consulta API-Football con la clave secreta (variable APIFOOTBALL_KEY)
// y devuelve SOLO ligas y clasificaciones de España. Vercel guarda la respuesta en caché
// para gastar muy pocas peticiones del plan gratuito.
const BASE = "https://v3.football.api-sports.io";

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cache) res.setHeader("Cache-Control", cache);
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) return send(res, 501, { error: "no_key", message: "Falta configurar la variable APIFOOTBALL_KEY en Vercel." });
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);

  const call = async (path) => {
    const r = await fetch(BASE + path, { headers: { "x-apisports-key": key } });
    const j = await r.json();
    const errs = j.errors ? (Array.isArray(j.errors) ? j.errors : Object.values(j.errors)) : [];
    if (errs.length) throw new Error(errs.join(" "));
    return j.response || [];
  };

  try {
    if (q.type === "leagues") {
      // La API no permite combinar país y búsqueda: se piden todas las de España y se filtra aquí
      const r = await call(`/leagues?country=Spain`);
      const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const STOP = new Set(["de", "la", "el", "del", "liga", "division", "grupo", "futbol"]);
      const tokens = norm(q.search).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
      const alias = (n) => { const x = norm(n); return `${x} ${x.replace(/rfef/g, "federacion")} ${x.replace(/federacion/g, "rfef")} ${x.replace(/u19|sub-?19/g, "juvenil")}`; };
      const list = r.filter((x) => x.country && x.country.name === "Spain")
        .filter((x) => !tokens.length || tokens.every((t) => alias(x.league.name).includes(t === "federacion" ? "federacion" : t)))
        .map((x) => ({
          id: x.league.id, name: x.league.name, type: x.league.type, logo: x.league.logo,
          seasons: (x.seasons || []).map((se) => ({ year: se.year, current: !!se.current, standings: !!(se.coverage && se.coverage.standings) })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      return send(res, 200, { leagues: list }, "public, s-maxage=86400, stale-while-revalidate=604800");
    }

    if (q.type === "standings") {
      const league = parseInt(q.league, 10), season = parseInt(q.season, 10);
      if (!league || !season) return send(res, 400, { error: "params", message: "Faltan liga o temporada." });
      const r = await call(`/standings?league=${league}&season=${season}`);
      const L = r[0] && r[0].league;
      if (!L) return send(res, 200, { league: null, groups: [], fetched_at: new Date().toISOString() }, "public, s-maxage=1800");
      if (L.country !== "Spain") return send(res, 403, { error: "not_spain", message: "Solo se permiten ligas de España." });
      return send(res, 200, {
        league: { id: L.id, name: L.name, logo: L.logo, season: L.season },
        groups: (L.standings || []).map((g) => g.map((t) => ({
          rank: t.rank, team: t.team && t.team.name, logo: t.team && t.team.logo, group: t.group,
          pts: t.points, gd: t.goalsDiff, form: t.form, desc: t.description,
          pj: t.all.played, g: t.all.win, e: t.all.draw, p: t.all.lose, gf: t.all.goals.for, gc: t.all.goals.against,
        }))),
        fetched_at: new Date().toISOString(),
      }, "public, s-maxage=7200, stale-while-revalidate=86400");
    }

    return send(res, 400, { error: "type", message: "Petición no válida." });
  } catch (e) {
    return send(res, 502, { error: "api", message: e.message || "Error al consultar la API" }, "public, s-maxage=300");
  }
};
