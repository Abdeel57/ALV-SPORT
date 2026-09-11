"use client";

import { BarChart3, Home, ListOrdered, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Barra de pestañas inferior del sitio público en móvil, al estilo de una app
 * nativa: siempre a la mano del pulgar, con estado activo y respuesta al
 * toque. En pantallas ≥640px la navegación vive en la cabecera.
 */
const TABS = [
  { href: "/", label: "Inicio", icon: Home, isActive: (path: string) => path === "/" },
  { href: "/tabla", label: "Tabla", icon: ListOrdered, isActive: (path: string) => path.startsWith("/tabla") },
  {
    href: "/estadisticas",
    label: "Estadísticas",
    icon: BarChart3,
    isActive: (path: string) => path.startsWith("/estadisticas"),
  },
  { href: "/buscar", label: "Buscar", icon: Search, isActive: (path: string) => path.startsWith("/buscar") },
] as const;

export function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  return (
    // El ::after prolonga el fondo por debajo del borde de la ventana: Safari en
    // iPhone sigue pintando la página unos píxeles más abajo, tras su barra de
    // direcciones semitransparente, y sin esto ahí se asomaba el contenido.
    <nav
      aria-label="Navegación"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md select-none after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-32 after:bg-background after:content-[''] sm:hidden"
    >
      <div className="bg-brand-gradient h-px w-full opacity-50" aria-hidden />
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium tracking-wide transition-[color,transform] duration-150 motion-safe:active:scale-[.92]",
                  active ? "text-brand-amber" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span aria-hidden className="bg-brand-gradient absolute top-0 h-0.5 w-8 rounded-full" />
                )}
                <Icon className="size-[22px]" aria-hidden strokeWidth={active ? 2.4 : 1.9} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
