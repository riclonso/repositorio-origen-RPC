import type {
  CargaArchivoResumenPropia,
  GrupoCargaAprobada,
  TipoDesactivacionCargaPublicada,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  fechaVencimientoSolicitud,
  solicitudUtilizable,
  type SolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Mapeo de dominio -> vista para "Mis cargas" (histórico de exitosas del notificador). Vive en un
// módulo sin "use client" a propósito: `ListadoMisCargasExitosas.tsx` (Server Component) necesita
// invocar `aGrupoCargaExitosaVista` directamente, y una función exportada desde un archivo
// "use client" (como `TablaMisCargasExitosas.tsx`) solo puede renderizarse como componente, nunca
// llamarse desde el servidor. `TablaMisCargasExitosas.tsx` importa los tipos de aquí para tipar sus
// props, sin declarar la función.

// Vista liviana de una fila de carga (vigente o reemplazada): fecha ya formateada en el servidor.
// `motivo`/`motivoTipo` no nulos cuando esta carga dejó de ser la vigente de su combinación
// (formato, ventana), sea porque fue reemplazada por una solicitud consentida o rechazada (ver
// `CargaArchivoResumenPropia` en el dominio para de dónde sale cada fuente). Siempre `null` en la
// vigente de un grupo, salvo el caso borde de una `RECHAZADA` que todavía no tiene sucesora (sigue
// siendo la "vigente" de su grupo, ahora con el motivo de su propio rechazo).
export type FilaCargaExitosaVista = {
  id: string;
  nombreArchivoOriginal: string;
  vistoBuenoEl: string;
  motivo: string | null;
  motivoTipo: TipoDesactivacionCargaPublicada | null;
  // Fecha del rechazo/reemplazo (`CargaArchivoResumenPropia.desactivadaEn`), ya formateada. La
  // tabla de reemplazadas ("Mis cargas") la usa en la columna "Reemplazada el" en vez de
  // `vistoBuenoEl`: esa columna debe decir cuándo dejó de ser vigente, no cuándo se había aprobado
  // originalmente.
  desactivadaEl: string | null;
  // Mismo instante en ISO, solo para ordenar el historial (el texto formateado no ordena bien).
  desactivadaEnIso: string | null;
  // Revisor que rechazó la carga. `null` en un reemplazo (no hay rechazo registrado).
  rechazadoPor: string | null;
};

// RF-36: qué ofrece la fila vigente respecto de un reemplazo. Resuelto en el servidor (la fecha ya
// formateada en hora de Chile, mismo motivo que `vistoBuenoEl`):
// - `SOLICITAR`: aprobada, ventana que todavía admite autorizaciones (abierta o vencida por fecha) y
//   sin solicitud pendiente ni utilizable → acción "Solicitar reemplazo".
// - `SOLICITUD_PENDIENTE` / `REEMPLAZO_AUTORIZADO`: badge con el estado de la solicitud en curso.
// - `NO_DISPONIBLE`: rechazada, o ventana archivada, despublicada o eliminada (ajuste aprobado).
export type EstadoReemplazoGrupoVista =
  | { tipo: "SOLICITAR" }
  | { tipo: "SOLICITUD_PENDIENTE" }
  | { tipo: "REEMPLAZO_AUTORIZADO"; venceEl: string; venceElIso: string }
  | { tipo: "NO_DISPONIBLE" };

// Un grupo por `ventanaCargaId`: la vigente es la fila principal, las reemplazadas quedan como
// historial anidado dentro de esa misma fila (nunca como filas sueltas).
export type GrupoCargaExitosaVista = {
  ventanaCargaId: string;
  formatoExcelId: string;
  formatoExcelNombre: string;
  anio: number;
  vigente: FilaCargaExitosaVista;
  reemplazadas: FilaCargaExitosaVista[];
  estadoReemplazo: EstadoReemplazoGrupoVista;
};

// RF-36: estado de reemplazo de la fila vigente de un grupo, sin consultas propias: recibe las
// solicitudes del notificador (una consulta) y las ventanas que admiten autorizaciones (otra).
// Mismas reglas que el servidor aplica al solicitar (`SolicitarReemplazoCarga`): esto solo decide
// qué ofrecer, la autorización real se revalida en la petición.
export function resolverEstadoReemplazoGrupo(
  vigente: Pick<CargaArchivoResumenPropia, "id" | "estado" | "ventanaCargaId">,
  solicitudes: SolicitudReemplazoCarga[],
  idsVentanasQueAdmiten: ReadonlySet<string>,
  ahora: Date,
): EstadoReemplazoGrupoVista {
  if (vigente.estado !== "APROBADA" || !idsVentanasQueAdmiten.has(vigente.ventanaCargaId)) {
    return { tipo: "NO_DISPONIBLE" };
  }

  const solicitudesDeLaCarga = solicitudes.filter((solicitud) => solicitud.cargaArchivoId === vigente.id);

  if (solicitudesDeLaCarga.some((solicitud) => solicitud.estado === "PENDIENTE")) {
    return { tipo: "SOLICITUD_PENDIENTE" };
  }

  const utilizable = solicitudesDeLaCarga.find((solicitud) => solicitudUtilizable(solicitud, ahora));
  const venceEl = utilizable ? fechaVencimientoSolicitud(utilizable) : null;

  if (venceEl) {
    return { tipo: "REEMPLAZO_AUTORIZADO", venceEl: formatearFechaHora(venceEl), venceElIso: venceEl.toISOString() };
  }

  return { tipo: "SOLICITAR" };
}

function aFilaCargaExitosaVista(carga: CargaArchivoResumenPropia): FilaCargaExitosaVista {
  return {
    id: carga.id,
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
    vistoBuenoEl: carga.vistoBuenoEn ? formatearFechaHora(carga.vistoBuenoEn) : "—",
    motivo: carga.motivoDesactivacion,
    motivoTipo: carga.motivoDesactivacionTipo,
    desactivadaEl: carga.desactivadaEn ? formatearFechaHora(carga.desactivadaEn) : null,
    desactivadaEnIso: carga.desactivadaEn ? carga.desactivadaEn.toISOString() : null,
    rechazadoPor: carga.rechazo?.rechazadoPorNombre ?? null,
  };
}

export function aGrupoCargaExitosaVista(
  grupo: GrupoCargaAprobada<CargaArchivoResumenPropia>,
  estadoReemplazo: EstadoReemplazoGrupoVista,
): GrupoCargaExitosaVista {
  return {
    ventanaCargaId: grupo.vigente.ventanaCargaId,
    formatoExcelId: grupo.vigente.formatoExcelId,
    formatoExcelNombre: grupo.vigente.formatoExcelNombre,
    anio: grupo.vigente.anio,
    vigente: aFilaCargaExitosaVista(grupo.vigente),
    reemplazadas: grupo.reemplazadas.map(aFilaCargaExitosaVista),
    estadoReemplazo,
  };
}
