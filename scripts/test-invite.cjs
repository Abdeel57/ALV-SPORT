// Prueba del flujo de links de invitación con el ANON key.
const { Client } = require("pg");
const KONG = process.env.SUPABASE_URL;
const ANON = process.env.ANON_KEY;

async function rest(path, init = {}) {
  const res = await fetch(`${KONG}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  // Toma un código real de un equipo de liga publicada.
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await db.connect();
  const { rows } = await db.query(
    `select t.name, t.join_code from public.teams t
     join public.divisions d on d.id=t.division_id
     join public.seasons s on s.id=d.season_id
     join public.leagues l on l.id=s.league_id
     where l.is_published limit 1`,
  );
  await db.end();
  const team = rows[0];
  console.log("equipo de prueba:", team.name, "· código:", team.join_code);

  // 1. Resolver el código (lo que hace la página /unirse).
  const resolved = await rest("rpc/resolve_team_invite", {
    method: "POST",
    body: JSON.stringify({ p_code: team.join_code }),
  });
  console.log("resolver código:", resolved.status, Array.isArray(resolved.body) ? resolved.body[0] : resolved.body);

  // 2. Código inválido → sin fila.
  const bad = await rest("rpc/resolve_team_invite", {
    method: "POST",
    body: JSON.stringify({ p_code: "ZZZZZZ" }),
  });
  console.log("código inválido:", bad.status, Array.isArray(bad.body) ? `${bad.body.length} filas` : bad.body);

  // 3. Enviar la unión (jugador se auto-agrega al equipo).
  const join = await rest("rpc/submit_team_join", {
    method: "POST",
    body: JSON.stringify({
      p_code: team.join_code,
      p_full_name: "Jugador Invitado QA",
      p_email: "qa-invite@audit.alvsport.test",
      p_position: "Jardinero",
      p_jersey: "24",
    }),
  });
  console.log("enviar unión:", join.status, join.body);

  // 4. Verificar que quedó ligada al equipo correcto y limpiar.
  const db2 = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await db2.connect();
  const check = await db2.query(
    `select kind, preferred_team_id = $1 as ligada_al_equipo, jersey_number
     from public.signup_requests where email='qa-invite@audit.alvsport.test'`,
    [rows[0].join_code ? (await db2.query(`select id from public.teams where join_code=$1`, [team.join_code])).rows[0].id : null],
  );
  console.log("solicitud creada:", check.rows[0]);
  await db2.query("delete from public.signup_requests where email='qa-invite@audit.alvsport.test'");
  await db2.end();
  console.log("(limpieza ok)");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
