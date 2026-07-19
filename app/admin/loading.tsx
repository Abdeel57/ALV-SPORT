import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Carga del panel: aparece dentro del shell del admin (sidebar/nav quedan
 * fijos) mientras la página consulta datos.
 */
export default function Loading() {
  return <BrandLoader variant="seccion" />;
}
