"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ColumnaEditable } from "@/shared/components/TablaColumnasFormatoExcel";
import type { ReglaValidacionEditable } from "@/shared/components/EditorReglasValidacionFormatoExcel";

function normalizar(nombre: string): string {
  return nombre.trim().toLocaleLowerCase();
}

// Eliminación de una columna del formato, compartida por el asistente de creación y el formulario
// de edición. Una regla que mencionaba la columna eliminada deja de ser válida por definición, así
// que se elimina completa (nunca queda una regla parcial con semántica distinta a la configurada);
// si hay reglas afectadas, primero se pide confirmación.
export function useEliminarColumnaFormato(
  reglasValidacion: ReglaValidacionEditable[],
  setColumnas: Dispatch<SetStateAction<ColumnaEditable[]>>,
  setReglasValidacion: Dispatch<SetStateAction<ReglaValidacionEditable[]>>,
) {
  const [columnaPendienteEliminacion, setColumnaPendienteEliminacion] = useState<ColumnaEditable | null>(null);

  function eliminarColumnaYReglas(columnaAEliminar: ColumnaEditable) {
    const nombreNormalizado = normalizar(columnaAEliminar.nombre);

    setColumnas((actuales) =>
      actuales
        .filter((columna) => columna !== columnaAEliminar)
        .map((columna, indice) => ({ ...columna, orden: indice + 1 })),
    );
    setReglasValidacion((actuales) =>
      actuales.filter((regla) => !regla.columnas.some((nombre) => normalizar(nombre) === nombreNormalizado)),
    );
  }

  function solicitarEliminarColumna(columna: ColumnaEditable) {
    const nombreNormalizado = normalizar(columna.nombre);
    const tieneReglasAsociadas = reglasValidacion.some((regla) =>
      regla.columnas.some((nombre) => normalizar(nombre) === nombreNormalizado),
    );

    if (tieneReglasAsociadas) {
      setColumnaPendienteEliminacion(columna);
      return;
    }

    eliminarColumnaYReglas(columna);
  }

  function confirmarEliminarColumna() {
    if (!columnaPendienteEliminacion) return;
    eliminarColumnaYReglas(columnaPendienteEliminacion);
    setColumnaPendienteEliminacion(null);
  }

  function cancelarEliminarColumna() {
    setColumnaPendienteEliminacion(null);
  }

  return { columnaPendienteEliminacion, solicitarEliminarColumna, confirmarEliminarColumna, cancelarEliminarColumna };
}
