import type {
  FormatoExcel,
  TipoDatoColumna,
  TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import { FormatoDuplicadoError } from "@/modules/formatos-excel/domain/errors/FormatoDuplicadoError";

export type DatosColumnaEdicion = {
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
};

export type DatosReglaValidacionEdicion = {
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
};

export type DatosEdicionFormatoExcel = {
  nombre: string;
  descripcion: string | null;
  columnas: DatosColumnaEdicion[];
  reglasValidacion: DatosReglaValidacionEdicion[];
};

export type ResultadoActualizarFormatoExcel =
  | { ok: true; formato: FormatoExcel }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "DUPLICADO"; nombre: string };

// La plantilla persistida NO se toca aquí (decisión ya tomada): solo se reemplazan
// `nombre`/`descripcion` y el set completo de columnas.
export async function actualizarFormatoExcel(
  id: string,
  datos: DatosEdicionFormatoExcel,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoActualizarFormatoExcel> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  if (datos.nombre !== actual.nombre) {
    const conflicto = await dependencias.repositorio.buscarPorNombre(datos.nombre);

    if (conflicto && conflicto.id !== id) {
      return { ok: false, motivo: "DUPLICADO", nombre: datos.nombre };
    }
  }

  const columnasConOrden = datos.columnas.map((columna, indice) => ({ ...columna, orden: indice + 1 }));
  const reglasValidacionConOrden = datos.reglasValidacion.map((regla, indice) => ({
    ...regla,
    orden: indice + 1,
  }));

  try {
    const formato = await dependencias.repositorio.actualizar(id, {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      columnas: columnasConOrden,
      reglasValidacion: reglasValidacionConOrden,
    });

    return { ok: true, formato };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarPorNombre` y el UPDATE.
    if (error instanceof FormatoDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", nombre: datos.nombre };
    }

    throw error;
  }
}
