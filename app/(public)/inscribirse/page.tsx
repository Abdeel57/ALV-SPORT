import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, SectionTitle } from "@/components/public/bits";
import { SignupForm } from "@/components/signup/signup-form";
import { getSignupOptions } from "@/lib/signup/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inscríbete",
  description:
    "Regístrate como coach para inscribir a tu equipo, o como jugador para unirte a un equipo de la liga.",
};

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; tipo?: string }>;
}

const steps = [
  { n: 1, label: "Envías tu solicitud", detail: "Sin cuenta ni pago." },
  { n: 2, label: "La liga te contacta", detail: "Confirman tus datos." },
  { n: 3, label: "Quedas dentro", detail: "Tu equipo o registro se activa." },
];

export default async function InscribirsePage({ searchParams }: PageProps) {
  const { ok, error, tipo } = await searchParams;
  const options = await getSignupOptions();
  const defaultKind = tipo === "player" ? "player" : "coach";

  return (
    <main className="stagger mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-bold tracking-[0.2em] text-brand-amber uppercase">
          Únete a la liga
        </p>
        <h1 className="font-display text-4xl leading-[0.95] sm:text-5xl">
          Inscríbete en un minuto
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          ¿Traes equipo o buscas dónde jugar? Regístrate tú mismo — sin filas,
          sin llenar hojas de papel. La liga recibe tu solicitud al instante.
        </p>
      </header>

      {/* Cómo funciona */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.n}
            className="card-elevated flex items-center gap-3 rounded-xl px-3.5 py-3"
          >
            <span
              aria-hidden
              className="font-display flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-black"
            >
              {step.n}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold leading-tight">{step.label}</span>
              <span className="truncate text-xs text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {ok ? (
        <section
          aria-live="polite"
          className="card-elevated relative overflow-hidden rounded-2xl border-brand-amber/30 p-6 text-center"
        >
          <span className="bg-brand-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
          <p className="text-4xl" aria-hidden>
            ✅
          </p>
          <h2 className="font-display mt-2 text-2xl">¡Solicitud enviada!</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            La liga recibió tu registro y te contactará muy pronto por correo o
            WhatsApp para confirmar los detalles. No necesitas hacer nada más.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/inscribirse"
              className="flex min-h-11 items-center rounded-lg border border-brand-silver/25 px-4 text-sm hover:bg-muted"
            >
              Registrar a alguien más
            </Link>
            <Link
              href="/"
              className="flex min-h-11 items-center rounded-lg border border-brand-silver/25 px-4 text-sm hover:bg-muted"
            >
              Volver al inicio
            </Link>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <SectionTitle>Tu registro</SectionTitle>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-sm text-brand-red"
            >
              {error}
            </p>
          )}
          {!options.available ? (
            <EmptyState>
              El auto-registro se activa cuando el sitio está conectado a la
              base de datos (no en el modo demo local).
            </EmptyState>
          ) : options.seasons.length === 0 ? (
            <EmptyState>
              Todavía no hay ligas abiertas a inscripción. Vuelve pronto — o
              escríbele a la organización de tu liga.
            </EmptyState>
          ) : (
            <div className="card-elevated rounded-2xl p-4 sm:p-6">
              <SignupForm
                seasons={options.seasons}
                teams={options.teams}
                defaultKind={defaultKind}
              />
            </div>
          )}
        </section>
      )}
    </main>
  );
}
