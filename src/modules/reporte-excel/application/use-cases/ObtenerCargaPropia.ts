import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

// Ownership explícito por `usuarioId`: una carga que no pertenece al actor se trata como si no
// existiera (`null`), nunca se distingue "no existe" de "no es tuya" hacia afuera.
export async function obtenerCargaPropia(
  id: string,
  usuarioId: string,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<CargaArchivo | null> {
  return dependencias.repositorio.obtenerPropiaPorId(id, usuarioId);
}
