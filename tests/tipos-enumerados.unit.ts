// Tipos de dato enumerados definidos por el usuario: normalización, validador por columna,
// esquema Zod, revalidación en `application/`, mensaje al notificador y caso de uso de carga. Sin
// base de datos: las dependencias de los casos de uso se reemplazan por dobles en memoria.
//
//   npx tsx tests/tipos-enumerados.unit.ts
import assert from "node:assert/strict";
import {
  MAXIMO_VALORES_EN_MENSAJE,
  mensajeValorNoPermitidoEnumerado,
  normalizarValorEnumerado,
} from "../src/modules/formatos-excel/domain/entities/TipoEnumerado";
import {
  ValidadoresTipoDato,
  crearValidadorColumna,
} from "../src/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";
import {
  crearFormatoExcelSchema,
  editarFormatoExcelSchema,
} from "../src/modules/formatos-excel/schemas/formato-excel.schema";
import { resolverTiposEnumerados } from "../src/modules/formatos-excel/application/resolverTiposEnumerados";
import { actualizarFormatoExcel } from "../src/modules/formatos-excel/application/use-cases/ActualizarFormatoExcel";
import { validarYCargarArchivo } from "../src/modules/reporte-excel/application/use-cases/ValidarYCargarArchivo";
import type {
  ColumnaFormatoExcel,
  DatosEdicionFormatoExcel,
  FormatoExcel,
  TipoEnumeradoFormatoExcel,
} from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "../src/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import type { CargaArchivoRepository } from "../src/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { VentanaCargaRepository } from "../src/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { SolicitudReemplazoCargaRepository } from "../src/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type { VentanaCarga } from "../src/modules/ventanas-carga/domain/entities/VentanaCarga";
import type {
  CargaArchivo,
  DatosNuevaCargaArchivo,
  ValorCeldaArchivo,
} from "../src/modules/reporte-excel/domain/entities/CargaArchivo";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FORMATO_ID = "formato-enum";

const TIPO_SEXO: TipoEnumeradoFormatoExcel = {
  id: "t1",
  orden: 1,
  nombre: "Sexo",
  valores: ["Masculino", "Femenino", "Intersex"],
};
const TIPO_RESPUESTA: TipoEnumeradoFormatoExcel = { id: "t2", orden: 2, nombre: "Respuesta", valores: ["Sí", "No", "1"] };

function columna(
  nombre: string,
  tipoDato: ColumnaFormatoExcel["tipoDato"],
  tipoEnumeradoNombre: string | null = null,
  requerida = false,
): ColumnaFormatoExcel {
  return { id: `c-${nombre}`, orden: 1, nombre, requerida, tipoDato, tipoEnumeradoNombre };
}

// ---------------------------------------------------------------------------------------------
// 1. Normalización: ignora mayúsculas, distingue acentos, NFC y trim.
// ---------------------------------------------------------------------------------------------
function probarNormalizacion(): void {
  assert.equal(normalizarValorEnumerado("SI"), normalizarValorEnumerado("si"));
  assert.equal(normalizarValorEnumerado("  Femenino  "), normalizarValorEnumerado("femenino"));
  // NFC ("í" precompuesta) vs NFD ("i" + acento combinante): mismo valor.
  assert.equal(normalizarValorEnumerado("Sí"), normalizarValorEnumerado("Sí"));
  // Los acentos SÍ se distinguen.
  assert.notEqual(normalizarValorEnumerado("Si"), normalizarValorEnumerado("Sí"));
  assert.notEqual(normalizarValorEnumerado("Peru"), normalizarValorEnumerado("Perú"));
}

// ---------------------------------------------------------------------------------------------
// 2. Validador por columna.
// ---------------------------------------------------------------------------------------------
function probarValidador(): void {
  const validarSexo = crearValidadorColumna(columna("Sexo", "ENUMERADO", "sexo"), [TIPO_SEXO]);
  assert.equal(validarSexo("Masculino"), true);
  assert.equal(validarSexo("FEMENINO"), true);
  assert.equal(validarSexo("  intersex "), true);
  assert.equal(validarSexo("Otro"), false);
  assert.equal(validarSexo(new Date()), false);

  const validarRespuesta = crearValidadorColumna(columna("R", "ENUMERADO", "Respuesta"), [TIPO_SEXO, TIPO_RESPUESTA]);
  // Número 1 de Excel → "1": coincide con el valor "1".
  assert.equal(validarRespuesta(1), true);
  assert.equal(validarRespuesta("1"), true);
  // "01" (texto) no es "1" (aceptado por diseño).
  assert.equal(validarRespuesta("01"), false);
  assert.equal(validarRespuesta("si"), false, "sin acento no coincide con «Sí»");
  assert.equal(validarRespuesta("SÍ"), true);
  assert.equal(validarRespuesta("Sí"), true, "NFD coincide con la forma NFC guardada");
  assert.equal(validarRespuesta(true), false, "un booleano se compara como \"true\"");

  // Tipos fijos: la fábrica devuelve el validador fijo de siempre.
  assert.equal(crearValidadorColumna(columna("Edad", "ENTERO"), []), ValidadoresTipoDato.ENTERO);

  // Columna ENUMERADO sin su tipo: dato corrupto, lanza (sin valores de celda en el mensaje).
  assert.throws(
    () => crearValidadorColumna(columna("Sexo", "ENUMERADO", "Inexistente"), [TIPO_SEXO]),
    /columna "Sexo"/,
  );
  assert.throws(() => crearValidadorColumna(columna("Sexo", "ENUMERADO", null), [TIPO_SEXO]));
}

// ---------------------------------------------------------------------------------------------
// 3. Esquema Zod.
// ---------------------------------------------------------------------------------------------
type ColumnaPayload = { nombre: string; requerida: boolean; tipoDato: string; tipoEnumeradoNombre?: string | null };

function payload(columnas: ColumnaPayload[], tiposEnumerados?: unknown): Record<string, unknown> {
  return { nombre: "Formato", columnas, reglasValidacion: [], ...(tiposEnumerados === undefined ? {} : { tiposEnumerados }) };
}

function primerMensaje(resultado: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return resultado.error?.issues[0]?.message ?? "";
}

function probarEsquema(): void {
  const tipos = [{ nombre: "Sexo", valores: ["Masculino", "Femenino"] }];

  // Válido: referencia sin distinguir mayúsculas, nombres y valores con trim.
  const valido = crearFormatoExcelSchema.safeParse(
    payload([{ nombre: "Sexo", requerida: true, tipoDato: "ENUMERADO", tipoEnumeradoNombre: " sexo " }], [
      { nombre: "  Sexo ", valores: [" Masculino ", "Femenino"] },
    ]),
  );
  assert.equal(valido.success, true, primerMensaje(valido));
  assert.deepEqual(valido.data?.tiposEnumerados, [{ nombre: "Sexo", valores: ["Masculino", "Femenino"] }]);
  assert.equal(valido.data?.columnas[0].tipoEnumeradoNombre, "sexo");

  // `.default([])` y `tipoEnumeradoNombre` opcional (clientes antiguos).
  const sinEnumerados = crearFormatoExcelSchema.safeParse(payload([{ nombre: "A", requerida: false, tipoDato: "TEXTO" }]));
  assert.equal(sinEnumerados.success, true);
  assert.deepEqual(sinEnumerados.data?.tiposEnumerados, []);
  assert.equal(sinEnumerados.data?.columnas[0].tipoEnumeradoNombre, null);
  const edicionSinEnumerados = editarFormatoExcelSchema.safeParse(payload([{ nombre: "A", requerida: false, tipoDato: "TEXTO" }]));
  assert.equal(edicionSinEnumerados.success, true);
  assert.deepEqual(edicionSinEnumerados.data?.tiposEnumerados, []);

  // Invariante en ambos sentidos.
  const enumSinNombre = crearFormatoExcelSchema.safeParse(
    payload([{ nombre: "Sexo", requerida: false, tipoDato: "ENUMERADO", tipoEnumeradoNombre: null }], tipos),
  );
  assert.equal(enumSinNombre.success, false);
  const nombreSinEnum = crearFormatoExcelSchema.safeParse(
    payload([{ nombre: "Sexo", requerida: false, tipoDato: "TEXTO", tipoEnumeradoNombre: "Sexo" }], tipos),
  );
  assert.equal(nombreSinEnum.success, false);

  // Referencia inexistente.
  const inexistente = crearFormatoExcelSchema.safeParse(
    payload([{ nombre: "Sexo", requerida: false, tipoDato: "ENUMERADO", tipoEnumeradoNombre: "Genero" }], tipos),
  );
  assert.equal(inexistente.success, false);
  assert.equal(primerMensaje(inexistente), 'La columna "Sexo" usa un tipo enumerado que no existe: "Genero"');

  const columnaTexto = [{ nombre: "A", requerida: false, tipoDato: "TEXTO" }];

  // Valores duplicados sin distinguir mayúsculas; el error nombra el valor repetido.
  const duplicado = crearFormatoExcelSchema.safeParse(payload(columnaTexto, [{ nombre: "R", valores: ["SI", "si"] }]));
  assert.equal(duplicado.success, false);
  assert.ok(primerMensaje(duplicado).includes('"si"'));
  // Con acento distinto NO es duplicado.
  assert.equal(crearFormatoExcelSchema.safeParse(payload(columnaTexto, [{ nombre: "R", valores: ["Si", "Sí"] }])).success, true);

  // Nombres de tipo repetidos sin distinguir mayúsculas.
  assert.equal(
    crearFormatoExcelSchema.safeParse(
      payload(columnaTexto, [
        { nombre: "Sexo", valores: ["a"] },
        { nombre: "SEXO", valores: ["b"] },
      ]),
    ).success,
    false,
  );

  // Límites.
  const conTipos = (tiposEnumerados: unknown) => crearFormatoExcelSchema.safeParse(payload(columnaTexto, tiposEnumerados)).success;
  assert.equal(conTipos(Array.from({ length: 20 }, (_, i) => ({ nombre: `T${i}`, valores: ["a"] }))), true);
  assert.equal(conTipos(Array.from({ length: 21 }, (_, i) => ({ nombre: `T${i}`, valores: ["a"] }))), false);
  assert.equal(conTipos([{ nombre: "T", valores: Array.from({ length: 1000 }, (_, i) => `v${i}`) }]), true);
  assert.equal(conTipos([{ nombre: "T", valores: Array.from({ length: 1001 }, (_, i) => `v${i}`) }]), false);
  assert.equal(conTipos([{ nombre: "T", valores: ["x".repeat(100)] }]), true);
  assert.equal(conTipos([{ nombre: "T", valores: ["x".repeat(101)] }]), false);
  assert.equal(conTipos([{ nombre: "x".repeat(60), valores: ["a"] }]), true);
  assert.equal(conTipos([{ nombre: "x".repeat(61), valores: ["a"] }]), false);
  assert.equal(conTipos([{ nombre: "   ", valores: ["a"] }]), false);
  assert.equal(conTipos([{ nombre: "T", valores: [] }]), false);
  assert.equal(conTipos([{ nombre: "T", valores: ["  "] }]), false);
  assert.equal(conTipos([{ nombre: "T", valores: ["a\nb"] }]), false);
  assert.equal(conTipos([{ nombre: "T", valores: ["a\tb"] }]), false);
}

// ---------------------------------------------------------------------------------------------
// 4. Revalidación en `application/`.
// ---------------------------------------------------------------------------------------------
function probarResolver(): void {
  const resuelto = resolverTiposEnumerados(
    [
      { nombre: "Sexo", requerida: true, tipoDato: "ENUMERADO", tipoEnumeradoNombre: "SEXO" },
      { nombre: "Edad", requerida: false, tipoDato: "ENTERO", tipoEnumeradoNombre: null },
    ],
    [{ nombre: "Sexo", valores: ["M", "F"] }],
  );
  assert.equal(resuelto.ok, true);
  if (!resuelto.ok) return;
  // Se guarda el nombre tal como está en el tipo, no como lo escribió el cliente.
  assert.equal(resuelto.columnas[0].tipoEnumeradoNombre, "Sexo");
  assert.deepEqual(
    resuelto.columnas.map((c) => c.orden),
    [1, 2],
  );
  assert.deepEqual(resuelto.tiposEnumerados, [{ orden: 1, nombre: "Sexo", valores: ["M", "F"] }]);

  assert.deepEqual(
    resolverTiposEnumerados([{ nombre: "X", requerida: false, tipoDato: "ENUMERADO", tipoEnumeradoNombre: "Nada" }], []),
    { ok: false, motivo: "REFERENCIA_TIPO_ENUMERADO_INVALIDA", nombreColumna: "X" },
  );
  assert.deepEqual(
    resolverTiposEnumerados([{ nombre: "X", requerida: false, tipoDato: "TEXTO", tipoEnumeradoNombre: "Sexo" }], [
      { nombre: "Sexo", valores: ["M"] },
    ]),
    { ok: false, motivo: "REFERENCIA_TIPO_ENUMERADO_INVALIDA", nombreColumna: "X" },
  );
  assert.deepEqual(
    resolverTiposEnumerados([], [
      { nombre: "Sexo", valores: ["M"] },
      { nombre: "sexo", valores: ["F"] },
    ]),
    { ok: false, motivo: "TIPO_ENUMERADO_DUPLICADO", nombreTipo: "sexo" },
  );
}

// ---------------------------------------------------------------------------------------------
// 5. Mensaje al notificador: lista los valores con 10 o menos; nunca el valor recibido.
// ---------------------------------------------------------------------------------------------
function probarMensaje(): void {
  assert.equal(
    mensajeValorNoPermitidoEnumerado("Sexo", TIPO_SEXO),
    'El valor de "Sexo" no está entre los valores permitidos de «Sexo»: Masculino, Femenino, Intersex',
  );

  const diez = { nombre: "Diez", valores: Array.from({ length: MAXIMO_VALORES_EN_MENSAJE }, (_, i) => `v${i}`) };
  assert.ok(mensajeValorNoPermitidoEnumerado("C", diez).endsWith(": v0, v1, v2, v3, v4, v5, v6, v7, v8, v9"));

  const once = { nombre: "Once", valores: Array.from({ length: MAXIMO_VALORES_EN_MENSAJE + 1 }, (_, i) => `v${i}`) };
  assert.equal(mensajeValorNoPermitidoEnumerado("C", once), 'El valor de "C" no está entre los valores permitidos de «Once»');
}

// ---------------------------------------------------------------------------------------------
// 6. Caso de uso de carga: TIPO_DATO_INVALIDO con el mensaje nuevo; vacías siguen su camino.
// ---------------------------------------------------------------------------------------------
function formatoConEnumerado(): FormatoExcel {
  return {
    id: FORMATO_ID,
    nombre: "Formato enumerado",
    descripcion: null,
    nombreArchivoPlantilla: "plantilla.xlsx",
    tipoContenidoPlantilla: TIPO_XLSX,
    tipoArchivo: "EXCEL",
    separadorCsv: null,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    columnas: [
      { ...columna("Sexo", "ENUMERADO", "Sexo", true), orden: 1 },
      { ...columna("Respuesta", "ENUMERADO", "Respuesta", false), orden: 2 },
    ],
    reglasValidacion: [],
    tiposEnumerados: [TIPO_SEXO, TIPO_RESPUESTA],
  };
}

async function ejecutarCarga(formato: FormatoExcel, filas: Record<string, ValorCeldaArchivo>[]): Promise<DatosNuevaCargaArchivo> {
  let persistido: DatosNuevaCargaArchivo | null = null;
  const ventana = {
    id: "ventana-1",
    anio: new Date().getFullYear(),
    fechaApertura: new Date(2000, 0, 1),
    fechaVencimiento: new Date(2100, 0, 1),
    formatoExcelId: FORMATO_ID,
    publicada: true,
    archivada: false,
    eliminadaEn: null,
  } as unknown as VentanaCarga;

  const resultado = await validarYCargarArchivo(
    {
      formatoExcelId: FORMATO_ID,
      anio: ventana.anio,
      usuarioId: "usuario-1",
      nombreArchivoOriginal: "archivo.xlsx",
      tipoContenidoArchivo: TIPO_XLSX,
      tipoArchivoDetectado: "EXCEL",
      contenidoArchivo: Buffer.alloc(0),
    },
    {
      repositorio: {
        obtenerReaperturaPendientePorUsuarioYVentana: async () => null,
        obtenerPendienteFinalizadaPorUsuarioYVentana: async () => null,
        obtenerAprobadaVigentePorUsuarioYVentana: async () => null,
        crear: async (datos: DatosNuevaCargaArchivo) => {
          persistido = datos;
          return { id: "carga-1" } as unknown as CargaArchivo;
        },
      } as unknown as CargaArchivoRepository,
      repositorioFormatosExcel: {
        estaAsignadoYActivo: async () => true,
        obtenerPorId: async () => formato,
      } as unknown as FormatoExcelRepository,
      repositorioVentanasCarga: { obtenerPorAnioYFormato: async () => ventana } as unknown as VentanaCargaRepository,
      repositorioSolicitudesReemplazo: {
        obtenerAprobadaUtilizablePorCarga: async () => null,
      } as unknown as SolicitudReemplazoCargaRepository,
      lector: { leer: async () => ({ encabezados: ["Sexo", "Respuesta"], filas }) },
    },
  );

  assert.equal(resultado.ok, true);
  assert.ok(persistido, "el caso de uso debería haber persistido la carga");
  return persistido;
}

async function probarCasoDeUso(): Promise<void> {
  const carga = await ejecutarCarga(formatoConEnumerado(), [
    { Sexo: "masculino", Respuesta: 1 },
    { Sexo: "Hombre", Respuesta: "NO" },
    { Sexo: null, Respuesta: null },
    { Sexo: "Femenino", Respuesta: "Talvez" },
  ]);

  assert.deepEqual(
    carga.errores.map((error) => [error.numeroFila, error.columna, error.tipoError]),
    [
      [3, "Sexo", "TIPO_DATO_INVALIDO"],
      [4, "Sexo", "VALOR_REQUERIDO_VACIO"],
      [5, "Respuesta", "TIPO_DATO_INVALIDO"],
    ],
  );
  assert.equal(
    carga.errores[0].mensaje,
    'El valor de "Sexo" no está entre los valores permitidos de «Sexo»: Masculino, Femenino, Intersex',
  );
  // Nunca el valor recibido de la celda.
  assert.ok(carga.errores.every((error) => !error.mensaje.includes("Hombre") && !error.mensaje.includes("Talvez")));

  // Dato corrupto (columna ENUMERADO sin su tipo): lanza con el id del formato, para el 500 genérico.
  const corrupto = { ...formatoConEnumerado(), tiposEnumerados: [TIPO_RESPUESTA] };
  await assert.rejects(() => ejecutarCarga(corrupto, [{ Sexo: "x", Respuesta: "No" }]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes(FORMATO_ID));
    assert.ok(!error.message.includes('"x"'));
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// 7. Edición: `tiposEnumeradosCambiados` alimenta la auditoría (solo el nombre del campo).
// ---------------------------------------------------------------------------------------------
async function probarActualizar(): Promise<void> {
  const actual = formatoConEnumerado();
  let guardado: DatosEdicionFormatoExcel | null = null;
  const repositorio = {
    obtenerPorId: async () => actual,
    buscarPorNombre: async () => null,
    actualizar: async (_id: string, datos: DatosEdicionFormatoExcel) => {
      guardado = datos;
      return actual;
    },
  } as unknown as FormatoExcelRepository;

  const base = {
    nombre: actual.nombre,
    descripcion: null,
    columnas: actual.columnas.map(({ nombre, requerida, tipoDato, tipoEnumeradoNombre }) => ({
      nombre,
      requerida,
      tipoDato,
      tipoEnumeradoNombre,
    })),
    reglasValidacion: [],
  };

  const sinCambios = await actualizarFormatoExcel(
    FORMATO_ID,
    { ...base, tiposEnumerados: actual.tiposEnumerados.map(({ nombre, valores }) => ({ nombre, valores })) },
    { repositorio },
  );
  assert.equal(sinCambios.ok && sinCambios.tiposEnumeradosCambiados, false);

  const conCambios = await actualizarFormatoExcel(
    FORMATO_ID,
    {
      ...base,
      tiposEnumerados: [
        { nombre: "Sexo", valores: ["Masculino", "Femenino"] },
        { nombre: "Respuesta", valores: ["Sí", "No", "1"] },
      ],
    },
    { repositorio },
  );
  assert.equal(conCambios.ok && conCambios.tiposEnumeradosCambiados, true);
  assert.ok(guardado);

  const referenciaRota = await actualizarFormatoExcel(
    FORMATO_ID,
    { ...base, tiposEnumerados: [] },
    { repositorio },
  );
  assert.deepEqual(referenciaRota, { ok: false, motivo: "REFERENCIA_TIPO_ENUMERADO_INVALIDA", nombreColumna: "Sexo" });
}

async function main(): Promise<void> {
  probarNormalizacion();
  probarValidador();
  probarEsquema();
  probarResolver();
  probarMensaje();
  await probarCasoDeUso();
  await probarActualizar();
  console.log("OK: tipos enumerados (normalización, validador, esquema, application/, mensaje, carga y edición)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
