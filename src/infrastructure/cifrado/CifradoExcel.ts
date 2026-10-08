import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { FuenteZip } from "unzipper";

const MAGIA = Buffer.from("RPCXLS01");
const CABECERA = 512;
const BLOQUE = 64 * 1024;
const TAG = 16;
const PIE = 8 + TAG;
const INDICE_PIE = 0xffffffff;

export type ClavesExcel = { activa: string; claves: Record<string, Buffer> };

// Se evalúa al usar el almacén, no durante el build. Nunca reutilizar AUTH_SECRET.
export function clavesExcelDesdeEntorno(): ClavesExcel {
  const activa = process.env.EXCEL_ENCRYPTION_KEY_ID ?? "v1";
  let valores: unknown;
  try { valores = JSON.parse(process.env.EXCEL_ENCRYPTION_KEYS ?? "{}"); }
  catch { throw new Error("EXCEL_ENCRYPTION_KEYS debe ser un mapa JSON de claves base64"); }
  if (!valores || typeof valores !== "object" || Array.isArray(valores)) throw new Error("Configuración de cifrado Excel inválida");
  const claves: Record<string, Buffer> = Object.create(null);
  for (const [id, valor] of Object.entries(valores)) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id) || typeof valor !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) {
      throw new Error("Configuración de cifrado Excel inválida");
    }
    const clave = Buffer.from(valor, "base64");
    if (clave.length !== 32 || clave.toString("base64") !== valor) throw new Error("Clave de cifrado Excel inválida");
    claves[id] = clave;
  }
  if (!claves[activa]) throw new Error("Falta la clave activa para cifrar las nuevas cargas Excel");
  return { activa, claves };
}

function nonce(prefijo: Buffer, indice: number): Buffer {
  const iv = Buffer.alloc(12);
  prefijo.copy(iv);
  iv.writeUInt32BE(indice, 8);
  return iv;
}

function aad(cabecera: Buffer, indice: number, longitud: number): Buffer {
  const datos = Buffer.alloc(8);
  datos.writeUInt32BE(indice);
  datos.writeUInt32BE(longitud, 4);
  return Buffer.concat([cabecera, datos]);
}

function derivar(maestra: Buffer, salt: Buffer, usuarioId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", maestra, salt, Buffer.from(`rpc/excel/v1/usuario/${usuarioId}`), 32));
}

async function escribirCompleto(archivo: FileHandle, bytes: Buffer): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await archivo.write(bytes, offset, bytes.length - offset);
    if (!bytesWritten) throw new Error("Escritura de archivo interrumpida");
    offset += bytesWritten;
  }
}

async function leerCompleto(archivo: FileHandle, longitud: number, posicion: number): Promise<Buffer> {
  const bytes = Buffer.alloc(longitud);
  let offset = 0;
  while (offset < longitud) {
    const { bytesRead } = await archivo.read(bytes, offset, longitud - offset, posicion + offset);
    if (!bytesRead) throw new Error("Archivo Excel cifrado truncado");
    offset += bytesRead;
  }
  return bytes;
}

// Cada bloque se autentica ANTES de entregar texto claro. El pie autenticado protege tamaño,
// truncamiento y bloques añadidos. Nonces distintos por índice, con prefijo aleatorio por archivo.
export async function crearEscritorExcelCifrado(archivo: FileHandle, usuarioId: string, configuracion: ClavesExcel, archivoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(archivoId)) throw new Error("Identificador de archivo inválido");
  if (!usuarioId || Buffer.byteLength(usuarioId) > 128) throw new Error("Propietario de Excel inválido");
  const salt = randomBytes(32);
  const prefijo = randomBytes(8);
  const cabecera = Buffer.alloc(CABECERA);
  MAGIA.copy(cabecera);
  const metadatos = Buffer.from(JSON.stringify({ usuarioId, archivoId, keyId: configuracion.activa, salt: salt.toString("base64"), nonce: prefijo.toString("base64") }));
  if (metadatos.length > CABECERA - 12) throw new Error("Metadatos de cifrado demasiado largos");
  cabecera.writeUInt32BE(metadatos.length, 8);
  metadatos.copy(cabecera, 12);
  const clave = derivar(configuracion.claves[configuracion.activa], salt, usuarioId);
  await escribirCompleto(archivo, cabecera);
  let pendiente = Buffer.alloc(0);
  let indice = 0;
  let tamano = 0;

  async function bloque(bytes: Buffer) {
    if (indice >= INDICE_PIE) throw new Error("Archivo Excel demasiado grande");
    const cipher = createCipheriv("aes-256-gcm", clave, nonce(prefijo, indice), { authTagLength: TAG });
    cipher.setAAD(aad(cabecera, indice, bytes.length));
    await escribirCompleto(archivo, Buffer.concat([cipher.update(bytes), cipher.final(), cipher.getAuthTag()]));
    indice += 1;
  }

  return {
    async escribir(bytes: Uint8Array) {
      tamano += bytes.byteLength;
      let offset = 0;
      while (offset < bytes.byteLength) {
        const cantidad = Math.min(BLOQUE - pendiente.length, bytes.byteLength - offset);
        pendiente = Buffer.concat([pendiente, bytes.subarray(offset, offset + cantidad)]);
        offset += cantidad;
        if (pendiente.length === BLOQUE) { await bloque(pendiente); pendiente = Buffer.alloc(0); }
      }
    },
    async finalizar() {
      try {
        if (pendiente.length) await bloque(pendiente);
        const size = Buffer.alloc(8);
        size.writeBigUInt64BE(BigInt(tamano));
        const cipher = createCipheriv("aes-256-gcm", clave, nonce(prefijo, INDICE_PIE), { authTagLength: TAG });
        cipher.setAAD(Buffer.concat([cabecera, size]));
        cipher.final();
        await escribirCompleto(archivo, Buffer.concat([size, cipher.getAuthTag()]));
      } finally { clave.fill(0); }
    },
    destruir() { clave.fill(0); pendiente.fill(0); },
  };
}

// null identifica un archivo anterior SIN cifrado. Un archivo nuevo dañado nunca se interpreta
// como antiguo: el almacén exige la envoltura en referencias con extensión .enc.
export async function abrirFuenteExcelCifrado(ruta: string, obtenerClaves: () => ClavesExcel, exigir = false): Promise<FuenteZip | null> {
  const archivo = await open(ruta, "r");
  let cabecera: Buffer;
  let prefijo: Buffer;
  let clave: Buffer;
  let tamano: number;
  try {
    const firma = Buffer.alloc(8);
    await archivo.read(firma, 0, 8, 0);
    if (!firma.equals(MAGIA)) {
      if (exigir) throw new Error("Archivo Excel cifrado inválido");
      return null;
    }
    cabecera = await leerCompleto(archivo, CABECERA, 0);
    const longitud = cabecera.readUInt32BE(8);
    if (longitud < 1 || longitud > CABECERA - 12) throw new Error("Archivo Excel cifrado inválido");
    const meta = JSON.parse(cabecera.subarray(12, 12 + longitud).toString());
    if (typeof meta.usuarioId !== "string" || !meta.usuarioId || Buffer.byteLength(meta.usuarioId) > 128 || typeof meta.keyId !== "string") throw new Error("Archivo Excel cifrado inválido");
    if (exigir && !ruta.endsWith(".part.enc") && path.basename(ruta) !== `${meta.archivoId}.xlsx.enc`) throw new Error("El archivo cifrado no corresponde a esta carga");
    const salt = Buffer.from(meta.salt, "base64");
    prefijo = Buffer.from(meta.nonce, "base64");
    if (salt.length !== 32 || prefijo.length !== 8) throw new Error("Archivo Excel cifrado inválido");
    const maestra = obtenerClaves().claves[meta.keyId];
    if (!maestra) throw new Error("La clave necesaria para leer este Excel no está configurada");
    clave = derivar(maestra, salt, meta.usuarioId);
    const fisico = (await archivo.stat()).size;
    const pie = await leerCompleto(archivo, PIE, fisico - PIE);
    const decipher = createDecipheriv("aes-256-gcm", clave, nonce(prefijo, INDICE_PIE), { authTagLength: TAG });
    decipher.setAAD(Buffer.concat([cabecera, pie.subarray(0, 8)]));
    decipher.setAuthTag(pie.subarray(8));
    decipher.final();
    const size = pie.readBigUInt64BE();
    if (size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Tamaño de Excel inválido");
    tamano = Number(size);
    if (fisico !== CABECERA + tamano + Math.ceil(tamano / BLOQUE) * TAG + PIE) throw new Error("Archivo Excel cifrado truncado o alterado");
  } finally { await archivo.close(); }

  return {
    size: async () => tamano,
    stream(offset, length) {
      async function* leer() {
        if (!Number.isSafeInteger(offset) || offset < 0 || (length !== undefined && (!Number.isSafeInteger(length) || length < 0))) throw new Error("Rango de lectura inválido");
        const fin = Math.min(tamano, length ? offset + length + 1 : tamano);
        if (offset >= fin) return;
        const fd = await open(ruta, "r");
        try {
          for (let i = Math.floor(offset / BLOQUE); i * BLOQUE < fin; i++) {
            const cantidad = Math.min(BLOQUE, tamano - i * BLOQUE);
            const bytes = await leerCompleto(fd, cantidad + TAG, CABECERA + i * (BLOQUE + TAG));
            const decipher = createDecipheriv("aes-256-gcm", clave, nonce(prefijo, i), { authTagLength: TAG });
            decipher.setAAD(aad(cabecera, i, cantidad));
            decipher.setAuthTag(bytes.subarray(cantidad));
            const parte = decipher.update(bytes.subarray(0, cantidad));
            decipher.final();
            yield parte.subarray(Math.max(0, offset - i * BLOQUE), Math.min(cantidad, fin - i * BLOQUE));
          }
        } finally { await fd.close(); }
      }
      return Readable.from(leer());
    },
  };
}
