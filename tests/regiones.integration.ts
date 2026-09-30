// Integración de RF-26 (mantenedor de regiones). Ejecutar SOLO contra una base PostgreSQL local y
// DESECHABLE con las migraciones aplicadas (la migración `agregar_region` siembra las 16
// regiones). Nunca contra la base de desarrollo compartida ni producción:
//
//   RF26_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/regiones.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaRegionRepository as repositorio } from "../src/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { crearRegion } from "../src/modules/regiones/application/use-cases/CrearRegion";
import { actualizarRegion } from "../src/modules/regiones/application/use-cases/ActualizarRegion";
import { eliminarRegion } from "../src/modules/regiones/application/use-cases/EliminarRegion";
import { listarRegiones } from "../src/modules/regiones/application/use-cases/ListarRegiones";
import { RegionDuplicadaError } from "../src/modules/regiones/domain/errors/RegionDuplicadaError";
import {
  aNumeroRegion,
  derivarNombreNormalizado,
  regionSchema,
} from "../src/modules/regiones/schemas/region.schema";
import { normalizarNombre } from "../src/shared/utils/texto";

const dependencias = { repositorio };
const regionesCreadas: string[] = [];

const SIEMBRA_ESPERADA: ReadonlyArray<[number, string]> = [
  [1, "Tarapacá"],
  [2, "Antofagasta"],
  [3, "Atacama"],
  [4, "Coquimbo"],
  [5, "Valparaíso"],
  [6, "Libertador General Bernardo O'Higgins"],
  [7, "Maule"],
  [8, "Biobío"],
  [9, "La Araucanía"],
  [10, "Los Lagos"],
  [11, "Aysén del General Carlos Ibáñez del Campo"],
  [12, "Magallanes y de la Antártica Chilena"],
  [13, "Metropolitana de Santiago"],
  [14, "Los Ríos"],
  [15, "Arica y Parinacota"],
  [16, "Ñuble"],
];

async function probarSiembra(): Promise<void> {
  const filas = await prisma.region.findMany({ orderBy: { numero: "asc" } });
  const sembradas = filas.filter((fila) => fila.numero <= 16);

  assert.equal(sembradas.length, 16, "La migración siembra las 16 regiones");

  sembradas.forEach((fila, indice) => {
    const [numero, nombre] = SIEMBRA_ESPERADA[indice];
    assert.equal(fila.numero, numero);
    assert.equal(fila.nombre, nombre);
    assert.equal(fila.codigo, String(numero).padStart(2, "0"));
    // El normalizado literal del SQL debe coincidir EXACTO con la función de la aplicación: si
    // no, un alta de "Biobio" no detectaría el duplicado de la región sembrada.
    assert.equal(fila.nombreNormalizado, normalizarNombre(fila.nombre), `Normalizado de ${nombre}`);
  });

  const listado = await listarRegiones(dependencias);
  assert.deepEqual(
    listado.slice(0, 16).map((region) => region.numero),
    SIEMBRA_ESPERADA.map(([numero]) => numero),
    "El listado sale ordenado por número",
  );
  assert.ok(
    !("nombreNormalizado" in listado[0]),
    "La entidad no expone nombreNormalizado",
  );
}

function probarEsquema(): void {
  const valido = { nombre: "Región X", codigo: "08", numero: 8 };
  assert.ok(regionSchema.safeParse(valido).success);
  assert.ok(regionSchema.safeParse({ ...valido, codigo: " 08 " }).success, "trim del código");

  for (const numero of [0, 100, 1.5, -1, Number.NaN]) {
    assert.ok(!regionSchema.safeParse({ ...valido, numero }).success, `numero ${numero}`);
  }
  assert.ok(!regionSchema.safeParse({ ...valido, numero: "5" }).success, "numero como string");
  assert.ok(!regionSchema.safeParse({ ...valido, numero: true }).success, "numero booleano");

  for (const codigo of ["8", "008", "ab", "", "0a"]) {
    const analisis = regionSchema.safeParse({ ...valido, codigo });
    assert.ok(!analisis.success, `codigo "${codigo}"`);
    assert.equal(analisis.error.issues[0]?.message, "Ingresa 2 dígitos, p. ej. 08");
  }

  assert.ok(!regionSchema.safeParse({ ...valido, nombre: "   " }).success, "nombre vacío");

  assert.equal(aNumeroRegion(" 12 "), 12);
  assert.ok(Number.isNaN(aNumeroRegion("")));
  assert.ok(Number.isNaN(aNumeroRegion("1e1")));
  assert.ok(Number.isNaN(aNumeroRegion("1.5")));
}

async function probarCheckNumero(): Promise<void> {
  await assert.rejects(
    prisma.region.create({
      data: {
        nombre: `Fuera de rango ${randomUUID()}`,
        nombreNormalizado: `fuera de rango ${randomUUID()}`,
        codigo: "00",
        numero: 100,
      },
    }),
    "El CHECK de la base rechaza numero fuera de 1..99",
  );
}

async function probarCrudYDuplicados(): Promise<void> {
  const creada = await crearRegion(
    { nombre: "Región Prueba Ñandú", codigo: "97", numero: 97 },
    dependencias,
  );
  assert.ok(creada.ok, "Crea la región de prueba");
  regionesCreadas.push(creada.region.id);
  assert.equal(creada.region.codigo, "97");

  // Duplicado por nombre con tildes, mayúsculas y espacios distintos.
  const porNombre = await crearRegion(
    { nombre: "  REGIÓN   prueba ñandu ", codigo: "96", numero: 96 },
    dependencias,
  );
  assert.deepEqual(porNombre, { ok: false, motivo: "DUPLICADO", campo: "nombre" });

  const porNombreSembrado = await crearRegion(
    { nombre: "BIOBIO", codigo: "96", numero: 96 },
    dependencias,
  );
  assert.deepEqual(porNombreSembrado, { ok: false, motivo: "DUPLICADO", campo: "nombre" });

  const porCodigo = await crearRegion(
    { nombre: "Otra región", codigo: "97", numero: 96 },
    dependencias,
  );
  assert.deepEqual(porCodigo, { ok: false, motivo: "DUPLICADO", campo: "codigo" });

  const porNumero = await crearRegion(
    { nombre: "Otra región", codigo: "96", numero: 97 },
    dependencias,
  );
  assert.deepEqual(porNumero, { ok: false, motivo: "DUPLICADO", campo: "numero" });

  // Carrera simulada: se salta el chequeo previo y se escribe directo. La constraint UNIQUE
  // (P2002) debe llegar traducida a error de dominio, con el campo identificado.
  for (const [campo, datos] of [
    ["nombre", { nombre: "Región Prueba Ñandú", codigo: "95", numero: 95 }],
    ["codigo", { nombre: "Carrera código", codigo: "97", numero: 95 }],
    ["numero", { nombre: "Carrera número", codigo: "95", numero: 97 }],
  ] as const) {
    await assert.rejects(
      repositorio.crear({ ...datos, nombreNormalizado: derivarNombreNormalizado(datos.nombre) }),
      (error: unknown) => error instanceof RegionDuplicadaError && error.campo === campo,
      `P2002 por ${campo} se traduce a RegionDuplicadaError(${campo})`,
    );
  }

  // Editar conservando sus propios valores (solo cambia mayúsculas del nombre): sin falso duplicado.
  const mismaRegion = await actualizarRegion(
    creada.region.id,
    { nombre: "REGIÓN PRUEBA ÑANDÚ", codigo: "97", numero: 97 },
    dependencias,
  );
  assert.ok(mismaRegion.ok, "Editar conservando valores propios no choca consigo misma");
  assert.equal(mismaRegion.region.nombre, "REGIÓN PRUEBA ÑANDÚ");

  // Editar hacia los valores de otra región (Biobío, sembrada).
  const haciaCodigoAjeno = await actualizarRegion(
    creada.region.id,
    { nombre: "Región Prueba Ñandú", codigo: "08", numero: 97 },
    dependencias,
  );
  assert.deepEqual(haciaCodigoAjeno, { ok: false, motivo: "DUPLICADO", campo: "codigo" });

  const haciaNumeroAjeno = await actualizarRegion(
    creada.region.id,
    { nombre: "Región Prueba Ñandú", codigo: "97", numero: 8 },
    dependencias,
  );
  assert.deepEqual(haciaNumeroAjeno, { ok: false, motivo: "DUPLICADO", campo: "numero" });

  const haciaNombreAjeno = await actualizarRegion(
    creada.region.id,
    { nombre: "biobío", codigo: "97", numero: 97 },
    dependencias,
  );
  assert.deepEqual(haciaNombreAjeno, { ok: false, motivo: "DUPLICADO", campo: "nombre" });

  const inexistente = await actualizarRegion(
    randomUUID(),
    { nombre: "Nada", codigo: "94", numero: 94 },
    dependencias,
  );
  assert.deepEqual(inexistente, { ok: false, motivo: "NO_ENCONTRADO" });

  // Eliminar y re-eliminar.
  assert.deepEqual(await eliminarRegion(creada.region.id, dependencias), { ok: true });
  assert.deepEqual(await eliminarRegion(creada.region.id, dependencias), {
    ok: false,
    motivo: "NO_ENCONTRADO",
  });
  assert.equal(await repositorio.obtenerPorId(creada.region.id), null);

  // Actualizar una región borrada entre la lectura y la escritura (P2025) devuelve null.
  assert.equal(
    await repositorio.actualizar(creada.region.id, {
      nombre: "Borrada",
      nombreNormalizado: "borrada",
      codigo: "93",
      numero: 93,
    }),
    null,
  );
}

async function limpiar(): Promise<void> {
  await prisma.region.deleteMany({ where: { id: { in: regionesCreadas } } });
}

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(process.env.RF26_TEST_DATABASE, "true", "Requiere autorización de BD desechable");

  try {
    await probarSiembra();
    probarEsquema();
    await probarCheckNumero();
    await probarCrudYDuplicados();
    console.log("regiones.integration: OK");
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
