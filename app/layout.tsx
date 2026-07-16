import type { Metadata, Viewport } from "next";
import { Inter, Saira_Condensed } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const saira = Saira_Condensed({
  variable: "--font-saira",
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
    <html lang="es-MX" className="dark">
      <body className={`${inter.variable} ${saira.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
