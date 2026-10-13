import { Transform, type TransformCallback } from "node:stream";
import type { CodificacionCsv } from "@/shared/utils/texto-csv";

// RF-38: agrega una columna al final de un CSV (separador coma) EN STREAMING y a nivel de bytes, sin
// decodificar ni reescribir el contenido: se conservan el BOM, la codificación original, las comillas,
// los saltos de línea dentro de campos y el tipo de fin de línea (CRLF o LF). Una máquina de estados
// sigue las comillas (`""` escapada alterna dos veces) e inserta `,<valor>` antes de cada fin de
// registro fuera de comillas, y al final si el último registro no termina en salto. Los registros
// vacíos (líneas en blanco) se dejan como están. Solo lo usan las cargas antiguas en CSV (RF-23 dejó
// de aceptar CSV del notificador).
// Opcionalmente antepone además una columna al INICIO (`columnaInicial`, "NOMBRE LABORATORIO"): el
// encabezado se retiene hasta su fin de registro para decidir si se agrega, y en cada registro de
// datos con contenido se inserta `<valor>,` antes de su primer byte.

const COMILLA = 0x22;
const SALTO = 0x0a;
const RETORNO = 0x0d;
const BOM_UTF8 = [0xef, 0xbb, 0xbf];
// El encabezado retenido no puede crecer sin límite (un archivo sin saltos de línea).
const MAXIMO_BYTES_ENCABEZADO = 1024 * 1024;

export type OpcionesAnexarColumnaCsv = {
  codificacion: CodificacionCsv;
  // Recibe los nombres de las columnas del encabezado (ya decodificados) y devuelve el de la nueva.
  nombreColumna: (encabezados: string[]) => string;
  // Valor de la columna en cada fila de datos (ASCII, sin comas ni comillas).
  valor: string;
  // Columna antepuesta; `agregar` recibe los encabezados originales y decide si se agrega.
  columnaInicial?: { nombre: string; valor: string; agregar: (encabezados: string[]) => boolean };
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
  const inicial = opciones.columnaInicial;
  const prefijoDatos = inicial ? codificar(`${campoCsv(inicial.valor)},`, opciones.codificacion) : Buffer.alloc(0);
  let enComillas = false;
  let retornoPendiente = false;
  let registroConContenido = false;
  let enEncabezado = true;
  // El encabezado se retiene completo hasta su fin de registro: solo entonces se conocen sus campos.
  const encabezado: Buffer[] = [];
  let bytesEncabezado = 0;
  let agregarInicial = false;

  function componerEncabezado(): Buffer {
    const bytes = Buffer.concat(encabezado);
    encabezado.length = 0;
    if (!registroConContenido) return bytes;
    const campos = camposEncabezadoCsv(bytes, opciones.codificacion);
    agregarInicial = inicial !== undefined && inicial.agregar(campos);
    const conBom = bytes.subarray(0, 3).equals(Buffer.from(BOM_UTF8));
    return Buffer.concat([
      conBom ? bytes.subarray(0, 3) : Buffer.alloc(0),
      agregarInicial && inicial ? codificar(`${campoCsv(inicial.nombre)},`, opciones.codificacion) : Buffer.alloc(0),
      conBom ? bytes.subarray(3) : bytes,
      codificar(`,${campoCsv(opciones.nombreColumna(campos))}`, opciones.codificacion),
    ]);
  }

  // Procesa un trozo y devuelve los bytes de salida.
  function procesar(trozo: Buffer): Buffer {
    const partes: Buffer[] = [];
    let desde = 0;

    const emitirHasta = (hasta: number) => {
      if (hasta > desde) {
        const parte = trozo.subarray(desde, hasta);
        if (enEncabezado) {
          bytesEncabezado += parte.length;
          if (bytesEncabezado > MAXIMO_BYTES_ENCABEZADO) throw new Error("Encabezado CSV demasiado grande");
          encabezado.push(parte);
        } else {
          partes.push(parte);
        }
      }
      desde = hasta;
    };

    const cerrarRegistro = (terminador: Buffer) => {
      if (enEncabezado) partes.push(componerEncabezado());
      else if (registroConContenido) partes.push(valorDatos);
      partes.push(terminador);
      registroConContenido = false;
      enEncabezado = false;
    };

    // Antes del primer byte con contenido de cada registro de datos va el valor de la columna inicial.
    const marcarContenido = (indice: number) => {
      if (!registroConContenido && !enEncabezado && agregarInicial) {
        emitirHasta(indice);
        partes.push(prefijoDatos);
      }
      registroConContenido = true;
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
        marcarContenido(indice);
        enComillas = !enComillas;
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
      marcarContenido(indice);
    }

    emitirHasta(trozo.length);
    return Buffer.concat(partes);
  }

  return new Transform({
    transform(trozo: Buffer, _codificacion: BufferEncoding, listo: TransformCallback) {
      try {
        listo(null, procesar(trozo));
      } catch (error) {
        listo(error instanceof Error ? error : new Error("CSV inválido"));
      }
    },
    flush(listo: TransformCallback) {
      const partes: Buffer[] = [];
      // Archivo de un solo registro (sin salto final): el encabezado retenido sale aquí.
      if (enEncabezado) partes.push(componerEncabezado());
      else if (registroConContenido) partes.push(valorDatos);
      if (retornoPendiente) partes.push(Buffer.from([RETORNO]));
      listo(null, Buffer.concat(partes));
    },
  });
}
