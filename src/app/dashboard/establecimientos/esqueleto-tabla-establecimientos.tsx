import { EsqueletoTabla } from "@/shared/components/EsqueletoTabla";

const COLUMNAS_ESQUELETO = ["w-28", "w-52", "w-40", "w-28", "w-28"];

// Esqueleto con la forma de la tabla de establecimientos: lo comparten loading.tsx y el fallback
// del Suspense del listado.
export function EsqueletoTablaEstablecimientos() {
  return <EsqueletoTabla columnas={COLUMNAS_ESQUELETO} />;
}
