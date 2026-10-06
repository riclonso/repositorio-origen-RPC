"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { normalizarValorEnumerado } from "@/modules/formatos-excel/domain/entities/TipoEnumerado";
import type { ColumnaEditable } from "@/shared/components/TablaColumnasFormatoExcel";

export type TipoEnumeradoEditable = { nombre: string; valores: string[] };

// Tipos enumerados del formato en edición, compartido por el asistente de creación y el formulario
// de edición. Mantiene coherentes las columnas que los usan (mismo papel que
// `useEliminarColumnaFormato` cumple con las reglas):
// - renombrar un tipo propaga el nombre nuevo a toda columna que lo usaba;
// - eliminar un tipo que alguna columna usa no está permitido (la UI deshabilita el botón y aquí
//   se vuelve a comprobar), para que ninguna columna quede apuntando a un tipo inexistente.
export function useTiposEnumeradosFormato(
  tiposIniciales: () => TipoEnumeradoEditable[],
  columnas: ColumnaEditable[],
  setColumnas: Dispatch<SetStateAction<ColumnaEditable[]>>,
) {
  const [tiposEnumerados, setTiposEnumerados] = useState<TipoEnumeradoEditable[]>(tiposIniciales);

  function columnasQueUsan(nombreTipo: string): string[] {
    const nombreNormalizado = normalizarValorEnumerado(nombreTipo);

    return columnas
      .filter(
        (columna) =>
          columna.tipoEnumeradoNombre !== null &&
          normalizarValorEnumerado(columna.tipoEnumeradoNombre) === nombreNormalizado,
      )
      .map((columna) => columna.nombre || `Columna ${columna.orden}`);
  }

  // `indice === null` agrega un tipo nuevo; un número reemplaza el tipo en esa posición.
  function guardarTipo(indice: number | null, tipo: TipoEnumeradoEditable) {
    if (indice === null) {
      setTiposEnumerados((actuales) => [...actuales, tipo]);
      return;
    }

    const anterior = tiposEnumerados[indice];
    if (!anterior) return;

    setTiposEnumerados((actuales) => actuales.map((actual, i) => (i === indice ? tipo : actual)));

    if (anterior.nombre !== tipo.nombre) {
      const nombreAnterior = normalizarValorEnumerado(anterior.nombre);

      setColumnas((actuales) =>
        actuales.map((columna) =>
          columna.tipoEnumeradoNombre !== null &&
          normalizarValorEnumerado(columna.tipoEnumeradoNombre) === nombreAnterior
            ? { ...columna, tipoEnumeradoNombre: tipo.nombre }
            : columna,
        ),
      );
    }
  }

  function eliminarTipo(indice: number) {
    const tipo = tiposEnumerados[indice];
    if (!tipo || columnasQueUsan(tipo.nombre).length > 0) return;

    setTiposEnumerados((actuales) => actuales.filter((_, i) => i !== indice));
  }

  return { tiposEnumerados, columnasQueUsan, guardarTipo, eliminarTipo };
}
