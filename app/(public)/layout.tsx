import { SiteHeader } from "@/components/public/site-header";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <footer className="border-t py-6">
        <p className="mx-auto w-full max-w-5xl px-4 text-xs text-muted-foreground">
          ALV SPORT — el sistema operativo de tu liga.
        </p>
      </footer>
    </div>
  );
}
