// Rechazo unilateral de una carga ya `APROBADA` (a diferencia de `SolicitudReemplazoCarga`, no hay
// "solicitud pendiente": quien rechaza decide directamente). Habilita una REAPERTURA de la
// combinación (formato, ventana) para que el mismo notificador vuelva a subir un archivo. La
// reapertura NO se consume al subir: se consume al finalizar y enviar con éxito
// (`CargaArchivoRepository.finalizar()`), con la ventana abierta o cerrada por fecha.

import { fechaVencimientoAutorizacion } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// Longitud máxima del motivo de rechazo, mismo criterio y mismo valor que
// `SolicitudReemplazoCarga.LONGITUD_MAXIMA_MOTIVO`: texto libre, sin reglas de complejidad que
// reutilizar de `shared/schemas/` (esas son de contraseñas).
export const LONGITUD_MAXIMA_MOTIVO_RECHAZO = 500;

// Vista denormalizada (join a `CargaArchivo`/`FormatoExcel`/`VentanaCarga`/`Usuario`), mismo
// criterio que `SolicitudReemplazoCarga`: los listados (banner del notificador, sección
// "Rechazadas" del detalle de ventana) no necesitan una consulta aparte por fila.
export type CargaArchivoRechazo = {
  id: string;
  cargaArchivoId: string;
  ventanaCargaId: string;
  anio: number;
  ventanaFechaVencimiento: Date;
  formatoExcelNombre: string;
  nombreArchivoOriginal: string;
  motivo: string;
  rechazadoEn: Date;
  rechazadoPorId: string;
  rechazadoPorNombre: string;
  // RF-36: copia de `VentanaCarga.diasVigenciaReemplazo` al rechazar (5 en los rechazos anteriores
  // a RF-36), para que editar la ventana después no cambie el plazo ya otorgado.
  diasReapertura: number;
  reaperturaConsumidaEn: Date | null;
  reaperturaConsumidaPorCargaArchivoId: string | null;
  createdAt: Date;
};

export type DatosNuevoRechazoCargaArchivo = {
  cargaArchivoId: string;
  rechazadoPorId: string;
  motivo: string;
};

// Recorte de `VentanaCarga` con lo mínimo que necesita `fechaLimiteReapertura`/`reaperturaVigente`.
export type VentanaParaReapertura = {
  fechaVencimiento: Date;
};

// Fecha límite hasta la cual se puede usar la reapertura (RF-36, ajuste aprobado): el mismo plazo
// único que una solicitud de reemplazo aprobada (`fechaVencimientoAutorizacion`), con el rechazo
// como fecha de decisión y sus `diasReapertura` copiados:
// `max(vencimiento de la ventana, fin del día Chile de rechazadoEn + diasReapertura)`. El
// resultado es un instante real (no hora de pared): se compara con `ahora` y se muestra con
// `formatearFechaHora`.
export function fechaLimiteReapertura(
  rechazo: Pick<CargaArchivoRechazo, "rechazadoEn" | "diasReapertura">,
  ventana: VentanaParaReapertura,
): Date {
  return fechaVencimientoAutorizacion({
    fechaDecision: rechazo.rechazadoEn,
    diasVigencia: rechazo.diasReapertura,
    fechaVencimientoVentana: ventana.fechaVencimiento,
  });
}

// `true` solo si el rechazo todavía no consumió su reapertura y `ahora` no superó la fecha límite.
// Calculado siempre en lectura contra un `ahora` recibido como parámetro, nunca persistido como
// estado propio — mismo patrón que `TokenRecuperacion.expiraEn`/`VentanaCarga.estaAbierta`. No mira
// si la ventana sigue publicada o archivada: esa regla vive en `resolverVentanaHabilitada`.
export function reaperturaVigente(
  rechazo: Pick<CargaArchivoRechazo, "rechazadoEn" | "diasReapertura" | "reaperturaConsumidaEn">,
  ventana: VentanaParaReapertura,
  ahora: Date,
): boolean {
  if (rechazo.reaperturaConsumidaEn !== null) return false;
  return ahora.getTime() <= fechaLimiteReapertura(rechazo, ventana).getTime();
}

// `true` si el rechazo ocurrió DESPUÉS de que se aprobara la carga hoy vigente de la combinación:
// solo entonces la reapertura corresponde a un intento posterior a esa aprobación (p.ej. se
// rechazó la carga de reemplazo). Una reapertura vieja que quedó sin consumir, anterior a la
// aprobación vigente, no debe abrir un reemplazo que nadie autorizó. Sin `vistoBuenoEn` (no
// debería ocurrir en una `APROBADA`) se trata como no autorizada. Pura y sin dependencias de
// servidor: la reutiliza el panel del notificador (Client Component).
export function rechazoPosteriorAAprobacion(rechazadoEn: Date, vistoBuenoEn: Date | null): boolean {
  if (!vistoBuenoEn) return false;
  return rechazadoEn.getTime() > vistoBuenoEn.getTime();
}

// Una reapertura autoriza a reemplazar la carga `APROBADA` vigente solo si sigue vigente y es
// posterior a esa aprobación (ver `rechazoPosteriorAAprobacion`). La usa
// `resolverAutorizacionReemplazo` tanto al subir como al finalizar.
export function reaperturaAutorizaReemplazo(
  rechazo: Pick<CargaArchivoRechazo, "rechazadoEn" | "diasReapertura" | "reaperturaConsumidaEn">,
  ventana: VentanaParaReapertura,
  vigente: { vistoBuenoEn: Date | null },
  ahora: Date,
): boolean {
  return reaperturaVigente(rechazo, ventana, ahora) && rechazoPosteriorAAprobacion(rechazo.rechazadoEn, vigente.vistoBuenoEn);
}
