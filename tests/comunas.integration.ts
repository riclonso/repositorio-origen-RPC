// Integración de RF-28 (mantenedor de comunas). Ejecutar SOLO contra una base PostgreSQL local y
// DESECHABLE con las migraciones aplicadas (`agregar_region` siembra las 16 regiones,
// `agregar_provincia` las 3 provincias del Biobío y `agregar_comuna` las 12 comunas de la
// provincia de Concepción). Nunca contra la base de desarrollo compartida ni producción:
//
//   COMUNAS_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/comunas.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaComunaRepository as repositorio } from "../src/modules/comunas/infrastructure/repositories/PrismaComunaRepository";
import { prismaProvinciaRepository as repositorioProvincias } from "../src/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { crearComuna } from "../src/modules/comunas/application/use-cases/CrearComuna";
import { actualizarComuna } from "../src/modules/comunas/application/use-cases/ActualizarComuna";
import { eliminarComuna } from "../src/modules/comunas/application/use-cases/EliminarComuna";
import { listarComunas } from "../src/modules/comunas/application/use-cases/ListarComunas";
import { ComunaDuplicadaError } from "../src/modules/comunas/domain/errors/ComunaDuplicadaError";
import { ProvinciaInvalidaError } from "../src/modules/comunas/domain/errors/ProvinciaInvalidaError";
import {
  comunaSchema,
  derivarNombreNormalizado,
  filtroComunasSchema,
} from "../src/modules/comunas/schemas/comuna.schema";
import { crearProvincia } from "../src/modules/provincias/application/use-cases/CrearProvincia";
import { prismaRegionRepository as repositorioRegiones } from "../src/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { normalizarNombre } from "../src/shared/utils/texto";

const dependencias = { repositorio, repositorioProvincias };
const comunasCreadas: string[] = [];
const provinciasCreadas: string[] = [];

const SIEMBRA_ESPERADA: ReadonlyArray<[string, string]> = [
  ["08101", "Concepción"],
  ["08102", "Coronel"],
  ["08103", "Chiguayante"],
  ["08104", "Florida"],
  ["08105", "Hualqui"],
  ["08106", "Lota"],
  ["08107", "Penco"],
  ["08108", "San Pedro de la Paz"],
  ["08109", "Santa Juana"],
  ["08110", "Talcahuano"],
  ["08111", "Tomé"],
  ["08112", "Hualpén"],
];

async function obtenerProvinciaPorCodigo(codigo: string) {
  const provincia = await prisma.provincia.findUnique({ where: { codigo } });
  assert.ok(provincia, `La provincia ${codigo} está sembrada`);
  return provincia;
}

async function obtenerRegionPorCodigo(codigo: string) {
  const region = await prisma.region.findUnique({ where: { codigo } });
  assert.ok(region, `La región ${codigo} está sembrada`);
  return region;
}

// Extrae el INSERT de siembra de la migración para re-ejecutarlo y comprobar que es idempotente.
function leerSentenciaSiembra(): string {
  const carpeta = join(process.cwd(), "prisma", "migrations");
  const migracion = readdirSync(carpeta).find((nombre) => nombre.endsWith("_agregar_comuna"));
  assert.ok(migracion, "Existe la migración agregar_comuna");

  const sql = readFileSync(join(carpeta, migracion, "migration.sql"), "utf8");
  const inicio = sql.indexOf('INSERT INTO "comuna"');
  const fin = sql.indexOf("ON CONFLICT DO NOTHING;", inicio);
  assert.ok(inicio >= 0 && fin > inicio, "La migración contiene la siembra");

  return sql.slice(inicio, fin + "ON CONFLICT DO NOTHING".length);
}

async function probarSiembra(): Promise<void> {
  const concepcion = await obtenerProvinciaPorCodigo("081");
  const filas = await prisma.comuna.findMany({ orderBy: { codigo: "asc" } });

  assert.equal(filas.length, 12, "La migración siembra 12 comunas");

  filas.forEach((fila, indice) => {
    const [codigo, nombre] = SIEMBRA_ESPERADA[indice];
    assert.equal(fila.codigo, codigo);
    assert.equal(fila.nombre, nombre);
    assert.equal(fila.provinciaId, concepcion.id, `${nombre} pertenece a la provincia 081`);
    // El normalizado literal del SQL debe coincidir EXACTO con la función de la aplicación.
    assert.equal(fila.nombreNormalizado, normalizarNombre(fila.nombre), `Normalizado de ${nombre}`);
  });

  // Re-ejecutar la siembra no duplica (ON CONFLICT DO NOTHING).
  await prisma.$executeRawUnsafe(leerSentenciaSiembra());
  assert.equal(await prisma.comuna.count(), 12, "Re-ejecutar la siembra no duplica");

  const listado = await listarComunas({ provinciaId: concepcion.id }, { repositorio });
  assert.deepEqual(
    listado.map((comuna) => comuna.codigo),
    SIEMBRA_ESPERADA.map(([codigo]) => codigo),
    "Filtrado por provincia y ordenado por código",
  );
  assert.equal(listado[0].provincia.codigo, "081");
  assert.equal(listado[0].provincia.region.codigo, "08");
  assert.ok(!("nombreNormalizado" in listado[0]), "La entidad no expone nombreNormalizado");
}

function probarEsquema(): void {
  const valido = { nombre: "Comuna X", codigo: "08101", provinciaId: randomUUID() };
  assert.ok(comunaSchema.safeParse(valido).success);
  assert.ok(comunaSchema.safeParse({ ...valido, codigo: " 08101 " }).success, "trim del código");

  for (const codigo of ["8101", "081011", "0810a", ""]) {
    const analisis = comunaSchema.safeParse({ ...valido, codigo });
    assert.ok(!analisis.success, `codigo "${codigo}"`);
    assert.equal(analisis.error.issues[0]?.message, "Ingresa 5 dígitos, p. ej. 08101");
  }

  const sinProvincia = comunaSchema.safeParse({ ...valido, provinciaId: "" });
  assert.ok(!sinProvincia.success);
  assert.equal(sinProvincia.error.issues[0]?.message, "Selecciona una provincia");

  assert.ok(!comunaSchema.safeParse({ ...valido, nombre: "   " }).success, "nombre vacío");
  assert.ok(!comunaSchema.safeParse({ ...valido, nombre: "a".repeat(121) }).success, "nombre largo");

  assert.ok(filtroComunasSchema.safeParse({}).success, "sin filtros");
  assert.ok(!filtroComunasSchema.safeParse({ regionId: "no-uuid" }).success, "región malformada");
  assert.ok(!filtroComunasSchema.safeParse({ provinciaId: "x" }).success, "provincia malformada");
}

async function probarCheckCodigo(): Promise<void> {
  const concepcion = await obtenerProvinciaPorCodigo("081");
  await assert.rejects(
    prisma.comuna.create({
      data: {
        nombre: `Fuera de formato ${randomUUID()}`,
        nombreNormalizado: `fuera de formato ${randomUUID()}`,
        codigo: "081a1",
        provinciaId: concepcion.id,
      },
    }),
    "El CHECK de la base rechaza un código no numérico",
  );
}

async function probarCrudYReglas(): Promise<void> {
  const concepcion = await obtenerProvinciaPorCodigo("081");
  const arauco = await obtenerProvinciaPorCodigo("082");

  const creada = await crearComuna(
    { nombre: "Comuna Prueba Ñandú", codigo: "08199", provinciaId: concepcion.id },
    dependencias,
  );
  assert.ok(creada.ok, "Crea la comuna de prueba");
  comunasCreadas.push(creada.comuna.id);
  assert.equal(creada.comuna.provincia.id, concepcion.id);
  assert.equal(creada.comuna.provincia.region.codigo, "08");

  // Provincia inexistente.
  const provinciaInexistente = await crearComuna(
    { nombre: "Sin provincia", codigo: "99901", provinciaId: randomUUID() },
    dependencias,
  );
  assert.deepEqual(provinciaInexistente, { ok: false, motivo: "PROVINCIA_INVALIDA" });

  // Prefijo que no coincide con la provincia.
  const prefijoMalo = await crearComuna(
    { nombre: "Prefijo malo", codigo: "08201", provinciaId: concepcion.id },
    dependencias,
  );
  assert.deepEqual(prefijoMalo, {
    ok: false,
    motivo: "CODIGO_NO_COINCIDE_PROVINCIA",
    codigoProvincia: "081",
  });

  // Código duplicado (global).
  const porCodigo = await crearComuna(
    { nombre: "Otra comuna", codigo: "08101", provinciaId: concepcion.id },
    dependencias,
  );
  assert.deepEqual(porCodigo, { ok: false, motivo: "DUPLICADO", campo: "codigo" });

  // Nombre duplicado en la misma provincia (tildes/mayúsculas/espacios distintos).
  const porNombre = await crearComuna(
    { nombre: "  TALCAHUANO ", codigo: "08198", provinciaId: concepcion.id },
    dependencias,
  );
  assert.deepEqual(porNombre, { ok: false, motivo: "DUPLICADO", campo: "nombre" });

  // Mismo nombre en otra provincia: permitido.
  const mismoNombreOtraProvincia = await crearComuna(
    { nombre: "Talcahuano", codigo: "08299", provinciaId: arauco.id },
    dependencias,
  );
  assert.ok(mismoNombreOtraProvincia.ok, "El nombre es único POR provincia");
  comunasCreadas.push(mismoNombreOtraProvincia.comuna.id);

  // Editar conservando sus propios valores: sin falso duplicado ni provinciaAnteriorId.
  const mismaComuna = await actualizarComuna(
    creada.comuna.id,
    { nombre: "COMUNA PRUEBA ÑANDÚ", codigo: "08199", provinciaId: concepcion.id },
    dependencias,
  );
  assert.ok(mismaComuna.ok, "Editar conservando valores propios no choca consigo misma");
  assert.equal(mismaComuna.provinciaAnteriorId, undefined);

  // Mover a otra provincia sin ajustar el código: rechazado por prefijo.
  const moverSinAjustar = await actualizarComuna(
    creada.comuna.id,
    { nombre: "Comuna Prueba Ñandú", codigo: "08199", provinciaId: arauco.id },
    dependencias,
  );
  assert.deepEqual(moverSinAjustar, {
    ok: false,
    motivo: "CODIGO_NO_COINCIDE_PROVINCIA",
    codigoProvincia: "082",
  });

  // Mover a otra provincia con el código ajustado: permitido e informa la provincia anterior.
  const movida = await actualizarComuna(
    creada.comuna.id,
    { nombre: "Comuna Prueba Ñandú", codigo: "08298", provinciaId: arauco.id },
    dependencias,
  );
  assert.ok(movida.ok, "Mover a otra provincia con código coherente");
  assert.equal(movida.comuna.provincia.id, arauco.id);
  assert.equal(movida.comuna.codigo, "08298");
  assert.equal(movida.provinciaAnteriorId, concepcion.id);

  // Editar hacia el nombre de otra comuna de la misma provincia.
  const haciaNombreAjeno = await actualizarComuna(
    creada.comuna.id,
    { nombre: "talcahuano", codigo: "08298", provinciaId: arauco.id },
    dependencias,
  );
  assert.deepEqual(haciaNombreAjeno, { ok: false, motivo: "DUPLICADO", campo: "nombre" });

  const inexistente = await actualizarComuna(
    randomUUID(),
    { nombre: "Nada", codigo: "08197", provinciaId: concepcion.id },
    dependencias,
  );
  assert.deepEqual(inexistente, { ok: false, motivo: "NO_ENCONTRADO" });

  // Carrera simulada: se salta el chequeo previo y se escribe directo. La constraint UNIQUE
  // (P2002) debe llegar traducida a error de dominio, con el campo identificado por constraint.
  for (const [campo, datos] of [
    ["codigo", { nombre: "Carrera código", codigo: "08101", provinciaId: concepcion.id }],
    ["nombre", { nombre: "Lota", codigo: "08197", provinciaId: concepcion.id }],
  ] as const) {
    await assert.rejects(
      repositorio.crear({ ...datos, nombreNormalizado: derivarNombreNormalizado(datos.nombre) }),
      (error: unknown) => error instanceof ComunaDuplicadaError && error.campo === campo,
      `P2002 por ${campo} se traduce a ComunaDuplicadaError(${campo})`,
    );
  }

  // Carrera simulada con la provincia eliminada: P2003 → ProvinciaInvalidaError.
  await assert.rejects(
    repositorio.crear({
      nombre: "Provincia fantasma",
      nombreNormalizado: "provincia fantasma",
      codigo: "98701",
      provinciaId: randomUUID(),
    }),
    (error: unknown) => error instanceof ProvinciaInvalidaError,
    "P2003 al crear se traduce a ProvinciaInvalidaError",
  );

  // Eliminar devuelve la provincia que tenía; re-eliminar es NO_ENCONTRADO.
  assert.deepEqual(await eliminarComuna(creada.comuna.id, { repositorio }), {
    ok: true,
    provinciaId: arauco.id,
  });
  assert.deepEqual(await eliminarComuna(creada.comuna.id, { repositorio }), {
    ok: false,
    motivo: "NO_ENCONTRADO",
  });
  assert.equal(await repositorio.eliminar(creada.comuna.id), null);
  assert.equal(await repositorio.obtenerPorId(creada.comuna.id), null);

  // Actualizar una comuna borrada entre la lectura y la escritura (P2025) devuelve null.
  assert.equal(
    await repositorio.actualizar(creada.comuna.id, {
      nombre: "Borrada",
      nombreNormalizado: "borrada",
      codigo: "08196",
      provinciaId: concepcion.id,
    }),
    null,
  );
}

async function probarFiltros(): Promise<void> {
  const biobio = await obtenerRegionPorCodigo("08");
  const metropolitana = await obtenerRegionPorCodigo("13");
  const concepcion = await obtenerProvinciaPorCodigo("081");
  const arauco = await obtenerProvinciaPorCodigo("082");

  // Provincia y comuna en otra región para comprobar que el filtro por región excluye.
  const provinciaOtraRegion = await crearProvincia(
    { nombre: "Provincia Filtro Prueba", codigo: "139", regionId: metropolitana.id },
    { repositorio: repositorioProvincias, repositorioRegiones },
  );
  assert.ok(provinciaOtraRegion.ok);
  provinciasCreadas.push(provinciaOtraRegion.provincia.id);

  const comunaOtraRegion = await crearComuna(
    { nombre: "Comuna Filtro Prueba", codigo: "13901", provinciaId: provinciaOtraRegion.provincia.id },
    dependencias,
  );
  assert.ok(comunaOtraRegion.ok);
  comunasCreadas.push(comunaOtraRegion.comuna.id);

  const todas = await listarComunas({}, { repositorio });
  assert.ok(todas.some((comuna) => comuna.id === comunaOtraRegion.comuna.id), "Sin filtro lista todas");
  // Orden: por número de región (08 antes que 13), luego por código.
  const indiceBiobio = todas.findIndex((comuna) => comuna.codigo === "08101");
  const indiceOtra = todas.findIndex((comuna) => comuna.id === comunaOtraRegion.comuna.id);
  assert.ok(indiceBiobio < indiceOtra, "Ordenado por número de región");

  const porRegion = await listarComunas({ regionId: biobio.id }, { repositorio });
  assert.ok(porRegion.every((comuna) => comuna.provincia.region.id === biobio.id), "Filtro por región");
  assert.ok(!porRegion.some((comuna) => comuna.id === comunaOtraRegion.comuna.id));

  const porRegionMetropolitana = await listarComunas({ regionId: metropolitana.id }, { repositorio });
  assert.deepEqual(
    porRegionMetropolitana.map((comuna) => comuna.id),
    [comunaOtraRegion.comuna.id],
  );

  const porProvincia = await listarComunas({ provinciaId: arauco.id }, { repositorio });
  assert.ok(porProvincia.every((comuna) => comuna.provincia.id === arauco.id), "Filtro por provincia");

  // Combinados (AND): coherentes → las de la provincia; incoherentes → vacío.
  const combinados = await listarComunas(
    { regionId: biobio.id, provinciaId: concepcion.id },
    { repositorio },
  );
  assert.equal(combinados.length, 12);

  const incoherentes = await listarComunas(
    { regionId: metropolitana.id, provinciaId: concepcion.id },
    { repositorio },
  );
  assert.deepEqual(incoherentes, [], "Región y provincia se combinan con AND");
}

async function limpiar(): Promise<void> {
  await prisma.comuna.deleteMany({ where: { id: { in: comunasCreadas } } });
  await prisma.provincia.deleteMany({ where: { id: { in: provinciasCreadas } } });
}

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(process.env.COMUNAS_TEST_DATABASE, "true", "Requiere autorización de BD desechable");

  try {
    await probarSiembra();
    probarEsquema();
    await probarCheckCodigo();
    await probarCrudYReglas();
    await probarFiltros();
    console.log("comunas.integration: OK");
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
