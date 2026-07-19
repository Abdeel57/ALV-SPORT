import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Carga raíz: cubre la entrada a la app y toda ruta sin `loading.tsx` más
 * cercano (login, activar, anotador…). Las vistas públicas y el admin tienen
 * su propio boundary dentro de su shell (variante `seccion`).
 */
export default function Loading() {
  return <BrandLoader />;
}
