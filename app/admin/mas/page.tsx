import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Más" };

const sections = [
  { href: "/admin/jugadores", label: "Jugadores", detail: "Altas, fotos y rosters" },
  { href: "/admin/temporadas", label: "Temporadas y divisiones", detail: "Estructura de la competencia" },
  { href: "/admin/sedes", label: "Sedes y canchas", detail: "Dónde se juega" },
  { href: "/admin/inscripciones", label: "Inscripciones y pagos", detail: "Mercado Pago y efectivo" },
  { href: "/admin/sanciones", label: "Sanciones", detail: "Suspensiones por jugador" },
  { href: "/admin/noticias", label: "Noticias", detail: "Editor y publicación" },
  { href: "/admin/patrocinadores", label: "Patrocinadores", detail: "Logos y posiciones" },
  { href: "/admin/auditoria", label: "Auditoría", detail: "Quién cambió qué (solo org_admin)" },
  { href: "/anotador", label: "Mesa de anotación", detail: "Ir a la mesa" },
  { href: "/", label: "Sitio público", detail: "Ver como aficionado" },
] as const;

export default function MasPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle>Más secciones</AdminTitle>
      <ul className="flex flex-col gap-2">
        {sections.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="flex min-h-16 flex-col justify-center gap-0.5 rounded-xl border px-4 transition-colors hover:bg-muted"
            >
              <span className="text-sm font-semibold">{section.label}</span>
              <span className="text-xs text-muted-foreground">{section.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
