import type { ReglaValidacionFormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { celdaVacia, parsearFecha } from "@/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";

// Contexto adicional que necesitan `FECHA_DENTRO_DE_VENTANA_VIGENTE` y
// `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`, a diferencia de `ALGUNA_COLUMNA_CON_VALOR`: el rango
// (o el año) no se deriva de la fila, sino de la ventana de carga elegida para la subida completa
// (RF-15). `anio` es el año calendario de la ventana (`VentanaCarga.anio`), distinto del rango
// exacto `fechaApertura`/`fechaVencimiento` que usa la primera regla.
export type ContextoEvaluacionReglas = {
  ventana: { fechaApertura: Date; fechaVencimiento: Date; anio: number };
};

// Tres tipos de regla soportados hoy (ver `TIPOS_REGLA_VALIDACION` en `formatos-excel`):
// `ALGUNA_COLUMNA_CON_VALOR` (de un conjunto de columnas, al menos una debe traer valor en la
// fila), `FECHA_DENTRO_DE_VENTANA_VIGENTE` (una columna de fecha debe caer dentro del rango de la
// ventana vigente) y `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA` (una "fecha efectiva" calculada a
// partir de varias columnas debe caer dentro del AÑO calendario de la ventana). Un tipo de regla
// nuevo exige agregar su propio `case` aquí, mismo criterio que `ValidadoresTipoDato` para los
// tipos de dato.
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
    // `columnas[0]` = principal, `columnas[1..]` = alternativas (convención documentada en
    // `domain/entities/FormatoExcel.ts`). Prioridad: (1) principal con valor parseable → esa es
    // la fecha efectiva; (2) principal vacía → la MÁS ANTIGUA de las alternativas con valor
    // parseable; (3) ninguna columna aporta una fecha utilizable → falla la regla (decisión
    // explícita: no depende de que alguna columna esté marcada "requerida"). Una columna con
    // valor que no parsea como fecha ya quedó reportada como `TIPO_DATO_INVALIDO` en un paso
    // anterior: se trata como "no utilizable" (ni como fecha válida, ni como aporte a "vacío"),
    // sin duplicar el error.
    case "FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA": {
      const [nombrePrincipal, ...nombresAlternativas] = regla.columnas;
      if (!nombrePrincipal) return true; // config inválida, no debería pasar la validación de schema

      const valorPrincipal = fila[nombrePrincipal] ?? null;
      if (!celdaVacia(valorPrincipal)) {
        const fechaPrincipal = parsearFecha(valorPrincipal);
        if (!fechaPrincipal) return true; // ya reportado como TIPO_DATO_INVALIDO, no duplicar

        return fechaPrincipal.getFullYear() === contexto.ventana.anio;
      }

      const fechasAlternativas = nombresAlternativas
        .map((nombre) => fila[nombre] ?? null)
        .filter((valor) => !celdaVacia(valor))
        .map((valor) => parsearFecha(valor))
        .filter((fecha): fecha is Date => fecha !== null);

      const algunaAlternativaConValorNoVacio = nombresAlternativas.some(
        (nombre) => !celdaVacia(fila[nombre] ?? null),
      );

      // Alguna alternativa traía valor pero ninguna parseó: ya reportado, no duplicar.
      if (algunaAlternativaConValorNoVacio && fechasAlternativas.length === 0) return true;

      // Ninguna columna (ni la principal ni ninguna alternativa) aportó una fecha utilizable.
      if (fechasAlternativas.length === 0) return false;

      const fechaEfectiva = fechasAlternativas.reduce((minima, actual) => (actual < minima ? actual : minima));
      return fechaEfectiva.getFullYear() === contexto.ventana.anio;
    }
    default:
      return true;
  }
}
