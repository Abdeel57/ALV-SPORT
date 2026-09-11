import { ExternalLink, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InstallAppButton } from "@/components/admin/install-app";
import { navGroups } from "@/components/admin/nav-items";
import { AdminTitle } from "@/components/admin/ui";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Más" };

/** Menú completo en móvil: las mismas secciones de la barra lateral. */
export default function MasPage() {
  const groups = navGroups.filter((group) => group.label !== "General");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Más</AdminTitle>

      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase">{group.label}</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-14 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-brand-amber" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-label="Enlaces" className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase">Enlaces</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <li>
            <Link href="/anotador" className="flex min-h-14 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
              <PenLine className="size-4 shrink-0 text-brand-amber" aria-hidden />
              Mesa de anotación
            </Link>
          </li>
          <li>
            <Link href="/" className="flex min-h-14 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
              <ExternalLink className="size-4 shrink-0 text-brand-amber" aria-hidden />
              Sitio público
            </Link>
          </li>
        </ul>
      </section>

      <section aria-label="Sesión" className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
        <InstallAppButton />
        <SignOutButton className="flex min-h-11 items-center gap-2 rounded-lg border px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" />
      </section>
    </main>
  );
}
