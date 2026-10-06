import type {
  FormatoExcel,
  SeparadorCsv,
  TipoDatoColumna,
  TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import { FormatoDuplicadoError } from "@/modules/formatos-excel/domain/errors/FormatoDuplicadoError";
import {
  resolverTiposEnumerados,
  type RechazoTiposEnumerados,
} from "@/modules/formatos-excel/application/resolverTiposEnumerados";

export type DatosColumnaEdicion = {
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
  tipoEnumeradoNombre: string | null;
};

export type DatosTipoEnumeradoEdicion = {
  nombre: string;
  valores: string[];
};

export type DatosReglaValidacionEdicion = {
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
};

export type DatosEdicionFormatoExcel = {
  nombre: string;
  descripcion: string | null;
  // `undefined` conserva el separador actual.
  separadorCsv?: SeparadorCsv | null;
  columnas: DatosColumnaEdicion[];
  reglasValidacion: DatosReglaValidacionEdicion[];
  tiposEnumerados: DatosTipoEnumeradoEdicion[];
};

// Igualdad estructural (nombre y valores, en orden) entre el set persistido y el recibido. Solo
// alimenta la auditoría (`campos: ["tiposEnumerados"]`), nunca la lista de valores.
function mismosTiposEnumerados(
  anteriores: readonly { nombre: string; valores: readonly string[] }[],
  nuevos: readonly { nombre: string; valores: readonly string[] }[],
): boolean {
  return (
    anteriores.length === nuevos.length &&
    anteriores.every((anterior, indice) => {
      const nuevo = nuevos[indice];
      return (
        anterior.nombre === nuevo.nombre &&
        anterior.valores.length === nuevo.valores.length &&
        anterior.valores.every((valor, posicion) => valor === nuevo.valores[posicion])
      );
    })
  );
}

export type ResultadoActualizarFormatoExcel =
  | { ok: true; formato: FormatoExcel; separadorCsvCambiado: boolean; tiposEnumeradosCambiados: boolean }
  | RechazoTiposEnumerados
  | { ok: false; motivo: "NO_ENCONTRADO" }
  // Separador incoherente con el `tipoArchivo` persistido (inmutable): falta en un CSV o viene
  // en un EXCEL.
  | { ok: false; motivo: "SEPARADOR_INVALIDO" }
  | { ok: false; motivo: "DUPLICADO"; nombre: string };

// La plantilla persistida NO se toca aquí (decisión ya tomada): solo se reemplazan
// `nombre`/`descripcion`, el separador CSV y el set completo de columnas y reglas.
export async function actualizarFormatoExcel(
  id: string,
  datos: DatosEdicionFormatoExcel,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoActualizarFormatoExcel> {
  // Antes de consultar la base de datos: una referencia inválida no necesita ninguna lectura.
  // También fija el orden de columnas y tipos enumerados por posición.
  const resueltos = resolverTiposEnumerados(datos.columnas, datos.tiposEnumerados);

  if (!resueltos.ok) {
    return resueltos;
  }

  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const separadorCsv = datos.separadorCsv === undefined ? actual.separadorCsv : datos.separadorCsv;

  if ((actual.tipoArchivo === "CSV") !== (separadorCsv !== null)) {
    return { ok: false, motivo: "SEPARADOR_INVALIDO" };
  }

  if (datos.nombre !== actual.nombre) {
    const conflicto = await dependencias.repositorio.buscarPorNombre(datos.nombre);

    if (conflicto && conflicto.id !== id) {
      return { ok: false, motivo: "DUPLICADO", nombre: datos.nombre };
    }
  }

  const reglasValidacionConOrden = datos.reglasValidacion.map((regla, indice) => ({
    ...regla,
    orden: indice + 1,
  }));

  try {
    const formato = await dependencias.repositorio.actualizar(id, {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      separadorCsv,
      columnas: resueltos.columnas,
      reglasValidacion: reglasValidacionConOrden,
      tiposEnumerados: resueltos.tiposEnumerados,
    });

    return {
      ok: true,
      formato,
      separadorCsvCambiado: separadorCsv !== actual.separadorCsv,
      tiposEnumeradosCambiados: !mismosTiposEnumerados(actual.tiposEnumerados, resueltos.tiposEnumerados),
    };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarPorNombre` y el UPDATE.
    if (error instanceof FormatoDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", nombre: datos.nombre };
    }

    throw error;
  }
}
