// Integración de la asignación masiva de formatos y de la limpieza de asignaciones al desactivar.
// Ejecutar SOLO contra una base PostgreSQL local y desechable (con los perfiles ya cargados):
//
//   FORMATOS_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/asignacion-masiva-formato.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaFormatoExcelRepository as repositorio } from "../src/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { asignarFormatoAUsuariosMasivo } from "../src/modules/formatos-excel/application/use-cases/AsignarFormatoAUsuariosMasivo";
import { cambiarEstadoFormatoExcel } from "../src/modules/formatos-excel/application/use-cases/CambiarEstadoFormatoExcel";
import { eliminarFormatoExcel } from "../src/modules/formatos-excel/application/use-cases/EliminarFormatoExcel";
import { listarCandidatosAsignacionFormato } from "../src/modules/formatos-excel/application/use-cases/ListarCandidatosAsignacionFormato";
import { asignacionMasivaFormatoSchema } from "../src/modules/formatos-excel/schemas/formato-excel.schema";

const dependencias = { repositorio };
const marca = randomUUID().slice(0, 8);
const usuariosCreados: string[] = [];
const formatosCreados: string[] = [];

async function crearFormato(nombre: string, activo = true): Promise<string> {
  const formato = await prisma.formatoExcel.create({
    data: {
      nombre: `${nombre}-${marca}`,
      nombreArchivoPlantilla: "plantilla.csv",
      tipoContenidoPlantilla: "text/csv",
      tipoArchivo: "CSV",
      separadorCsv: "COMA",
      contenidoPlantilla: Uint8Array.from(Buffer.from("a,b\n")),
      activo,
    },
    select: { id: true },
  });
  formatosCreados.push(formato.id);
  return formato.id;
}

async function crearUsuario(perfilCodigo: string, formatos: string[], activo = true): Promise<string> {
  const id = randomUUID();
  await prisma.usuario.create({
    data: {
      id,
      nombres: "Prueba",
      apellidos: `Asignación ${marca}`,
      rut: id,
      email: `${id}@example.invalid`,
      username: id,
      perfilCodigo,
      activo,
      formatosAsignados: { create: formatos.map((formatoExcelId) => ({ formatoExcelId })) },
    },
  });
  usuariosCreados.push(id);
  return id;
}

async function tieneFormato(usuarioId: string, formatoExcelId: string): Promise<boolean> {
  const fila = await prisma.usuarioFormatoExcel.findFirst({ where: { usuarioId, formatoExcelId } });
  return fila !== null;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(process.env.FORMATOS_TEST_DATABASE, "true", "Requiere autorización de BD desechable");

  try {
    // --- Validación Zod del lote ---
    const idA = randomUUID();
    assert.equal(asignacionMasivaFormatoSchema.safeParse({ agregarIds: [idA], quitarIds: [idA] }).success, false);
    assert.equal(asignacionMasivaFormatoSchema.safeParse({ agregarIds: [idA, idA] }).success, false);
    assert.equal(asignacionMasivaFormatoSchema.safeParse({}).success, false);
    const lote201 = Array.from({ length: 201 }, () => randomUUID());
    assert.equal(asignacionMasivaFormatoSchema.safeParse({ agregarIds: lote201 }).success, false);
    console.log("OK: solapamiento, repetidos, lote vacío y >200 rechazados (400)");

    // --- Asignación masiva ---
    const formatoX = await crearFormato("X");
    const formatoY = await crearFormato("Y");
    const notifSinX = await crearUsuario("NOTIFICADOR_RPC", [formatoY]);
    const notifConXeY = await crearUsuario("NOTIFICADOR_RPC", [formatoX, formatoY]);
    const notifSoloX = await crearUsuario("NOTIFICADOR_RPC", [formatoX]);
    const notifInactivo = await crearUsuario("NOTIFICADOR_RPC", [formatoY], false);
    const admin = await crearUsuario("ADMIN", []);
    const inexistente = randomUUID();

    const candidatos = await listarCandidatosAsignacionFormato(formatoX, dependencias);
    assert.ok(candidatos.ok);
    const propios = candidatos.candidatos.filter((candidato) => usuariosCreados.includes(candidato.id));
    assert.deepEqual(propios.map((candidato) => candidato.id).sort(), [notifSinX, notifConXeY, notifSoloX].sort());
    assert.equal(propios.find((candidato) => candidato.id === notifSoloX)?.esUnicoFormato, true);
    console.log("OK: candidatos = notificadores activos, con esUnicoFormato");

    const lote = await asignarFormatoAUsuariosMasivo(
      formatoX,
      { agregarIds: [notifSinX, notifInactivo, admin, inexistente], quitarIds: [notifConXeY, notifSoloX] },
      dependencias,
    );
    assert.ok(lote.ok);
    assert.deepEqual(lote.clasificacion.aAgregar, [notifSinX]);
    assert.deepEqual(lote.clasificacion.aQuitar, [notifConXeY]);
    assert.deepEqual(lote.clasificacion.noElegibles.sort(), [notifInactivo, admin, inexistente].sort());
    assert.deepEqual(lote.clasificacion.excluidosUltimoFormato, [notifSoloX]);
    assert.equal(await tieneFormato(notifSinX, formatoX), true);
    assert.equal(await tieneFormato(notifConXeY, formatoX), false);
    assert.equal(await tieneFormato(notifSoloX, formatoX), true);
    console.log("OK: agregar + quitar en un lote, no elegibles y exclusión por último formato");

    const repetido = await asignarFormatoAUsuariosMasivo(
      formatoX,
      { agregarIds: [notifSinX], quitarIds: [notifConXeY] },
      dependencias,
    );
    assert.ok(repetido.ok);
    assert.deepEqual(repetido.clasificacion.sinCambio.sort(), [notifSinX, notifConXeY].sort());
    assert.equal(repetido.clasificacion.aAgregar.length + repetido.clasificacion.aQuitar.length, 0);
    console.log("OK: reenviar el mismo lote es idempotente (sin cambio)");

    // --- Formato inactivo: rechaza agregar y quitar ---
    const formatoInactivo = await crearFormato("Inactivo", false);
    const rechazoAgregar = await asignarFormatoAUsuariosMasivo(
      formatoInactivo,
      { agregarIds: [notifSinX], quitarIds: [] },
      dependencias,
    );
    const rechazoQuitar = await asignarFormatoAUsuariosMasivo(
      formatoInactivo,
      { agregarIds: [], quitarIds: [notifSinX] },
      dependencias,
    );
    assert.equal(!rechazoAgregar.ok && rechazoAgregar.motivo, "FORMATO_INVALIDO");
    assert.equal(!rechazoQuitar.ok && rechazoQuitar.motivo, "FORMATO_INVALIDO");
    console.log("OK: formato inactivo rechaza agregar y quitar (409)");

    // --- Desactivación bloqueada por notificador ACTIVO con X como único formato ---
    const bloqueoActivo = await cambiarEstadoFormatoExcel(formatoX, false, dependencias);
    assert.ok(!bloqueoActivo.ok && bloqueoActivo.motivo === "FORMATO_UNICO_DE_NOTIFICADORES");
    assert.deepEqual(bloqueoActivo.bloqueo.usuariosIds, [notifSoloX]);
    assert.equal(bloqueoActivo.bloqueo.cantidadActivos, 1);
    assert.equal((await prisma.formatoExcel.findUniqueOrThrow({ where: { id: formatoX } })).activo, true);
    console.log("OK: desactivación bloqueada por notificador activo, sin escribir");

    // --- Eliminación bloqueada por el mismo criterio ---
    const bloqueoEliminar = await eliminarFormatoExcel(formatoX, dependencias);
    assert.ok(!bloqueoEliminar.ok && bloqueoEliminar.motivo === "FORMATO_UNICO_DE_NOTIFICADORES");
    assert.ok(await prisma.formatoExcel.findUnique({ where: { id: formatoX } }));
    console.log("OK: eliminación bloqueada por único formato");

    // --- Bloqueo por notificador INACTIVO ---
    await prisma.usuarioFormatoExcel.create({ data: { usuarioId: notifSoloX, formatoExcelId: formatoY } });
    const notifInactivoSoloX = await crearUsuario("NOTIFICADOR_RPC", [formatoX], false);
    const bloqueoInactivo = await cambiarEstadoFormatoExcel(formatoX, false, dependencias);
    assert.ok(!bloqueoInactivo.ok && bloqueoInactivo.motivo === "FORMATO_UNICO_DE_NOTIFICADORES");
    assert.deepEqual(bloqueoInactivo.bloqueo.usuariosIds, [notifInactivoSoloX]);
    assert.equal(bloqueoInactivo.bloqueo.cantidadInactivos, 1);
    console.log("OK: desactivación bloqueada por notificador inactivo");

    // --- Desactivación exitosa: borra todas las asignaciones de X ---
    await prisma.usuarioFormatoExcel.create({ data: { usuarioId: notifInactivoSoloX, formatoExcelId: formatoY } });
    const desactivado = await cambiarEstadoFormatoExcel(formatoX, false, dependencias);
    assert.ok(desactivado.ok && desactivado.cambio === "DESACTIVADO");
    assert.deepEqual(
      desactivado.asignacionesEliminadasUsuarioIds.sort(),
      [notifSinX, notifSoloX, notifInactivoSoloX].sort(),
    );
    assert.equal(await prisma.usuarioFormatoExcel.count({ where: { formatoExcelId: formatoX } }), 0);
    assert.equal((await prisma.formatoExcel.findUniqueOrThrow({ where: { id: formatoX } })).activo, false);
    console.log("OK: desactivación borra asignaciones y fija activo=false");

    // --- Reactivar no restaura ---
    const reactivado = await cambiarEstadoFormatoExcel(formatoX, true, dependencias);
    assert.ok(reactivado.ok && reactivado.cambio === "ACTIVADO");
    assert.equal(await prisma.usuarioFormatoExcel.count({ where: { formatoExcelId: formatoX } }), 0);
    console.log("OK: reactivar no restaura asignaciones");

    // --- Formato ya inactivo con asignaciones heredadas: SIN_EFECTO, filas intactas ---
    await prisma.usuarioFormatoExcel.create({ data: { usuarioId: notifSinX, formatoExcelId: formatoInactivo } });
    const sinCambio = await cambiarEstadoFormatoExcel(formatoInactivo, false, dependencias);
    assert.ok(sinCambio.ok && sinCambio.cambio === "SIN_CAMBIO");
    assert.equal(await tieneFormato(notifSinX, formatoInactivo), true);
    console.log("OK: formato ya inactivo conserva asignaciones heredadas (SIN_EFECTO)");
  } finally {
    await prisma.usuarioFormatoExcel.deleteMany({ where: { usuarioId: { in: usuariosCreados } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuariosCreados } } });
    await prisma.usuarioFormatoExcel.deleteMany({ where: { formatoExcelId: { in: formatosCreados } } });
    await prisma.formatoExcel.deleteMany({ where: { id: { in: formatosCreados } } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
