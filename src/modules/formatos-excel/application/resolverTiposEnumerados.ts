import type {
  DatosColumnaNueva,
  DatosTipoEnumeradoNuevo,
  TipoDatoColumna,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  buscarTipoEnumeradoPorNombre,
  normalizarValorEnumerado,
} from "@/modules/formatos-excel/domain/entities/TipoEnumerado";

type ColumnaEntrada = {
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
  tipoEnumeradoNombre: string | null;
};

type TipoEnumeradoEntrada = { nombre: string; valores: string[] };

// Rechazos posibles, compartidos con los resultados de `CrearFormatoExcel`/`ActualizarFormatoExcel`.
export type RechazoTiposEnumerados =
  | { ok: false; motivo: "TIPO_ENUMERADO_DUPLICADO"; nombreTipo: string }
  | { ok: false; motivo: "REFERENCIA_TIPO_ENUMERADO_INVALIDA"; nombreColumna: string };

export type ResultadoResolverTiposEnumerados =
  | { ok: true; columnas: DatosColumnaNueva[]; tiposEnumerados: DatosTipoEnumeradoNuevo[] }
  | RechazoTiposEnumerados;

// Revalidación en `application/` (defensa en profundidad frente al esquema Zod, que ya lo exige):
// nombres de tipos únicos sin distinguir mayúsculas, invariante `ENUMERADO` ⇔ nombre, y toda
// referencia debe existir en el mismo payload. Además:
// - la columna guarda SIEMPRE el nombre tal como está en el tipo enumerado (no como lo escribió
//   el cliente), para que la referencia por nombre no dependa de mayúsculas;
// - el orden de columnas y tipos lo fija el servidor por posición, nunca el cliente.
// Compartida entre la creación y la edición.
export function resolverTiposEnumerados(
  columnas: ColumnaEntrada[],
  tiposEnumerados: TipoEnumeradoEntrada[],
): ResultadoResolverTiposEnumerados {
  const nombresVistos = new Set<string>();

  for (const tipo of tiposEnumerados) {
    const normalizado = normalizarValorEnumerado(tipo.nombre);
    // Un nombre repetido haría ambigua cualquier referencia por nombre.
    if (nombresVistos.has(normalizado)) {
      return { ok: false, motivo: "TIPO_ENUMERADO_DUPLICADO", nombreTipo: tipo.nombre };
    }
    nombresVistos.add(normalizado);
  }

  const columnasResueltas: DatosColumnaNueva[] = [];

  for (const [indice, columna] of columnas.entries()) {
    let tipoEnumeradoNombre: string | null = null;

    if (columna.tipoDato === "ENUMERADO") {
      const tipo =
        columna.tipoEnumeradoNombre === null
          ? undefined
          : buscarTipoEnumeradoPorNombre(tiposEnumerados, columna.tipoEnumeradoNombre);

      if (!tipo) {
        return { ok: false, motivo: "REFERENCIA_TIPO_ENUMERADO_INVALIDA", nombreColumna: columna.nombre };
      }
      tipoEnumeradoNombre = tipo.nombre;
    } else if (columna.tipoEnumeradoNombre !== null) {
      return { ok: false, motivo: "REFERENCIA_TIPO_ENUMERADO_INVALIDA", nombreColumna: columna.nombre };
    }

    columnasResueltas.push({
      orden: indice + 1,
      nombre: columna.nombre,
      requerida: columna.requerida,
      tipoDato: columna.tipoDato,
      tipoEnumeradoNombre,
    });
  }

  return {
    ok: true,
    columnas: columnasResueltas,
    tiposEnumerados: tiposEnumerados.map((tipo, indice) => ({
      orden: indice + 1,
      nombre: tipo.nombre,
      valores: tipo.valores,
    })),
  };
}
