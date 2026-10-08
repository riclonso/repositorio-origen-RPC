// RF-38: generador DETERMINISTA del corpus de la prueba de equivalencia. Escribe los
// archivos en el directorio indicado (por defecto `tests/fixtures/equivalencia/corpus/`) y devuelve
// su descripción. Combina dos fuentes:
//  - libros escritos con exceljs (volumen, tipos habituales, fechas 1904, residuos con estilo);
//  - paquetes .xlsx armados a mano con XML crudo (jszip), para lo que exceljs no escribe y sí
//    producen Excel, LibreOffice o Google Sheets: `inlineStr`, fórmulas compartidas, resultados de
//    fórmula booleanos/error/fecha, celdas de error, escapes `_xHHHH_`, textos fonéticos,
//    hipervínculos sobre números/fechas/celdas vacías, celdas combinadas que crean filas, etc.
//
//   npx tsx tests/fixtures/equivalencia/generarCorpus.ts [directorio]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { ENCABEZADOS_CORPUS } from "./formatosPrueba";

export type CasoCorpus = {
  archivo: string;
  descripcion: string;
  // Trae texto enriquecido (`richText`): única excepción permitida a la equivalencia (ajuste 2 del
  // diseño). La prueba afirma el resultado nuevo esperado en vez de la igualdad.
  textoEnriquecido?: { encabezados: string[]; celdas: { numeroFila: number; columna: string }[] };
};

export const DIRECTORIO_CORPUS_POR_DEFECTO = path.join(__dirname, "corpus");

// --- Utilidades ---

// Generador pseudoaleatorio con semilla (mulberry32): el corpus es idéntico en cada ejecución.
function crearAleatorio(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function digitoVerificador(cuerpo: number): string {
  let suma = 0;
  let multiplicador = 2;
  for (const digito of String(cuerpo).split("").reverse()) {
    suma += Number(digito) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

function rutConPuntos(cuerpo: number): string {
  return `${cuerpo.toLocaleString("de-DE")}-${digitoVerificador(cuerpo)}`;
}

function rutSinPuntos(cuerpo: number): string {
  return `${cuerpo}-${digitoVerificador(cuerpo)}`;
}

function letraColumna(indice: number): string {
  let resultado = "";
  let numero = indice;
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    numero = Math.floor((numero - 1) / 26);
  }
  return resultado;
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Paquete .xlsx con XML crudo ---

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Estilos: 0 general, 1 fecha integrada (id 14), 2 fecha y hora personalizada, 3 negrita, 4 "0.00",
// 5 fecha personalizada con configuración regional.
const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS_MAIN}">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd\\-mm\\-yyyy\\ hh:mm"/><numFmt numFmtId="165" formatCode="[$-340A]d\\-mmm\\-yy;@"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

type OpcionesPaquete = {
  filasXml: string;
  // XML después de `</sheetData>` (combinadas, hipervínculos, márgenes...).
  despuesDeDatos?: string;
  // Antes de `<sheetData>` (dimensión, vistas, columnas...).
  antesDeDatos?: string;
  // Contenido interno de cada `<si>` de la tabla de textos compartidos.
  textosCompartidos?: string[];
  date1904?: boolean;
  relacionesHoja?: { id: string; destino: string }[];
};

async function construirPaquete(opciones: OpcionesPaquete): Promise<Buffer> {
  const zip = new JSZip();
  const conTextos = opciones.textosCompartidos !== undefined;
  const conRelacionesHoja = (opciones.relacionesHoja?.length ?? 0) > 0;

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${conTextos ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' : ""}
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${opciones.date1904 ? '<workbookPr date1904="1"/>' : "<workbookPr/>"}<sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${conTextos ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' : ""}
</Relationships>`,
  );
  zip.file("xl/styles.xml", ESTILOS_XML);

  if (conTextos) {
    const textos = opciones.textosCompartidos ?? [];
    zip.file(
      "xl/sharedStrings.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${NS_MAIN}" count="${textos.length}" uniqueCount="${textos.length}">${textos.map((si) => `<si>${si}</si>`).join("")}</sst>`,
    );
  }

  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac">${opciones.antesDeDatos ?? ""}<sheetData>${opciones.filasXml}</sheetData>${opciones.despuesDeDatos ?? ""}</worksheet>`,
  );

  if (conRelacionesHoja) {
    zip.file(
      "xl/worksheets/_rels/sheet1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${(opciones.relacionesHoja ?? [])
        .map(
          (relacion) =>
            `<Relationship Id="${relacion.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escaparXml(relacion.destino)}" TargetMode="External"/>`,
        )
        .join("")}</Relationships>`,
    );
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// Tabla de textos compartidos construida al vuelo: devuelve el índice de cada texto plano.
class TablaTextos {
  readonly entradas: string[] = [];
  private readonly indices = new Map<string, number>();

  texto(valor: string): number {
    const existente = this.indices.get(valor);
    if (existente !== undefined) return existente;
    const indice = this.entradas.push(`<t xml:space="preserve">${escaparXml(valor)}</t>`) - 1;
    this.indices.set(valor, indice);
    return indice;
  }

  // Entrada cruda (texto enriquecido, `_xHHHH_`, fonética, vacía...).
  cruda(siInterno: string): number {
    return this.entradas.push(siInterno) - 1;
  }
}

type Celda = { col: number; xml: string };

function fila(numero: number, celdas: Celda[], atributos = ""): string {
  return `<row r="${numero}"${atributos}>${celdas.map((celda) => celda.xml).join("")}</row>`;
}

function ref(col: number, numeroFila: number): string {
  return `${letraColumna(col)}${numeroFila}`;
}

const c = {
  compartido: (col: number, nf: number, indice: number, estilo?: number): Celda => ({
    col,
    xml: `<c r="${ref(col, nf)}"${estilo !== undefined ? ` s="${estilo}"` : ""} t="s"><v>${indice}</v></c>`,
  }),
  numero: (col: number, nf: number, valor: number | string, estilo?: number, tipo?: string): Celda => ({
    col,
    xml: `<c r="${ref(col, nf)}"${estilo !== undefined ? ` s="${estilo}"` : ""}${tipo ? ` t="${tipo}"` : ""}><v>${valor}</v></c>`,
  }),
  enLinea: (col: number, nf: number, interno: string): Celda => ({
    col,
    xml: `<c r="${ref(col, nf)}" t="inlineStr"><is>${interno}</is></c>`,
  }),
  crudo: (col: number, nf: number, interno: string, atributos = ""): Celda => ({
    col,
    xml: `<c r="${ref(col, nf)}"${atributos}>${interno}</c>`,
  }),
};

function encabezadoCompartido(tabla: TablaTextos, encabezados: readonly string[] = ENCABEZADOS_CORPUS): string {
  return fila(
    1,
    encabezados.map((encabezado, indice) => c.compartido(indice + 1, 1, tabla.texto(encabezado))),
  );
}

// Columnas (1-based) del corpus.
const COL = { rut: 1, nombre: 2, nacimiento: 3, diagnostico: 4, edad: 5, peso: 6, activo: 7, correo: 8, sexo: 9, comentario: 10 };

// Fila "válida" completa con textos compartidos y fechas con estilo de fecha (serial de Excel).
function filaValida(tabla: TablaTextos, nf: number, cuerpoRut: number, nombre: string): string {
  return fila(nf, [
    c.compartido(COL.rut, nf, tabla.texto(rutConPuntos(cuerpoRut))),
    c.compartido(COL.nombre, nf, tabla.texto(nombre)),
    c.numero(COL.nacimiento, nf, 30000 + nf, 1),
    c.numero(COL.diagnostico, nf, 45300 + (nf % 300), 1),
    c.numero(COL.edad, nf, 20 + (nf % 60)),
    c.numero(COL.peso, nf, 60.5 + (nf % 10), 4),
    c.numero(COL.activo, nf, nf % 2, undefined, "b"),
    c.compartido(COL.correo, nf, tabla.texto(`persona${nf}@salud.cl`)),
    c.compartido(COL.sexo, nf, tabla.texto(nf % 2 === 0 ? "Femenino" : "masculino")),
  ]);
}

// --- Casos con XML crudo ---

async function celdasEspeciales(): Promise<Buffer> {
  const tabla = new TablaTextos();
  const filas: string[] = [encabezadoCompartido(tabla)];

  filas.push(
    fila(2, [
      c.compartido(COL.rut, 2, tabla.texto(rutConPuntos(12345678))),
      c.enLinea(COL.nombre, 2, "<t>Ana en línea</t>"),
      c.numero(COL.nacimiento, 2, 32874, 1),
      c.numero(COL.diagnostico, 2, 45400.5, 2),
      c.numero(COL.edad, 2, 30),
      c.crudo(COL.peso, 2, "<v>72,5</v>", ' t="str"'),
      c.numero(COL.activo, 2, 1, undefined, "b"),
      c.enLinea(COL.correo, 2, "<t>ana@salud.cl</t>"),
      c.compartido(COL.sexo, 2, tabla.texto("MASCULINO")),
    ]),
  );

  // Fórmulas: con resultado numérico, compartida maestra, booleana, texto, fecha (con estilo) y error.
  filas.push(
    fila(3, [
      c.compartido(COL.rut, 3, tabla.texto(rutSinPuntos(11111111))),
      c.crudo(COL.nombre, 3, "<f>NA()</f><v>#N/A</v>", ' t="e"'),
      c.crudo(COL.diagnostico, 3, "<f>DATE(2024,5,1)</f><v>45413</v>", ' s="1"'),
      c.crudo(COL.edad, 3, "<f>1+1</f><v>2</v>"),
      c.crudo(COL.peso, 3, '<f t="shared" ref="F3:F6" si="0">E3*2</f><v>4</v>'),
      c.crudo(COL.activo, 3, "<f>TRUE()</f><v>1</v>", ' t="b"'),
      c.crudo(COL.comentario, 3, '<f>"x"&amp;"y"</f><v>xy</v>', ' t="str"'),
    ]),
  );

  // Fórmula compartida esclava, fórmula sin resultado, fecha de fórmula sin estilo.
  filas.push(
    fila(4, [
      c.compartido(COL.rut, 4, tabla.texto(rutConPuntos(22222222))),
      c.compartido(COL.nombre, 4, tabla.texto("Luis")),
      c.crudo(COL.diagnostico, 4, "<f>TODAY()</f><v>45500</v>"),
      c.crudo(COL.edad, 4, "<f>A1+1</f>"),
      c.crudo(COL.peso, 4, '<f t="shared" si="0"/><v>6</v>'),
      c.crudo(COL.activo, 4, "<f>1/0</f><v>#DIV/0!</v>", ' t="e"'),
    ]),
  );

  // Esclava sin resultado, celda de error sin fórmula, entidades que exceljs decodifica dos veces
  // en `t="str"` pero no en `inlineStr`.
  filas.push(
    fila(5, [
      c.compartido(COL.rut, 5, tabla.texto(rutConPuntos(33333333))),
      c.crudo(COL.nombre, 5, "<v>&amp;lt;b&amp;gt;Pedro&amp;lt;/b&amp;gt;</v>", ' t="str"'),
      c.crudo(COL.peso, 5, '<f t="shared" si="0"/>'),
      c.crudo(COL.correo, 5, "<v>#VALUE!</v>", ' t="e"'),
      c.enLinea(COL.comentario, 5, "<t>&amp;lt;p&amp;gt;texto&amp;lt;/p&amp;gt;</t>"),
      c.numero(COL.diagnostico, 5, 45350, 5),
    ]),
  );

  // Escapes `_xHHHH_` (los decodifica la tabla de textos, no `inlineStr`) y texto fonético.
  filas.push(
    fila(6, [
      c.compartido(COL.rut, 6, tabla.texto(rutConPuntos(44444444))),
      c.compartido(COL.nombre, 6, tabla.cruda("<t>Mar_x00ED_a_x000D_ Jos_x00e9_</t>")),
      c.enLinea(COL.comentario, 6, "<t>valor_x0041_</t>"),
      c.compartido(COL.correo, 6, tabla.cruda('<t>fono@salud.cl</t><rPh sb="0" eb="1"><t>フォノ</t></rPh>')),
      c.numero(COL.diagnostico, 6, 45360, 1),
      c.crudo(COL.peso, 6, '<f t="shared" si="0"/><v>8</v>'),
    ]),
  );

  // Números grandes y decimales, booleano falso, ENTERO como texto con ceros a la izquierda.
  filas.push(
    fila(7, [
      c.compartido(COL.rut, 7, tabla.texto(rutConPuntos(55555555))),
      c.compartido(COL.nombre, 7, tabla.texto("Números")),
      c.numero(COL.edad, 7, "1E+21"),
      c.numero(COL.peso, 7, "0.30000000000000004"),
      c.numero(COL.activo, 7, 0, undefined, "b"),
      c.compartido(COL.comentario, 7, tabla.texto("00123")),
      c.numero(COL.diagnostico, 7, 45001, 1),
    ]),
  );

  // Fechas como texto (convención chilena), fecha imposible y fecha con hora.
  filas.push(
    fila(8, [
      c.compartido(COL.rut, 8, tabla.texto("8.888.888-8")),
      c.compartido(COL.nombre, 8, tabla.texto("Fechas texto")),
      c.compartido(COL.nacimiento, 8, tabla.texto("15/03/1990 10:30")),
      c.compartido(COL.diagnostico, 8, tabla.texto("31-02-2024")),
      c.compartido(COL.comentario, 8, tabla.texto("15-03-2024")),
    ]),
  );

  // Espacios: celdas solo con espacios en requeridas, texto con espacios a los lados.
  filas.push(
    fila(9, [
      c.compartido(COL.rut, 9, tabla.texto("   ")),
      c.compartido(COL.nombre, 9, tabla.texto("  Ana  ")),
      c.compartido(COL.diagnostico, 9, tabla.texto(" 01-06-2024 ")),
      c.compartido(COL.correo, 9, tabla.texto(" ANA@SALUD.CL ")),
    ]),
  );

  // `t="n"` explícito y `t="d"` (fecha ISO, la escriben algunas herramientas).
  filas.push(
    fila(10, [
      c.compartido(COL.rut, 10, tabla.texto(rutConPuntos(10101010))),
      c.compartido(COL.nombre, 10, tabla.texto("Tipos explícitos")),
      c.numero(COL.edad, 10, 5, undefined, "n"),
      c.crudo(COL.nacimiento, 10, "<v>2024-01-02T00:00:00</v>", ' t="d"'),
      c.numero(COL.diagnostico, 10, 45320, 1),
    ]),
  );

  // Celdas vacías con estilo (tipo nulo) y sin estilo (tipo combinada de exceljs).
  filas.push(
    fila(11, [
      c.compartido(COL.rut, 11, tabla.texto(rutConPuntos(12121212))),
      c.crudo(COL.nombre, 11, "", ' s="3"'),
      c.crudo(COL.comentario, 11, ""),
      c.numero(COL.diagnostico, 11, 45330, 1),
    ]),
  );

  // Textos compartidos vacíos: `<t/>` y `<si/>` sin contenido.
  filas.push(
    fila(12, [
      c.compartido(COL.rut, 12, tabla.texto(rutConPuntos(13131313))),
      c.compartido(COL.nombre, 12, tabla.cruda("<t/>")),
      c.compartido(COL.comentario, 12, tabla.cruda("")),
      c.numero(COL.diagnostico, 12, 45331, 1),
    ]),
  );

  // Celdas más allá del último encabezado (se ignoran) y texto que empieza con "=".
  filas.push(
    fila(13, [
      c.compartido(COL.rut, 13, tabla.texto(rutConPuntos(14141414))),
      c.compartido(COL.nombre, 13, tabla.texto("=SUMA(A1:A2)")),
      c.numero(COL.diagnostico, 13, 45332, 1),
      c.compartido(11, 13, tabla.texto("fuera")),
      c.numero(12, 13, 99),
    ]),
  );

  // Duplicados de la fila 2 (RUT) y de la 4 (Nombre + Fecha Nacimiento vacía).
  filas.push(
    fila(14, [
      c.compartido(COL.rut, 14, tabla.texto(rutConPuntos(12345678))),
      c.compartido(COL.nombre, 14, tabla.texto("Luis")),
      c.numero(COL.diagnostico, 14, 45333, 1),
    ]),
  );

  // HTML prohibido y permitido, enumerados (NFD, sin tilde, mayúsculas).
  filas.push(
    fila(15, [
      c.compartido(COL.rut, 15, tabla.texto(rutConPuntos(15151515))),
      c.compartido(COL.nombre, 15, tabla.texto("<b>Negrita</b>")),
      c.compartido(COL.comentario, 15, tabla.texto("a < b y R&D")),
      c.compartido(COL.sexo, 15, tabla.texto("Ñandú")),
      c.numero(COL.diagnostico, 15, 45334, 1),
    ]),
  );
  filas.push(
    fila(16, [
      c.compartido(COL.rut, 16, tabla.texto(rutConPuntos(16161616))),
      c.compartido(COL.nombre, 16, tabla.texto("Sin tilde")),
      c.compartido(COL.sexo, 16, tabla.texto("ÑANDU")),
      c.compartido(COL.comentario, 16, tabla.texto("Juan&nbsp;Pérez")),
      c.numero(COL.diagnostico, 16, 45335, 1),
    ]),
  );

  // RUT como número sin dígito verificador, booleano y fecha en columnas de texto, número en correo.
  filas.push(
    fila(17, [
      c.numero(COL.rut, 17, 12345678),
      c.numero(COL.nombre, 17, 1, undefined, "b"),
      c.numero(COL.comentario, 17, 45000, 1),
      c.numero(COL.correo, 17, 42),
      c.numero(COL.diagnostico, 17, 45336, 1),
    ]),
  );

  // Fila con `<row>` sin celdas en medio y una fila de residuo con estilo al final.
  filas.push(fila(18, [], ' spans="1:10" x14ac:dyDescent="0.25"'));
  filas.push(filaValida(tabla, 19, 19191919, "Después de vacía"));
  filas.push(filaValida(tabla, 25, 25252525, "Tras hueco sin row"));
  filas.push(fila(40, [c.crudo(COL.nombre, 40, "", ' s="3"')], ' ht="30" customHeight="1"'));

  return construirPaquete({
    filasXml: filas.join(""),
    textosCompartidos: tabla.entradas,
    antesDeDatos: '<dimension ref="A1:L40"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="10" width="15" customWidth="1"/></cols>',
    despuesDeDatos: '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>',
  });
}

async function hipervinculos(conEncabezado: boolean): Promise<Buffer> {
  const tabla = new TablaTextos();
  const filas: string[] = [encabezadoCompartido(tabla)];
  for (let nf = 2; nf <= 9; nf += 1) filas.push(filaValida(tabla, nf, 20000000 + nf * 7, `Persona ${nf}`));
  // Celdas vacías con estilo en la fila 7 (el hipervínculo cae sobre una de ellas).
  filas[6] = fila(7, [c.compartido(COL.rut, 7, tabla.texto(rutConPuntos(7070707))), c.crudo(COL.nombre, 7, "", ' s="3"'), c.numero(COL.diagnostico, 7, 45340, 1)]);
  // Fórmula de texto con hipervínculo (fila 6, Comentario).
  filas[5] = fila(6, [
    c.compartido(COL.rut, 6, tabla.texto(rutConPuntos(6060606))),
    c.compartido(COL.nombre, 6, tabla.texto("Seis")),
    c.numero(COL.diagnostico, 6, 45341, 1),
    c.crudo(COL.comentario, 6, '<f>HYPERLINK("https://x.cl","ver")</f><v>ver</v>', ' t="str"'),
  ]);

  const vinculos = [
    `<hyperlink ref="B2" r:id="rId1"/>`,
    `<hyperlink ref="E3" r:id="rId2"/>`,
    `<hyperlink ref="J4" location="Datos!A1" display="interno"/>`,
    `<hyperlink ref="D5" r:id="rId3"/>`,
    `<hyperlink ref="J6" r:id="rId4"/>`,
    `<hyperlink ref="B7" r:id="rId5"/>`,
    `<hyperlink ref="C8:D8" r:id="rId6"/>`,
    `<hyperlink ref="H9" r:id="rId7"/>`,
  ];
  if (conEncabezado) vinculos.push(`<hyperlink ref="J1" r:id="rId8"/>`);

  return construirPaquete({
    filasXml: filas.join(""),
    textosCompartidos: tabla.entradas,
    despuesDeDatos: `<hyperlinks>${vinculos.join("")}</hyperlinks>`,
    relacionesHoja: Array.from({ length: 8 }, (_, indice) => ({ id: `rId${indice + 1}`, destino: `https://salud.cl/recurso/${indice + 1}` })),
  });
}

async function combinadas(enEncabezado: boolean): Promise<Buffer> {
  const tabla = new TablaTextos();
  const filas: string[] = [];

  if (enEncabezado) {
    // "RUT" combinado A1:B1: el encabezado queda duplicado y "Nombre" falta.
    filas.push(
      fila(1, [
        c.compartido(1, 1, tabla.texto("RUT")),
        c.crudo(2, 1, ""),
        ...ENCABEZADOS_CORPUS.slice(2).map((encabezado, indice) => c.compartido(indice + 3, 1, tabla.texto(encabezado))),
      ]),
    );
  } else {
    filas.push(encabezadoCompartido(tabla));
  }

  for (let nf = 2; nf <= 10; nf += 1) filas.push(filaValida(tabla, nf, 30000000 + nf * 13, `Combinada ${nf}`));
  // B4 y B5 traen su propio valor: la combinación B3:B5 lo reemplaza por el de B3.
  filas.push(filaValida(tabla, 21, 21212121, "Veintiuno"));

  const rangos = ["B3:B5", "E6:G6", "J9:J14", "C20:C22", "A12:A13"];
  if (enEncabezado) rangos.push("A1:B1");

  return construirPaquete({
    filasXml: filas.join(""),
    textosCompartidos: tabla.entradas,
    despuesDeDatos: `<mergeCells count="${rangos.length}">${rangos.map((rango) => `<mergeCell ref="${rango}"/>`).join("")}</mergeCells>`,
  });
}

async function encabezadosEspeciales(): Promise<Buffer> {
  const tabla = new TablaTextos();
  // Encabezados número, fecha y booleano en columnas extra, y una fórmula con resultado de texto.
  const filas = [
    fila(1, [
      ...ENCABEZADOS_CORPUS.slice(0, 9).map((encabezado, indice) => c.compartido(indice + 1, 1, tabla.texto(encabezado))),
      c.crudo(10, 1, '<f>"Comen"&amp;"tario"</f><v>Comentario</v>', ' t="str"'),
      c.numero(11, 1, 2024),
      c.numero(12, 1, 45000, 1),
      c.numero(13, 1, 1, undefined, "b"),
    ]),
    filaValida(tabla, 2, 40404040, "Encabezados raros"),
  ];
  return construirPaquete({ filasXml: filas.join(""), textosCompartidos: tabla.entradas });
}

async function textoEnriquecidoDatos(): Promise<Buffer> {
  const tabla = new TablaTextos();
  const filas: string[] = [encabezadoCompartido(tabla)];
  for (let nf = 2; nf <= 8; nf += 1) filas.push(filaValida(tabla, nf, 50000000 + nf * 3, `Persona ${nf}`));

  const enriquecidoNombre = tabla.cruda('<r><rPr><b/></rPr><t>Ma</t></r><r><t xml:space="preserve">ría Pérez</t></r>');
  const enriquecidoComentario = tabla.cruda('<r><rPr><color rgb="FFFF0000"/></rPr><t>urgente</t></r>');
  const enriquecidoEspacios = tabla.cruda('<r><rPr><b/></rPr><t xml:space="preserve">   </t></r>');

  filas[2] = fila(3, [
    c.compartido(COL.rut, 3, tabla.texto(rutConPuntos(30303030))),
    c.compartido(COL.nombre, 3, enriquecidoNombre),
    c.numero(COL.diagnostico, 3, 45410, 1),
  ]);
  filas[4] = fila(5, [
    c.compartido(COL.rut, 5, tabla.texto(rutConPuntos(50505050))),
    c.compartido(COL.nombre, 5, tabla.texto("Cinco")),
    c.numero(COL.diagnostico, 5, 45411, 1),
    c.compartido(COL.comentario, 5, enriquecidoComentario),
  ]);
  filas[5] = fila(6, [
    c.compartido(COL.rut, 6, tabla.texto(rutConPuntos(60606060))),
    c.compartido(COL.nombre, 6, tabla.texto("Seis")),
    c.numero(COL.diagnostico, 6, 45412, 1),
    c.enLinea(COL.comentario, 6, '<r><rPr><i/></rPr><t>en </t></r><r><t>línea</t></r>'),
  ]);
  filas[6] = fila(7, [
    c.compartido(COL.rut, 7, tabla.texto(rutConPuntos(70707070))),
    c.compartido(COL.nombre, 7, tabla.texto("Siete")),
    c.numero(COL.diagnostico, 7, 45413, 1),
    c.compartido(COL.comentario, 7, enriquecidoEspacios),
  ]);

  return construirPaquete({ filasXml: filas.join(""), textosCompartidos: tabla.entradas });
}

async function textoEnriquecidoEncabezado(): Promise<Buffer> {
  const tabla = new TablaTextos();
  const encabezadoEnriquecido = tabla.cruda('<r><rPr><b/></rPr><t>Nom</t></r><r><t>bre</t></r>');
  const filas = [
    fila(
      1,
      ENCABEZADOS_CORPUS.map((encabezado, indice) =>
        c.compartido(indice + 1, 1, indice === 1 ? encabezadoEnriquecido : tabla.texto(encabezado)),
      ),
    ),
    filaValida(tabla, 2, 60000006, "Uno"),
    filaValida(tabla, 3, 60000013, "Dos"),
  ];
  return construirPaquete({ filasXml: filas.join(""), textosCompartidos: tabla.entradas });
}

async function sinEncabezado(): Promise<Buffer> {
  const tabla = new TablaTextos();
  return construirPaquete({
    filasXml: [filaValida(tabla, 3, 70000007, "Sin encabezado"), filaValida(tabla, 4, 70000014, "Otra")].join(""),
    textosCompartidos: tabla.entradas,
  });
}

async function vacio(): Promise<Buffer> {
  return construirPaquete({ filasXml: "" });
}

// --- Casos con exceljs ---

type ValorExcel = ExcelJS.CellValue;

async function libroExcelJs(
  filas: ValorExcel[][],
  opciones: { encabezados?: readonly string[]; date1904?: boolean; ajustar?: (hoja: ExcelJS.Worksheet) => void } = {},
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  if (opciones.date1904) libro.properties.date1904 = true;
  const hoja = libro.addWorksheet("Datos");
  hoja.addRow([...(opciones.encabezados ?? ENCABEZADOS_CORPUS)]);
  for (const valores of filas) hoja.addRow(valores);
  hoja.getColumn(3).numFmt = "dd/mm/yyyy";
  hoja.getColumn(4).numFmt = "dd-mm-yyyy hh:mm";
  opciones.ajustar?.(hoja);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const NOMBRES = ["Ana", "Luis", "María José", "Pedro", "Ñuño", "Sofía", "Tomás", "Valentina", "Benjamín", "Isidora"];
const APELLIDOS = ["Pérez", "González", "Muñoz", "Rojas", "Díaz", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda"];
const COMENTARIOS = ["", "Control en 3 meses", "Derivado a oncología", "<br>", "Sin observaciones", "R&D", "a < b"];

// Fila de datos clínicos sintética. `calidad` ∈ [0,1): debajo de 0,08 mete algún error.
function filaSintetica(aleatorio: () => number, indice: number): ValorExcel[] {
  const cuerpo = 5_000_000 + Math.floor(aleatorio() * 20_000_000);
  const nombre = `${NOMBRES[indice % NOMBRES.length]} ${APELLIDOS[Math.floor(aleatorio() * APELLIDOS.length)]}`;
  const nacimiento = new Date(Date.UTC(1940 + Math.floor(aleatorio() * 70), Math.floor(aleatorio() * 12), 1 + Math.floor(aleatorio() * 28)));
  const diagnostico = new Date(Date.UTC(2024, Math.floor(aleatorio() * 12), 1 + Math.floor(aleatorio() * 28), Math.floor(aleatorio() * 24), 0, 0));
  const calidad = aleatorio();

  const filaBase: ValorExcel[] = [
    aleatorio() < 0.5 ? rutConPuntos(cuerpo) : rutSinPuntos(cuerpo),
    nombre,
    nacimiento,
    diagnostico,
    Math.floor(aleatorio() * 100),
    Math.round(aleatorio() * 10000) / 100,
    aleatorio() < 0.5,
    aleatorio() < 0.7 ? `p${indice}@salud.cl` : null,
    ["Masculino", "femenino", "INTERSEX", "Ñandú"][Math.floor(aleatorio() * 4)],
    COMENTARIOS[Math.floor(aleatorio() * COMENTARIOS.length)] || null,
  ];

  if (calidad < 0.02) filaBase[0] = `${cuerpo}-0`; // RUT con dígito probablemente inválido
  else if (calidad < 0.04) filaBase[4] = "treinta"; // ENTERO inválido
  else if (calidad < 0.05) filaBase[3] = new Date(Date.UTC(2019, 1, 1)); // fuera del año
  else if (calidad < 0.06) filaBase[1] = null; // requerida vacía
  else if (calidad < 0.07) filaBase[7] = "no-es-correo";
  else if (calidad < 0.075) return [null, null, null, null, null, null, null, null, null, null]; // fila vacía intermedia

  return filaBase;
}

function filasSinteticas(cantidad: number, semilla: number): ValorExcel[][] {
  const aleatorio = crearAleatorio(semilla);
  const filas = Array.from({ length: cantidad }, (_, indice) => filaSintetica(aleatorio, indice));
  // Duplicados exactos repartidos (FILA_DUPLICADA) y una clave vacía repetida (no cuenta).
  for (let indice = 50; indice < cantidad; indice += 997) filas[indice] = [...filas[indice - 37]];
  return filas;
}

// --- Corpus completo ---

export async function generarCorpus(directorio: string = DIRECTORIO_CORPUS_POR_DEFECTO): Promise<CasoCorpus[]> {
  await mkdir(directorio, { recursive: true });
  const casos: CasoCorpus[] = [];

  async function agregar(caso: CasoCorpus, contenido: Buffer | Promise<Buffer>): Promise<void> {
    await writeFile(path.join(directorio, caso.archivo), await contenido);
    casos.push(caso);
  }

  await agregar({ archivo: "celdas-especiales.xlsx", descripcion: "inlineStr, fórmulas (compartidas, booleanas, error, fecha, sin resultado), errores, entidades, _xHHHH_, fonética, huecos y residuos" }, celdasEspeciales());
  await agregar({ archivo: "hipervinculos.xlsx", descripcion: "hipervínculos en texto, número, fecha, fórmula, celda vacía, rango e internos" }, hipervinculos(false));
  await agregar({ archivo: "hipervinculo-encabezado.xlsx", descripcion: "hipervínculo en un encabezado" }, hipervinculos(true));
  await agregar({ archivo: "combinadas-datos.xlsx", descripcion: "celdas combinadas en datos, incluso más allá de la última fila y con la principal ausente" }, combinadas(false));
  await agregar({ archivo: "combinadas-encabezado.xlsx", descripcion: "celda combinada en el encabezado" }, combinadas(true));
  await agregar({ archivo: "encabezados-especiales.xlsx", descripcion: "encabezado de fórmula, número, fecha y booleano" }, encabezadosEspeciales());
  await agregar({ archivo: "sin-encabezado.xlsx", descripcion: "fila 1 ausente" }, sinEncabezado());
  await agregar({ archivo: "vacio.xlsx", descripcion: "hoja sin filas" }, vacio());

  await agregar(
    {
      archivo: "texto-enriquecido-datos.xlsx",
      descripcion: "texto enriquecido (compartido y en línea) en celdas de datos",
      textoEnriquecido: {
        encabezados: [],
        celdas: [
          { numeroFila: 3, columna: "Nombre" },
          { numeroFila: 5, columna: "Comentario" },
          { numeroFila: 6, columna: "Comentario" },
        ],
      },
    },
    textoEnriquecidoDatos(),
  );
  await agregar(
    {
      archivo: "texto-enriquecido-encabezado.xlsx",
      descripcion: "texto enriquecido en un encabezado",
      textoEnriquecido: { encabezados: ["Nombre"], celdas: [] },
    },
    textoEnriquecidoEncabezado(),
  );

  await agregar({ archivo: "tipos-exceljs.xlsx", descripcion: "tipos habituales escritos por exceljs" }, libroExcelJs(filasSinteticas(300, 7)));
  await agregar({ archivo: "fechas-1904.xlsx", descripcion: "sistema de fechas 1904" }, libroExcelJs(filasSinteticas(120, 11), { date1904: true }));
  await agregar(
    { archivo: "residuos-estilo.xlsx", descripcion: "filas de residuo con estilo al final y en medio" },
    libroExcelJs(filasSinteticas(40, 13), {
      ajustar: (hoja) => {
        hoja.getRow(60).height = 30;
        hoja.getRow(80).getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
      },
    }),
  );
  await agregar({ archivo: "solo-encabezados.xlsx", descripcion: "solo la fila de encabezados" }, libroExcelJs([]));
  await agregar(
    { archivo: "solo-vacias.xlsx", descripcion: "encabezados y filas vacías con estilo" },
    libroExcelJs([], { ajustar: (hoja) => { hoja.getRow(5).height = 25; hoja.getRow(9).height = 25; } }),
  );
  await agregar(
    { archivo: "columnas-inesperadas.xlsx", descripcion: "una columna que no pertenece al formato" },
    libroExcelJs(filasSinteticas(30, 17).map((valores) => [...valores, "extra"]), { encabezados: [...ENCABEZADOS_CORPUS, "Observación"] }),
  );
  await agregar(
    { archivo: "columnas-faltantes.xlsx", descripcion: "falta Fecha Diagnóstico" },
    libroExcelJs(filasSinteticas(30, 19).map((valores) => valores.filter((_, indice) => indice !== 3)), {
      encabezados: ENCABEZADOS_CORPUS.filter((_, indice) => indice !== 3),
    }),
  );
  await agregar(
    { archivo: "encabezados-espacios-mayusculas.xlsx", descripcion: "encabezados con espacios y otras mayúsculas, uno duplicado" },
    libroExcelJs(filasSinteticas(30, 23).map((valores) => [...valores, "dup"]), {
      encabezados: [...ENCABEZADOS_CORPUS.map((encabezado, indice) => (indice === 0 ? ` ${encabezado.toLowerCase()} ` : indice === 1 ? encabezado.toUpperCase() : encabezado)), "Comentario"],
    }),
  );
  await agregar(
    { archivo: "encabezado-con-hueco.xlsx", descripcion: "encabezado vacío en medio" },
    libroExcelJs(filasSinteticas(20, 29), { encabezados: [...ENCABEZADOS_CORPUS.slice(0, 4), "", ...ENCABEZADOS_CORPUS.slice(5)] }),
  );
  await agregar(
    { archivo: "mas-de-500-errores.xlsx", descripcion: "más de 500 errores" },
    libroExcelJs(Array.from({ length: 1500 }, (_, indice) => ["no-rut", null, "fecha mala", null, "x", "y", "z", "correo", "otro", `<p>${indice}</p>`])),
  );
  await agregar({ archivo: "veinte-mil-filas.xlsx", descripcion: "20.000 filas de datos" }, libroExcelJs(filasSinteticas(20_000, 31)));
  await agregar({ archivo: "treinta-mil-filas.xlsx", descripcion: "30.000 filas (supera el tope anterior de 20.000)" }, libroExcelJs(filasSinteticas(30_000, 37)));
  await agregar(
    { archivo: "utf8-extenso.xlsx", descripcion: "textos con ñ y tildes que cruzan los límites de los trozos descomprimidos" },
    libroExcelJs(
      Array.from({ length: 40_000 }, (_, indice) => [rutConPuntos(9_000_000 + indice), `Ñandú ácido ${indice} ÁÉÍÓÚ`, null, new Date(Date.UTC(2024, 2, 1)), null, null, null, null, "Ñandú", `peña ${indice}`]),
    ),
  );

  return casos;
}

if (require.main === module) {
  void generarCorpus(process.argv[2]).then((casos) => {
    console.log(`Corpus generado: ${casos.length} archivos`);
  });
}
