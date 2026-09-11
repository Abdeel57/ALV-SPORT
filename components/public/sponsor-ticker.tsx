"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { PublicSponsor } from "@/lib/data/extras";

/**
 * Barra de patrocinador pegada al borde inferior. No vive ahí siempre:
 * sube unos segundos cada minuto con un patrocinador distinto (principales
 * y oficiales, en orden) y vuelve a bajar. Cerrarla la apaga por el resto
 * de la visita (sessionStorage: es una preferencia de vista, no estado
 * crítico). Con reduced-motion aparece y desaparece sin deslizar.
 */

const FIRST_DELAY_MS = 10_000;
const INTERVAL_MS = 60_000;
const VISIBLE_MS = 8_000;
const EXIT_MS = 260;
const DISMISS_KEY = "alv:sponsor-bar:dismissed";

type Phase = "hidden" | "in" | "out";

function wasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Sin almacenamiento (modo privado): solo se cierra en esta página.
  }
}

export function SponsorTicker({ sponsors }: { sponsors: PublicSponsor[] }) {
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (sponsors.length === 0 || wasDismissed()) return;
    setEnabled(true);
  }, [sponsors.length]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const schedule = (fn: () => void, ms: number) => {
      timer = setTimeout(fn, ms);
    };
    const hide = () => {
      if (cancelled) return;
      setPhase("out");
      schedule(() => {
        setPhase("hidden");
        setIndex((current) => current + 1);
        schedule(show, INTERVAL_MS - VISIBLE_MS - EXIT_MS);
      }, EXIT_MS);
    };
    const show = () => {
      if (cancelled) return;
      // En una pestaña en segundo plano no vale la pena gastar el turno.
      if (document.hidden) {
        schedule(show, 5_000);
        return;
      }
      setPhase("in");
      schedule(hide, VISIBLE_MS);
    };
    schedule(show, FIRST_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  if (!enabled || phase === "hidden") return null;
  const sponsor = sponsors[index % sponsors.length];
  if (!sponsor) return null;

  const dismiss = () => {
    rememberDismissed();
    setEnabled(false);
    setPhase("hidden");
  };

  const body = (
    <>
      {sponsor.logoUrl ? (
        <Image
          src={sponsor.logoUrl}
          alt=""
          width={200}
          height={48}
          className="logo-glow h-9 w-auto max-w-32 shrink-0 object-contain"
        />
      ) : null}
      <span className="font-display min-w-0 truncate text-base sm:text-lg">{sponsor.name}</span>
      {sponsor.linkUrl && (
        <span className="ml-auto hidden shrink-0 text-xs text-brand-amber sm:inline">Visitar →</span>
      )}
    </>
  );
  const bodyClass = "flex min-w-0 flex-1 items-center gap-3";

  return (
    <div
      role="complementary"
      aria-label={`Patrocinador: ${sponsor.name}`}
      className={`fixed inset-x-0 bottom-0 z-40 ${phase === "in" ? "sponsor-bar-in" : "sponsor-bar-out"}`}
    >
      <div className="border-t border-brand-silver/15 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgb(0_0_0/0.45)] backdrop-blur-md">
        <span className="bg-brand-gradient block h-px opacity-60" aria-hidden />
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <span className="hidden shrink-0 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase sm:inline">
            Patrocinador
          </span>
          {sponsor.linkUrl ? (
            <a
              href={sponsor.linkUrl}
              target="_blank"
              rel="noreferrer sponsored"
              className={`${bodyClass} rounded-lg transition-opacity hover:opacity-90`}
            >
              {body}
            </a>
          ) : (
            <div className={bodyClass}>{body}</div>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar patrocinador"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
