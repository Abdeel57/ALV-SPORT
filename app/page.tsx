import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <h1 className="font-display text-6xl tracking-tight sm:text-7xl">
        ALV <span className="text-brand-silver">Sport</span>
      </h1>
      <div className="bg-brand-gradient h-1 w-40 rounded-full" aria-hidden />
      <p className="max-w-sm text-center text-muted-foreground">
        El sistema operativo de tu liga: calendario, marcadores en vivo,
        estadísticas y tablas de posiciones.
      </p>
      <Button variant="outline" render={<Link href="/demo" />}>
        Ver demo con datos seed
      </Button>
    </main>
  );
}
