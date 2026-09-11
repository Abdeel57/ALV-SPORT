import { BrandLogo } from "@/components/brand/brand-logo";
import { BismarkCredit } from "@/components/public/bismark-credit";
import { InstallBanner } from "@/components/public/install-banner";
import { MobileTabBar } from "@/components/public/mobile-tab-bar";
import { SiteHeader } from "@/components/public/site-header";
import { SponsorStrip } from "@/components/public/sponsor-strip";
import { SponsorTicker } from "@/components/public/sponsor-ticker";
import { getSponsors, tickerSponsors } from "@/lib/data/extras";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sponsors = await getSponsors();
  return (
    // En móvil el contenido deja sitio a la barra de pestañas inferior.
    <div className="flex min-h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <SiteHeader />
      <InstallBanner />
      <div className="flex-1">{children}</div>
      <footer className="relative mt-12 border-t border-white/5">
        <div className="bg-brand-gradient absolute inset-x-0 top-0 h-px opacity-40" aria-hidden />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
          <SponsorStrip sponsors={sponsors} />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <BrandLogo className="h-10" />
            <p className="text-xs text-muted-foreground">
              El sistema operativo de tu liga — inscripciones, calendario,
              anotación en vivo y estadísticas.
            </p>
          </div>
        </div>
        <BismarkCredit />
      </footer>
      <SponsorTicker sponsors={tickerSponsors(sponsors)} />
      <MobileTabBar />
    </div>
  );
}
