import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

export type ResultadoEliminarFormatoExcel =
  | { ok: true; nombre: string }
  | { ok: false; motivo: "NO_ENCONTRADO" | "CON_VENTANAS_ACTIVAS"; nombre?: string };

export async function eliminarFormatoExcel(
  id: string,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoEliminarFormatoExcel> {
  const formato = await dependencias.repositorio.obtenerPorId(id);
  if (!formato) return { ok: false, motivo: "NO_ENCONTRADO" };

  const resultado = await dependencias.repositorio.eliminar(id);
  if (resultado === "ELIMINADO") return { ok: true, nombre: formato.nombre };
  if (resultado === "NO_ENCONTRADO") return { ok: false, motivo: "NO_ENCONTRADO" };
  return { ok: false, motivo: "CON_VENTANAS_ACTIVAS", nombre: formato.nombre };
}
