import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Carga de las vistas públicas: la pantalla de marca dentro del shell
 * público (el header queda fijo mientras llega el contenido).
 */
export default function Loading() {
  return <BrandLoader variant="seccion" />;
}
