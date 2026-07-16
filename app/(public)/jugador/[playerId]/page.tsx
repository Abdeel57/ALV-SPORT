import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, SectionTitle } from "@/components/public/bits";
import { getPublicData } from "@/lib/data";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ playerId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { playerId } = await params;
  const profile = await getPublicData().getPlayerProfile(playerId);
  return {
    title: profile ? profile.name : "Jugador no encontrado",
    description: profile
      ? `${profile.name} — estadísticas de la temporada con ${profile.team.name}.`
      : undefined,
  };
}

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "America/Mexico_City",
});

/** Gráfica simple de rendimiento por jornada (SVG puro, sin librerías). */
function PerformanceChart({
  values,
  labels,
  statLabel,
  color,
}: {
  values: number[];
  labels: string[];
  statLabel: string;
  color: string;
}) {
  const width = 640;
  const height = 180;
  const pad = 24;
  const max = Math.max(1, ...values);
  const barGap = 8;
  const barWidth =
    values.length === 0
      ? 0
      : (width - pad * 2 - barGap * (values.length - 1)) / values.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`${statLabel} por jornada: ${values.join(", ")}`}
    >
      {values.map((value, index) => {
        const barHeight = (value / max) * (height - pad * 2);
        const x = pad + index * (barWidth + barGap);
        const y = height - pad - barHeight;
        return (
          <g key={index}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(2, barHeight)}
              rx={3}
              fill={value > 0 ? color : "var(--muted)"}
              opacity={value > 0 ? 0.9 : 0.6}
            />
            <text
              x={x + barWidth / 2}
              y={y - 6}
              textAnchor="middle"
              fontSize="12"
              fill="var(--muted-foreground)"
              className="tabular-nums"
            >
              {value}
            </text>
            <text
              x={x + barWidth / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {labels[index] ?? ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function JugadorPage({ params }: PageProps) {
  const { playerId } = await params;
  const profile = await getPublicData().getPlayerProfile(playerId);

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <EmptyState>El jugador no existe o su liga no está publicada.</EmptyState>
      </main>
    );
  }

  const headline = profile.statDefs[0];
  const chartValues = profile.perGame.map(
    (line) => line.statLine[headline?.key ?? ""] ?? 0,
  );
  const chartLabels = profile.perGame.map((line) =>
    dateFormat.format(new Date(line.scheduledAt)),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <section
        className="flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-5 sm:px-6"
        style={{
          backgroundImage: `linear-gradient(120deg, ${profile.team.color ?? "#666"}26 0%, transparent 55%)`,
        }}
      >
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-full border font-display text-2xl tabular-nums"
          style={{
            backgroundColor: `${profile.team.color ?? "#666"}26`,
            borderColor: `${profile.team.color ?? "#666"}66`,
          }}
        >
          {profile.jerseyNumber ?? profile.name.slice(0, 1)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-3xl sm:text-4xl">{profile.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/equipo/${profile.team.slug}`} className="hover:underline">
              {profile.team.name}
            </Link>
            {profile.position ? ` · ${profile.position}` : ""} · {profile.league.name}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Temporada {profile.league.seasonName}</SectionTitle>
        {profile.perGame.length === 0 ? (
          <EmptyState>Este jugador aún no registra participación.</EmptyState>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {profile.statDefs.map((def) => (
              <div
                key={def.key}
                className="flex flex-col items-center gap-1 rounded-xl border bg-card px-2 py-3"
              >
                <span className="font-display text-2xl tabular-nums">
                  {profile.seasonTotals[def.key] ?? 0}
                </span>
                <span className="text-center text-xs text-muted-foreground">
                  {def.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {headline && profile.perGame.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>{headline.label} por jornada</SectionTitle>
          <div className="rounded-xl border p-3">
            <PerformanceChart
              values={chartValues}
              labels={chartLabels}
              statLabel={headline.label}
              color={profile.team.color ?? "#F5A50B"}
            />
          </div>
        </section>
      )}

      {profile.perGame.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Juego por juego</SectionTitle>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Rival</th>
                  <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
                  {profile.statDefs.map((def) => (
                    <th scope="col" key={def.key} className="px-3 py-2 text-right font-medium">
                      {def.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {profile.perGame.map((line) => (
                  <tr key={line.gameId} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/partido/${line.gameId}`} className="hover:underline">
                        vs {line.opponentName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {dateFormat.format(new Date(line.scheduledAt))}
                    </td>
                    {profile.statDefs.map((def) => (
                      <td key={def.key} className="px-3 py-2 text-right">
                        {line.statLine[def.key] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
