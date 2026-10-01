import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

// Contador liviano para la campana del revisor. Una carga solo aparece aquí después de que el
// notificador la finaliza y envía; los borradores o archivos con errores nunca generan aviso.
export async function contarCargasPendientesRevision(dependencias: {
  repositorio: CargaArchivoRepository;
}): Promise<number> {
  return dependencias.repositorio.contarPendientesFinalizadas();
}
