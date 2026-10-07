import type { SolicitudReemplazoBioestadistica } from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import type { DecisionRevisionSolicitudReemplazo } from "@/modules/solicitudes-reemplazo/application/use-cases/RevisarSolicitudReemplazo";
import { DIAS_VIGENCIA_REEMPLAZO_POR_DEFECTO } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

export type DatosRevisarSolicitudReemplazoBioestadistica = {
  revisadoPorId: string;
  decision: DecisionRevisionSolicitudReemplazo;
  comentario: string | null;
};

export type ResultadoRevisarSolicitudReemplazoBioestadistica =
  | { ok: true; solicitud: SolicitudReemplazoBioestadistica }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "SOLICITUD_YA_RESUELTA" };

// RF-37: ADMIN o REVISOR_REPOSITORIO aprueban o rechazan una solicitud PENDIENTE (cualquiera, sin
// restricción de autoría). Al APROBAR se COPIA `diasVigencia` = máximo `diasVigenciaReemplazo` de las
// ventanas del año publicadas y no archivadas (semántica de unión), o el valor por defecto (7) si no
// queda ninguna; editar las ventanas después no cambia el plazo ya otorgado.
export async function revisarSolicitudReemplazoBioestadistica(
  id: string,
  datos: DatosRevisarSolicitudReemplazoBioestadistica,
  dependencias: {
    repositorio: SolicitudReemplazoBioestadisticaRepository;
    repositorioVentanas: VentanaCargaRepository;
  },
): Promise<ResultadoRevisarSolicitudReemplazoBioestadistica> {
  const existente = await dependencias.repositorio.obtenerPorId(id);
  if (!existente) return { ok: false, motivo: "NO_ENCONTRADO" };

  let actualizada: SolicitudReemplazoBioestadistica | null;

  if (datos.decision === "APROBAR") {
    const resumenes = await dependencias.repositorioVentanas.listarDiasVigenciaPorAnio([existente.anio]);
    const diasVigencia =
      resumenes.find((resumen) => resumen.anio === existente.anio)?.diasVigenciaMaximos ??
      DIAS_VIGENCIA_REEMPLAZO_POR_DEFECTO;

    actualizada = await dependencias.repositorio.revisar(id, {
      revisadoPorId: datos.revisadoPorId,
      estado: "APROBADA",
      comentarioRevision: datos.comentario,
      diasVigencia,
    });
  } else {
    actualizada = await dependencias.repositorio.revisar(id, {
      revisadoPorId: datos.revisadoPorId,
      estado: "RECHAZADA",
      comentarioRevision: datos.comentario,
      diasVigencia: null,
    });
  }

  // Dos revisores a la vez: la segunda escritura ya no la encontró PENDIENTE.
  if (!actualizada) return { ok: false, motivo: "SOLICITUD_YA_RESUELTA" };

  return { ok: true, solicitud: actualizada };
}
