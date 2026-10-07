import type { FiltroVistaCargasBioestadistica } from "@/shared/components/ListadoCargasBioestadistica";
import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO } from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";

const TAMANO_POR_DEFECTO = 25;

// RF-37: URL del listado administrativo de archivos de Bioestadística conservando el filtro. Un
// parámetro en su valor por defecto se omite, mismo criterio que `construirRutaSolicitudesDashboard`.
// Compartido por `/dashboard/bioestadistica` y `/revisor/bioestadistica` (solo cambia la base).
export function construirRutaCargasBioestadistica(rutaBase: string, filtro: FiltroVistaCargasBioestadistica): string {
  const parametros = new URLSearchParams();

  if (filtro.anio !== undefined) parametros.set("anio", String(filtro.anio));
  if (filtro.tipoArchivo) parametros.set("tipoArchivo", filtro.tipoArchivo);
  if (filtro.pagina > 1) parametros.set("page", String(filtro.pagina));
  if (filtro.tamano !== TAMANO_POR_DEFECTO) parametros.set("pageSize", String(filtro.tamano));

  const consulta = parametros.toString();
  return consulta ? `${rutaBase}?${consulta}` : rutaBase;
}

// RF-37: URL de la bandeja de solicitudes de Bioestadística conservando el estado.
export function construirRutaSolicitudesBioestadistica(
  rutaBase: string,
  pagina: number,
  estado?: EstadoSolicitudReemplazoCarga,
): string {
  const parametros = new URLSearchParams();

  if (estado && estado !== FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO.estado) parametros.set("estado", estado);
  if (pagina > 1) parametros.set("page", String(pagina));

  const consulta = parametros.toString();
  return consulta ? `${rutaBase}?${consulta}` : rutaBase;
}
