import type { Metadata, Viewport } from "next";
import { Inter, Kanit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Display de marca: itálica condensada bold (Kanit tiene itálicas reales;
// Saira Condensed no las ofrece en Google Fonts).
// Solo se usan dos variantes reales: 700 itálica (utility `font-display`:
// títulos, marcadores, nombres) y 700 normal (CardTitle vía `font-heading`).
// Antes se cargaban 6 archivos (600/700/800 × normal/itálica); ahora 2.
const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin"],
  weight: ["700"],
  style: ["normal", "italic"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const description =
  "El sistema operativo de tu liga: calendario, marcadores en vivo, estadísticas y tablas de posiciones.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ALV SPORT",
    template: "%s | ALV SPORT",
  },
  description,
  applicationName: "ALV SPORT",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "ALV SPORT",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: "ALV SPORT",
    title: "ALV SPORT",
    description,
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "ALV SPORT" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ALV SPORT",
    description,
    images: ["/brand/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Permite que el contenido llegue bajo la muesca/barra de gestos en modo PWA;
  // el padding de áreas seguras (env(safe-area-inset-*)) lo compensa en headers y nav.
  viewportFit: "cover",
  // NO fijamos maximumScale/userScalable: el zoom por accesibilidad debe seguir
  // disponible. El zoom molesto al enfocar campos se evita con font-size ≥16px.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-MX"
      className={`dark ${inter.variable} ${kanit.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
