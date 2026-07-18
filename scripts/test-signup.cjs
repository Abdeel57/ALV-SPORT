// Prueba del intake público de auto-registro contra producción, con el
// ANON key (como lo haría un visitante). Verifica: leer temporadas abiertas,
// enviar una solicitud vía RPC, y que la vista pública NO exponga los datos.
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
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  // 1. Un visitante lee las temporadas abiertas (sin sesión).
  const seasons = await rest("public_open_seasons?select=season_id,season_name,league_name&limit=1");
  console.log("temporadas abiertas visibles a anon:", seasons.status, Array.isArray(seasons.body) ? seasons.body.length : seasons.body);
  const season = Array.isArray(seasons.body) ? seasons.body[0] : null;
  if (!season) throw new Error("No hay temporadas abiertas para probar");
  console.log("  →", season.league_name, "/", season.season_name);

  // 2. Envía una solicitud de coach vía la función (único camino de escritura).
  const submit = await rest("rpc/submit_signup_request", {
    method: "POST",
    body: JSON.stringify({
      p_season: season.season_id,
      p_kind: "coach",
      p_full_name: "Prueba Auto QA",
      p_email: "qa-signup@audit.alvsport.test",
      p_phone: "5555555555",
      p_team_name: "Equipo de Prueba QA",
      p_team_color: "#22c55e",
      p_message: "Solicitud de prueba automatizada",
    }),
  });
  console.log("enviar solicitud (coach):", submit.status, submit.body);

  // 3. Un visitante NO debe poder leer la bandeja de solicitudes (privacidad).
  const leak = await rest("signup_requests?select=id,email&limit=5");
  console.log("¿anon puede leer signup_requests?", leak.status, "→", leak.status === 200 && Array.isArray(leak.body) ? `${leak.body.length} filas (FUGA si >0)` : "bloqueado/ok");

  // 4. Antiabuso: una segunda con datos inválidos debe fallar.
  const bad = await rest("rpc/submit_signup_request", {
    method: "POST",
    body: JSON.stringify({
      p_season: season.season_id,
      p_kind: "coach",
      p_full_name: "X",
      p_email: "no-es-correo",
      p_team_name: "Y",
    }),
  });
  console.log("solicitud inválida (debe fallar):", bad.status, typeof bad.body === "object" ? bad.body.message : bad.body);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
