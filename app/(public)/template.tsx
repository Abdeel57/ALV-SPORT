/**
 * Se vuelve a montar en cada navegación: la clase `page-enter` anima la
 * entrada de la vista (desvanecido + leve subida), como el cambio de pantalla
 * de una app. Sin animación con prefers-reduced-motion.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
