// RF-37: solicitud de una persona de Bioestadística para reemplazar su archivo ACTIVO de un (año,
// tipo). Mismo ciclo que la del notificador (`SolicitudReemplazoCarga`): PENDIENTE → APROBADA o
// RECHAZADA por ADMIN o REVISOR_REPOSITORIO; se CONSUME al activarse el archivo de reemplazo.
//
// Vigencia (RF-36, ajuste aprobado): misma fórmula única `fechaVencimientoAutorizacion`, con
// `fechaVencimientoVentana` = máximo vencimiento de las ventanas del año que admiten autorizaciones
// (publicadas, no archivadas, no eliminadas) y `diasVigencia` = copia hecha al aprobar. Si el año ya
// no tiene ninguna ventana así, la solicitud NO es utilizable (una ventana archivada o despublicada
// bloquea el uso de las autorizaciones).
import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import {
  fechaVencimientoAutorizacion,
  type ResumenVigenciaAnio,
} from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import type { TipoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";

export type SolicitudReemplazoBioestadistica = {
  id: string;
  cargaBioestadisticaId: string;
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  nombreArchivoOriginal: string;
  solicitadoPorId: string;
  solicitadoPorNombre: string;
  solicitadoPorRut: string;
  motivo: string;
  estado: EstadoSolicitudReemplazoCarga;
  revisadoPorId: string | null;
  revisadoPorNombre: string | null;
  revisadoEn: Date | null;
  comentarioRevision: string | null;
  diasVigencia: number | null;
  nuevaCargaBioestadisticaId: string | null;
  utilizadaEn: Date | null;
  createdAt: Date;
};

export type DatosNuevaSolicitudReemplazoBioestadistica = {
  cargaBioestadisticaId: string;
  solicitadoPorId: string;
  motivo: string;
};

// `diasVigencia` obligatorio al APROBAR (CHECK en la base) y `null` al rechazar.
export type DatosRevisionSolicitudReemplazoBioestadistica =
  | { revisadoPorId: string; estado: "APROBADA"; comentarioRevision: string | null; diasVigencia: number }
  | { revisadoPorId: string; estado: "RECHAZADA"; comentarioRevision: string | null; diasVigencia: null };

export type FiltroListadoSolicitudesBioestadistica = {
  estado?: EstadoSolicitudReemplazoCarga;
  pagina: number;
  tamano: number;
};

export type PaginaSolicitudesBioestadistica = {
  filas: SolicitudReemplazoBioestadistica[];
  total: number;
};

type CamposVigencia = Pick<SolicitudReemplazoBioestadistica, "estado" | "revisadoEn" | "diasVigencia" | "utilizadaEn">;

// Instante real hasta el cual una solicitud APROBADA habilita subir el reemplazo. `null` si no está
// aprobada, le falta el ancla o los días (defensivo), o el año ya no tiene ninguna ventana que admita
// autorizaciones (`resumenAnio` nulo).
export function fechaVencimientoSolicitudBioestadistica(
  solicitud: CamposVigencia,
  resumenAnio: Pick<ResumenVigenciaAnio, "fechaVencimientoMaxima"> | null,
): Date | null {
  if (solicitud.estado !== "APROBADA" || !solicitud.revisadoEn || solicitud.diasVigencia === null || !resumenAnio) {
    return null;
  }

  return fechaVencimientoAutorizacion({
    fechaDecision: solicitud.revisadoEn,
    diasVigencia: solicitud.diasVigencia,
    fechaVencimientoVentana: resumenAnio.fechaVencimientoMaxima,
  });
}

// `true` solo si está APROBADA, sin usar, el año todavía admite autorizaciones y `ahora` no superó
// su plazo. Es la autorización real para subir el archivo de reemplazo.
export function solicitudBioestadisticaUtilizable(
  solicitud: CamposVigencia,
  resumenAnio: Pick<ResumenVigenciaAnio, "fechaVencimientoMaxima"> | null,
  ahora: Date,
): boolean {
  if (solicitud.utilizadaEn !== null) return false;

  const venceEl = fechaVencimientoSolicitudBioestadistica(solicitud, resumenAnio);
  return venceEl !== null && ahora.getTime() <= venceEl.getTime();
}

// Para el badge "Vencida": APROBADA, sin usar y ya no utilizable.
export function solicitudBioestadisticaVencida(
  solicitud: CamposVigencia,
  resumenAnio: Pick<ResumenVigenciaAnio, "fechaVencimientoMaxima"> | null,
  ahora: Date,
): boolean {
  return (
    solicitud.estado === "APROBADA" &&
    solicitud.utilizadaEn === null &&
    !solicitudBioestadisticaUtilizable(solicitud, resumenAnio, ahora)
  );
}

// Índice de resúmenes por año para evaluar varias solicitudes sin una consulta por fila.
export function indexarResumenesPorAnio(resumenes: ResumenVigenciaAnio[]): Map<number, ResumenVigenciaAnio> {
  return new Map(resumenes.map((resumen) => [resumen.anio, resumen]));
}
