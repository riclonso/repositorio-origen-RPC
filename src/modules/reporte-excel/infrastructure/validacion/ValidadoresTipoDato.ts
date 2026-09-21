import { z } from "zod";
import type { TipoDatoColumna } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { esRutValido } from "@/shared/utils/rut";

// Convención chilena de formato de dato por celda (primera vez que se define en el proyecto):
// decimal acepta coma o punto, fecha en texto acepta DD-MM-AAAA o DD/MM/AAAA, booleano acepta
// SI/NO, VERDADERO/FALSO y 1/0 case-insensitive.

const ESQUEMA_EMAIL = z.string().trim().toLowerCase().pipe(z.email());

function aTextoCelda(valor: ValorCeldaArchivo): string {
  if (valor === null) return "";
  if (valor instanceof Date) return valor.toISOString();
  return String(valor).trim();
}

// Vacía = ni siquiera trae texto tras normalizar. `0`, `false` y una fecha epoch NO son vacíos:
// son valores válidos de sus respectivos tipos.
export function celdaVacia(valor: ValorCeldaArchivo): boolean {
  return aTextoCelda(valor).length === 0;
}

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

// `.xlsx`: exceljs entrega siempre un `Date` nativo para una celda de fecha, tenga o no
// componente de hora en Excel — a nivel de valor no hay forma de distinguir "solo fecha" de
// "fecha y hora", así que en xlsx este validador acepta lo mismo que `esFechaValida`. La
// distinción real solo aplica a `.csv`, donde el texto sí declara si trae hora: aquí se exige
// `DD-MM-AAAA HH:mm` o `DD-MM-AAAA HH:mm:ss` (con `/` o espacio/`T` como separadores), a
// diferencia de `FECHA` que en texto exige que NO traiga hora.
function esFechaHoraValida(valor: ValorCeldaArchivo): boolean {
  if (valor instanceof Date) {
    return !Number.isNaN(valor.getTime());
  }

  const coincidencia = PATRON_FECHA_HORA_TEXTO.exec(aTextoCelda(valor));
  if (!coincidencia) return false;

  const [, diaTexto, mesTexto, anioTexto, horaTexto, minutoTexto, segundoTexto] = coincidencia;
  if (!esFechaCalendarioValida(Number(anioTexto), Number(mesTexto), Number(diaTexto))) return false;

  const hora = Number(horaTexto);
  const minuto = Number(minutoTexto);
  const segundo = segundoTexto ? Number(segundoTexto) : 0;
  return hora <= 23 && minuto <= 59 && segundo <= 59;
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
// función construyera con hora LOCAL del servidor, la comparación de rango en
// `EvaluadorReglasValidacion` quedaría corrida por el huso horario del proceso. La usa
// `EvaluadorReglasValidacion` para `FECHA_DENTRO_DE_VENTANA_VIGENTE` (RF-15). Nunca se invoca
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

// Un validador por cada uno de los ocho tipos de dato. Se invoca únicamente sobre celdas que ya
// pasaron `celdaVacia` (una celda vacía se reporta como `VALOR_REQUERIDO_VACIO`, nunca como
// `TIPO_DATO_INVALIDO`).
export const ValidadoresTipoDato: Record<TipoDatoColumna, (valor: ValorCeldaArchivo) => boolean> = {
  // Cualquier valor no vacío es un texto válido: no tiene un formato propio que incumplir.
  TEXTO: () => true,
  ENTERO: (valor) => PATRON_ENTERO.test(aTextoCelda(valor)),
  DECIMAL: (valor) => PATRON_DECIMAL.test(aTextoCelda(valor)),
  BOOLEANO: esBooleanoValido,
  FECHA: esFechaValida,
  FECHA_HORA: esFechaHoraValida,
  RUT: (valor) => esRutValido(aTextoCelda(valor)),
  EMAIL: (valor) => ESQUEMA_EMAIL.safeParse(aTextoCelda(valor)).success,
};
