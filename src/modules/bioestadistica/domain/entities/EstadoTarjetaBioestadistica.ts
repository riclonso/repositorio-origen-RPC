import type { MotivoFalloCargaBioestadistica } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";

// RF-37: estado de la tarjeta de un (año, tipo) en el inicio de Bioestadística.
//  - SUBIR: no hay archivo vigente; se ofrece subir uno.
//  - PROCESANDO: hay un archivo recibido en procesamiento (la tarjeta se refresca sola).
//  - ENVIADO: hay un archivo vigente; para cambiarlo hay que solicitar el reemplazo.
//  - SOLICITUD_PENDIENTE: hay un archivo vigente y una solicitud de reemplazo esperando decisión.
//  - REEMPLAZO_AUTORIZADO: hay una solicitud aprobada y utilizable; se ofrece subir el reemplazo.
export const ESTADOS_TARJETA_BIOESTADISTICA = [
  "SUBIR",
  "PROCESANDO",
  "ENVIADO",
  "SOLICITUD_PENDIENTE",
  "REEMPLAZO_AUTORIZADO",
] as const;
export type EstadoTarjetaBioestadistica = (typeof ESTADOS_TARJETA_BIOESTADISTICA)[number];

export type EntradaEstadoTarjeta = {
  hayActiva: boolean;
  hayProcesando: boolean;
  haySolicitudPendiente: boolean;
  haySolicitudUtilizable: boolean;
};

// Prioridad: un procesamiento en curso manda sobre todo (no se admite otra subida hasta que termine);
// luego, con archivo vigente, la autorización utilizable, la solicitud pendiente y, si no hay nada,
// "enviado". Sin archivo vigente, siempre "subir". Función pura.
export function derivarEstadoTarjetaBioestadistica(entrada: EntradaEstadoTarjeta): EstadoTarjetaBioestadistica {
  if (entrada.hayProcesando) return "PROCESANDO";
  if (!entrada.hayActiva) return "SUBIR";
  if (entrada.haySolicitudUtilizable) return "REEMPLAZO_AUTORIZADO";
  if (entrada.haySolicitudPendiente) return "SOLICITUD_PENDIENTE";
  return "ENVIADO";
}

// Aviso del último intento fallido, solo si es POSTERIOR al archivo vigente (o no hay vigente): un
// fallo antiguo ya superado por un archivo activo no debe seguir mostrándose.
export type UltimoFalloTarjeta = {
  motivo: MotivoFalloCargaBioestadistica;
  nombreArchivoOriginal: string;
  fecha: Date;
};

export function ultimoFalloVisible(
  ultimoFallo: UltimoFalloTarjeta | null,
  fechaActiva: Date | null,
): UltimoFalloTarjeta | null {
  if (!ultimoFallo) return null;
  if (fechaActiva && ultimoFallo.fecha.getTime() <= fechaActiva.getTime()) return null;
  return ultimoFallo;
}
