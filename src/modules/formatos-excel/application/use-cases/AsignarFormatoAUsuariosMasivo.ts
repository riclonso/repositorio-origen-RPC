import type { ClasificacionCambiosAsignacion } from "@/modules/formatos-excel/domain/entities/AsignacionFormato";
import { ConflictoConcurrenteError } from "@/modules/formatos-excel/domain/errors/ConflictoConcurrenteError";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

export type ResultadoAsignarFormatoMasivo =
  | { ok: true; nombre: string; clasificacion: ClasificacionCambiosAsignacion }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "FORMATO_INVALIDO"; nombre: string }
  | { ok: false; motivo: "CONFLICTO_CONCURRENTE" };

// Procesamiento parcial: aplica lo aplicable e informa lo omitido (no elegibles, sin cambio, y
// quienes quedarían sin ningún formato). Las comprobaciones de existencia y estado del formato, y
// la clasificación de cada id (`clasificarCambiosAsignacion`, dominio), se hacen DENTRO de la
// transacción del repositorio: comprobarlas antes y fuera dejaría una ventana de carrera con una
// desactivación o una edición de usuario concurrente.
export async function asignarFormatoAUsuariosMasivo(
  id: string,
  cambios: { agregarIds: string[]; quitarIds: string[] },
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoAsignarFormatoMasivo> {
  try {
    const resultado = await dependencias.repositorio.aplicarAsignacionesMasivas(
      id,
      cambios.agregarIds,
      cambios.quitarIds,
    );

    switch (resultado.estado) {
      case "NO_ENCONTRADO":
        return { ok: false, motivo: "NO_ENCONTRADO" };
      case "FORMATO_INACTIVO":
        return { ok: false, motivo: "FORMATO_INVALIDO", nombre: resultado.nombre };
      case "APLICADO":
        return { ok: true, nombre: resultado.nombre, clasificacion: resultado.clasificacion };
    }
  } catch (error) {
    if (error instanceof ConflictoConcurrenteError) return { ok: false, motivo: "CONFLICTO_CONCURRENTE" };
    throw error;
  }
}
