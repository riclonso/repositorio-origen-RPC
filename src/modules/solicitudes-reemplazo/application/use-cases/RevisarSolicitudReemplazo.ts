import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type { SolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

export type DecisionRevisionSolicitudReemplazo = "APROBAR" | "RECHAZAR";

export type DatosRevisarSolicitudReemplazo = {
  revisadoPorId: string;
  decision: DecisionRevisionSolicitudReemplazo;
  comentario: string | null;
};

export type ResultadoRevisarSolicitudReemplazo =
  | { ok: true; solicitud: SolicitudReemplazoCarga }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "SOLICITUD_YA_RESUELTA" };

// Aprueba o rechaza una solicitud `PENDIENTE`. Un ADMIN o REVISOR_REPOSITORIO puede resolver
// cualquier solicitud (a diferencia de la eliminación de ventanas de carga, no hay restricción de
// "solo las que yo creé": la revisión de reemplazos es simétrica entre ambos perfiles).
export async function revisarSolicitudReemplazo(
  id: string,
  datos: DatosRevisarSolicitudReemplazo,
  dependencias: { repositorio: SolicitudReemplazoCargaRepository },
): Promise<ResultadoRevisarSolicitudReemplazo> {
  const existente = await dependencias.repositorio.obtenerPorId(id);

  if (!existente) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // RF-36: al aprobar se COPIA el N vigente de la ventana de la carga; editar la ventana después no
  // cambia el plazo ya otorgado. Al rechazar no hay plazo que fijar.
  const actualizada = await dependencias.repositorio.revisar(
    id,
    datos.decision === "APROBAR"
      ? {
          revisadoPorId: datos.revisadoPorId,
          estado: "APROBADA",
          comentarioRevision: datos.comentario,
          diasVigencia: existente.diasVigenciaReemplazoVentana,
        }
      : { revisadoPorId: datos.revisadoPorId, estado: "RECHAZADA", comentarioRevision: datos.comentario, diasVigencia: null },
  );

  if (!actualizada) {
    // Cierra la ventana de carrera de dos revisores actuando a la vez: ya no estaba `PENDIENTE`.
    return { ok: false, motivo: "SOLICITUD_YA_RESUELTA" };
  }

  return { ok: true, solicitud: actualizada };
}
