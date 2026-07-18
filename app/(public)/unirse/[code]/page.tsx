import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/public/bits";
import { TeamJoinForm } from "@/components/signup/team-join-form";
import { resolveTeamInvite } from "@/lib/signup/team-invite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unirme a un equipo",
  robots: { index: false },
};

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function UnirsePage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const { ok, error } = await searchParams;
  const invite = await resolveTeamInvite(code);

  if (!invite) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <EmptyState>
          Este link de invitación no es válido o expiró. Pídele a tu coach que
          te comparta uno nuevo, o{" "}
          <Link href="/inscribirse?tipo=player" className="text-brand-amber hover:underline">
            regístrate aquí
          </Link>
          .
        </EmptyState>
      </main>
    );
  }

  const tint = invite.teamColor ?? "#666";

  return (
    <main className="stagger mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <section
        className="card-elevated relative flex items-center gap-4 overflow-hidden rounded-2xl px-5 py-6"
        style={{ backgroundImage: `linear-gradient(120deg, ${tint}2e 0%, transparent 60%)` }}
      >
        <span
          aria-hidden
          className="absolute -top-16 -left-16 size-48 rounded-full blur-3xl"
          style={{ backgroundColor: `${tint}22` }}
        />
        <span
          aria-hidden
          className="relative flex size-14 shrink-0 items-center justify-center rounded-full border font-display text-2xl"
          style={{ backgroundColor: `${tint}26`, borderColor: `${tint}66`, boxShadow: `0 0 26px ${tint}33` }}
        >
          {invite.teamName.slice(0, 1)}
        </span>
        <div className="relative flex min-w-0 flex-col">
          <p className="text-xs font-bold tracking-[0.18em] text-brand-amber uppercase">
            Invitación de equipo
          </p>
          <h1 className="font-display text-2xl leading-tight sm:text-3xl">
            Únete a {invite.teamName}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {invite.leagueName} · {invite.seasonName}
          </p>
        </div>
      </section>

      {ok ? (
        <section
          aria-live="polite"
          className="card-elevated relative overflow-hidden rounded-2xl border-brand-amber/30 p-6 text-center"
        >
          <span className="bg-brand-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
          <p className="text-4xl" aria-hidden>
            ✅
          </p>
          <h2 className="font-display mt-2 text-2xl">¡Listo!</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Tu solicitud para unirte a {invite.teamName} quedó registrada. Tu
            coach la confirma y ya estarás en el roster.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-brand-silver/25 px-4 text-sm hover:bg-muted"
          >
            Ver la liga
          </Link>
        </section>
      ) : (
        <section className="card-elevated flex flex-col gap-4 rounded-2xl p-4 sm:p-6">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-sm text-brand-red"
            >
              {error}
            </p>
          )}
          <TeamJoinForm code={code} teamName={invite.teamName} />
        </section>
      )}
    </main>
  );
}
