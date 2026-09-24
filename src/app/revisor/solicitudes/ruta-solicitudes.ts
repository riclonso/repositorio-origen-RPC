import { FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO } from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

export const RUTA_SOLICITUDES_REVISOR = "/revisor/solicitudes";

// Conserva el filtro de estado vigente y reemplaza solo la página, mismo criterio que
// `construirRutaUsuariosDashboard`: un parámetro en su valor por defecto se omite de la URL.
export function construirRutaSolicitudesRevisor(pagina: number, estado?: EstadoSolicitudReemplazoCarga): string {
  const parametros = new URLSearchParams();

  if (estado && estado !== FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO.estado) {
    parametros.set("estado", estado);
  }
  if (pagina > 1) {
    parametros.set("page", String(pagina));
  }

  const consulta = parametros.toString();
  return consulta ? `${RUTA_SOLICITUDES_REVISOR}?${consulta}` : RUTA_SOLICITUDES_REVISOR;
}
