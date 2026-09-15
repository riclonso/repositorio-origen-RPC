import type { ReglaValidacionFormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { celdaVacia, parsearFecha } from "@/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";

// Contexto adicional que necesita `FECHA_DENTRO_DE_VENTANA_VIGENTE`, a diferencia de
// `ALGUNA_COLUMNA_CON_VALOR`: el rango no se deriva de la fila, sino de la ventana de carga
// elegida para la subida completa (RF-15).
export type ContextoEvaluacionReglas = {
  ventana: { fechaApertura: Date; fechaVencimiento: Date };
};

// Dos tipos de regla soportados hoy (ver `TIPOS_REGLA_VALIDACION` en `formatos-excel`):
// `ALGUNA_COLUMNA_CON_VALOR` (de un conjunto de columnas, al menos una debe traer valor en la
// fila) y `FECHA_DENTRO_DE_VENTANA_VIGENTE` (una columna de fecha debe caer dentro del rango de
// la ventana vigente). Un tipo de regla nuevo exige agregar su propio `case` aquí, mismo criterio
// que `ValidadoresTipoDato` para los tipos de dato.
export function cumpleReglaValidacion(
  regla: ReglaValidacionFormatoExcel,
  fila: Record<string, ValorCeldaArchivo>,
  contexto: ContextoEvaluacionReglas,
): boolean {
  switch (regla.tipo) {
    case "ALGUNA_COLUMNA_CON_VALOR":
      return regla.columnas.some((nombreColumna) => !celdaVacia(fila[nombreColumna] ?? null));
    case "FECHA_DENTRO_DE_VENTANA_VIGENTE": {
      const nombreColumna = regla.columnas[0];
      if (!nombreColumna) return true;

      const valor = fila[nombreColumna] ?? null;
      const fecha = parsearFecha(valor);

      // Una celda que no es una fecha válida ya quedó reportada como `TIPO_DATO_INVALIDO` en un
      // paso anterior de `ValidarYCargarArchivo`: esta regla no reporta nada más para no
      // duplicar el error.
      if (!fecha) return true;

      return fecha >= contexto.ventana.fechaApertura && fecha <= contexto.ventana.fechaVencimiento;
    }
    default:
      return true;
  }
}
