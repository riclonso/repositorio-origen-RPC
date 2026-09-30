// Integración de RF-27 (mantenedor de provincias). Ejecutar SOLO contra una base PostgreSQL local y
// DESECHABLE con las migraciones aplicadas (`agregar_region` siembra las 16 regiones y
// `agregar_provincia` las 3 provincias del Biobío; desde RF-28, `agregar_comuna` siembra 12 comunas
// en la provincia 081). Nunca contra la base de desarrollo compartida ni producción:
//
//   PROVINCIAS_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/provincias.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaProvinciaRepository as repositorio } from "../src/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { prismaRegionRepository as repositorioRegiones } from "../src/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { crearProvincia } from "../src/modules/provincias/application/use-cases/CrearProvincia";
import { actualizarProvincia } from "../src/modules/provincias/application/use-cases/ActualizarProvincia";
import { eliminarProvincia } from "../src/modules/provincias/application/use-cases/EliminarProvincia";
import { listarProvincias } from "../src/modules/provincias/application/use-cases/ListarProvincias";
import { ProvinciaDuplicadaError } from "../src/modules/provincias/domain/errors/ProvinciaDuplicadaError";
import { RegionInvalidaError } from "../src/modules/provincias/domain/errors/RegionInvalidaError";
import {
  derivarNombreNormalizado,
  provinciaSchema,
} from "../src/modules/provincias/schemas/provincia.schema";
import { crearRegion } from "../src/modules/regiones/application/use-cases/CrearRegion";
import { actualizarRegion } from "../src/modules/regiones/application/use-cases/ActualizarRegion";
import { eliminarRegion } from "../src/modules/regiones/application/use-cases/EliminarRegion";
import { normalizarNombre } from "../src/shared/utils/texto";

const dependencias = { repositorio, repositorioRegiones };
const provinciasCreadas: string[] = [];
const regionesCreadas: string[] = [];

const SIEMBRA_ESPERADA: ReadonlyArray<[string, string]> = [
  ["081", "Concepción"],
  ["082", "Arauco"],
  ["083", "Biobío"],
];

async function obtenerRegionPorCodigo(codigo: string) {
  const region = await prisma.region.findUnique({ where: { codigo } });
  assert.ok(region, `La región ${codigo} está sembrada`);
  return region;
}

async function probarSiembra(): Promise<void> {
  const biobio = await obtenerRegionPorCodigo("08");
  const filas = await prisma.provincia.findMany({ orderBy: { codigo: "asc" } });

  assert.equal(filas.length, 3, "La migración siembra 3 provincias");

  filas.forEach((fila, indice) => {
    const [codigo, nombre] = SIEMBRA_ESPERADA[indice];
    assert.equal(fila.codigo, codigo);
    assert.equal(fila.nombre, nombre);
    assert.equal(fila.regionId, biobio.id, `${nombre} pertenece a la región 08`);
    // El normalizado literal del SQL debe coincidir EXACTO con la función de la aplicación.
    assert.equal(fila.nombreNormalizado, normalizarNombre(fila.nombre), `Normalizado de ${nombre}`);
  });

  const listado = await listarProvincias({ regionId: biobio.id }, { repositorio });
  assert.deepEqual(
    listado.map((provincia) => provincia.codigo),
    ["081", "082", "083"],
    "Filtrado por región y ordenado por código",
  );
  assert.equal(listado[0].region.codigo, "08");
  assert.equal(listado[0].region.nombre, "Biobío");
  assert.ok(!("nombreNormalizado" in listado[0]), "La entidad no expone nombreNormalizado");

  const otraRegion = await obtenerRegionPorCodigo("13");
  assert.deepEqual(await listarProvincias({ regionId: otraRegion.id }, { repositorio }), []);
}

function probarEsquema(): void {
  const valido = { nombre: "Provincia X", codigo: "081", regionId: randomUUID() };
  assert.ok(provinciaSchema.safeParse(valido).success);
  assert.ok(provinciaSchema.safeParse({ ...valido, codigo: " 081 " }).success, "trim del código");

  for (const codigo of ["81", "0811", "ab1", ""]) {
    const analisis = provinciaSchema.safeParse({ ...valido, codigo });
    assert.ok(!analisis.success, `codigo "${codigo}"`);
    assert.equal(analisis.error.issues[0]?.message, "Ingresa 3 dígitos, p. ej. 081");
  }

  const sinRegion = provinciaSchema.safeParse({ ...valido, regionId: "" });
  assert.ok(!sinRegion.success);
  assert.equal(sinRegion.error.issues[0]?.message, "Selecciona una región");

  assert.ok(!provinciaSchema.safeParse({ ...valido, nombre: "   " }).success, "nombre vacío");
}

async function probarCheckCodigo(): Promise<void> {
  const biobio = await obtenerRegionPorCodigo("08");
  await assert.rejects(
    prisma.provincia.create({
      data: {
        nombre: `Fuera de formato ${randomUUID()}`,
        nombreNormalizado: `fuera de formato ${randomUUID()}`,
        codigo: "0a1",
        regionId: biobio.id,
      },
    }),
    "El CHECK de la base rechaza un código no numérico",
  );
}

async function probarCrudYReglas(): Promise<void> {
  const biobio = await obtenerRegionPorCodigo("08");
  const nuble = await obtenerRegionPorCodigo("16");

  const creada = await crearProvincia(
    { nombre: "Provincia Prueba Ñandú", codigo: "089", regionId: biobio.id },
    dependencias,
  );
  assert.ok(creada.ok, "Crea la provincia de prueba");
  provinciasCreadas.push(creada.provincia.id);
  assert.equal(creada.provincia.region.id, biobio.id);

  // Código duplicado (global).
  const porCodigo = await crearProvincia(
    { nombre: "Otra provincia", codigo: "081", regionId: biobio.id },
    dependencias,
  );
  assert.deepEqual(porCodigo, { ok: false, motivo: "DUPLICADO", campo: "codigo" });

  // Nombre duplicado en la misma región (tildes/mayúsculas/espacios distintos).
  const porNombre = await crearProvincia(
    { nombre: "  CONCEPCION ", codigo: "088", regionId: biobio.id },
    dependencias,
  );
  assert.deepEqual(porNombre, { ok: false, motivo: "DUPLICADO", campo: "nombre" });

  // Mismo nombre en otra región: permitido.
  const mismoNombreOtraRegion = await crearProvincia(
    { nombre: "Concepción", codigo: "169", regionId: nuble.id },
    dependencias,
  );
  assert.ok(mismoNombreOtraRegion.ok, "El nombre es único POR región");
  provinciasCreadas.push(mismoNombreOtraRegion.provincia.id);

  // Prefijo que no coincide con la región.
  const prefijoMalo = await crearProvincia(
    { nombre: "Prefijo malo", codigo: "131", regionId: biobio.id },
    dependencias,
  );
  assert.deepEqual(prefijoMalo, {
    ok: false,
    motivo: "CODIGO_NO_COINCIDE_REGION",
    codigoRegion: "08",
  });

  // Región inexistente.
  const regionInexistente = await crearProvincia(
    { nombre: "Sin región", codigo: "991", regionId: randomUUID() },
    dependencias,
  );
  assert.deepEqual(regionInexistente, { ok: false, motivo: "REGION_INVALIDA" });

  // Editar conservando sus propios valores: sin falso duplicado.
  const mismaProvincia = await actualizarProvincia(
    creada.provincia.id,
    { nombre: "PROVINCIA PRUEBA ÑANDÚ", codigo: "089", regionId: biobio.id },
    dependencias,
  );
  assert.ok(mismaProvincia.ok, "Editar conservando valores propios no choca consigo misma");
  assert.equal(mismaProvincia.regionAnteriorId, undefined, "Sin mover, no hay región anterior");

  // Mover a otra región sin ajustar el código: rechazado por prefijo.
  const moverSinAjustar = await actualizarProvincia(
    creada.provincia.id,
    { nombre: "Provincia Prueba Ñandú", codigo: "089", regionId: nuble.id },
    dependencias,
  );
  assert.deepEqual(moverSinAjustar, {
    ok: false,
    motivo: "CODIGO_NO_COINCIDE_REGION",
    codigoRegion: "16",
  });

  // Mover a otra región con el código ajustado: permitido.
  const movida = await actualizarProvincia(
    creada.provincia.id,
    { nombre: "Provincia Prueba Ñandú", codigo: "168", regionId: nuble.id },
    dependencias,
  );
  assert.ok(movida.ok, "Mover a otra región con código coherente");
  assert.equal(movida.provincia.region.id, nuble.id);
  assert.equal(movida.provincia.codigo, "168");
  assert.equal(movida.regionAnteriorId, biobio.id, "Mover informa la región anterior");

  // Editar hacia el nombre de otra provincia de la misma región.
  const haciaNombreAjeno = await actualizarProvincia(
    creada.provincia.id,
    { nombre: "concepción", codigo: "168", regionId: nuble.id },
    dependencias,
  );
  assert.deepEqual(haciaNombreAjeno, { ok: false, motivo: "DUPLICADO", campo: "nombre" });

  const inexistente = await actualizarProvincia(
    randomUUID(),
    { nombre: "Nada", codigo: "087", regionId: biobio.id },
    dependencias,
  );
  assert.deepEqual(inexistente, { ok: false, motivo: "NO_ENCONTRADO" });

  // Carrera simulada: se salta el chequeo previo y se escribe directo. La constraint UNIQUE
  // (P2002) debe llegar traducida a error de dominio, con el campo identificado.
  for (const [campo, datos] of [
    ["codigo", { nombre: "Carrera código", codigo: "081", regionId: biobio.id }],
    ["nombre", { nombre: "Arauco", codigo: "087", regionId: biobio.id }],
  ] as const) {
    await assert.rejects(
      repositorio.crear({ ...datos, nombreNormalizado: derivarNombreNormalizado(datos.nombre) }),
      (error: unknown) => error instanceof ProvinciaDuplicadaError && error.campo === campo,
      `P2002 por ${campo} se traduce a ProvinciaDuplicadaError(${campo})`,
    );
  }

  // Carrera simulada con la región eliminada: P2003 → RegionInvalidaError.
  await assert.rejects(
    repositorio.crear({
      nombre: "Región fantasma",
      nombreNormalizado: "region fantasma",
      codigo: "987",
      regionId: randomUUID(),
    }),
    (error: unknown) => error instanceof RegionInvalidaError,
    "P2003 al crear se traduce a RegionInvalidaError",
  );

  // Eliminar (devuelve la región que tenía, para auditarla) y re-eliminar.
  assert.deepEqual(await eliminarProvincia(creada.provincia.id, { repositorio }), {
    ok: true,
    regionId: nuble.id,
  });
  assert.deepEqual(await eliminarProvincia(creada.provincia.id, { repositorio }), {
    ok: false,
    motivo: "NO_ENCONTRADO",
  });
  assert.equal(await repositorio.eliminar(creada.provincia.id), null);
  assert.equal(await repositorio.obtenerPorId(creada.provincia.id), null);

  // Actualizar una provincia borrada entre la lectura y la escritura (P2025) devuelve null.
  assert.equal(
    await repositorio.actualizar(creada.provincia.id, {
      nombre: "Borrada",
      nombreNormalizado: "borrada",
      codigo: "086",
      regionId: biobio.id,
    }),
    null,
  );
}

async function probarReglasDeRegion(): Promise<void> {
  const biobio = await obtenerRegionPorCodigo("08");

  // Eliminar una región con provincias: la FK Restrict corta el DELETE (P2003) → EN_USO.
  assert.deepEqual(await eliminarRegion(biobio.id, { repositorio: repositorioRegiones }), {
    ok: false,
    motivo: "EN_USO",
  });
  assert.ok(await repositorioRegiones.obtenerPorId(biobio.id), "La región sigue existiendo");

  assert.equal(await repositorioRegiones.tieneProvincias(biobio.id), true);

  // Cambiar el código de una región con provincias: bloqueado.
  const recodificar = await actualizarRegion(
    biobio.id,
    { nombre: biobio.nombre, codigo: "98", numero: biobio.numero },
    { repositorio: repositorioRegiones },
  );
  assert.deepEqual(recodificar, { ok: false, motivo: "CODIGO_CON_PROVINCIAS" });

  // Cambiar solo el nombre (conservando el código): permitido.
  const renombrar = await actualizarRegion(
    biobio.id,
    { nombre: "Biobío Renombrada", codigo: "08", numero: biobio.numero },
    { repositorio: repositorioRegiones },
  );
  assert.ok(renombrar.ok, "Cambiar el nombre de una región con provincias");

  const restaurar = await actualizarRegion(
    biobio.id,
    { nombre: biobio.nombre, codigo: "08", numero: biobio.numero },
    { repositorio: repositorioRegiones },
  );
  assert.ok(restaurar.ok);

  // Cambiar el código de una región SIN provincias: permitido.
  const sinProvincias = await crearRegion(
    { nombre: "Región Sin Provincias", codigo: "92", numero: 92 },
    { repositorio: repositorioRegiones },
  );
  assert.ok(sinProvincias.ok);
  regionesCreadas.push(sinProvincias.region.id);
  assert.equal(await repositorioRegiones.tieneProvincias(sinProvincias.region.id), false);

  const recodificarSinProvincias = await actualizarRegion(
    sinProvincias.region.id,
    { nombre: "Región Sin Provincias", codigo: "91", numero: 92 },
    { repositorio: repositorioRegiones },
  );
  assert.ok(recodificarSinProvincias.ok, "Recodificar una región sin provincias");
  assert.equal(recodificarSinProvincias.region.codigo, "91");
}

// RF-28: reglas que las comunas imponen sobre la provincia 081 (sembrada con 12 comunas).
async function probarReglasDeComunas(): Promise<void> {
  const biobio = await obtenerRegionPorCodigo("08");
  const nuble = await obtenerRegionPorCodigo("16");
  const concepcion = await prisma.provincia.findUnique({ where: { codigo: "081" } });
  assert.ok(concepcion, "La provincia 081 está sembrada");

  assert.equal(await repositorio.tieneComunas(concepcion.id), true);

  // Eliminar una provincia con comunas: la FK Restrict corta el DELETE (P2003) → EN_USO.
  assert.deepEqual(await eliminarProvincia(concepcion.id, { repositorio }), {
    ok: false,
    motivo: "EN_USO",
  });
  assert.ok(await repositorio.obtenerPorId(concepcion.id), "La provincia sigue existiendo");

  // Cambiar el código de una provincia con comunas: bloqueado.
  const recodificar = await actualizarProvincia(
    concepcion.id,
    { nombre: concepcion.nombre, codigo: "089", regionId: biobio.id },
    dependencias,
  );
  assert.deepEqual(recodificar, { ok: false, motivo: "CODIGO_CON_COMUNAS" });

  // Moverla de región exige cambiar el prefijo: también bloqueado (antes que validar la región).
  const moverDeRegion = await actualizarProvincia(
    concepcion.id,
    { nombre: concepcion.nombre, codigo: "161", regionId: nuble.id },
    dependencias,
  );
  assert.deepEqual(moverDeRegion, { ok: false, motivo: "CODIGO_CON_COMUNAS" });

  // Cambiar solo el nombre (conservando el código): permitido.
  const renombrar = await actualizarProvincia(
    concepcion.id,
    { nombre: "Concepción Renombrada", codigo: "081", regionId: biobio.id },
    dependencias,
  );
  assert.ok(renombrar.ok, "Cambiar el nombre de una provincia con comunas");
  assert.equal(renombrar.regionAnteriorId, undefined);

  const restaurar = await actualizarProvincia(
    concepcion.id,
    { nombre: concepcion.nombre, codigo: "081", regionId: biobio.id },
    dependencias,
  );
  assert.ok(restaurar.ok);

  // Una provincia sin comunas no las tiene.
  const arauco = await prisma.provincia.findUnique({ where: { codigo: "082" } });
  assert.ok(arauco);
  assert.equal(await repositorio.tieneComunas(arauco.id), false);
}

async function limpiar(): Promise<void> {
  await prisma.provincia.deleteMany({ where: { id: { in: provinciasCreadas } } });
  await prisma.region.deleteMany({ where: { id: { in: regionesCreadas } } });
}

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(
    process.env.PROVINCIAS_TEST_DATABASE,
    "true",
    "Requiere autorización de BD desechable",
  );

  try {
    await probarSiembra();
    probarEsquema();
    await probarCheckCodigo();
    await probarCrudYReglas();
    await probarReglasDeRegion();
    await probarReglasDeComunas();
    console.log("provincias.integration: OK");
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
