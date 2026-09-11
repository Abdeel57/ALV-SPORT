"use client";

import { Eye, EyeOff, LoaderCircle, Lock, Mail, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { signInAction, type LoginState } from "@/lib/auth/actions";

const INITIAL: LoginState = { error: null };

const fieldClass =
  "min-h-11 w-full rounded-lg border border-input bg-background/40 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-60";
const iconClass =
  "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground";
const labelClass =
  "text-xs font-medium tracking-wide text-muted-foreground uppercase";

/**
 * Formulario de acceso. La contraseña se manda por POST a una Server Action
 * y nunca llega al bundle del navegador ningún cliente de base de datos.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="stagger flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass}>
          Correo
        </label>
        <div className="relative">
          <Mail className={iconClass} aria-hidden />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            placeholder="tucorreo@ejemplo.com"
            disabled={pending}
            aria-invalid={Boolean(state.error)}
            className={`${fieldClass} pl-10`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelClass}>
          Contraseña
        </label>
        <div className="relative">
          <Lock className={iconClass} aria-hidden />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={pending}
            aria-invalid={Boolean(state.error)}
            className={`${fieldClass} pr-11 pl-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={pending}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </p>
      )}

      <Button
        type="submit"
        className="sheen mt-1 min-h-11 w-full font-medium"
        disabled={pending}
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
