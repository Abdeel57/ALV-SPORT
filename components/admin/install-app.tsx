"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Evento no estándar de instalación de PWA (Chromium). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Botón "Instalar app" para el panel de administrador. En Chrome/Android
 * dispara el prompt nativo (instala la PWA ALV Panel, que abre directo en
 * /admin). En iOS/Safari —que no soporta el prompt— muestra las instrucciones
 * de "Compartir → Agregar a inicio". Se oculta si ya corre como app instalada.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS marca las apps instaladas con navigator.standalone.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);

    const ua = window.navigator.userAgent;
    setIsIOS(/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Ya instalada: nada que mostrar.
  if (standalone) return null;

  // Chrome/Android: prompt nativo disponible.
  if (promptEvent) {
    return (
      <button
        type="button"
        onClick={() => {
          void promptEvent.prompt();
          void promptEvent.userChoice.finally(() => setPromptEvent(null));
        }}
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-amber/50 bg-brand-amber/10 px-3 text-sm font-medium text-brand-amber transition-colors hover:bg-brand-amber/15",
          className,
        )}
      >
        <Download className="size-4 shrink-0" aria-hidden />
        Instalar app del panel
      </button>
    );
  }

  // iOS/Safari: sin prompt nativo, se instala desde el menú Compartir.
  if (isIOS) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <button
          type="button"
          onClick={() => setShowIOSHint((value) => !value)}
          aria-expanded={showIOSHint}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-amber/50 bg-brand-amber/10 px-3 text-sm font-medium text-brand-amber transition-colors hover:bg-brand-amber/15"
        >
          <Share className="size-4 shrink-0" aria-hidden />
          Instalar app del panel
        </button>
        {showIOSHint && (
          <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
            En Safari, toca <Share className="inline size-3.5 align-text-bottom" aria-hidden />{" "}
            <span className="font-medium text-foreground">Compartir</span> y luego{" "}
            <span className="font-medium text-foreground">“Agregar a inicio”</span>.
          </p>
        )}
      </div>
    );
  }

  // Otros navegadores / aún sin cumplir criterios: no forzamos nada.
  return null;
}
