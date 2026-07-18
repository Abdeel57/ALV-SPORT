import type { GameAiContext, GameAiInput, PlayerPerformance } from "./context";
import { storySchema, type AiStory } from "./schema";

/**
 * Generador de crónicas DETERMINISTA — sin IA ni dependencias externas.
 * Arma título, resumen (2-3 párrafos), MVP y jugador destacado a partir de
 * los datos ya calculados por el motor (marcador, línea por periodo,
 * actuaciones, récords). Nunca inventa un dato: solo redacta los reales.
 * Función pura y testeable, igual que el resto de `lib/engine`.
 */

function statLabels(input: GameAiInput): Map<string, string> {
  return new Map(input.config.playerStatDefs.map((def) => [def.key, def.label]));
}

/** "3 Carreras, 2 Hits" a partir de la línea del jugador. */
function renderLine(line: Record<string, number>, labels: Map<string, string>): string {
  const parts = Object.entries(line)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${value} ${labels.get(key) ?? key}`);
  return parts.length > 0 ? parts.join(", ") : "sin estadísticas registradas";
}

interface Outcome {
  tie: boolean;
  winnerName: string;
  loserName: string;
  winnerCmp: number;
  loserCmp: number;
  byPeriods: boolean;
  winnerPts: number;
  loserPts: number;
}

function resolveOutcome(input: GameAiInput, context: GameAiContext): Outcome {
  const { config, game } = input;
  const byPeriods = config.standings.winnerBy === "periods_won";
  const { home, away } = context.lineScore;
  const homeCmp = byPeriods
    ? home.filter((value, i) => value > (away[i] ?? 0)).length
    : context.homeScore;
  const awayCmp = byPeriods
    ? away.filter((value, i) => value > (home[i] ?? 0)).length
    : context.awayScore;

  const homeWon = homeCmp > awayCmp;
  return {
    tie: homeCmp === awayCmp,
    winnerName: homeWon ? game.homeName : game.awayName,
    loserName: homeWon ? game.awayName : game.homeName,
    winnerCmp: Math.max(homeCmp, awayCmp),
    loserCmp: Math.min(homeCmp, awayCmp),
    byPeriods,
    winnerPts: homeWon ? context.homeScore : context.awayScore,
    loserPts: homeWon ? context.awayScore : context.homeScore,
  };
}

export function buildRecap(input: GameAiInput, context: GameAiContext): AiStory {
  const { game } = input;
  const labels = statLabels(input);
  const outcome = resolveOutcome(input, context);
  const where = `la ${game.leagueName}`;

  // --- Título ---
  const titulo = outcome.tie
    ? `${game.awayName} y ${game.homeName} empatan ${context.awayScore}-${context.homeScore}`
    : `${outcome.winnerName} vence a ${outcome.loserName} ${outcome.winnerCmp}-${outcome.loserCmp}`;

  // --- Párrafo 1: el resultado ---
  const margin = outcome.winnerCmp - outcome.loserCmp;
  const tone = outcome.byPeriods
    ? margin <= 1
      ? " en una serie muy cerrada"
      : ""
    : margin <= 2
      ? " en un final cerrado"
      : margin >= 10
        ? " con autoridad"
        : "";

  let p1: string;
  if (outcome.tie) {
    p1 = `${game.awayName} y ${game.homeName} igualaron ${context.awayScore}-${context.homeScore} en ${where} (${game.seasonName}). Un duelo parejo que se fue sin ganador.`;
  } else if (outcome.byPeriods) {
    p1 = `${outcome.winnerName} se impuso ${outcome.winnerCmp} sets a ${outcome.loserCmp} sobre ${outcome.loserName} en ${where} (${game.seasonName})${tone}. En puntos totales, ${outcome.winnerName} sumó ${outcome.winnerPts} y ${outcome.loserName} ${outcome.loserPts}.`;
  } else {
    p1 = `${outcome.winnerName} se impuso ${outcome.winnerPts}-${outcome.loserPts} a ${outcome.loserName} en ${where} (${game.seasonName})${tone}.`;
  }

  // --- MVP y destacado (de las actuaciones ya ordenadas por impacto) ---
  const performances = context.performances;
  const mvpPerf: PlayerPerformance | undefined =
    performances.find((p) => !outcome.tie && p.team === outcome.winnerName) ?? performances[0];
  const destPerf = performances.find((p) => p.playerId !== mvpPerf?.playerId);

  // --- Párrafo 2: actuaciones ---
  let p2: string;
  if (mvpPerf) {
    p2 = `En lo individual, ${mvpPerf.name} fue la figura por ${mvpPerf.team} con ${renderLine(mvpPerf.line, labels)}.`;
    if (destPerf) {
      p2 += ` También destacó ${destPerf.name} (${destPerf.team}) con ${renderLine(destPerf.line, labels)}.`;
    }
  } else {
    p2 = `El desenlace se definió en el marcador colectivo; no se capturaron estadísticas individuales en esta ocasión.`;
  }

  // --- Párrafo 3: récords (si los hay) ---
  const record = context.records[0];
  const p3 = record
    ? `Además, ${record.playerName} firmó una marca de temporada con ${record.value} ${record.statLabel}, superando el registro previo de ${record.previousMax} de ${record.previousHolder}.`
    : null;

  const resumen = [p1, p2, p3].filter(Boolean).join("\n\n");

  // --- MVP / destacado estructurados ---
  const mvp = mvpPerf
    ? {
        nombre: mvpPerf.name,
        justificacion: `${renderLine(mvpPerf.line, labels)} para ${mvpPerf.team}.`,
      }
    : {
        nombre: outcome.tie ? "Reparto de puntos" : outcome.winnerName,
        justificacion: outcome.tie
          ? `Empate ${context.awayScore}-${context.homeScore}.`
          : `Triunfo de equipo ${outcome.winnerCmp}-${outcome.loserCmp}.`,
      };

  const destacado = destPerf
    ? {
        nombre: destPerf.name,
        razon: `${renderLine(destPerf.line, labels)} para ${destPerf.team}.`,
      }
    : {
        nombre: outcome.tie ? game.homeName : outcome.loserName,
        razon: "Aporte colectivo del equipo en el marcador.",
      };

  return storySchema.parse({ titulo: titulo.slice(0, 160), resumen, mvp, destacado });
}
