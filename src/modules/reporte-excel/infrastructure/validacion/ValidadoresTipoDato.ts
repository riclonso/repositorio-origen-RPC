import { z } from "zod";
import type {
  ColumnaFormatoExcel,
  TipoDatoColumnaFijo,
  TipoEnumeradoFormatoExcel,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  buscarTipoEnumeradoPorNombre,
  normalizarValorEnumerado,
} from "@/modules/formatos-excel/domain/entities/TipoEnumerado";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { aTextoCelda, celdaVacia } from "@/modules/reporte-excel/domain/reglas/filasArchivo";

// Convención chilena de formato de dato por celda (primera vez que se define en el proyecto):
// decimal acepta coma o punto, fecha en texto acepta DD-MM-AAAA o DD/MM/AAAA, booleano acepta
// SI/NO, VERDADERO/FALSO y 1/0 case-insensitive.

const ESQUEMA_EMAIL = z.string().trim().toLowerCase().pipe(z.email());

// `aTextoCelda` y `celdaVacia` viven en `domain/reglas/filasArchivo.ts` (RF-32: también las usa
// `DarVistoBueno`); `celdaVacia` se reexporta aquí para no cambiar a quienes ya la importan.
export { celdaVacia };

const PATRON_ENTERO = /^-?\d+$/;
const PATRON_DECIMAL = /^-?\d+([.,]\d+)?$/;
const PATRON_FECHA_TEXTO = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;
const PATRON_FECHA_HORA_TEXTO = /^(\d{2})[-/](\d{2})[-/](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

const VALORES_BOOLEANOS_VERDADEROS = new Set(["si", "sí", "verdadero", "1"]);
const VALORES_BOOLEANOS_FALSOS = new Set(["no", "falso", "0"]);

function esFechaCalendarioValida(anio: number, mes: number, dia: number): boolean {
  const fecha = new Date(anio, mes - 1, dia);
  // Descarta fechas imposibles que `Date` normaliza en silencio (31 de febrero, etc.).
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

function esFechaValida(valor: ValorCeldaArchivo): boolean {
  // `.xlsx`: la celda ya llega como objeto `Date` nativo vía exceljs, se usa directo.
  if (valor instanceof Date) {
    return !Number.isNaN(valor.getTime());
  }

  // `.csv`: la fecha llega como texto, en alguno de los dos formatos chilenos aceptados.
  const coincidencia = PATRON_FECHA_TEXTO.exec(aTextoCelda(valor));
  if (!coincidencia) return false;

  const [, diaTexto, mesTexto, anioTexto] = coincidencia;
  return esFechaCalendarioValida(Number(anioTexto), Number(mesTexto), Number(diaTexto));
}

function esBooleanoValido(valor: ValorCeldaArchivo): boolean {
  if (typeof valor === "boolean") return true;

  const texto = aTextoCelda(valor).toLowerCase();
  return VALORES_BOOLEANOS_VERDADEROS.has(texto) || VALORES_BOOLEANOS_FALSOS.has(texto);
}

// Parsea una celda ya confirmada como fecha válida (por `esFechaValida`/`esFechaHoraValida`) a un
// `Date` real, reutilizando la misma lógica de parseo de arriba: agnóstica de si vino de un
// `.xlsx` (objeto `Date` nativo, que `exceljs` ya entrega construido en UTC) o de un `.csv`
// (texto `DD-MM-AAAA[ HH:mm[:ss]]`, construido aquí también en UTC con `Date.UTC`). Es
// deliberado: `VentanaCarga.fechaApertura/fechaVencimiento` se coercionan con `z.coerce.date()`
// a partir de un string de fecha simple, que JavaScript interpreta como medianoche UTC — si esta
// función construyera con hora LOCAL del servidor, la comparación en
// `EvaluadorReglasValidacion` quedaría corrida por el huso horario del proceso. La usa
// `EvaluadorReglasValidacion` para `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`. Nunca se invoca
// sobre una celda que no haya pasado ya la validación de tipo correspondiente: si la celda no es
// una fecha válida, devuelve `null` en vez de lanzar, para que el llamador decida qué hacer (en
// la práctica, ese caso ya quedó reportado como `TIPO_DATO_INVALIDO` en un paso anterior).
export function parsearFecha(valor: ValorCeldaArchivo): Date | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  const texto = aTextoCelda(valor);

  const coincidenciaFechaHora = PATRON_FECHA_HORA_TEXTO.exec(texto);
  if (coincidenciaFechaHora) {
    const [, diaTexto, mesTexto, anioTexto, horaTexto, minutoTexto, segundoTexto] = coincidenciaFechaHora;
    const anio = Number(anioTexto);
    const mes = Number(mesTexto);
    const dia = Number(diaTexto);

    if (!esFechaCalendarioValida(anio, mes, dia)) return null;

    const hora = Number(horaTexto);
    const minuto = Number(minutoTexto);
    const segundo = segundoTexto ? Number(segundoTexto) : 0;
    if (hora > 23 || minuto > 59 || segundo > 59) return null;

    return new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo));
  }

  const coincidenciaFecha = PATRON_FECHA_TEXTO.exec(texto);
  if (coincidenciaFecha) {
    const [, diaTexto, mesTexto, anioTexto] = coincidenciaFecha;
    const anio = Number(anioTexto);
    const mes = Number(mesTexto);
    const dia = Number(diaTexto);

    if (!esFechaCalendarioValida(anio, mes, dia)) return null;

    return new Date(Date.UTC(anio, mes - 1, dia));
  }

  return null;
}

// Serializa una celda a una representación estable para construir la clave de comparación de
// `FILA_DUPLICADA` (`EvaluadorReglasValidacion.ts`). Retorna `null` cuando la celda está vacía
// (mismo criterio que `celdaVacia`), para que el caller pueda distinguir "vacío" de "valor real" y
// excluir del chequeo las filas cuya clave completa queda vacía (decisión de negocio: celdas
// vacías no cuentan como duplicado). Deliberadamente case-sensitive (sin `toLowerCase()`): "Juan"
// y "JUAN" son valores distintos para efectos de esta regla.
export function serializarValorParaClaveDuplicado(valor: ValorCeldaArchivo): string | null {
  if (valor === null || celdaVacia(valor)) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return valor.trim();
}

export type ValidadorCelda = (valor: ValorCeldaArchivo) => boolean;

// Un validador por cada tipo de dato FIJO (el RUT ya no es un tipo de dato: se valida
// con la regla `RUT_VALIDO`, ver `EvaluadorReglasValidacion.ts`). Se invoca únicamente sobre celdas que ya
// pasaron `celdaVacia` (una celda vacía se reporta como `VALOR_REQUERIDO_VACIO`, nunca como
// `TIPO_DATO_INVALIDO`). `ENUMERADO` no está aquí: su validador depende de los valores definidos
// en cada formato y lo arma `crearValidadorColumna`.
export const ValidadoresTipoDato: Record<TipoDatoColumnaFijo, ValidadorCelda> = {
  // Cualquier valor no vacío es un texto válido: no tiene un formato propio que incumplir.
  TEXTO: () => true,
  ENTERO: (valor) => PATRON_ENTERO.test(aTextoCelda(valor)),
  DECIMAL: (valor) => PATRON_DECIMAL.test(aTextoCelda(valor)),
  BOOLEANO: esBooleanoValido,
  FECHA: esFechaValida,
  EMAIL: (valor) => ESQUEMA_EMAIL.safeParse(aTextoCelda(valor)).success,
};

// Validador de una columna concreta. Se llama UNA vez por columna antes de recorrer las filas: para
// `ENUMERADO` arma un `Set` con los valores permitidos ya normalizados, así cada celda cuesta una
// búsqueda O(1) en vez de recorrer la lista. La celda se pasa primero a texto con `aTextoCelda`
// (número 1 → "1", booleano → "true", fecha → ISO) y se compara con `normalizarValorEnumerado`
// (sin mayúsculas, con acentos).
//
// Una columna `ENUMERADO` cuyo tipo no existe en el formato es un dato corrupto (la BD, Zod y
// `application/` lo impiden): se lanza en vez de aceptar o rechazar todas las celdas en silencio.
// El mensaje lleva solo el nombre de la columna, nunca valores de celdas.
export function crearValidadorColumna(
  columna: Pick<ColumnaFormatoExcel, "nombre" | "tipoDato" | "tipoEnumeradoNombre">,
  tiposEnumerados: readonly TipoEnumeradoFormatoExcel[],
): ValidadorCelda {
  if (columna.tipoDato !== "ENUMERADO") {
    return ValidadoresTipoDato[columna.tipoDato];
  }

  const tipoEnumerado =
    columna.tipoEnumeradoNombre === null
      ? undefined
      : buscarTipoEnumeradoPorNombre(tiposEnumerados, columna.tipoEnumeradoNombre);

  if (!tipoEnumerado) {
    throw new Error(`La columna "${columna.nombre}" es de tipo enumerado pero su tipo no existe en el formato`);
  }

  const valoresPermitidos = new Set(tipoEnumerado.valores.map(normalizarValorEnumerado));
  return (valor) => valoresPermitidos.has(normalizarValorEnumerado(aTextoCelda(valor)));
}
