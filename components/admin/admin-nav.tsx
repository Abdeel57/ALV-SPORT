"use client";

import {
  Ban,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  type LucideIcon,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MoreHorizontal,
  Newspaper,
  ScrollText,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

/**
 * Navegación del panel: barra inferior fija en móvil (4 destinos, targets
 * grandes), top bar de marca en móvil y sidebar agrupada en desktop.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const primary: readonly NavItem[] = [
  { href: "/admin", label: "Panel", icon: LayoutDashboard },
  { href: "/admin/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/admin/equipos", label: "Equipos", icon: Users },
  { href: "/admin/mas", label: "Más", icon: MoreHorizontal },
];

const groups: readonly { label: string; items: readonly NavItem[] }[] = [
  {
    label: "General",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/calendario", label: "Calendario", icon: CalendarDays },
    ],
  },
  {
    label: "Competencia",
    items: [
      { href: "/admin/equipos", label: "Equipos", icon: Users },
      { href: "/admin/jugadores", label: "Jugadores", icon: UserRound },
      { href: "/admin/temporadas", label: "Temporadas y divisiones", icon: Trophy },
      { href: "/admin/sedes", label: "Sedes y canchas", icon: MapPin },
    ],
  },
  {
    label: "Inscripciones",
    items: [
      { href: "/admin/solicitudes", label: "Solicitudes de registro", icon: ClipboardCheck },
      { href: "/admin/inscripciones", label: "Inscripciones y pagos", icon: CreditCard },
      { href: "/admin/sanciones", label: "Sanciones", icon: Ban },
    ],
  },
  {
    label: "Contenido",
    items: [
      { href: "/admin/noticias", label: "Noticias", icon: Newspaper },
      { href: "/admin/patrocinadores", label: "Patrocinadores", icon: Megaphone },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/admin/auditoria", label: "Auditoría", icon: ScrollText }],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/** Chip de marca "Panel" reutilizado en sidebar y top bar móvil. */
function PanelChip() {
  return (
    <span className="rounded-full border border-brand-silver/25 bg-brand-silver/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-silver">
      Panel
    </span>
  );
}

export function AdminMobileTopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md lg:hidden">
      <Link href="/admin" aria-label="ALV SPORT — Panel" className="shrink-0 leading-none">
        <BrandLogo className="h-6" />
      </Link>
      <PanelChip />
    </header>
  );
}

export function AdminBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación del panel"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden"
    >
      <div className="bg-brand-gradient h-px w-full opacity-50" aria-hidden />
      <ul className="grid grid-cols-4">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-brand-amber" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="bg-brand-gradient absolute top-0 h-0.5 w-9 rounded-full"
                  />
                )}
                <Icon className="size-5" aria-hidden strokeWidth={active ? 2.4 : 2} />
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
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/30 lg:flex">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-4">
        <Link href="/admin" className="shrink-0 leading-none" aria-label="ALV SPORT — Panel">
          <BrandLogo className="h-7" />
        </Link>
        <PanelChip />
      </div>
      <div className="bg-brand-gradient mx-5 h-px opacity-30" aria-hidden />

      <nav
        aria-label="Secciones"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3"
      >
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    active
                      ? "bg-secondary font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="bg-brand-gradient absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full"
                    />
                  )}
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active
                        ? "text-brand-amber"
                        : "text-muted-foreground/80 group-hover:text-foreground",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          Ver sitio público
        </Link>
      </div>
    </aside>
  );
}
