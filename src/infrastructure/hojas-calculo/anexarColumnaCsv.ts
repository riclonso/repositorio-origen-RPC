import { Transform, type TransformCallback } from "node:stream";
import type { CodificacionCsv } from "@/shared/utils/texto-csv";

// RF-38: agrega una columna al final de un CSV (separador coma) EN STREAMING y a nivel de bytes, sin
// decodificar ni reescribir el contenido: se conservan el BOM, la codificación original, las comillas,
// los saltos de línea dentro de campos y el tipo de fin de línea (CRLF o LF). Una máquina de estados
// sigue las comillas (`""` escapada alterna dos veces) e inserta `,<valor>` antes de cada fin de
// registro fuera de comillas, y al final si el último registro no termina en salto. Los registros
// vacíos (líneas en blanco) se dejan como están. Solo lo usan las cargas antiguas en CSV (RF-23 dejó
// de aceptar CSV del notificador).

const COMILLA = 0x22;
const SALTO = 0x0a;
const RETORNO = 0x0d;
const BOM_UTF8 = [0xef, 0xbb, 0xbf];

export type OpcionesAnexarColumnaCsv = {
  codificacion: CodificacionCsv;
  // Recibe los nombres de las columnas del encabezado (ya decodificados) y devuelve el de la nueva.
  nombreColumna: (encabezados: string[]) => string;
  // Valor de la columna en cada fila de datos (ASCII, sin comas ni comillas).
  valor: string;
};

function codificar(texto: string, codificacion: CodificacionCsv): Buffer {
  // Windows-1252 coincide con Latin-1 en las letras del español (á, é, ñ, ó...).
  return codificacion === "utf-8" ? Buffer.from(texto, "utf8") : Buffer.from(texto, "latin1");
}

function campoCsv(texto: string): string {
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Campos del encabezado (separador coma, comillas RFC 4180), sin BOM ni espacios a los lados.
export function camposEncabezadoCsv(bytes: Buffer, codificacion: CodificacionCsv): string[] {
  const sinBom = bytes.subarray(0, 3).equals(Buffer.from(BOM_UTF8)) ? bytes.subarray(3) : bytes;
  const texto = new TextDecoder(codificacion).decode(sinBom);
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice];
    if (caracter === '"') {
      if (enComillas && texto[indice + 1] === '"') {
        actual += '"';
        indice += 1;
      } else {
        enComillas = !enComillas;
      }
    } else if (caracter === "," && !enComillas) {
      campos.push(actual.trim());
      actual = "";
    } else {
      actual += caracter;
    }
  }
  campos.push(actual.trim());
  return campos;
}

export function crearTransformAnexarColumnaCsv(opciones: OpcionesAnexarColumnaCsv): Transform {
  const valorDatos = codificar(`,${opciones.valor}`, opciones.codificacion);
  let enComillas = false;
  let retornoPendiente = false;
  let registroConContenido = false;
  let enEncabezado = true;
  const encabezado: Buffer[] = [];
  let insercionEncabezado: Buffer | null = null;

  function insercion(): Buffer {
    if (!enEncabezado) return valorDatos;
    if (!insercionEncabezado) {
      const nombre = opciones.nombreColumna(camposEncabezadoCsv(Buffer.concat(encabezado), opciones.codificacion));
      insercionEncabezado = codificar(`,${campoCsv(nombre)}`, opciones.codificacion);
    }
    return insercionEncabezado;
  }

  // Procesa un trozo y devuelve los bytes de salida.
  function procesar(trozo: Buffer): Buffer {
    const partes: Buffer[] = [];
    let desde = 0;

    const emitirHasta = (hasta: number) => {
      if (hasta > desde) {
        const parte = trozo.subarray(desde, hasta);
        partes.push(parte);
        if (enEncabezado) encabezado.push(parte);
      }
      desde = hasta;
    };

    const cerrarRegistro = (terminador: Buffer) => {
      if (registroConContenido) partes.push(insercion());
      partes.push(terminador);
      registroConContenido = false;
      enEncabezado = false;
    };

    for (let indice = 0; indice < trozo.length; indice += 1) {
      const byte = trozo[indice];

      if (retornoPendiente) {
        retornoPendiente = false;
        if (byte === SALTO) {
          emitirHasta(indice);
          cerrarRegistro(Buffer.from([RETORNO, SALTO]));
          desde = indice + 1;
          continue;
        }
        // Retorno suelto (sin salto): se trata como fin de registro.
        emitirHasta(indice);
        cerrarRegistro(Buffer.from([RETORNO]));
      }

      if (byte === COMILLA) {
        enComillas = !enComillas;
        registroConContenido = true;
        continue;
      }
      if (enComillas) continue;

      if (byte === RETORNO) {
        emitirHasta(indice);
        desde = indice + 1;
        retornoPendiente = true;
        continue;
      }
      if (byte === SALTO) {
        emitirHasta(indice);
        cerrarRegistro(Buffer.from([SALTO]));
        desde = indice + 1;
        continue;
      }
      // El BOM al inicio no es contenido.
      if (enEncabezado && encabezado.length === 0 && indice < 3 && desde === 0 && byte === BOM_UTF8[indice]) continue;
      registroConContenido = true;
    }

    emitirHasta(trozo.length);
    return Buffer.concat(partes);
  }

  return new Transform({
    transform(trozo: Buffer, _codificacion: BufferEncoding, listo: TransformCallback) {
      listo(null, procesar(trozo));
    },
    flush(listo: TransformCallback) {
      const partes: Buffer[] = [];
      if (retornoPendiente) {
        if (registroConContenido) partes.push(insercion());
        partes.push(Buffer.from([RETORNO]));
      } else if (registroConContenido) {
        // Último registro sin salto final.
        partes.push(insercion());
      }
      listo(null, Buffer.concat(partes));
    },
  });
}
