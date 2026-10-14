import { cumpleComparacionFechas, cumpleOperador } from "./ComparadorFechas";
import { createHash, hash } from "node:crypto";
import {
  esConfiguracionAnioDentroDeRango,
  esConfiguracionComparacionAnioVentana,
  esConfiguracionComparacionFechas,
  MARCADOR_ANIO_DESDE,
  MARCADOR_ANIO_HASTA,
  MARCADOR_ANIO_VENTANA,
  type ConfiguracionAnioDentroDeRango,
  type ReglaValidacionFormatoExcel,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  celdaVacia,
  parsearFecha,
  serializarValorParaClaveDuplicado,
} from "@/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";
import { contieneHtml } from "@/modules/reporte-excel/infrastructure/validacion/DetectorContenidoHtml";
import { esRutValidoFlexible } from "@/shared/utils/rut";

// Un RUT (o su número) puede llegar como número desde un `.xlsx` o desde un CSV cuyo campo es
// solo dígitos. Un entero se escribe sin decimales ni notación exponencial; cualquier otra cosa
// (decimal, fecha, booleano) se convierte a texto y no calzará con el patrón de RUT.
function aTextoRut(valor: ValorCeldaArchivo): string {
  if (typeof valor === "number" && Number.isSafeInteger(valor)) return valor.toFixed(0);
  if (valor instanceof Date) return valor.toISOString();
  return String(valor ?? "").trim();
}

// Contexto adicional que necesita `COMPARACION_ANIO_VENTANA`: el año no se deriva
// de la fila, sino de la ventana de carga elegida para la subida completa (`VentanaCarga.anio`).
// `diaCalendarioHoy` (para `FECHA_NO_FUTURA`): el día calendario en America/Santiago del momento de
// la validación, como `Date.UTC(año, mes, día)`; se calcula una vez por archivo, no por fila.
export type ContextoEvaluacionReglas = {
  ventana: { fechaApertura: Date; fechaVencimiento: Date; anio: number };
  diaCalendarioHoy?: number;
};

const FORMATEADOR_DIA_SANTIAGO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" });

export function diaCalendarioSantiago(instante: Date): number {
  const partes = Object.fromEntries(FORMATEADOR_DIA_SANTIAGO.formatToParts(instante).map((parte) => [parte.type, parte.value]));
  return Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day));
}

function rangoAniosVentana(configuracion: ConfiguracionAnioDentroDeRango, anioVentana: number): { desde: number; hasta: number } {
  return { desde: anioVentana - configuracion.aniosAntes, hasta: anioVentana + configuracion.aniosDespues };
}

// Mensaje que se registra cuando una regla falla. `COMPARACION_ANIO_VENTANA` interpreta solo el
// marcador `{anioVentana}`; `ANIO_DENTRO_DE_RANGO_VENTANA` además `{anioDesde}` y `{anioHasta}`. En
// los demás tipos el mensaje se devuelve tal cual, así que ningún mensaje existente cambia. Nunca
// incluye valores de celdas. No depende de la fila: quien recorre un archivo lo calcula una vez por regla.
export function mensajeReglaValidacion(regla: ReglaValidacionFormatoExcel, contexto: Pick<ContextoEvaluacionReglas, "ventana">): string {
  const anioVentana = contexto.ventana.anio;
  if (regla.tipo === "COMPARACION_ANIO_VENTANA") {
    return regla.mensaje.replaceAll(MARCADOR_ANIO_VENTANA, String(anioVentana));
  }
  if (regla.tipo === "ANIO_DENTRO_DE_RANGO_VENTANA" && esConfiguracionAnioDentroDeRango(regla.configuracion)) {
    const { desde, hasta } = rangoAniosVentana(regla.configuracion, anioVentana);
    return regla.mensaje
      .replaceAll(MARCADOR_ANIO_VENTANA, String(anioVentana))
      .replaceAll(MARCADOR_ANIO_DESDE, String(desde))
      .replaceAll(MARCADOR_ANIO_HASTA, String(hasta));
  }
  return regla.mensaje;
}

// Tipos de regla soportados hoy (ver `TIPOS_REGLA_VALIDACION` en `formatos-excel`):
// `ALGUNA_COLUMNA_CON_VALOR` (de un conjunto de columnas, al menos una debe traer valor en la
// fila), `FILA_DUPLICADA`,
// `RUT_VALIDO`, (RF-32) `CONTENIDO_HTML` y `FILA_VACIA`, `FECHA_POSTERIOR_O_IGUAL`,
// `FECHA_NO_FUTURA`, `COMPARACION_ANIO_VENTANA` (año de una fecha frente al año de la ventana) y
// `ANIO_DENTRO_DE_RANGO_VENTANA` (año de cada fecha dentro de un rango en torno al año de la ventana).
// Un tipo de regla nuevo exige agregar su propio `case` aquí, mismo criterio que
// `ValidadoresTipoDato` para los tipos de dato.
//
// `FILA_DUPLICADA` es una excepción (igual que `CONTENIDO_HTML` y `FILA_VACIA`, ver su `case`):
// a diferencia de las demás, que son puras y evalúan una
// fila de forma aislada, detectar una fila repetida exige memoria de las filas ya vistas en el
// mismo archivo. Por eso NO se resuelve en `cumpleReglaValidacion` (que se mantiene puro y sin
// estado): el `case` de abajo devuelve `true` (sin error) a propósito para esta regla, y el
// chequeo real vive en `crearRastreadorFilasDuplicadas`/`evaluarFilaDuplicada`, más abajo, que
// `MotorValidacionFilas` (RF-38) invoca aparte dentro del mismo recorrido de filas.
export function cumpleReglaValidacion(
  regla: ReglaValidacionFormatoExcel,
  fila: Record<string, ValorCeldaArchivo>,
  contexto: ContextoEvaluacionReglas,
): boolean {
  switch (regla.tipo) {
    case "FECHA_POSTERIOR_O_IGUAL":
      return cumpleComparacionFechas(esConfiguracionComparacionFechas(regla.configuracion) ? regla.configuracion : null, fila);
    // Año de `columnas[0]` + desplazamiento (ausente = 0) <operador> año de la ventana. Vacía → no aplica; valor no parseable → ya
    // reportado como TIPO_DATO_INVALIDO. Año en UTC, igual que `parsearFecha` construye la fecha.
    case "COMPARACION_ANIO_VENTANA": {
      const valor = fila[regla.columnas[0] ?? ""] ?? null;
      if (celdaVacia(valor)) return true;
      const fecha = parsearFecha(valor);
      if (!fecha) return true;
      // Inalcanzable en la práctica: Zod la exige al guardar y el mapper del repositorio valida su forma al leer.
      if (!esConfiguracionComparacionAnioVentana(regla.configuracion)) return false;
      const { operador, desplazamientoAnios = 0 } = regla.configuracion;
      return cumpleOperador(fecha.getUTCFullYear() + desplazamientoAnios - contexto.ventana.anio, operador);
    }
    // Año de cada columna en [año ventana − aniosAntes, año ventana + aniosDespues], bordes incluidos.
    // Vacías o no parseables no cuentan (estas últimas ya son TIPO_DATO_INVALIDO). Un solo booleano
    // por fila: varias columnas fuera de rango producen un único error.
    case "ANIO_DENTRO_DE_RANGO_VENTANA": {
      const anios: number[] = [];
      for (const nombreColumna of regla.columnas) {
        const valor = fila[nombreColumna] ?? null;
        if (celdaVacia(valor)) continue;
        const fecha = parsearFecha(valor);
        if (fecha) anios.push(fecha.getUTCFullYear());
      }
      // Mismo orden que `COMPARACION_ANIO_VENTANA`: sin ninguna fecha evaluable la regla no aplica.
      if (anios.length === 0) return true;
      // Inalcanzable en la práctica: Zod la exige al guardar y el mapper del repositorio valida su forma al leer.
      if (!esConfiguracionAnioDentroDeRango(regla.configuracion)) return false;
      const { desde, hasta } = rangoAniosVentana(regla.configuracion, contexto.ventana.anio);
      return anios.every((anio) => anio >= desde && anio <= hasta);
    }
    // Vacía → no falla (la obligatoriedad la decide `requerida`); valor no parseable → ya
    // reportado como TIPO_DATO_INVALIDO. Se compara el día calendario: hoy está permitido.
    case "FECHA_NO_FUTURA": {
      const valor = fila[regla.columnas[0] ?? ""] ?? null;
      if (celdaVacia(valor)) return true;
      const fecha = parsearFecha(valor);
      if (!fecha) return true;
      const hoy = contexto.diaCalendarioHoy ?? diaCalendarioSantiago(new Date());
      return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()) <= hoy;
    }
    case "ALGUNA_COLUMNA_CON_VALOR":
      return regla.columnas.some((nombreColumna) => !celdaVacia(fila[nombreColumna] ?? null));
    // Ver comentario de la función: `FILA_DUPLICADA` se evalúa aparte, con estado
    // (`crearRastreadorFilasDuplicadas`/`evaluarFilaDuplicada`), no aquí.
    case "FILA_DUPLICADA":
      return true;
    // Convención de `columnas[]` en `domain/entities/FormatoExcel.ts`: 1 columna = RUT completo;
    // 2 columnas = número + dígito verificador. Todas vacías → no falla (el dato es opcional,
    // su obligatoriedad la decide `requerida`); solo una de dos vacía → falla (RUT incompleto).
    case "RUT_VALIDO": {
      const valores = regla.columnas.map((nombreColumna) => fila[nombreColumna] ?? null);
      if (valores.length === 0 || valores.every((valor) => celdaVacia(valor))) return true;
      if (valores.some((valor) => celdaVacia(valor))) return false;

      const rut = valores.map(aTextoRut).join("-");
      return esRutValidoFlexible(rut);
    }
    // RF-32: mismo criterio que `FILA_DUPLICADA`, ninguna de las dos cabe en un booleano puro por
    // fila. `CONTENIDO_HTML` produce un error POR CELDA (ver `columnasConContenidoHtml`) y
    // `FILA_VACIA` necesita la posición de la fila respecto de la última fila con datos del
    // archivo (ver `domain/reglas/filasArchivo.ts`). `MotorValidacionFilas`
    // las evalúa aparte, dentro del mismo recorrido de filas.
    case "CONTENIDO_HTML":
    case "FILA_VACIA":
      return true;
    default:
      return true;
  }
}

// Estado por regla `FILA_DUPLICADA` del formato: el RESUMEN de la clave de cada fila ya vista (el
// "original" nunca se marca como error — decisión de negocio: solo la 2ª aparición en adelante se
// rechaza). Un conjunto por regla, para que dos reglas `FILA_DUPLICADA` con columnas distintas del
// mismo formato no interfieran entre sí.
//
// RF-38: con hasta 500.000 filas, guardar la clave textual completa podía costar cientos de MB por
// regla. Se guarda su SHA-256 truncado (132 bits, 22 caracteres base64): ~50-60 B por fila y regla.
// La probabilidad de colisión con 500.000 filas es < 4·10⁻²⁸, equivalente en la práctica a comparar
// el texto. El número de la fila original nunca se leía, así que basta un `Set`.
export type RastreadorFilasDuplicadas = Map<string, Set<string>>;

// 22 caracteres base64 = 132 bits del SHA-256 (≥ 128 bits).
const LARGO_RESUMEN_BASE64 = 22;

// `crypto.hash` (one-shot, Node ≥ 20.12) es ~2 veces más rápido y genera mucha menos basura que crear
// un `Hash` por fila (medido: con 500.000 filas, ~25 MB retenidos por regla en ambos casos, pero el
// pico de memoria transitoria baja a la mitad). Respaldo con `createHash` para un Node anterior.
function resumirClave(clave: string): string {
  const base64 = typeof hash === "function" ? hash("sha256", clave, "base64") : createHash("sha256").update(clave, "utf8").digest("base64");
  return base64.slice(0, LARGO_RESUMEN_BASE64);
}

// Se construye una sola vez por carga de archivo (no por fila), a partir de las reglas
// `FILA_DUPLICADA` del formato. `MotorValidacionFilas` lo crea antes de recorrer las filas y lo
// reutiliza durante todo el recorrido, manteniendo la evaluación en O(filas) por regla (un solo
// recorrido, sin bucles anidados ni una segunda pasada sobre el archivo).
export function crearRastreadorFilasDuplicadas(
  reglas: ReglaValidacionFormatoExcel[],
): RastreadorFilasDuplicadas {
  const rastreador: RastreadorFilasDuplicadas = new Map();

  for (const regla of reglas) {
    if (regla.tipo === "FILA_DUPLICADA") {
      rastreador.set(regla.id, new Set());
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
  // depender de que algún separador esté ausente del contenido real de la celda. Se resume (ver
  // `RastreadorFilasDuplicadas`) después de serializar, así que la decisión es la misma.
  const clave = resumirClave(JSON.stringify(valoresClave));

  if (clavesPorRegla.has(clave)) {
    return true; // 2ª aparición en adelante: duplicada
  }

  clavesPorRegla.add(clave);
  return false; // primera aparición: es "el original", no se marca
}

// RF-32 (`FILA_VACIA`): `filaCompletamenteVacia` e `indiceUltimaFilaConDatos` son reglas puras y
// viven en `domain/reglas/filasArchivo.ts`, porque también las usa `DarVistoBueno`.

// RF-32 (`CONTENIDO_HTML`): nombres de las columnas de `nombresColumnas` cuya celda es texto y
// contiene HTML. Un `number`, `boolean` o `Date` no puede contener HTML, y el richText e
// hipervínculos de Excel ya llegan como texto plano desde el lector. Nunca devuelve el contenido.
export function columnasConContenidoHtml(
  fila: Record<string, ValorCeldaArchivo>,
  nombresColumnas: string[],
): string[] {
  return nombresColumnas.filter((nombreColumna) => {
    const valor = fila[nombreColumna] ?? null;
    return typeof valor === "string" && contieneHtml(valor);
  });
}
