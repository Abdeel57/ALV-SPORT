import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Serwist inyecta el service worker vía webpack: `next build` NO debe usar
// --turbopack (el dev server sí puede; el SW está deshabilitado en dev).
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // La página offline se precachea para servir de fallback sin red.
  additionalPrecacheEntries: [{ url: "/offline", revision: null }],
});

// Fotos y logos viven en Supabase Storage. En autoalojado (Railway/Kong) el
// host público sale de NEXT_PUBLIC_SUPABASE_URL, que existe en build (ver
// Dockerfile); sin él en la lista, el optimizador responde 400 a esas imágenes.
const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

const nextConfig: NextConfig = {
  // Hay lockfiles ajenos arriba en el árbol (C:\Users\Admin): fijar la raíz.
  outputFileTracingRoot: process.cwd(),
  // Railway: imagen mínima con server.js autocontenido (ver Dockerfile).
  output: "standalone",
  experimental: {
    serverActions: {
      // Las fotos suben desde teléfonos vía Server Actions (escudos, fotos de
      // jugador, imágenes de noticia). El default de Next es 1 MB: mataba la
      // petición ANTES de la validación propia de 4 MB (uploadImage), y el
      // usuario veía la página de error en vez de un mensaje claro. El tope
      // real por archivo lo sigue poniendo uploadImage; esto solo evita que
      // el transporte rechace el formulario.
      bodySizeLimit: "25mb",
    },
  },
  images: {
    // Formatos modernos: el optimizador sirve AVIF/WebP con fallback automático.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      ...(storageUrl
        ? [
            {
              protocol: storageUrl.protocol === "http:" ? ("http" as const) : ("https" as const),
              hostname: storageUrl.hostname,
              ...(storageUrl.port ? { port: storageUrl.port } : {}),
            },
          ]
        : []),
      { protocol: "https" as const, hostname: "**.supabase.co" },
      { protocol: "https" as const, hostname: "**.supabase.in" },
    ],
  },
};

export default withSerwist(nextConfig);
