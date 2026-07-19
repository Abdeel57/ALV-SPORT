"use client";

import { useMemo, useState } from "react";
import { submitSignup } from "@/lib/signup/actions";
import type { OpenSeason, SeasonTeam } from "@/lib/signup/data";

type Kind = "coach" | "player";

// text-base en móvil evita el zoom de iOS al enfocar; sm:text-sm en ≥640px.
const inputClass =
  "h-12 w-full rounded-lg border border-brand-silver/20 bg-surface/70 px-3.5 text-base sm:text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-brand-amber/60";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function PathButton({
  active,
  onClick,
  emoji,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`sheen relative flex flex-1 flex-col items-start gap-1 overflow-hidden rounded-xl border p-4 text-left transition-all ${
        active
          ? "border-brand-amber/70 bg-brand-amber/[0.06] shadow-[inset_0_-2px_0_var(--brand-amber)]"
          : "border-brand-silver/15 bg-surface/50 hover:border-brand-silver/35"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="font-display text-lg leading-none">{title}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}

export function SignupForm({
  seasons,
  teams,
  defaultKind,
}: {
  seasons: OpenSeason[];
  teams: SeasonTeam[];
  defaultKind: Kind;
}) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [seasonId, setSeasonId] = useState<string>(seasons[0]?.seasonId ?? "");
  const [color, setColor] = useState<string>("#2563EB");

  const seasonTeams = useMemo(
    () => teams.filter((team) => team.seasonId === seasonId),
    [teams, seasonId],
  );

  return (
    <form action={submitSignup} className="flex flex-col gap-5">
      {/* Honeypot anti-spam: oculto para humanos. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">¿Cómo te quieres registrar?</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PathButton
            active={kind === "coach"}
            onClick={() => setKind("coach")}
            emoji="📋"
            title="Coach / Capitán"
            subtitle="Inscribe a tu equipo a la liga"
          />
          <PathButton
            active={kind === "player"}
            onClick={() => setKind("player")}
            emoji="🏅"
            title="Jugador"
            subtitle="Únete a un equipo o busca uno"
          />
        </div>
      </div>

      <Field label="Liga / temporada">
        <select
          name="seasonId"
          required
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Selecciona a qué liga te inscribes
          </option>
          {seasons.map((season) => (
            <option key={season.seasonId} value={season.seasonId}>
              {season.leagueName} — {season.seasonName} ({season.sportName})
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === "coach" ? "Tu nombre (coach)" : "Tu nombre"}>
          <input
            name="fullName"
            required
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Nombre y apellido"
            className={inputClass}
          />
        </Field>
        <Field label="Correo">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            placeholder="tu@correo.com"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="WhatsApp / teléfono" hint="opcional, para contactarte más rápido">
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="55 1234 5678"
          className={inputClass}
        />
      </Field>

      {kind === "coach" ? (
        <div className="grid gap-4 rounded-xl border border-brand-silver/15 bg-surface/40 p-4 sm:grid-cols-[1fr_auto]">
          <Field label="Nombre del equipo">
            <input
              name="teamName"
              required
              placeholder="Ej. Águilas del Valle"
              className={inputClass}
            />
          </Field>
          <Field label="Color" hint="del uniforme">
            <div className="flex h-12 items-center gap-2 rounded-lg border border-brand-silver/20 bg-surface/70 px-3">
              <input
                type="color"
                name="teamColor"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="size-8 cursor-pointer rounded border-0 bg-transparent"
                aria-label="Color del equipo"
              />
              <span className="font-mono text-xs text-muted-foreground uppercase tabular-nums">
                {color}
              </span>
            </div>
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 rounded-xl border border-brand-silver/15 bg-surface/40 p-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Field label="¿A qué equipo te quieres unir?" hint="si aún no tienes, elige “Busco equipo”">
              <select name="preferredTeamId" defaultValue="" className={inputClass}>
                <option value="">🔎 Busco equipo (agente libre)</option>
                {seasonTeams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Posición" hint="opcional">
            <input name="position" placeholder="Ej. Pitcher" className={inputClass} />
          </Field>
          <Field label="Número" hint="opcional">
            <input
              name="jerseyNumber"
              inputMode="numeric"
              maxLength={4}
              placeholder="00"
              className={inputClass}
            />
          </Field>
        </div>
      )}

      <Field label="Mensaje" hint="opcional">
        <textarea
          name="message"
          rows={3}
          placeholder={
            kind === "coach"
              ? "Cuéntanos de tu equipo: cuántos jugadores, experiencia previa…"
              : "Cuéntanos tu experiencia, disponibilidad, etc."
          }
          className={`${inputClass} min-h-24 py-3`}
        />
      </Field>

      <button
        type="submit"
        className="group relative mt-1 flex min-h-13 items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-gradient px-6 py-3.5 font-display text-lg text-black transition-transform active:scale-[0.99]"
      >
        {kind === "coach" ? "Inscribir mi equipo" : "Enviar mi registro"}
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Al enviar, la liga recibe tu solicitud y te contacta para confirmar. No
        creas cuenta ni pagas nada en este paso.
      </p>
    </form>
  );
}
