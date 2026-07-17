import Link from "next/link";

interface PagerProps {
  page: number;
  total: number;
  pageSize: number;
  baseHref: string;
  /** Filtros activos que deben sobrevivir al cambiar de página. */
  params?: Record<string, string>;
}

function hrefFor(baseHref: string, params: Record<string, string>, page: number): string {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== ""),
  );
  if (page > 1) search.set("p", String(page));
  const query = search.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

export function Pager({ page, total, pageSize, baseHref, params = {} }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const linkClass =
    "flex min-h-11 items-center rounded-lg border px-4 text-sm text-muted-foreground hover:bg-muted";
  const disabledClass =
    "flex min-h-11 items-center rounded-lg border px-4 text-sm text-muted-foreground/40";

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Paginación">
      {page > 1 ? (
        <Link href={hrefFor(baseHref, params, page - 1)} className={linkClass}>
          ← Anteriores
        </Link>
      ) : (
        <span className={disabledClass}>← Anteriores</span>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(baseHref, params, page + 1)} className={linkClass}>
          Siguientes →
        </Link>
      ) : (
        <span className={disabledClass}>Siguientes →</span>
      )}
    </nav>
  );
}
