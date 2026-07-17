"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Seguir" a un equipo: pide permiso de notificaciones, se suscribe a push
 * (VAPID) y guarda la suscripción en el servidor. Incluye preferencias por
 * tipo de aviso y el banner para iPhone (push solo con PWA instalada).
 */

interface FollowTeamProps {
  teamId: string;
  teamName: string;
}

interface SubscriptionState {
  following: boolean;
  notifyStart: boolean;
  notifyPeriod: boolean;
  notifyFinal: boolean;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone))
  );
}

export function FollowTeam({ teamId, teamName }: FollowTeamProps) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [supported, setSupported] = useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vapidKey) return;
    const pushSupported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(pushSupported);
    setIosNeedsInstall(isIOS() && !isStandalone());
    if (!pushSupported) return;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          setState({ following: false, notifyStart: true, notifyPeriod: true, notifyFinal: true });
          return;
        }
        const response = await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
        );
        const data = (await response.json()) as {
          found: boolean;
          teams?: string[];
          notifyStart?: boolean;
          notifyPeriod?: boolean;
          notifyFinal?: boolean;
        };
        setState({
          following: Boolean(data.found && data.teams?.includes(teamId)),
          notifyStart: data.notifyStart ?? true,
          notifyPeriod: data.notifyPeriod ?? true,
          notifyFinal: data.notifyFinal ?? true,
        });
      } catch {
        setState({ following: false, notifyStart: true, notifyPeriod: true, notifyFinal: true });
      }
    })();
  }, [vapidKey, teamId]);

  const follow = useCallback(async () => {
    if (!vapidKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          "Sin permiso de notificaciones. Actívalo en la configuración del navegador.",
        );
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        }));
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), teamId }),
      });
      if (!response.ok) throw new Error("No se pudo guardar la suscripción");
      setState((current) => ({
        following: true,
        notifyStart: current?.notifyStart ?? true,
        notifyPeriod: current?.notifyPeriod ?? true,
        notifyFinal: current?.notifyFinal ?? true,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo activar");
    } finally {
      setBusy(false);
    }
  }, [vapidKey, teamId]);

  const unfollow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint, teamId }),
        });
      }
      setState((current) => (current ? { ...current, following: false } : current));
    } catch {
      setError("No se pudo dejar de seguir");
    } finally {
      setBusy(false);
    }
  }, [teamId]);

  const updatePrefs = useCallback(
    async (prefs: Pick<SubscriptionState, "notifyStart" | "notifyPeriod" | "notifyFinal">) => {
      setState((current) => (current ? { ...current, ...prefs } : current));
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        await fetch("/api/push/subscribe", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint, ...prefs }),
        });
      } catch {
        // Silencioso: las prefs se re-sincronizan en la próxima visita.
      }
    },
    [],
  );

  // Sin VAPID configurado, la sección no existe.
  if (!vapidKey) return null;

  return (
    <section aria-label="Notificaciones" className="flex flex-col gap-2">
      {iosNeedsInstall && (
        <p className="rounded-lg border border-brand-amber/40 bg-brand-amber/10 px-3 py-2 text-xs">
          📱 En iPhone las notificaciones solo llegan con la app instalada:
          abre este sitio en Safari → Compartir → <strong>Agregar a inicio</strong>,
          y sigue al equipo desde la app.
        </p>
      )}
      {!supported ? (
        <p className="text-xs text-muted-foreground">
          Este navegador no soporta notificaciones push.
        </p>
      ) : state === null ? null : !state.following ? (
        <button
          type="button"
          onClick={() => void follow()}
          disabled={busy}
          className="min-h-12 self-start rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60"
        >
          {busy ? "Activando…" : `🔔 Seguir a ${teamName}`}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Siguiendo a {teamName}</span>
            <button
              type="button"
              onClick={() => void unfollow()}
              disabled={busy}
              className="min-h-10 rounded-lg border px-3 text-xs text-muted-foreground hover:bg-muted"
            >
              Dejar de seguir
            </button>
          </div>
          <fieldset className="flex flex-wrap gap-2 text-xs">
            <legend className="sr-only">Tipos de notificación</legend>
            {(
              [
                ["notifyStart", "Inicio de partido"],
                ["notifyPeriod", "Fin de periodo"],
                ["notifyFinal", "Resultado final"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 has-checked:border-brand-amber/60 has-checked:bg-secondary"
              >
                <input
                  type="checkbox"
                  checked={state[key]}
                  onChange={(event) =>
                    void updatePrefs({
                      notifyStart: state.notifyStart,
                      notifyPeriod: state.notifyPeriod,
                      notifyFinal: state.notifyFinal,
                      [key]: event.target.checked,
                    })
                  }
                  className="accent-[var(--brand-amber)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
