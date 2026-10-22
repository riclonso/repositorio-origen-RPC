import type { AlmacenReglasLlenado, RegistrarFalloNoFatal } from "@/modules/formatos-excel/application/ports";
import type { ReglasLlenadoFormato } from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";
import type { ReglasLlenadoRepository } from "@/modules/formatos-excel/domain/repositories/ReglasLlenadoRepository";

export type DependenciasEliminarReglasLlenado = {
  repositorio: ReglasLlenadoRepository;
  almacen: AlmacenReglasLlenado;
  registrarFallo: RegistrarFalloNoFatal;
};

export type ResultadoEliminarReglasLlenado =
  | { ok: true; reglas: ReglasLlenadoFormato }
  | { ok: false; motivo: "NO_ENCONTRADO" };

// RF-45: primero la fila (desde ese momento nadie puede descargarlo), luego el archivo. Un fallo al
// borrar el archivo no revierte la eliminación: se registra en errores.txt.
export async function eliminarReglasLlenado(
  formatoExcelId: string,
  dependencias: DependenciasEliminarReglasLlenado,
): Promise<ResultadoEliminarReglasLlenado> {
  const eliminada = await dependencias.repositorio.eliminar(formatoExcelId);

  if (!eliminada) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  try {
    await dependencias.almacen.eliminar(eliminada.rutaArchivo);
  } catch (error) {
    dependencias.registrarFallo("No se pudo eliminar el archivo de reglas de llenado", error);
  }

  return { ok: true, reglas: eliminada };
}
