import type { Metadata } from "next";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import { Pager } from "@/components/admin/pagination";
import { requireAdmin } from "@/lib/admin/auth";

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
  return name ?? row.record_id ?? "";
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
        <Feedback error="La auditoría solo está disponible para administradores de la organización." />
      </main>
    );
  }

  let query = context.supabase
    .from("audit_log")
    .select("id, action, table_name, record_id, actor_id, created_at, before, after", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (tabla) query = query.eq("table_name", tabla);
  if (accion) query = query.eq("action", accion);
  const { data, count } = await query;
  const rows = (data ?? []) as unknown as AuditRow[];
  const total = count ?? rows.length;

  const tables = [
    "seasons", "divisions", "teams", "players", "rosters", "games",
    "game_assignments", "game_lineups", "registrations", "sanctions",
    "news", "sponsors", "venues", "courts",
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle>Auditoría</AdminTitle>
      <p className="text-sm text-muted-foreground">
        Toda mutación administrativa queda registrada por triggers de la base
        (quién, qué, antes/después). {total} movimientos en total.
      </p>

      <form className="flex flex-wrap gap-2" action="/admin/auditoria">
        <select name="tabla" defaultValue={tabla} className={`${inputClass} w-auto`}>
          <option value="">Todas las tablas</option>
          {tables.map((table) => (
            <option key={table} value={table}>
              {table}
            </option>
          ))}
        </select>
        <select name="accion" defaultValue={accion} className={`${inputClass} w-auto`}>
          <option value="">Todas las acciones</option>
          <option value="insert">Creación</option>
          <option value="update">Modificación</option>
          <option value="delete">Eliminación</option>
        </select>
        <SubmitButton>Filtrar</SubmitButton>
      </form>

      {rows.length === 0 ? (
        <EmptyRow>Sin movimientos con esos filtros.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <span
                className={`w-20 shrink-0 text-xs font-semibold ${
                  row.action === "delete"
                    ? "text-destructive"
                    : row.action === "insert"
                      ? "text-brand-silver"
                      : "text-brand-amber"
                }`}
              >
                {actionLabels[row.action] ?? row.action}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono text-xs text-muted-foreground">{row.table_name}</span>{" "}
                {summarize(row)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {dateFormat.format(new Date(row.created_at))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        baseHref="/admin/auditoria"
        params={{ tabla, accion }}
      />
    </main>
  );
}
