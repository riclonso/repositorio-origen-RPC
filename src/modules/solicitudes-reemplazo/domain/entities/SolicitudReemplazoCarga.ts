// Solicitud de un notificador para reemplazar una de sus cargas (RF nuevo, ver diseño aprobado).
// Cubre dos orígenes (ver `OrigenSolicitudReemplazoCarga`): una carga ya `APROBADA`, o una
// `PENDIENTE_VISTO_BUENO` que el notificador ya finalizó y envió pero que todavía nadie decidió.
// Requiere aprobación de un ADMIN o REVISOR_REPOSITORIO antes de habilitar la subida del archivo de
// reemplazo (o, para el segundo origen, antes de rechazar la carga original y liberar la
// combinación formato/ventana).

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

// Vigencia de una solicitud ya `APROBADA` y no usada: se calcula siempre en lectura contra un
// `ahora` recibido como parámetro, nunca persistida como un estado propio — mismo patrón que
// `TokenRecuperacion.expiraEn`/`VentanaCarga.estaAbierta`.
export const DIAS_VIGENCIA_SOLICITUD_APROBADA = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Vista denormalizada (join a `CargaArchivo`/`FormatoExcel`/`VentanaCarga`/`Usuario`) para que los
// listados de revisión y de seguimiento propio no necesiten una consulta aparte por fila.
export type SolicitudReemplazoCarga = {
  id: string;
  cargaArchivoId: string;
  formatoExcelNombre: string;
  anio: number;
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

export type DatosRevisionSolicitudReemplazoCarga = {
  revisadoPorId: string;
  estado: "APROBADA" | "RECHAZADA";
  comentarioRevision: string | null;
};

export type FiltroListadoSolicitudesReemplazo = {
  estado?: EstadoSolicitudReemplazoCarga;
  pagina: number;
  tamano: number;
};

export type PaginaSolicitudesReemplazo = {
  filas: SolicitudReemplazoCarga[];
  total: number;
};

// `true` solo si la solicitud está `APROBADA`, no se ha usado todavía, y no pasaron más de
// `DIAS_VIGENCIA_SOLICITUD_APROBADA` desde que se aprobó. Es la autorización real para subir el
// archivo de reemplazo (`ValidarYCargarArchivo`, extensión de RF-14).
export function solicitudUtilizable(solicitud: SolicitudReemplazoCarga, ahora: Date): boolean {
  if (solicitud.estado !== "APROBADA") return false;
  if (solicitud.utilizadaEn !== null) return false;
  // No debería ocurrir: toda solicitud `APROBADA` fija `revisadoEn` en la misma escritura
  // (`RevisarSolicitudReemplazo`). Defensivo: sin ancla de vigencia, se trata como no utilizable.
  if (!solicitud.revisadoEn) return false;

  const vencimiento = new Date(solicitud.revisadoEn.getTime() + DIAS_VIGENCIA_SOLICITUD_APROBADA * MS_POR_DIA);
  return ahora <= vencimiento;
}

// Para el badge "Vencida" en los listados (revisor y notificador), sin duplicar la fecha de corte:
// una solicitud `APROBADA`, no usada, cuya ventana de `solicitudUtilizable` ya cerró.
export function solicitudVencida(solicitud: SolicitudReemplazoCarga, ahora: Date): boolean {
  return solicitud.estado === "APROBADA" && solicitud.utilizadaEn === null && !solicitudUtilizable(solicitud, ahora);
}
