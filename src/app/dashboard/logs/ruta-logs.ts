import type { TipoAvisoCorreo } from "@/infrastructure/logging/catalogoFallasCorreo";
import type { TamanoPagina, TipoLog } from "@/infrastructure/logging/leerLogs";

// Construye la URL del visor preservando filtro, tamaño de página y página al navegar. Un
// parámetro en su valor por defecto se omite, para no dejar la barra llena de `?...` redundantes.
// `tipoAviso` (RF-44) solo tiene sentido en la pestaña de fallas de correo: en otra se descarta.
export function construirRutaLogs(opciones: {
  tipo: TipoLog;
  desde?: string;
  hasta?: string;
  tipoAviso?: TipoAvisoCorreo;
  tamano?: TamanoPagina;
  pagina?: number;
}): string {
  const parametros = new URLSearchParams({ tipo: opciones.tipo });
  if (opciones.desde) parametros.set("desde", opciones.desde);
  if (opciones.hasta) parametros.set("hasta", opciones.hasta);
  if (opciones.tipoAviso && opciones.tipo === "fallas-correo") parametros.set("aviso", opciones.tipoAviso);
  if (opciones.tamano) parametros.set("tamano", String(opciones.tamano));
  if (opciones.pagina && opciones.pagina > 1) parametros.set("pagina", String(opciones.pagina));
  return `/dashboard/logs?${parametros.toString()}`;
}
