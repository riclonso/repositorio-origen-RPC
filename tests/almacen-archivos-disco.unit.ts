// RF-38: almacén de binarios en disco generalizado (`src/infrastructure/almacenamiento/`):
// verificación de prefijo, apertura con `wx`, tope medido, SHA-256, primeros bytes según la
// configuración, idempotencia al eliminar, limpieza de temporales y la etiqueta en errores.txt. Sin
// base de datos (el logger importa `env.ts`: se fijan valores ficticios).
//
//   npx tsx tests/almacen-archivos-disco.unit.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";

let fallos = 0;
let ejecutadas = 0;

async function prueba(nombre: string, cuerpo: () => void | Promise<void>): Promise<void> {
  ejecutadas += 1;
  try {
    await cuerpo();
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`FALLA ${nombre}`);
    console.error(error);
  }
}

function flujoDe(...partes: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controlador) {
      for (const parte of partes) controlador.enqueue(parte);
      controlador.close();
    },
  });
}

async function main(): Promise<void> {
  const { crearAlmacenArchivosDisco } = await import("../src/infrastructure/almacenamiento/AlmacenArchivosDisco");
  const directorio = await mkdtemp(path.join(tmpdir(), "almacen-d1-"));
  const almacen = crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => directorio, etiqueta: "pruebas", bytesPrimeros: 4 });

  try {
    await prueba("guarda, mide, calcula SHA-256 y devuelve solo los primeros 4 bytes", async () => {
      const contenido = Buffer.from("PK\u0003\u0004resto del archivo");
      const guardado = await almacen.guardarTemporal(flujoDe(contenido.subarray(0, 2), contenido.subarray(2)), 1000);
      assert.ok(guardado.ok);
      if (!guardado.ok) return;
      assert.equal(guardado.tamanoBytes, contenido.length);
      assert.equal(guardado.sha256, createHash("sha256").update(contenido).digest("hex"));
      assert.deepEqual([...guardado.primerosBytes], [0x50, 0x4b, 0x03, 0x04]);

      const id = crypto.randomUUID();
      const referencia = await almacen.moverDefinitivo(guardado.referenciaTemporal, 2025, id, "xlsx");
      assert.equal(referencia, `2025/${id}.xlsx`);
      const abierto = await almacen.abrirLectura(referencia);
      assert.equal(Buffer.from(await new Response(abierto?.flujo).arrayBuffer()).toString(), contenido.toString());

      await almacen.eliminar(referencia);
      await almacen.eliminar(referencia); // idempotente
      assert.equal(await almacen.abrirLectura(referencia), null);
    });

    await prueba("corta al superar el tope medido y no deja temporales", async () => {
      const resultado = await almacen.guardarTemporal(flujoDe(new Uint8Array(600), new Uint8Array(600)), 1000);
      assert.deepEqual(resultado, { ok: false, motivo: "EXCEDE_TAMANO" });
      assert.deepEqual(await readdir(path.join(directorio, "tmp")), []);
    });

    await prueba("rechaza referencias fuera del directorio base y uuid inválido", async () => {
      await assert.rejects(() => almacen.abrirLectura("../../fuera.txt"), /fuera del almacén/);
      await assert.rejects(() => almacen.moverDefinitivo("tmp/x.part", 2025, "../x", "xlsx"), /inválidos/);
    });

    await prueba("sin directorio temporal no hay nada que limpiar", async () => {
      const otro = crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => path.join(directorio, "no"), etiqueta: "x", bytesPrimeros: 4 });
      assert.deepEqual(await otro.eliminarTemporalesAnterioresA(new Date()), { eliminados: 0, fallidos: 0 });
    });
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }

  console.log(`\n${ejecutadas - fallos}/${ejecutadas} pruebas OK`);
  if (fallos > 0) process.exitCode = 1;
}

void main();
