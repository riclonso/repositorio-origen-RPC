import type { TamanoPagina, TipoLog } from "@/infrastructure/logging/leerLogs";

// Construye la URL del visor preservando filtro, tamaño de página y página al navegar. Un
// parámetro en su valor por defecto se omite, para no dejar la barra llena de `?...` redundantes.
export function construirRutaLogs(opciones: {
  tipo: TipoLog;
  desde?: string;
  hasta?: string;
  tamano?: TamanoPagina;
  pagina?: number;
}): string {
  const parametros = new URLSearchParams({ tipo: opciones.tipo });
  if (opciones.desde) parametros.set("desde", opciones.desde);
  if (opciones.hasta) parametros.set("hasta", opciones.hasta);
  if (opciones.tamano) parametros.set("tamano", String(opciones.tamano));
  if (opciones.pagina && opciones.pagina > 1) parametros.set("pagina", String(opciones.pagina));
  return `/dashboard/logs?${parametros.toString()}`;
}
