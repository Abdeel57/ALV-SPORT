import type { Metadata } from "next";
import { AdminTitle, EmptyRow, Feedback, GhostButton, inputClass } from "@/components/admin/ui";
import { Pager } from "@/components/admin/pagination";
import { requireAdmin } from "@/lib/admin/auth";
import { join, sql, type SqlQuery } from "@/lib/db";

export const metadata: Metadata = { title: "Auditoría" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface AuditRow {
  id: number;
  action: string;
  table_name: string;
  record_id: string | null;
  actor_id: string | null;
  created_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const actionLabels: Record<string, string> = {
  insert: "Creó",
  update: "Modificó",
  delete: "Eliminó",
};

const tableLabels: Record<string, string> = {
  organizations: "organización",
  organization_members: "miembros",
  leagues: "ligas",
  seasons: "temporadas",
  divisions: "divisiones",
  teams: "equipos",
  players: "jugadores",
  rosters: "rosters",
  games: "partidos",
  game_assignments: "asignaciones",
  game_lineups: "alineaciones",
  registrations: "inscripciones",
  sanctions: "sanciones",
  news: "noticias",
  sponsors: "patrocinadores",
  venues: "sedes",
  courts: "campos",
  team_stat_imports: "estadísticas importadas",
};

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function summarize(row: AuditRow): string {
  const source = row.after ?? row.before;
  if (!source) return row.record_id ?? "";
  const name =
    (source.name as string | undefined) ??
    (source.title as string | undefined) ??
    ([source.first_name, source.last_name].filter(Boolean).join(" ") || undefined);
  return name ?? row.record_id?.slice(0, 8) ?? "";
}

interface PageProps {
  searchParams: Promise<{ tabla?: string; accion?: string; error?: string; p?: string }>;
}

export default async function AuditoriaPage({ searchParams }: PageProps) {
  const { tabla = "", accion = "", p } = await searchParams;
  const page = Math.max(1, Number.parseInt(p ?? "1", 10) || 1);
  const context = await requireAdmin();
  if (!context) return null;
  if (context.role !== "org_admin") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Feedback error="La auditoría solo está disponible para administradores." />
      </main>
    );
  }

  const filters = [
    tabla ? sql`table_name = ${tabla}` : null,
    accion ? sql`action = ${accion}` : null,
  ].filter((part): part is SqlQuery => part !== null);
  const where = filters.length > 0 ? join(filters, " and ") : sql`true`;

  const [rows, totalRow] = await Promise.all([
    context.db.rows<AuditRow>(sql`
      select id, action::text as action, table_name, record_id, actor_id, created_at, before, after
        from public.audit_log
       where ${where}
       order by created_at desc
       limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
    `),
    context.db.one<{ total: number }>(sql`select count(*)::int as total from public.audit_log where ${where}`),
  ]);
  const total = totalRow.total;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={total} subtitle="Quién cambió qué, registrado por la base de datos">
        Auditoría
      </AdminTitle>

      <form className="flex flex-wrap gap-2" action="/admin/auditoria">
        <select name="tabla" defaultValue={tabla} className={`${inputClass} min-h-11 w-auto`} aria-label="Sección">
          <option value="">Todas las secciones</option>
          {Object.entries(tableLabels).map(([table, label]) => (
            <option key={table} value={table}>
              {label}
            </option>
          ))}
        </select>
        <select name="accion" defaultValue={accion} className={`${inputClass} min-h-11 w-auto`} aria-label="Acción">
          <option value="">Todas las acciones</option>
          <option value="insert">Creación</option>
          <option value="update">Modificación</option>
          <option value="delete">Eliminación</option>
        </select>
        <GhostButton>Filtrar</GhostButton>
      </form>

      {rows.length === 0 ? (
        <EmptyRow>Sin movimientos con esos filtros.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <span
                className={`w-16 shrink-0 text-xs font-semibold ${
                  row.action === "delete" ? "text-destructive" : row.action === "insert" ? "text-brand-silver" : "text-brand-amber"
                }`}
              >
                {actionLabels[row.action] ?? row.action}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="text-xs text-muted-foreground">{tableLabels[row.table_name] ?? row.table_name}</span> {summarize(row)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dateFormat.format(new Date(row.created_at))}</span>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} total={total} pageSize={PAGE_SIZE} baseHref="/admin/auditoria" params={{ tabla, accion }} />
    </main>
  );
}
