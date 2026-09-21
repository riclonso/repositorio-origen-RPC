import { EsqueletoTabla } from "@/shared/components/EsqueletoTabla";

const COLUMNAS_ESQUELETO = ["w-40", "w-28", "w-52", "w-20", "w-28"];

// Esqueleto con la forma de la tabla (no un spinner): lo comparten `loading.tsx` y el fallback
// del Suspense del listado, tanto en `/dashboard/usuarios` (ADMIN) como en `/revisor/usuarios`
// (REVISOR_REPOSITORIO).
export function EsqueletoTablaUsuarios() {
  return <EsqueletoTabla columnas={COLUMNAS_ESQUELETO} />;
}
