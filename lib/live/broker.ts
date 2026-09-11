import "server-only";
import { Client } from "pg";
import { sql } from "@/lib/db/sql";
import { serviceDb } from "@/lib/db/session";
import { hasDatabaseEnv } from "@/lib/db/pool";

/**
 * Repartidor del marcador en vivo — el reemplazo del servicio Realtime.
 *
 * UNA sola conexión a Postgres escucha el canal `alv_live` para todo el
 * proceso. Cuando llega un aviso, se leen los eventos nuevos de ese partido
 * UNA vez y se reparten a todos los espectadores conectados por SSE.
 *
 * Por qué una sola lectura es correcta: la política RLS de game_events
 * autoriza POR PARTIDO, no por fila. Quien puede ver el partido ve todos
 * sus eventos, así que todos los suscriptores reciben exactamente lo mismo.
 * El permiso se verifica una vez, al suscribirse, con la identidad real de
 * quien mira (ver la ruta /api/live).
 */

export interface LiveEventRow {
  id: string;
  seq: number;
  game_id: string;
  team_id: string | null;
  player_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  period: number | null;
  clock_seconds: number | null;
  corrects_event_id: string | null;
  created_by: string;
  created_at: string;
}

export interface LiveUpdate {
  events: LiveEventRow[];
  status: string | null;
}

type Subscriber = (update: LiveUpdate) => void;

const CHANNEL = "alv_live";
const GLOBAL_KEY = "__alvSportLiveBroker";

interface GameState {
  subscribers: Set<Subscriber>;
  /** Último seq ya repartido; solo se leen los eventos posteriores. */
  lastSeq: number;
  /** Último estado repartido, para no repetir avisos redundantes. */
  lastStatus: string | null;
  /** Lectura en curso, para no disparar varias por el mismo aviso. */
  pending: Promise<void> | null;
}

class LiveBroker {
  private games = new Map<string, GameState>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private retryDelayMs = 1000;
  private closed = false;

  /**
   * Registra un espectador de un partido. `fromSeq` es el último evento que
   * ya tiene, para no reenviárselo.
   */
  subscribe(
    gameId: string,
    fromSeq: number,
    onUpdate: Subscriber,
  ): () => void {
    const state = this.games.get(gameId) ?? {
      subscribers: new Set<Subscriber>(),
      lastSeq: fromSeq,
      lastStatus: null,
      pending: null,
    };
    // Si otro espectador va más atrasado, se rebaja la marca para que la
    // siguiente lectura alcance a todos.
    state.lastSeq = Math.min(state.lastSeq, fromSeq);
    state.subscribers.add(onUpdate);
    this.games.set(gameId, state);

    void this.ensureListening();

    return () => {
      const current = this.games.get(gameId);
      if (!current) return;
      current.subscribers.delete(onUpdate);
      if (current.subscribers.size === 0) this.games.delete(gameId);
    };
  }

  private async ensureListening(): Promise<void> {
    if (this.client || this.connecting || this.closed) return;
    this.connecting = this.connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connect(): Promise<void> {
    if (!hasDatabaseEnv()) return;
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : false,
      application_name: "alv-sport-live",
    });

    client.on("notification", (message) => {
      if (message.channel !== CHANNEL || !message.payload) return;
      try {
        const parsed: unknown = JSON.parse(message.payload);
        if (typeof parsed !== "object" || parsed === null) return;
        const gameId = (parsed as { gameId?: unknown }).gameId;
        if (typeof gameId === "string") void this.refresh(gameId);
      } catch {
        // Aviso con formato inesperado: se ignora.
      }
    });

    client.on("error", () => {
      // La reconexión la maneja el cierre de abajo.
      void this.reconnect(client);
    });
    client.on("end", () => {
      void this.reconnect(client);
    });

    try {
      await client.connect();
      await client.query(`listen ${CHANNEL}`);
      this.client = client;
      this.retryDelayMs = 1000;
      // Tras reconectar puede haberse perdido algún aviso: se refrescan
      // todos los partidos que alguien esté mirando.
      for (const gameId of this.games.keys()) void this.refresh(gameId);
    } catch {
      this.client = null;
      void this.reconnect(client);
    }
  }

  private async reconnect(previous: Client): Promise<void> {
    if (this.closed) return;
    if (this.client && this.client !== previous) return;
    this.client = null;
    try {
      await previous.end();
    } catch {
      // Ya estaba cerrada.
    }
    if (this.games.size === 0) return;

    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(delay * 2, 30_000);
    setTimeout(() => {
      void this.ensureListening();
    }, delay);
  }

  /** Lee lo nuevo de un partido y lo reparte. Coalesce lecturas simultáneas. */
  private async refresh(gameId: string): Promise<void> {
    const state = this.games.get(gameId);
    if (!state || state.subscribers.size === 0) return;
    if (state.pending) return;

    state.pending = (async () => {
      try {
        const db = serviceDb();
        const [events, game] = await Promise.all([
          db.rows<LiveEventRow>(sql`
            select id, seq, game_id, team_id, player_id, event_type, payload,
                   period, clock_seconds, corrects_event_id, created_by, created_at
              from public.game_events
             where game_id = ${gameId} and seq > ${state.lastSeq}
             order by seq
          `),
          db.maybeOne<{ status: string }>(sql`
            select status::text as status from public.games where id = ${gameId} limit 1
          `),
        ]);

        const status = game?.status ?? null;
        const statusChanged = status !== null && status !== state.lastStatus;
        if (events.length === 0 && !statusChanged) return;

        const lastEvent = events[events.length - 1];
        if (lastEvent) state.lastSeq = lastEvent.seq;
        state.lastStatus = status;

        const update: LiveUpdate = { events, status: statusChanged ? status : null };
        for (const subscriber of state.subscribers) {
          try {
            subscriber(update);
          } catch {
            // Un espectador que ya cerró no debe afectar a los demás.
          }
        }
      } catch {
        // Un fallo de lectura no tumba el repartidor: el siguiente aviso
        // (o el latido de reconexión) vuelve a intentarlo.
      } finally {
        state.pending = null;
      }
    })();

    await state.pending;
  }
}

interface BrokerHolder {
  [GLOBAL_KEY]?: LiveBroker;
}

export function getLiveBroker(): LiveBroker {
  const holder = globalThis as unknown as BrokerHolder;
  const existing = holder[GLOBAL_KEY];
  if (existing) return existing;
  const broker = new LiveBroker();
  holder[GLOBAL_KEY] = broker;
  return broker;
}
