/**
 * Llamado a la acción de la portada: un solo botón de contacto (WhatsApp,
 * correo o enlace) configurado por la liga en el panel. Sin contacto
 * configurado no se muestra nada: mejor que un botón que no lleva a ningún
 * lado.
 */
export function JoinCta({ contactUrl }: { contactUrl: string | null }) {
  if (!contactUrl) return null;
  const isWhatsApp = /wa\.me|whatsapp/i.test(contactUrl);
  const isMail = /^mailto:/i.test(contactUrl);
  const external = /^https?:\/\//i.test(contactUrl);
  return (
    <section
      aria-labelledby="unete"
      className="card-elevated relative overflow-hidden rounded-2xl px-5 py-7 sm:px-8 sm:py-9"
    >
      <span className="bg-brand-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
      <span
        aria-hidden
        className="absolute -top-24 -right-16 size-64 rounded-full bg-brand-red/10 blur-3xl"
      />
      <span
        aria-hidden
        className="absolute -bottom-24 -left-16 size-64 rounded-full bg-brand-amber/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-md flex-col gap-2">
          <p className="text-xs font-bold tracking-[0.2em] text-brand-amber uppercase">
            Temporada abierta
          </p>
          <h2 id="unete" className="font-display text-3xl leading-[0.95] sm:text-4xl">
            ¿Quieres jugar esta temporada?
          </h2>
          <p className="text-sm text-muted-foreground">
            Escríbenos y te decimos cómo inscribir a tu equipo o unirte a uno.
          </p>
        </div>
        <div className="flex flex-col gap-2.5 sm:min-w-58">
          <a
            href={contactUrl}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className="sheen group flex items-center justify-between gap-3 rounded-xl bg-brand-gradient px-5 py-3.5 font-display text-lg text-black transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>{isWhatsApp ? "💬" : isMail ? "✉️" : "📞"}</span>
              {isWhatsApp ? "Contacto por WhatsApp" : "Contacto"}
            </span>
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
