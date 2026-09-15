import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

// Visible para ADMIN/REVISOR_REPOSITORIO solo si la carga ya fue aprobada por su notificador.
export async function obtenerCargaAprobada(
  id: string,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<CargaArchivo | null> {
  return dependencias.repositorio.obtenerAprobadaPorId(id);
}
