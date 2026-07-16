import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Serwist inyecta el service worker vía webpack: `next build` NO debe usar
// --turbopack (el dev server sí puede; el SW está deshabilitado en dev).
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
