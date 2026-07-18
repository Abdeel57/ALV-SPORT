"use client";

import { submitTeamJoin } from "@/lib/signup/actions";

const inputClass =
  "h-12 w-full rounded-lg border border-brand-silver/20 bg-surface/70 px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-brand-amber/60";

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

export function TeamJoinForm({ code, teamName }: { code: string; teamName: string }) {
  return (
    <form action={submitTeamJoin} className="flex flex-col gap-4">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <input type="hidden" name="code" value={code} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tu nombre">
          <input name="fullName" required placeholder="Nombre y apellido" className={inputClass} />
        </Field>
        <Field label="Correo">
          <input type="email" name="email" required placeholder="tu@correo.com" className={inputClass} />
        </Field>
      </div>

      <Field label="WhatsApp / teléfono" hint="opcional">
        <input name="phone" inputMode="tel" placeholder="55 1234 5678" className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Posición" hint="opcional">
          <input name="position" placeholder="Ej. Pitcher" className={inputClass} />
        </Field>
        <Field label="Número" hint="opcional">
          <input name="jerseyNumber" maxLength={4} placeholder="00" className={inputClass} />
        </Field>
      </div>

      <Field label="Mensaje" hint="opcional">
        <textarea
          name="message"
          rows={2}
          placeholder="Algo que tu coach deba saber…"
          className={`${inputClass} min-h-20 py-3`}
        />
      </Field>

      <button
        type="submit"
        className="group mt-1 flex min-h-13 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3.5 font-display text-lg text-black transition-transform active:scale-[0.99]"
      >
        Unirme a {teamName}
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Tu coach confirma tu ingreso. No creas cuenta ni pagas nada aquí.
      </p>
    </form>
  );
}
