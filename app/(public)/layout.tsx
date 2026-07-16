import { SiteHeader } from "@/components/public/site-header";
import { SponsorStrip } from "@/components/public/sponsor-strip";
import { getSponsors } from "@/lib/data/extras";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const footerSponsors = await getSponsors("footer");
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <footer className="flex flex-col gap-4 border-t px-4 py-6">
        <div className="mx-auto w-full max-w-5xl">
          <SponsorStrip sponsors={footerSponsors} />
        </div>
        <p className="mx-auto w-full max-w-5xl text-xs text-muted-foreground">
          ALV SPORT — el sistema operativo de tu liga.
        </p>
      </footer>
    </div>
  );
}
