// Rechazo unilateral de una carga ya `APROBADA` (a diferencia de `SolicitudReemplazoCarga`, no hay
// "solicitud pendiente": quien rechaza decide directamente). Habilita una REAPERTURA de la
// combinación (formato, ventana) para que el mismo notificador vuelva a subir un archivo. La
// reapertura NO se consume al subir: se consume al finalizar y enviar con éxito
// (`CargaArchivoRepository.finalizar()`), con la ventana abierta o cerrada.

import { finDelDiaChile, paredChileAInstante } from "@/shared/utils/fecha";

// Longitud máxima del motivo de rechazo, mismo criterio y mismo valor que
// `SolicitudReemplazoCarga.LONGITUD_MAXIMA_MOTIVO`: texto libre, sin reglas de complejidad que
// reutilizar de `shared/schemas/` (esas son de contraseñas).
export const LONGITUD_MAXIMA_MOTIVO_RECHAZO = 500;

// Vigencia de la reapertura, en días adicionales, cuando la ventana YA había vencido al momento
// del rechazo. Mismo valor que `DIAS_VIGENCIA_SOLICITUD_APROBADA` de solicitudes de reemplazo, sin
// compartir la constante: son conceptos de dominio distintos que solo coinciden en el número.
export const DIAS_REAPERTURA_TRAS_VENCIMIENTO = 5;

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
  reaperturaConsumidaEn: Date | null;
  reaperturaConsumidaPorCargaArchivoId: string | null;
  createdAt: Date;
};

export type DatosNuevoRechazoCargaArchivo = {
  cargaArchivoId: string;
  rechazadoPorId: string;
  motivo: string;
};

// Recorte de `VentanaCarga` con lo mínimo que necesita `fechaLimiteReapertura`/`reaperturaVigente`:
// evita que este archivo dependa del tipo completo de `modules/ventanas-carga`.
export type VentanaParaReapertura = {
  fechaVencimiento: Date;
};

// Fecha límite hasta la cual se puede usar la reapertura: si la ventana NO había vencido al
// momento del rechazo, dura hasta su `fechaVencimiento` original (ni más ni menos); si ya había
// vencido, dura `DIAS_REAPERTURA_TRAS_VENCIMIENTO` días adicionales desde el rechazo. Decisión
// explícita del usuario, confirmada en el diseño aprobado. Ambos plazos terminan a las 23:59 hora de
// Chile, y el resultado es un instante real (no hora de pared): se compara con `ahora` y se muestra
// con `formatearFechaHora`.
export function fechaLimiteReapertura(rechazo: Pick<CargaArchivoRechazo, "rechazadoEn">, ventana: VentanaParaReapertura): Date {
  const vencimientoVentana = paredChileAInstante(ventana.fechaVencimiento);

  if (vencimientoVentana.getTime() > rechazo.rechazadoEn.getTime()) {
    return vencimientoVentana;
  }

  return finDelDiaChile(rechazo.rechazadoEn, DIAS_REAPERTURA_TRAS_VENCIMIENTO);
}

// `true` solo si el rechazo todavía no consumió su reapertura y `ahora` no superó la fecha límite.
// Calculado siempre en lectura contra un `ahora` recibido como parámetro, nunca persistido como
// estado propio — mismo patrón que `TokenRecuperacion.expiraEn`/`VentanaCarga.estaAbierta`.
export function reaperturaVigente(
  rechazo: Pick<CargaArchivoRechazo, "rechazadoEn" | "reaperturaConsumidaEn">,
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
  rechazo: Pick<CargaArchivoRechazo, "rechazadoEn" | "reaperturaConsumidaEn">,
  ventana: VentanaParaReapertura,
  vigente: { vistoBuenoEn: Date | null },
  ahora: Date,
): boolean {
  return reaperturaVigente(rechazo, ventana, ahora) && rechazoPosteriorAAprobacion(rechazo.rechazadoEn, vigente.vistoBuenoEn);
}
