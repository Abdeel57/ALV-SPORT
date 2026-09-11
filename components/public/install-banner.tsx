"use client";

import { Share, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

/** Evento no estándar de instalación de PWA (Chromium). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "alv:install-banner:dismissed-at";
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Invitación a instalar el sitio como app (solo móvil, solo en navegador).
 * Instalada, la PWA abre sin barra de direcciones ni pestañas: esa es la
 * diferencia real entre "página" y "app". En Chrome/Android dispara el
 * prompt nativo; en iOS explica "Compartir → Agregar a inicio". Cerrarla la
 * silencia dos semanas (preferencia de vista, no estado crítico).
 */
export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || recentlyDismissed()) return;

    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    setIsIOS(ios);
    if (ios) setVisible(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Sin almacenamiento: solo se cierra en esta página.
    }
    setVisible(false);
  };

  const install = () => {
    if (promptEvent) {
      void promptEvent.prompt();
      void promptEvent.userChoice.then((choice) => {
        if (choice.outcome === "accepted") setVisible(false);
        setPromptEvent(null);
      });
      return;
    }
    if (isIOS) setShowIOSHint((value) => !value);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:hidden">
      <div className="card-elevated flex flex-col gap-2 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Instalar ALV SPORT</p>
            <p className="truncate text-xs text-muted-foreground">Sin navegador, a un toque.</p>
          </div>
          <button
            type="button"
            onClick={install}
            aria-expanded={isIOS ? showIOSHint : undefined}
            className="min-h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-transform motion-safe:active:scale-95"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar"
            className="-mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {showIOSHint && (
          <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
            En Safari, toca <Share className="inline size-3.5 align-text-bottom" aria-hidden />{" "}
            <span className="font-medium text-foreground">Compartir</span> y luego{" "}
            <span className="font-medium text-foreground">“Agregar a inicio”</span>.
          </p>
        )}
      </div>
    </div>
  );
}
