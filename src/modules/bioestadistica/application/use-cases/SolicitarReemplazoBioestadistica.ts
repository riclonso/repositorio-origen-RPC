import { solicitudBioestadisticaUtilizable, type SolicitudReemplazoBioestadistica } from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import { SolicitudReemplazoDuplicadaError } from "@/modules/solicitudes-reemplazo/domain/errors/SolicitudReemplazoDuplicadaError";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

export type DatosSolicitarReemplazoBioestadistica = {
  cargaBioestadisticaId: string;
  usuarioId: string;
  motivo: string;
};

export type ResultadoSolicitarReemplazoBioestadistica =
  | { ok: true; solicitud: SolicitudReemplazoBioestadistica }
  // No existe o no es del actor (indistinguibles desde fuera).
  | { ok: false; motivo: "NO_ENCONTRADO" }
  // La carga no es la ACTIVA de su (año, tipo): ya fue reemplazada, falló o sigue procesándose.
  | { ok: false; motivo: "NO_ES_VIGENTE" }
  // El año no tiene ninguna ventana publicada y no archivada: una aprobación nunca podría usarse.
  | { ok: false; motivo: "VENTANA_NO_DISPONIBLE" }
  | { ok: false; motivo: "SOLICITUD_DUPLICADA" }
  | { ok: false; motivo: "SOLICITUD_YA_APROBADA_VIGENTE" };

// RF-37: la persona solicita reemplazar su archivo ACTIVO de un (año, tipo). Se admite con el año ya
// cerrado por fecha (la aprobación habilita subir fuera de plazo), pero no si el año ya no tiene
// ninguna ventana que admita autorizaciones (RF-36, ajuste aprobado: archivada o despublicada
// bloquea), mismo criterio que `solicitarReemplazoCarga` del notificador.
export async function solicitarReemplazoBioestadistica(
  datos: DatosSolicitarReemplazoBioestadistica,
  dependencias: {
    repositorio: SolicitudReemplazoBioestadisticaRepository;
    repositorioCargas: CargaBioestadisticaRepository;
    repositorioVentanas: VentanaCargaRepository;
    ahora?: Date;
  },
): Promise<ResultadoSolicitarReemplazoBioestadistica> {
  const carga = await dependencias.repositorioCargas.obtenerPropia(datos.cargaBioestadisticaId, datos.usuarioId);
  if (!carga) return { ok: false, motivo: "NO_ENCONTRADO" };
  if (carga.estado !== "ACTIVA") return { ok: false, motivo: "NO_ES_VIGENTE" };

  const resumenes = await dependencias.repositorioVentanas.listarDiasVigenciaPorAnio([carga.anio]);
  const resumenAnio = resumenes.find((resumen) => resumen.anio === carga.anio) ?? null;
  if (!resumenAnio) return { ok: false, motivo: "VENTANA_NO_DISPONIBLE" };

  const [pendiente, aprobada] = await Promise.all([
    dependencias.repositorio.obtenerPendientePorCarga(carga.id),
    dependencias.repositorio.obtenerAprobadaSinUsarPorCarga(carga.id),
  ]);

  if (pendiente) return { ok: false, motivo: "SOLICITUD_DUPLICADA" };
  if (aprobada && solicitudBioestadisticaUtilizable(aprobada, resumenAnio, dependencias.ahora ?? new Date())) {
    return { ok: false, motivo: "SOLICITUD_YA_APROBADA_VIGENTE" };
  }

  try {
    const solicitud = await dependencias.repositorio.crear({
      cargaBioestadisticaId: carga.id,
      solicitadoPorId: datos.usuarioId,
      motivo: datos.motivo,
    });
    return { ok: true, solicitud };
  } catch (error) {
    // Dos peticiones concurrentes que pasaron el chequeo de arriba: el índice único parcial corta
    // la segunda.
    if (error instanceof SolicitudReemplazoDuplicadaError) return { ok: false, motivo: "SOLICITUD_DUPLICADA" };
    throw error;
  }
}
