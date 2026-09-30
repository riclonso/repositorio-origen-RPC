// Integración de RF-29 (eliminación física de tipos de establecimiento). Ejecutar SOLO contra una
// base PostgreSQL local y DESECHABLE con las migraciones aplicadas. Nunca contra la base de
// desarrollo compartida ni producción:
//
//   TIPOS_ESTABLECIMIENTO_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/tipos-establecimiento.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaTipoEstablecimientoRepository as repositorio } from "../src/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { crearTipoEstablecimiento } from "../src/modules/tipoEstablecimiento/application/use-cases/CrearTipoEstablecimiento";
import { cambiarEstadoTipoEstablecimiento } from "../src/modules/tipoEstablecimiento/application/use-cases/CambiarEstadoTipoEstablecimiento";
import { eliminarTipoEstablecimiento } from "../src/modules/tipoEstablecimiento/application/use-cases/EliminarTipoEstablecimiento";
import { listarTiposEstablecimientoConUso } from "../src/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimientoConUso";

const dependencias = { repositorio };
const tiposCreados: string[] = [];
const establecimientosCreados: string[] = [];

async function crearTipo(prefijo: string): Promise<string> {
  const resultado = await crearTipoEstablecimiento(
    { nombre: `${prefijo} ${randomUUID()}` },
    dependencias,
  );
  assert.ok(resultado.ok, `Crea el tipo ${prefijo}`);
  tiposCreados.push(resultado.tipo.id);
  return resultado.tipo.id;
}

// Prisma directo: el test solo necesita filas que referencien al tipo, no las reglas del
// mantenedor de establecimientos (que exige un tipo ACTIVO y no dejaría asignar uno inactivo).
async function crearEstablecimiento(tipoId: string, activo: boolean): Promise<string> {
  const establecimiento = await prisma.establecimiento.create({
    data: {
      rut: `rf29-${randomUUID()}`,
      nombre: "Establecimiento de prueba RF-29",
      direccion: "Calle Falsa 123",
      tipoId,
      activo,
    },
    select: { id: true },
  });
  establecimientosCreados.push(establecimiento.id);
  return establecimiento.id;
}

async function probarEliminacionSinUso(): Promise<void> {
  const activoSinUso = await crearTipo("RF29 activo sin uso");
  assert.deepEqual(await eliminarTipoEstablecimiento(activoSinUso, dependencias), { ok: true });
  assert.equal(
    await prisma.tipoEstablecimiento.findUnique({ where: { id: activoSinUso } }),
    null,
    "La fila del tipo activo sin uso desaparece",
  );

  const inactivoSinUso = await crearTipo("RF29 inactivo sin uso");
  const desactivado = await cambiarEstadoTipoEstablecimiento(inactivoSinUso, false, dependencias);
  assert.ok(desactivado.ok && !desactivado.tipo.activo, "El tipo queda inactivo");
  assert.deepEqual(await eliminarTipoEstablecimiento(inactivoSinUso, dependencias), { ok: true });
  assert.equal(
    await prisma.tipoEstablecimiento.findUnique({ where: { id: inactivoSinUso } }),
    null,
    "Un tipo inactivo sin uso también se elimina",
  );

  // Re-eliminar e id inexistente: NO_ENCONTRADO (P2025), nunca un error técnico.
  assert.deepEqual(await eliminarTipoEstablecimiento(activoSinUso, dependencias), {
    ok: false,
    motivo: "NO_ENCONTRADO",
  });
  assert.deepEqual(await eliminarTipoEstablecimiento(randomUUID(), dependencias), {
    ok: false,
    motivo: "NO_ENCONTRADO",
  });
}

async function probarTipoEnUso(): Promise<void> {
  // Un establecimiento INACTIVO también cuenta como uso.
  const tipoEnUso = await crearTipo("RF29 en uso");
  await crearEstablecimiento(tipoEnUso, false);

  assert.deepEqual(await eliminarTipoEstablecimiento(tipoEnUso, dependencias), {
    ok: false,
    motivo: "EN_USO",
  });
  assert.ok(
    await prisma.tipoEstablecimiento.findUnique({ where: { id: tipoEnUso } }),
    "El tipo en uso sigue existiendo",
  );

  // La FK Restrict como defensa final: con `@prisma/adapter-pg`, el `delete()` del cliente (no
  // `$queryRaw`) entrega la violación como P2003, no como P2010.
  await assert.rejects(
    prisma.tipoEstablecimiento.delete({ where: { id: tipoEnUso } }),
    (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
    "La violación de FK llega como P2003",
  );
}

async function probarConteoDeUso(): Promise<void> {
  const sinUso = await crearTipo("RF29 conteo cero");
  const conUno = await crearTipo("RF29 conteo uno");
  const conVarios = await crearTipo("RF29 conteo varios");

  await crearEstablecimiento(conUno, true);
  await crearEstablecimiento(conVarios, true);
  await crearEstablecimiento(conVarios, false);
  await crearEstablecimiento(conVarios, true);

  const listado = await listarTiposEstablecimientoConUso(dependencias);
  const conteoPorId = new Map(listado.map((tipo) => [tipo.id, tipo.cantidadEstablecimientos]));

  assert.equal(conteoPorId.get(sinUso), 0, "Tipo sin establecimientos cuenta 0");
  assert.equal(conteoPorId.get(conUno), 1, "Tipo con un establecimiento cuenta 1");
  assert.equal(conteoPorId.get(conVarios), 3, "Cuenta establecimientos activos e inactivos");

  // El listado incluye tipos inactivos y no expone `nombreNormalizado`.
  await cambiarEstadoTipoEstablecimiento(sinUso, false, dependencias);
  const conInactivo = await listarTiposEstablecimientoConUso(dependencias);
  const filaInactiva = conInactivo.find((tipo) => tipo.id === sinUso);
  assert.ok(filaInactiva && !filaInactiva.activo, "El listado incluye tipos inactivos");
  assert.ok(!("nombreNormalizado" in filaInactiva), "La fila no expone nombreNormalizado");
}

async function limpiar(): Promise<void> {
  await prisma.establecimiento.deleteMany({ where: { id: { in: establecimientosCreados } } });
  await prisma.tipoEstablecimiento.deleteMany({ where: { id: { in: tiposCreados } } });
}

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(
    process.env.TIPOS_ESTABLECIMIENTO_TEST_DATABASE,
    "true",
    "Requiere autorización de BD desechable",
  );

  try {
    await probarEliminacionSinUso();
    await probarTipoEnUso();
    await probarConteoDeUso();
    console.log("tipos-establecimiento.integration: OK");
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
