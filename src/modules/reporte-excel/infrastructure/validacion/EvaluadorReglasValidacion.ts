import type { ReglaValidacionFormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  celdaVacia,
  parsearFecha,
  serializarValorParaClaveDuplicado,
} from "@/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";

// Contexto adicional que necesitan `FECHA_DENTRO_DE_VENTANA_VIGENTE` y
// `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`, a diferencia de `ALGUNA_COLUMNA_CON_VALOR`: el rango
// (o el año) no se deriva de la fila, sino de la ventana de carga elegida para la subida completa
// (RF-15). `anio` es el año calendario de la ventana (`VentanaCarga.anio`), distinto del rango
// exacto `fechaApertura`/`fechaVencimiento` que usa la primera regla.
export type ContextoEvaluacionReglas = {
  ventana: { fechaApertura: Date; fechaVencimiento: Date; anio: number };
};

// Cuatro tipos de regla soportados hoy (ver `TIPOS_REGLA_VALIDACION` en `formatos-excel`):
// `ALGUNA_COLUMNA_CON_VALOR` (de un conjunto de columnas, al menos una debe traer valor en la
// fila), `FECHA_DENTRO_DE_VENTANA_VIGENTE` (una columna de fecha debe caer dentro del rango de la
// ventana vigente), `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA` (una "fecha efectiva" calculada a
// partir de varias columnas debe caer dentro del AÑO calendario de la ventana) y `FILA_DUPLICADA`.
// Un tipo de regla nuevo exige agregar su propio `case` aquí, mismo criterio que
// `ValidadoresTipoDato` para los tipos de dato.
//
// `FILA_DUPLICADA` es la excepción: a diferencia de las otras tres, que son puras y evalúan una
// fila de forma aislada, detectar una fila repetida exige memoria de las filas ya vistas en el
// mismo archivo. Por eso NO se resuelve en `cumpleReglaValidacion` (que se mantiene puro y sin
// estado): el `case` de abajo devuelve `true` (sin error) a propósito para esta regla, y el
// chequeo real vive en `crearRastreadorFilasDuplicadas`/`evaluarFilaDuplicada`, más abajo, que
// `ValidarYCargarArchivo` invoca aparte dentro del mismo recorrido de filas.
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
    // Ver comentario de la función: `FILA_DUPLICADA` se evalúa aparte, con estado
    // (`crearRastreadorFilasDuplicadas`/`evaluarFilaDuplicada`), no aquí.
    case "FILA_DUPLICADA":
      return true;
    default:
      return true;
  }
}

// Estado por regla `FILA_DUPLICADA` del formato: la clave serializada de cada fila ya vista,
// mapeada al número de la fila donde apareció por primera vez (el "original", que nunca se marca
// como error — decisión de negocio: solo la 2ª aparición en adelante se rechaza). Una entrada de
// mapa por regla, para que dos reglas `FILA_DUPLICADA` con columnas distintas del mismo formato no
// interfieran entre sí.
export type RastreadorFilasDuplicadas = Map<string, Map<string, number>>;

// Se construye una sola vez por carga de archivo (no por fila), a partir de las reglas
// `FILA_DUPLICADA` del formato. `ValidarYCargarArchivo` lo crea antes de recorrer las filas y lo
// reutiliza durante todo el recorrido, manteniendo la evaluación en O(filas) por regla (un solo
// recorrido, sin bucles anidados ni una segunda pasada sobre el archivo).
export function crearRastreadorFilasDuplicadas(
  reglas: ReglaValidacionFormatoExcel[],
): RastreadorFilasDuplicadas {
  const rastreador: RastreadorFilasDuplicadas = new Map();

  for (const regla of reglas) {
    if (regla.tipo === "FILA_DUPLICADA") {
      rastreador.set(regla.id, new Map());
    }
  }

  return rastreador;
}

// Evalúa una fila contra una regla `FILA_DUPLICADA` puntual, actualizando el estado del
// rastreador. Reglas de negocio ya confirmadas:
// - Comparación case-sensitive tras `trim()` (vía `serializarValorParaClaveDuplicado`): "Juan" y
//   "JUAN" NO son la misma clave.
// - Si TODOS los valores de la clave están vacíos, la fila queda excluida del chequeo (no se
//   marca ni se registra en el mapa), incluso si otra fila también tiene esa misma clave vacía.
// - Solo la 2ª aparición en adelante de una misma clave se marca como duplicada; la primera
//   aparición ("el original") nunca se marca, solo queda registrada para detectar la siguiente.
export function evaluarFilaDuplicada(
  rastreador: RastreadorFilasDuplicadas,
  regla: ReglaValidacionFormatoExcel,
  fila: Record<string, ValorCeldaArchivo>,
  numeroFila: number,
): boolean {
  const clavesPorRegla = rastreador.get(regla.id);
  if (!clavesPorRegla) return false; // config inconsistente (no debería pasar), no reporta error

  const valoresClave: (string | null)[] = regla.columnas.map((columna) =>
    serializarValorParaClaveDuplicado(fila[columna] ?? null),
  );

  const todasVacias = valoresClave.every((valor) => valor === null);
  if (todasVacias) return false; // decisión de negocio: excluida del chequeo, no se registra

  // `JSON.stringify` sobre el ARRAY (no sobre cada valor por separado) produce una representación
  // textual unívoca de la combinación de valores: distingue automáticamente `null` (columna vacía,
  // serializa sin comillas) de la cadena literal "null" (serializa como `"null"`, con comillas), y
  // escapa comillas/backslashes/cualquier carácter especial dentro de los valores de texto sin
  // depender de que algún separador esté ausente del contenido real de la celda.
  const clave = JSON.stringify(valoresClave);

  if (clavesPorRegla.has(clave)) {
    return true; // 2ª aparición en adelante: duplicada
  }

  clavesPorRegla.set(clave, numeroFila);
  return false; // primera aparición: es "el original", no se marca
}
