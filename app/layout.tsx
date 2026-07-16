import type { Metadata, Viewport } from "next";
import { Inter, Kanit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Display de marca: itálica condensada bold (Kanit tiene itálicas reales;
// Saira Condensed no las ofrece en Google Fonts).
const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "ALV SPORT",
    template: "%s | ALV SPORT",
  },
  description:
    "El sistema operativo de tu liga: calendario, marcadores en vivo, estadísticas y tablas de posiciones.",
  applicationName: "ALV SPORT",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "ALV SPORT",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  colorScheme: "dark",
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
