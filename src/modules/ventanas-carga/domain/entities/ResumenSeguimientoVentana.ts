import type { ResumenAlertasVentana } from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// RF-16 (tablero de seguimiento): vista agregada de una ventana de carga ABIERTA, con los conteos
// de notificadores y el avance de tiempo ya resueltos, para pintar una tarjeta en
// `/dashboard` y `/revisor` sin que el componente tenga que hacer aritmética de fechas ni conocer
// reglas de negocio (mismo criterio que `VentanaCargaConEstado` para el estado `abierta`).
export type ResumenSeguimientoVentanaCarga = {
  ventanaCargaId: string;
  formatoExcelId: string;
  formatoExcelNombre: string;
  anio: number;
  fechaApertura: Date;
  fechaVencimiento: Date;
  // Notificadores NOTIFICADOR_RPC ACTIVOS asignados al formato de esta ventana (cuenta
  // ESTRUCTURAL: no filtra por `FormatoExcel.activo`, ver `contarNotificadoresAsignadosActivosPorFormato`).
  totalNotificadoresAsignados: number;
  // Notificadores DISTINTOS (no filas de `CargaArchivo`) con al menos una carga APROBADA en esta
  // ventana, ver `contarNotificadoresDistintosPorVentana`.
  totalNotificadoresReportaron: number;
  diasRestantes: number;
  // 0..1: fracción de tiempo transcurrido entre `fechaApertura` y `fechaVencimiento`. La barra de
  // progreso se LLENA con el tiempo (no se vacía), a diferencia de una barra de avance de tareas.
  fraccionTiempoTranscurrido: number;
  // `diasRestantes <= UMBRAL_DIAS_ALERTA_VENCIMIENTO_VENTANA`, ya resuelto aquí para que la vista
  // no reimporte la constante de dominio.
  vencimientoProximo: boolean;
  // RF-17: badge de estado del envío AUTOMÁTICO de alertas de esta ventana (nunca del manual, ver
  // `resolverEstadoAlertaVentana`). `null` cuando el envío automático está configurado pero
  // todavía no se ha enviado ninguna alerta automática (ni éxito ni error).
  estadoAlerta: EstadoAlertaVentana;
};

export type EstadoAlertaVentana = "NO_CONFIGURADA" | "CON_ERRORES" | "AVISO_ENVIADO" | null;

// RF-17: deriva el badge de alertas de una tarjeta del tablero de seguimiento, sin una consulta
// por tarjeta: `ObtenerResumenSeguimientoVentanasAbiertas` resuelve `resumenAlertas` una sola vez
// para TODAS las ventanas abiertas (`AlertaNotificacionRepository.obtenerResumenPorVentanas`, 2
// `groupBy`) y llama esto por cada una sobre el resultado ya en memoria. Un error más reciente que
// el último éxito (o sin éxito alguno) gana sobre "aviso enviado": el administrador necesita ver
// el problema, no un estado optimista.
//
// Este badge refleja EXCLUSIVAMENTE el envío automático: `resumenAlertas` ya llega filtrado a
// `tipo: "AUTOMATICA"` desde `obtenerResumenPorVentanas` (nunca agrega envíos manuales). Es
// deliberado: si un envío MANUAL_MASIVA/MANUAL_INDIVIDUAL contara aquí, una ventana SIN envío
// automático configurado pero con un envío manual fallido mostraría igual "Alertas no
// configuradas" (el primer `if` corta antes de mirar `resumenAlertas`), escondiendo el error a
// quien solo mira el tablero. El historial de envíos manuales sigue visible íntegro en el detalle
// de la ventana (`TablaLotesAlertaVentana`), que es donde corresponde revisarlo.
export function resolverEstadoAlertaVentana(
  ventana: Pick<VentanaCarga, "diasAnticipacionInicio">,
  resumenAlertas: ResumenAlertasVentana,
): EstadoAlertaVentana {
  if (ventana.diasAnticipacionInicio === null) {
    return "NO_CONFIGURADA";
  }

  const { ultimoEnvioExitosoEn, ultimoEnvioConErrorEn } = resumenAlertas;

  if (!ultimoEnvioExitosoEn && !ultimoEnvioConErrorEn) {
    return null;
  }

  if (ultimoEnvioConErrorEn && (!ultimoEnvioExitosoEn || ultimoEnvioConErrorEn > ultimoEnvioExitosoEn)) {
    return "CON_ERRORES";
  }

  return "AVISO_ENVIADO";
}
