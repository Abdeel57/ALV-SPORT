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

const nextConfig: NextConfig = {
  // Hay lockfiles ajenos arriba en el árbol (C:\Users\Admin): fijar la raíz.
  outputFileTracingRoot: process.cwd(),
  // Railway: imagen mínima con server.js autocontenido (ver Dockerfile).
  output: "standalone",
  images: {
    // Formatos modernos: el optimizador sirve AVIF/WebP con fallback automático.
    formats: ["image/avif", "image/webp"],
    // Fotos y logos suben a Supabase Storage; se permite ese host remoto.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
};

export default withSerwist(nextConfig);
