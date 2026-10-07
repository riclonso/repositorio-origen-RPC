// Solicitud de un notificador para reemplazar una de sus cargas (RF nuevo, ver diseño aprobado).
// Cubre dos orígenes (ver `OrigenSolicitudReemplazoCarga`): una carga ya `APROBADA`, o una
// `PENDIENTE_VISTO_BUENO` que el notificador ya finalizó y envió pero que todavía nadie decidió.
// Requiere aprobación de un ADMIN o REVISOR_REPOSITORIO antes de habilitar la subida del archivo de
// reemplazo (o, para el segundo origen, antes de rechazar la carga original y liberar la
// combinación formato/ventana).

import { fechaVencimientoAutorizacion } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

export const ESTADOS_SOLICITUD_REEMPLAZO_CARGA = ["PENDIENTE", "APROBADA", "RECHAZADA"] as const;
export type EstadoSolicitudReemplazoCarga = (typeof ESTADOS_SOLICITUD_REEMPLAZO_CARGA)[number];

// `CARGA_APROBADA`: camino original, reemplazar una carga ya aprobada.
// `CARGA_PENDIENTE_DECISION`: ampliación, reemplazar una carga `PENDIENTE_VISTO_BUENO` ya
// finalizada por el notificador y todavía sin decisión de un ADMIN/REVISOR_REPOSITORIO. Al
// aprobarse, dispara el rechazo de la carga original (ver `PATCH
// /api/dashboard/solicitudes-reemplazo/[id]`), a diferencia del camino `CARGA_APROBADA`, que
// habilita una subida nueva sin tocar la carga original.
export const ORIGENES_SOLICITUD_REEMPLAZO_CARGA = ["CARGA_APROBADA", "CARGA_PENDIENTE_DECISION"] as const;
export type OrigenSolicitudReemplazoCarga = (typeof ORIGENES_SOLICITUD_REEMPLAZO_CARGA)[number];

// Longitud máxima de `motivo` y `comentarioRevision`: texto libre, sin reglas de complejidad que
// reutilizar de `shared/schemas/` (esas son de contraseñas). 500 caracteres es suficiente para una
// justificación breve sin permitir un bloque de texto desmedido.
export const LONGITUD_MAXIMA_MOTIVO = 500;
export const LONGITUD_MAXIMA_COMENTARIO_REVISION = 500;

// Vigencia de una solicitud ya `APROBADA` y no usada (RF-36): se calcula siempre en lectura contra
// un `ahora` recibido como parámetro, nunca persistida como un estado propio — mismo patrón que
// `TokenRecuperacion.expiraEn`/`VentanaCarga.estaAbierta`. El plazo lo da
// `fechaVencimientoAutorizacion` con los `diasVigencia` copiados de la ventana al aprobar.

// Vista denormalizada (join a `CargaArchivo`/`FormatoExcel`/`VentanaCarga`/`Usuario`) para que los
// listados de revisión y de seguimiento propio no necesiten una consulta aparte por fila.
export type SolicitudReemplazoCarga = {
  id: string;
  cargaArchivoId: string;
  formatoExcelNombre: string;
  anio: number;
  // RF-36: ventana de la carga (join). `ventanaFechaVencimiento` es hora de pared de Chile escrita
  // en UTC (convenio de las ventanas); `diasVigenciaReemplazoVentana` es el N ACTUAL de la ventana,
  // que se copia en `diasVigencia` al aprobar.
  ventanaCargaId: string;
  ventanaFechaVencimiento: Date;
  diasVigenciaReemplazoVentana: number;
  nombreArchivoOriginal: string;
  solicitadoPorId: string;
  solicitadoPorNombre: string;
  solicitadoPorRut: string;
  motivo: string;
  estado: EstadoSolicitudReemplazoCarga;
  origen: OrigenSolicitudReemplazoCarga;
  revisadoPorId: string | null;
  revisadoPorNombre: string | null;
  revisadoEn: Date | null;
  comentarioRevision: string | null;
  // RF-36: copia de `diasVigenciaReemplazoVentana` al aprobar; `null` en PENDIENTE/RECHAZADA.
  diasVigencia: number | null;
  nuevaCargaArchivoId: string | null;
  utilizadaEn: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DatosNuevaSolicitudReemplazoCarga = {
  cargaArchivoId: string;
  solicitadoPorId: string;
  motivo: string;
  origen: OrigenSolicitudReemplazoCarga;
};

// RF-36: `diasVigencia` obligatorio al APROBAR (CHECK en la base) y `null` al rechazar: el tipo
// lo impone para que ningún llamador pueda aprobar sin fijar el plazo.
export type DatosRevisionSolicitudReemplazoCarga =
  | { revisadoPorId: string; estado: "APROBADA"; comentarioRevision: string | null; diasVigencia: number }
  | { revisadoPorId: string; estado: "RECHAZADA"; comentarioRevision: string | null; diasVigencia: null };

export type FiltroListadoSolicitudesReemplazo = {
  estado?: EstadoSolicitudReemplazoCarga;
  pagina: number;
  tamano: number;
};

export type PaginaSolicitudesReemplazo = {
  filas: SolicitudReemplazoCarga[];
  total: number;
};

type CamposVigenciaSolicitud = Pick<
  SolicitudReemplazoCarga,
  "estado" | "utilizadaEn" | "revisadoEn" | "diasVigencia" | "ventanaFechaVencimiento"
>;

// RF-36: instante real hasta el cual una solicitud `APROBADA` habilita la subida (y su
// finalización), con la fórmula única `fechaVencimientoAutorizacion`. `null` si no está aprobada o
// le falta el ancla (`revisadoEn`) o la copia de días (`diasVigencia`): no debería ocurrir en una
// `APROBADA` (CHECK en la base), defensivamente se trata como sin plazo. La usan la UI ("puedes
// subir hasta...") y el correo de aprobación.
export function fechaVencimientoSolicitud(
  solicitud: Pick<CamposVigenciaSolicitud, "estado" | "revisadoEn" | "diasVigencia" | "ventanaFechaVencimiento">,
): Date | null {
  if (solicitud.estado !== "APROBADA" || !solicitud.revisadoEn || solicitud.diasVigencia === null) return null;

  return fechaVencimientoAutorizacion({
    fechaDecision: solicitud.revisadoEn,
    diasVigencia: solicitud.diasVigencia,
    fechaVencimientoVentana: solicitud.ventanaFechaVencimiento,
  });
}

// `true` solo si la solicitud está `APROBADA`, no se ha usado todavía y `ahora` no superó
// `fechaVencimientoSolicitud`. Es la autorización real para subir el archivo de reemplazo
// (`ValidarYCargarArchivo`, extensión de RF-14). No mira si la ventana sigue publicada o archivada:
// esa regla vive en `resolverVentanaHabilitada` (`ventanaAdmiteAutorizaciones`).
export function solicitudUtilizable(solicitud: CamposVigenciaSolicitud, ahora: Date): boolean {
  if (solicitud.utilizadaEn !== null) return false;

  const venceEl = fechaVencimientoSolicitud(solicitud);
  return venceEl !== null && ahora.getTime() <= venceEl.getTime();
}

// Para el badge "Vencida" en los listados (revisor y notificador), sin duplicar la fecha de corte:
// una solicitud `APROBADA`, no usada, cuya ventana de `solicitudUtilizable` ya cerró.
export function solicitudVencida(solicitud: SolicitudReemplazoCarga, ahora: Date): boolean {
  return solicitud.estado === "APROBADA" && solicitud.utilizadaEn === null && !solicitudUtilizable(solicitud, ahora);
}
