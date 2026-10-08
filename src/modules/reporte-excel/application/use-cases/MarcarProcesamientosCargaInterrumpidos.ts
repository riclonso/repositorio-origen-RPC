import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

// RF-38: al arrancar, toda carga que quedó en `PROCESANDO` antes del arranque ya no tiene quién la
// termine (el proceso anterior se detuvo): pasa a `CON_ERRORES` con un error "La validación se
// interrumpió". Su archivo se conserva (es un intento fallido descargable por su dueño). Se asume una
// sola instancia del servidor, igual que en RF-37.
export async function marcarProcesamientosCargaInterrumpidos(
  arranque: Date,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<string[]> {
  return dependencias.repositorio.marcarProcesamientosInterrumpidos({ anterioresA: arranque });
}
