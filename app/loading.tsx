import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Carga raíz: cubre la entrada a la app y toda ruta sin `loading.tsx` más
 * cercano (login, activar, anotador…). Las vistas públicas de contenido
 * tienen su propio boundary con skeletons en `(public)/loading.tsx`.
 */
export default function Loading() {
  return <BrandLoader />;
}
