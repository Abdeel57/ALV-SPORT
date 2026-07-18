"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";

/**
 * Navegación del panel: barra inferior fija en móvil (4 destinos, targets
 * grandes) y sidebar completa en desktop.
 */

const primary = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/calendario", label: "Calendario", icon: "▤" },
  { href: "/admin/equipos", label: "Equipos", icon: "◉" },
  { href: "/admin/mas", label: "Más", icon: "≡" },
] as const;

const all = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/calendario", label: "Calendario" },
  { href: "/admin/equipos", label: "Equipos" },
  { href: "/admin/jugadores", label: "Jugadores" },
  { href: "/admin/temporadas", label: "Temporadas y divisiones" },
  { href: "/admin/sedes", label: "Sedes y canchas" },
  { href: "/admin/solicitudes", label: "Solicitudes de registro" },
  { href: "/admin/inscripciones", label: "Inscripciones y pagos" },
  { href: "/admin/sanciones", label: "Sanciones" },
  { href: "/admin/noticias", label: "Noticias" },
  { href: "/admin/patrocinadores", label: "Patrocinadores" },
  { href: "/admin/auditoria", label: "Auditoría" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación del panel"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur lg:hidden"
    >
      <div className="bg-brand-gradient h-px w-full opacity-50" aria-hidden />
      <ul className="grid grid-cols-4">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                  active ? "text-brand-amber" : "text-muted-foreground"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r lg:flex">
      <div className="px-5 py-5">
        <Link href="/admin" className="block" aria-label="ALV SPORT — Panel">
          <BrandLogo className="h-7" />
        </Link>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="bg-brand-gradient h-0.5 w-8 rounded-full" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Panel
          </span>
        </div>
      </div>
      <nav aria-label="Secciones" className="flex flex-1 flex-col gap-0.5 px-3">
        {all.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-secondary font-semibold text-brand-amber"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="px-5 py-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          ← Ver sitio público
        </Link>
      </p>
    </aside>
  );
}
