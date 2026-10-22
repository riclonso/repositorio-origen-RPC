// RF-45: el detector de tipo del archivo de reglas de llenado verifica el CONTENIDO real contra la
// extensión (renombrar no basta). Sin base de datos ni variables de entorno.
//
//   npx tsx tests/detector-tipo-documento.unit.ts
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { documentoCorrespondeAExtension } from "../src/modules/formatos-excel/infrastructure/deteccion/DetectorTipoDocumento";
import type { ExtensionReglasLlenado } from "../src/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";
import {
  extensionReglasLlenadoDesdeNombre,
} from "../src/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";
import { limpiarNombreArchivoReglas, nombreArchivoReglasSchema } from "../src/modules/formatos-excel/schemas/reglas-llenado.schema";

let fallos = 0;
let ejecutadas = 0;

async function prueba(nombre: string, cuerpo: () => void | Promise<void>): Promise<void> {
  ejecutadas += 1;
  try {
    await cuerpo();
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`  FALLA  ${nombre}`);
    console.error(error);
  }
}

const FIRMA_OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

async function docxMinimo(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="x"><w:body/></w:document>');
  return zip.generateAsync({ type: "nodebuffer" });
}

async function xlsxReal(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet("Hoja").addRow(["RUT", "Nombre"]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

async function zipCualquiera(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("hola.txt", "contenido");
  return zip.generateAsync({ type: "nodebuffer" });
}

async function main(): Promise<void> {
  const directorio = await mkdtemp(path.join(tmpdir(), "detector-reglas-"));
  let contador = 0;

  async function corresponde(contenido: Buffer | string, extension: ExtensionReglasLlenado): Promise<boolean> {
    contador += 1;
    const ruta = path.join(directorio, `archivo-${contador}.${extension}`);
    await writeFile(ruta, contenido);
    return documentoCorrespondeAExtension(ruta, extension);
  }

  try {
    const docx = await docxMinimo();
    const xlsx = await xlsxReal();
    const ole2 = Buffer.concat([FIRMA_OLE2, Buffer.alloc(504, 0)]);

    await prueba("docx válido", async () => assert.equal(await corresponde(docx, "docx"), true));
    await prueba("xlsx válido (exceljs)", async () => assert.equal(await corresponde(xlsx, "xlsx"), true));
    await prueba("doc válido (OLE2)", async () => assert.equal(await corresponde(ole2, "doc"), true));
    await prueba("xls válido (OLE2)", async () => assert.equal(await corresponde(ole2, "xls"), true));
    await prueba("txt UTF-8 válido con tildes", async () =>
      assert.equal(await corresponde("Regla 1: año de diagnóstico\r\n\tRUT con dígito\n", "txt"), true),
    );
    await prueba("txt UTF-8 con BOM", async () =>
      assert.equal(await corresponde(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("ñandú")]), "txt"), true),
    );

    await prueba("docx renombrado a xlsx se rechaza", async () => assert.equal(await corresponde(docx, "xlsx"), false));
    await prueba("xlsx renombrado a docx se rechaza", async () => assert.equal(await corresponde(xlsx, "docx"), false));
    await prueba("ZIP cualquiera con .docx se rechaza", async () =>
      assert.equal(await corresponde(await zipCualquiera(), "docx"), false),
    );
    await prueba("ZIP truncado con .docx se rechaza", async () =>
      assert.equal(await corresponde(docx.subarray(0, 40), "docx"), false),
    );
    await prueba("OLE2 con .txt se rechaza", async () => assert.equal(await corresponde(ole2, "txt"), false));
    await prueba("OLE2 con .docx se rechaza", async () => assert.equal(await corresponde(ole2, "docx"), false));
    await prueba("ZIP con .doc se rechaza", async () => assert.equal(await corresponde(docx, "doc"), false));
    await prueba("txt con NUL se rechaza", async () => assert.equal(await corresponde("hola\u0000mundo", "txt"), false));
    await prueba("txt con control (0x07) se rechaza", async () =>
      assert.equal(await corresponde("hola\u0007mundo", "txt"), false),
    );
    await prueba("txt con UTF-8 inválido se rechaza", async () =>
      assert.equal(await corresponde(Buffer.from([0x68, 0x6f, 0xc3, 0x28, 0x61]), "txt"), false),
    );
    await prueba("txt con UTF-8 cortado al final se rechaza", async () =>
      assert.equal(await corresponde(Buffer.from([0x61, 0xe2, 0x82]), "txt"), false),
    );
    for (const extension of ["docx", "doc", "xlsx", "xls", "txt"] as const) {
      await prueba(`archivo vacío con .${extension} se rechaza`, async () =>
        assert.equal(await corresponde(Buffer.alloc(0), extension), false),
      );
    }

    await prueba("lista blanca de extensiones", () => {
      assert.equal(extensionReglasLlenadoDesdeNombre("Reglas.DOCX"), "docx");
      assert.equal(extensionReglasLlenadoDesdeNombre("reglas.xls"), "xls");
      assert.equal(extensionReglasLlenadoDesdeNombre("reglas.pdf"), null);
      assert.equal(extensionReglasLlenadoDesdeNombre("reglas.docx.exe"), null);
      assert.equal(extensionReglasLlenadoDesdeNombre("reglas"), null);
    });

    await prueba("nombre: quita controles y rutas, máximo 255", () => {
      assert.equal(limpiarNombreArchivoReglas("C:\\x\\reg\u0000las\n.txt"), "reglas.txt");
      assert.equal(nombreArchivoReglasSchema.parse(encodeURIComponent("Guía de llenado.docx")), "Guía de llenado.docx");
      assert.equal(nombreArchivoReglasSchema.safeParse(encodeURIComponent(`${"a".repeat(252)}.txt`)).success, false);
      assert.equal(nombreArchivoReglasSchema.safeParse("%E0%A4%A").success, false);
    });
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }

  console.log(`\n${ejecutadas - fallos}/${ejecutadas} pruebas OK`);
  if (fallos > 0) process.exit(1);
}

void main();
