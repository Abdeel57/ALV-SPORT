// Demo de voleibol en producción SOLO con configuración: inserta el
// deporte (config jsonb), una liga publicada, 2 equipos con roster y un
// partido finalizado cuyo ganador se decide por SETS (3-2) aunque anotó
// MENOS puntos totales que el rival. Cero cambios al motor.
const { Client } = require("pg");
const path = require("path");

// La config se genera desde el MISMO módulo del repo (fuente única):
// se ejecuta con tsx desde el root, así que require del TS no aplica aquí;
// el JSON viene precompilado por scripts/print-volleyball-config.ts.
const config = JSON.parse(process.env.VOLLEY_CONFIG_JSON);

const ADMIN = "c99d3222-b4ab-4c6e-85c5-1b3b5d5ff955";
const setScores = [
  [25, 20],
  [20, 25],
  [25, 23],
  [10, 25],
  [15, 10],
]; // local (Águilas) gana 3-2 con 95 puntos vs 103 del rival

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  await client.connect();
  try {
    await client.query("begin");
    const org = "01000000-0000-4000-8000-000000000001";

    const { rows: existing } = await client.query(
      "select id from public.leagues where slug = 'voleibol' and organization_id = $1",
      [org],
    );
    if (existing.length > 0) {
      console.log("La liga de voleibol ya existe; nada que hacer.");
      await client.query("rollback");
      return;
    }

    const sport = (
      await client.query(
        `insert into public.sports (key, name, config, organization_id)
         values ('volleyball', 'Voleibol', $1::jsonb, null)
         on conflict (key) do update set config = excluded.config
         returning id`,
        [JSON.stringify(config)],
      )
    ).rows[0].id;

    const league = (
      await client.query(
        `insert into public.leagues (organization_id, sport_id, name, slug, is_published)
         values ($1, $2, 'Liga de Voleibol del Valle', 'voleibol', true) returning id`,
        [org, sport],
      )
    ).rows[0].id;
    const season = (
      await client.query(
        `insert into public.seasons (league_id, name, status, starts_on, ends_on)
         values ($1, 'Temporada Verano 2026', 'active', '2026-07-01', '2026-09-30') returning id`,
        [league],
      )
    ).rows[0].id;
    const division = (
      await client.query(
        `insert into public.divisions (season_id, name) values ($1, 'Única') returning id`,
        [season],
      )
    ).rows[0].id;

    const teams = {};
    for (const [name, slug, color] of [
      ["Águilas Voley", "aguilas-voley", "#0EA5E9"],
      ["Escorpiones Voley", "escorpiones-voley", "#EA580C"],
    ]) {
      teams[slug] = (
        await client.query(
          `insert into public.teams (organization_id, division_id, name, slug, color)
           values ($1, $2, $3, $4, $5) returning id`,
          [org, division, name, slug, color],
        )
      ).rows[0].id;
      for (let i = 1; i <= 6; i += 1) {
        const player = (
          await client.query(
            `insert into public.players (organization_id, first_name, last_name)
             values ($1, $2, $3) returning id`,
            [org, `Jugador${i}`, name.split(" ")[0]],
          )
        ).rows[0].id;
        await client.query(
          `insert into public.rosters (team_id, player_id, jersey_number, position)
           values ($1, $2, $3, 'JU')`,
          [teams[slug], player, String(i)],
        );
      }
    }

    const home = teams["aguilas-voley"];
    const away = teams["escorpiones-voley"];
    const game = (
      await client.query(
        `insert into public.games (season_id, division_id, home_team_id, away_team_id, scheduled_at, status, finalized_at)
         values ($1, $2, $3, $4, '2026-07-12T19:00:00Z', 'finalized', '2026-07-12T21:00:00Z') returning id`,
        [season, division, home, away],
      )
    ).rows[0].id;

    // Eventos punto por punto (opponent_error no requiere jugador).
    let ts = new Date("2026-07-12T19:00:00Z").getTime();
    for (let setIndex = 0; setIndex < setScores.length; setIndex += 1) {
      const [homePoints, awayPoints] = setScores[setIndex];
      for (let i = 0; i < homePoints; i += 1) {
        ts += 20000;
        await client.query(
          `insert into public.game_events (game_id, team_id, event_type, period, created_by, created_at)
           values ($1, $2, 'opponent_error', $3, $4, $5)`,
          [game, home, setIndex + 1, ADMIN, new Date(ts).toISOString()],
        );
      }
      for (let i = 0; i < awayPoints; i += 1) {
        ts += 20000;
        await client.query(
          `insert into public.game_events (game_id, team_id, event_type, period, created_by, created_at)
           values ($1, $2, 'opponent_error', $3, $4, $5)`,
          [game, away, setIndex + 1, ADMIN, new Date(ts).toISOString()],
        );
      }
    }

    await client.query("commit");
    // Fuera de la transacción: derivar caché (sets) + refrescar standings.
    await client.query("select public.rederive_game_score($1)", [game]);
    const { rows: check } = await client.query(
      `select g.home_score, g.away_score,
              (select json_agg(json_build_object('team', ps.team_name, 'w', ps.wins, 'l', ps.losses, 'pts', ps.points))
               from public.public_standings ps where ps.league_id = $2) as tabla
       from public.games g where g.id = $1`,
      [game, league],
    );
    console.log("Partido (marcador cacheado, debe ser 3-2 en SETS):", JSON.stringify(check[0]));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
