// RF-45: archivo de reglas para llenado de archivo, integración con PostgreSQL y disco reales.
//
//  - Casos de uso: subir (201 lógico), reemplazar borrando el archivo anterior del disco, eliminar
//    (fila y archivo), 413 por tamaño declarado y medido, tipo inválido sin dejar archivos, formato
//    inexistente.
//  - Autorización del notificador con el MISMO predicado del panel (`autorizadorVentanaNotificador`):
//    ventana propia → archivo; ventana de un formato no asignado, sin publicar o archivada → null (404).
//  - Respuesta de descarga: `filename*` con tildes, `attachment`, `nosniff`, `private, no-store`.
//  - HTTP (opcional, con `REGLAS_TEST_BASE_URL` apuntando a un `npm run dev` conectado a la MISMA base
//    desechable y con el mismo AUTH_SECRET): 401 sin sesión, 403 para ADMIN en la ruta del
//    notificador, 404 para ventana ajena y 413 por `Content-Length`.
//
// Ejecutar SOLO contra una base PostgreSQL local y DESECHABLE (nombre `prueba_*`) con las
// migraciones aplicadas. Nunca contra la base de desarrollo ni producción:
//
//   REGLAS_TEST_DATABASE=true DATABASE_URL=postgres://localhost/prueba_xxx AUTH_SECRET=... \
//     [REGLAS_TEST_BASE_URL=http://localhost:3613] npx tsx tests/reglas-llenado.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

function verificarBaseDesechable(): void {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.ok(url.pathname.slice(1).startsWith("prueba_"), "El nombre de la BD desechable debe empezar con prueba_");
  assert.equal(process.env.REGLAS_TEST_DATABASE, "true", "Requiere autorización de BD desechable");
}

// La verificación corre ANTES de cargar cualquier módulo que abra una conexión.
verificarBaseDesechable();

function flujoDe(contenido: Buffer | string): ReadableStream<Uint8Array> {
  const bytes = typeof contenido === "string" ? Buffer.from(contenido) : contenido;
  return new ReadableStream({
    start(controlador) {
      controlador.enqueue(new Uint8Array(bytes));
      controlador.close();
    },
  });
}

async function docxMinimo(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="x"/></Types>',
  );
  zip.file("word/document.xml", "<w:document/>");
  return zip.generateAsync({ type: "nodebuffer" });
}

async function listarRecursivo(directorio: string): Promise<string[]> {
  const entradas = await readdir(directorio, { recursive: true, withFileTypes: true });
  return entradas.filter((entrada) => entrada.isFile()).map((entrada) => path.join(entrada.parentPath, entrada.name));
}

async function main(): Promise<void> {
  const { prisma } = await import("../src/infrastructure/database/prisma");
  const { crearAlmacenArchivosDisco } = await import("../src/infrastructure/almacenamiento/AlmacenArchivosDisco");
  const { crearDetectorTipoDocumento } = await import(
    "../src/modules/formatos-excel/infrastructure/deteccion/DetectorTipoDocumento"
  );
  const { prismaReglasLlenadoRepository: repositorio } = await import(
    "../src/modules/formatos-excel/infrastructure/repositories/PrismaReglasLlenadoRepository"
  );
  const { subirReglasLlenado } = await import("../src/modules/formatos-excel/application/use-cases/SubirReglasLlenado");
  const { eliminarReglasLlenado } = await import("../src/modules/formatos-excel/application/use-cases/EliminarReglasLlenado");
  const { obtenerReglasLlenadoParaNotificador, abrirReglasLlenado } = await import(
    "../src/modules/formatos-excel/application/use-cases/ObtenerReglasLlenadoParaNotificador"
  );
  const { autorizadorVentanaNotificador } = await import("../src/app/notificador/_lib/tarjetasNotificador");
  const { respuestaDescargaReglas } = await import("../src/app/api/formatos-excel/_lib/reglasLlenado");
  const { TAMANO_MAXIMO_REGLAS_LLENADO } = await import(
    "../src/modules/formatos-excel/domain/entities/ReglasLlenadoFormato"
  );

  const directorio = await mkdtemp(path.join(tmpdir(), "reglas-llenado-integracion-"));
  const almacen = crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => directorio, etiqueta: "prueba", bytesPrimeros: 8 });
  const fallosRegistrados: string[] = [];
  const dependencias = {
    repositorio,
    almacen,
    detector: crearDetectorTipoDocumento(almacen),
    generarId: randomUUID,
    registrarFallo: (contexto: string) => {
      fallosRegistrados.push(contexto);
    },
  };

  const usuariosCreados: string[] = [];
  const formatosCreados: string[] = [];
  const ventanasCreadas: string[] = [];
  let ejecutados = 0;

  async function escenario(nombre: string, cuerpo: () => Promise<void>): Promise<void> {
    await cuerpo();
    ejecutados += 1;
    console.log(`  ok  ${nombre}`);
  }

  async function crearUsuario(perfilCodigo: string): Promise<string> {
    const id = randomUUID();
    await prisma.usuario.create({
      data: { id, nombres: "Prueba", apellidos: perfilCodigo, rut: id, email: `${id}@example.invalid`, username: id, perfilCodigo },
    });
    usuariosCreados.push(id);
    return id;
  }

  async function crearFormato(): Promise<string> {
    const formato = await prisma.formatoExcel.create({
      data: {
        nombre: `reglas-${randomUUID()}`,
        nombreArchivoPlantilla: "plantilla.xlsx",
        tipoContenidoPlantilla: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        tipoArchivo: "EXCEL",
        contenidoPlantilla: Uint8Array.from(Buffer.from("x")),
      },
      select: { id: true },
    });
    formatosCreados.push(formato.id);
    return formato.id;
  }

  const ahora = Date.now();
  async function crearVentana(formatoExcelId: string, creadoPorId: string, opciones: { publicada: boolean; archivada?: boolean }) {
    const ventana = await prisma.ventanaCarga.create({
      data: {
        anio: 2000 + Math.floor(Math.random() * 80),
        fechaApertura: new Date(ahora - 24 * 60 * 60 * 1000),
        fechaVencimiento: new Date(ahora + 30 * 24 * 60 * 60 * 1000),
        formatoExcelId,
        creadoPorId,
        publicada: opciones.publicada,
        archivada: opciones.archivada ?? false,
        plantillaAlerta: "<p>prueba</p>",
      },
      select: { id: true },
    });
    ventanasCreadas.push(ventana.id);
    return ventana.id;
  }

  try {
    const adminId = await crearUsuario("ADMIN");
    const notificadorId = await crearUsuario("NOTIFICADOR_RPC");
    const formatoId = await crearFormato();
    const formatoAjenoId = await crearFormato();
    const docx = await docxMinimo();

    const entrada = (contenido: Buffer | string, nombre: string, formatoExcelId = formatoId) => {
      const bytes = typeof contenido === "string" ? Buffer.from(contenido) : contenido;
      return {
        formatoExcelId,
        nombreArchivoOriginal: nombre,
        tamanoDeclarado: bytes.byteLength,
        cuerpo: flujoDe(bytes),
        subidoPorId: adminId,
        ahora: new Date(),
      };
    };

    await escenario("subir crea la fila y el archivo en <formato>/<uuid>.<ext>", async () => {
      const resultado = await subirReglasLlenado(entrada("Regla 1: año\n", "Guía de llenado.txt"), dependencias);
      assert.ok(resultado.ok);
      assert.equal(resultado.reemplazo, false);
      assert.match(resultado.reglas.rutaArchivo, new RegExp(`^${formatoId}/[0-9a-f-]{36}\\.txt$`));
      const archivos = (await listarRecursivo(directorio)).filter((ruta) => !ruta.includes(`${path.sep}tmp${path.sep}`));
      assert.equal(archivos.length, 1);
    });

    await escenario("reemplazar actualiza la fila y borra el archivo anterior", async () => {
      const anterior = await repositorio.obtenerPorFormato(formatoId);
      const resultado = await subirReglasLlenado(entrada(docx, "Reglas.docx"), dependencias);
      assert.ok(resultado.ok);
      assert.equal(resultado.reemplazo, true);
      assert.equal(resultado.reglas.extension, "docx");
      assert.notEqual(resultado.reglas.rutaArchivo, anterior?.rutaArchivo);
      const archivos = (await listarRecursivo(directorio)).filter((ruta) => !ruta.includes(`${path.sep}tmp${path.sep}`));
      assert.equal(archivos.length, 1);
      assert.ok(archivos[0]?.endsWith(".docx"));
      assert.equal(await prisma.reglasLlenadoFormato.count({ where: { formatoExcelId: formatoId } }), 1);
    });

    await escenario("tipo inválido (docx renombrado a xlsx) no deja archivos ni cambia la fila", async () => {
      const resultado = await subirReglasLlenado(entrada(docx, "Reglas.xlsx"), dependencias);
      assert.deepEqual(resultado, { ok: false, motivo: "TIPO_INVALIDO", extension: "xlsx" });
      assert.equal((await repositorio.obtenerPorFormato(formatoId))?.extension, "docx");
      assert.equal((await listarRecursivo(directorio)).length, 1);
    });

    await escenario("extensión fuera de la lista blanca → TIPO_INVALIDO sin leer el cuerpo", async () => {
      const resultado = await subirReglasLlenado(entrada("x", "reglas.pdf"), dependencias);
      assert.equal(resultado.ok, false);
      assert.equal(!resultado.ok && resultado.motivo, "TIPO_INVALIDO");
    });

    await escenario("413 por Content-Length declarado y por tamaño medido", async () => {
      const declarado = await subirReglasLlenado(
        { ...entrada("x", "r.txt"), tamanoDeclarado: TAMANO_MAXIMO_REGLAS_LLENADO + 1 },
        dependencias,
      );
      assert.equal(!declarado.ok && declarado.motivo, "EXCEDE_TAMANO");

      const grande = Buffer.alloc(TAMANO_MAXIMO_REGLAS_LLENADO + 10, 0x61);
      const medido = await subirReglasLlenado({ ...entrada(grande, "r.txt"), tamanoDeclarado: 10 }, dependencias);
      assert.equal(!medido.ok && medido.motivo, "EXCEDE_TAMANO");
      assert.equal((await listarRecursivo(directorio)).length, 1);
    });

    await escenario("formato inexistente → FORMATO_NO_ENCONTRADO", async () => {
      const resultado = await subirReglasLlenado(entrada("x", "r.txt", randomUUID()), dependencias);
      assert.equal(!resultado.ok && resultado.motivo, "FORMATO_NO_ENCONTRADO");
    });

    await escenario("descarga: filename* con tildes, attachment, nosniff, private no-store", async () => {
      const archivo = await abrirReglasLlenado(formatoId, dependencias);
      assert.ok(archivo);
      const respuesta = respuestaDescargaReglas({
        ...archivo,
        reglas: { ...archivo.reglas, nombreArchivoOriginal: "Guía de llenado año 2026.docx" },
      });
      const disposicion = respuesta.headers.get("content-disposition") ?? "";
      assert.ok(disposicion.startsWith("attachment;"));
      assert.ok(disposicion.includes("filename*=UTF-8''Gu%C3%ADa%20de%20llenado%20a%C3%B1o%202026.docx"));
      assert.equal(respuesta.headers.get("x-content-type-options"), "nosniff");
      assert.equal(respuesta.headers.get("cache-control"), "private, no-store");
      assert.equal(
        respuesta.headers.get("content-type"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      assert.equal(Buffer.from(await respuesta.arrayBuffer()).equals(docx), true);
    });

    // --- Autorización del notificador (mismo predicado que el panel) ---
    await prisma.usuarioFormatoExcel.create({ data: { usuarioId: notificadorId, formatoExcelId: formatoId } });
    const ventanaPropia = await crearVentana(formatoId, adminId, { publicada: true });
    const ventanaSinPublicar = await crearVentana(formatoId, adminId, { publicada: false });
    // Archivar despublica (invariante de RF-15): una ventana archivada nunca queda `publicada`.
    const ventanaArchivada = await crearVentana(formatoId, adminId, { publicada: false, archivada: true });
    const ventanaAjena = await crearVentana(formatoAjenoId, adminId, { publicada: true });
    await subirReglasLlenado(entrada("reglas ajenas", "ajeno.txt", formatoAjenoId), dependencias);

    const dependenciasNotificador = { ...dependencias, autorizador: autorizadorVentanaNotificador };

    await escenario("notificador: ventana con tarjeta → archivo del formato de la ventana", async () => {
      const archivo = await obtenerReglasLlenadoParaNotificador(notificadorId, ventanaPropia, dependenciasNotificador);
      assert.equal(archivo?.reglas.formatoExcelId, formatoId);
      await archivo?.archivo.flujo.cancel();
    });

    await escenario("notificador: ventana ajena, sin publicar o archivada → null (404)", async () => {
      for (const ventana of [ventanaAjena, ventanaSinPublicar, ventanaArchivada, randomUUID()]) {
        assert.equal(await obtenerReglasLlenadoParaNotificador(notificadorId, ventana, dependenciasNotificador), null);
      }
    });

    // --- HTTP (opcional) ---
    const baseUrl = process.env.REGLAS_TEST_BASE_URL;
    if (baseUrl) {
      const { jwtService } = await import("../src/modules/auth/infrastructure/auth/JwtService");
      const cookieDe = async (id: string, perfilCodigo: string) => {
        const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id }, select: { sesionVersion: true } });
        return `sesion=${await jwtService.emitir({ id, perfilCodigo, sesionVersion: usuario.sesionVersion })}`;
      };
      const rutaNotificador = (ventana: string) => `${baseUrl}/api/notificador/ventanas-carga/${ventana}/reglas-llenado`;

      await escenario("HTTP: 401 sin sesión", async () => {
        assert.equal((await fetch(rutaNotificador(ventanaPropia))).status, 401);
        assert.equal((await fetch(`${baseUrl}/api/formatos-excel/${formatoId}/reglas-llenado`)).status, 401);
      });

      await escenario("HTTP: 403 para ADMIN en la ruta del notificador", async () => {
        const respuesta = await fetch(rutaNotificador(ventanaPropia), { headers: { cookie: await cookieDe(adminId, "ADMIN") } });
        assert.equal(respuesta.status, 403);
      });

      await escenario("HTTP: notificador 200 en su ventana y 404 en la ajena", async () => {
        const cookie = await cookieDe(notificadorId, "NOTIFICADOR_RPC");
        const propia = await fetch(rutaNotificador(ventanaPropia), { headers: { cookie } });
        assert.equal(propia.status, 200);
        assert.equal(propia.headers.get("x-content-type-options"), "nosniff");
        assert.ok((propia.headers.get("content-disposition") ?? "").includes("filename*=UTF-8''"));
        await propia.arrayBuffer();
        assert.equal((await fetch(rutaNotificador(ventanaAjena), { headers: { cookie } })).status, 404);
      });

      await escenario("HTTP: 413 por Content-Length antes de leer el cuerpo", async () => {
        const respuesta = await fetch(`${baseUrl}/api/formatos-excel/${formatoId}/reglas-llenado`, {
          method: "PUT",
          headers: {
            cookie: await cookieDe(adminId, "ADMIN"),
            "x-nombre-archivo": encodeURIComponent("grande.txt"),
            "content-type": "application/octet-stream",
          },
          body: Buffer.alloc(TAMANO_MAXIMO_REGLAS_LLENADO + 1, 0x61),
        });
        assert.equal(respuesta.status, 413);
      });
    } else {
      console.log("  (sin REGLAS_TEST_BASE_URL: se omiten los escenarios HTTP)");
    }

    await escenario("eliminar borra la fila y el archivo; segunda vez NO_ENCONTRADO", async () => {
      const antes = await repositorio.obtenerPorFormato(formatoId);
      const resultado = await eliminarReglasLlenado(formatoId, dependencias);
      assert.ok(resultado.ok);
      assert.equal(await repositorio.obtenerPorFormato(formatoId), null);
      const archivos = await listarRecursivo(directorio);
      assert.ok(antes && !archivos.some((ruta) => ruta.endsWith(path.basename(antes.rutaArchivo))));
      assert.deepEqual(await eliminarReglasLlenado(formatoId, dependencias), { ok: false, motivo: "NO_ENCONTRADO" });
    });

    assert.deepEqual(fallosRegistrados, []);
    console.log(`\n${ejecutados} escenarios OK`);
  } finally {
    await prisma.reglasLlenadoFormato.deleteMany({ where: { formatoExcelId: { in: formatosCreados } } });
    await prisma.ventanaCarga.deleteMany({ where: { id: { in: ventanasCreadas } } });
    await prisma.usuarioFormatoExcel.deleteMany({ where: { usuarioId: { in: usuariosCreados } } });
    await prisma.formatoExcel.deleteMany({ where: { id: { in: formatosCreados } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuariosCreados } } });
    await prisma.$disconnect();
    await rm(directorio, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
