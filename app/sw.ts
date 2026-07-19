import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/*
 * Estrategia de caché ALV:
 *  - Shell y assets estáticos (JS/CSS/fuentes de _next/static): CacheFirst —
 *    llevan hash inmutable, así que una visita repetida no toca la red.
 *  - Imágenes (Storage/optimizador): StaleWhileRevalidate — pintan al instante
 *    desde caché y se refrescan en segundo plano.
 *  - Documentos/páginas (marcadores, tabla): NetworkFirst con timeout corto —
 *    priorizan datos frescos, pero caen a la última copia si no hay red.
 *  - Sin red y sin copia: fallback a /offline (precacheado).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/_next/static"),
      handler: new CacheFirst({
        cacheName: "alv-static-assets",
        plugins: [
          new ExpirationPlugin({ maxEntries: 240, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) =>
        sameOrigin && (request.destination === "style" || request.destination === "script" || request.destination === "font"),
      handler: new CacheFirst({
        cacheName: "alv-static-assets",
        plugins: [
          new ExpirationPlugin({ maxEntries: 240, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new StaleWhileRevalidate({
        cacheName: "alv-images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 }),
        ],
      }),
    },
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "alv-pages",
        networkTimeoutSeconds: 3,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// --- Web Push: mostrar la notificación (payload de lib/push/payloads) ---
interface AlvPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: AlvPushPayload;
  try {
    payload = event.data.json() as AlvPushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            void client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      },
    ),
  );
});
