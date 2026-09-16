import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { AlertaNotificacionRepository } from "@/modules/ventanas-carga/domain/repositories/AlertaNotificacionRepository";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import {
  UMBRAL_DIAS_ALERTA_VENCIMIENTO_VENTANA,
  calcularDiasRestantes,
  calcularFraccionTiempoTranscurrido,
} from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import {
  resolverEstadoAlertaVentana,
  type ResumenSeguimientoVentanaCarga,
} from "@/modules/ventanas-carga/domain/entities/ResumenSeguimientoVentana";

export type DependenciasResumenSeguimientoVentanas = {
  repositorioVentanas: VentanaCargaRepository;
  repositorioFormatos: FormatoExcelRepository;
  repositorioCargas: CargaArchivoRepository;
  repositorioAlertas: AlertaNotificacionRepository;
};

// RF-16 (tablero de seguimiento): resumen por cada ventana ABIERTA (misma noción de "abierta" que
// `app/notificador/page.tsx`, reutilizando `listarDisponibles()` en vez de reimplementar el
// filtro de fechas/publicación). Orquesta exactamente 3 consultas en total, nunca una por
// tarjeta: `listarDisponibles`, el conteo agrupado de asignados por formato y el conteo agrupado
// de quiénes ya reportaron por ventana. Solo conoce interfaces de `domain/repositories/`, nunca
// Prisma directamente.
export async function obtenerResumenSeguimientoVentanasAbiertas(
  dependencias: DependenciasResumenSeguimientoVentanas,
  ahora: Date = new Date(),
): Promise<ResumenSeguimientoVentanaCarga[]> {
  const ventanasAbiertas = await dependencias.repositorioVentanas.listarDisponibles(ahora);

  if (ventanasAbiertas.length === 0) return [];

  const formatoExcelIds = ventanasAbiertas.map((ventana) => ventana.formatoExcelId);
  const ventanaCargaIds = ventanasAbiertas.map((ventana) => ventana.id);

  const [asignadosPorFormato, reportaronPorVentana, resumenAlertasPorVentana] = await Promise.all([
    dependencias.repositorioFormatos.contarNotificadoresAsignadosActivosPorFormato(formatoExcelIds),
    dependencias.repositorioCargas.contarNotificadoresDistintosPorVentana(ventanaCargaIds),
    dependencias.repositorioAlertas.obtenerResumenPorVentanas(ventanaCargaIds),
  ]);

  return ventanasAbiertas.map((ventana) => {
    const diasRestantes = calcularDiasRestantes(ventana.fechaVencimiento, ahora);

    return {
      ventanaCargaId: ventana.id,
      formatoExcelId: ventana.formatoExcelId,
      formatoExcelNombre: ventana.formatoExcelNombre,
      anio: ventana.anio,
      fechaApertura: ventana.fechaApertura,
      fechaVencimiento: ventana.fechaVencimiento,
      // Fallback a 0: un formato sin ningún notificador asignado, o una ventana sin nadie que haya
      // reportado, no aparece como clave en el mapa devuelto por el repositorio.
      totalNotificadoresAsignados: asignadosPorFormato[ventana.formatoExcelId] ?? 0,
      totalNotificadoresReportaron: reportaronPorVentana[ventana.id] ?? 0,
      diasRestantes,
      fraccionTiempoTranscurrido: calcularFraccionTiempoTranscurrido(
        ventana.fechaApertura,
        ventana.fechaVencimiento,
        ahora,
      ),
      vencimientoProximo: diasRestantes <= UMBRAL_DIAS_ALERTA_VENCIMIENTO_VENTANA,
      estadoAlerta: resolverEstadoAlertaVentana(ventana, resumenAlertasPorVentana[ventana.id] ?? {
        ultimoEnvioExitosoEn: null,
        ultimoEnvioConErrorEn: null,
      }),
    };
  });
}
