// Integración de RF-25 (eliminación física de usuarios sin historial). Ejecutar SOLO contra una
// base PostgreSQL local y DESECHABLE con las migraciones aplicadas (los perfiles los siembran las
// propias migraciones). Nunca contra la base de desarrollo compartida ni producción:
//
//   RF25_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/eliminacion-usuario.integration.ts
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaUsuarioRepository as repositorio } from "../src/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { eliminarUsuario } from "../src/modules/usuarios/application/use-cases/EliminarUsuario";
import { RELACIONES_HISTORIAL_USUARIO } from "../src/modules/usuarios/infrastructure/repositories/relacionesHistorialUsuario";
import { jwtService, verificarSesion } from "../src/modules/auth/infrastructure/auth/JwtService";

const dependencias = { repositorio };
const marca = randomUUID().slice(0, 8);
const usuariosCreados: string[] = [];
let formatoId = "";
let anioSiguiente = 4000 + Math.floor(Math.random() * 1000) * 10;

async function crearUsuario(perfilCodigo: string, activo = true): Promise<string> {
  const id = randomUUID();
  await prisma.usuario.create({
    data: {
      id,
      nombres: "Prueba",
      apellidos: `Eliminación ${marca}`,
      rut: id,
      email: `${id}@example.invalid`,
      username: id,
      perfilCodigo,
      activo,
    },
  });
  usuariosCreados.push(id);
  return id;
}

async function crearVentana(creadoPorId: string, eliminadaPorId?: string): Promise<string> {
  const ventana = await prisma.ventanaCarga.create({
    data: {
      anio: anioSiguiente++,
      fechaApertura: new Date("2026-01-01T00:00:00Z"),
      fechaVencimiento: new Date("2026-12-31T23:59:00Z"),
      formatoExcelId: formatoId,
      creadoPorId,
      plantillaAlerta: "<p>prueba</p>",
      ...(eliminadaPorId ? { eliminadaPorId, eliminadaEn: new Date() } : {}),
    },
    select: { id: true },
  });
  return ventana.id;
}

async function crearCarga(usuarioId: string, ventanaCargaId: string, vistoBuenoPorId?: string): Promise<string> {
  const carga = await prisma.cargaArchivo.create({
    data: {
      formatoExcelId: formatoId,
      usuarioId,
      ventanaCargaId,
      nombreArchivoOriginal: "prueba.csv",
      tipoContenidoArchivo: "text/csv",
      contenidoArchivo: Uint8Array.from(Buffer.from("a,b\n1,2\n")),
      cantidadFilasDatos: 1,
      cantidadErrores: 0,
      estado: "PENDIENTE_VISTO_BUENO",
      ...(vistoBuenoPorId ? { vistoBuenoPorId, vistoBuenoEn: new Date() } : {}),
    },
    select: { id: true },
  });
  return carga.id;
}

function crearAlerta(ventanaCargaId: string, usuarioId: string, disparadoPorId?: string) {
  return prisma.alertaNotificacionVentana.create({
    data: {
      loteId: randomUUID(),
      ventanaCargaId,
      usuarioId,
      tipo: "MANUAL_INDIVIDUAL",
      resultado: "EXITO",
      asunto: "Prueba",
      mensaje: "<p>prueba</p>",
      ...(disparadoPorId ? { disparadoPorId } : {}),
    },
  });
}

// Una fixture por relación de historial: `victima` ocupa el rol de esa relación; `ayudante` cubre
// los demás roles obligatorios. Si se agrega una relación a la clasificación, falta su fixture aquí.
const FIXTURES: Record<string, (victima: string, ayudante: string, ventanaAyudante: string) => Promise<unknown>> = {
  cargasArchivo: (victima, _ayudante, ventana) => crearCarga(victima, ventana),
  cargasVistoBuenoPor: (victima, ayudante, ventana) => crearCarga(ayudante, ventana, victima),
  publicacionesCargaCreadas: async (victima, ayudante, ventana) =>
    prisma.cargaArchivoPublicada.create({
      data: { cargaArchivoId: await crearCarga(ayudante, ventana), publicadoPorId: victima },
    }),
  solicitudesReemplazoSolicitadas: async (victima, ayudante, ventana) =>
    prisma.solicitudReemplazoCarga.create({
      data: {
        cargaArchivoId: await crearCarga(ayudante, ventana),
        solicitadoPorId: victima,
        motivo: "prueba",
        origen: "CARGA_APROBADA",
      },
    }),
  solicitudesReemplazoRevisadas: async (victima, ayudante, ventana) =>
    prisma.solicitudReemplazoCarga.create({
      data: {
        cargaArchivoId: await crearCarga(ayudante, ventana),
        solicitadoPorId: ayudante,
        motivo: "prueba",
        origen: "CARGA_APROBADA",
        estado: "RECHAZADA",
        revisadoPorId: victima,
        revisadoEn: new Date(),
      },
    }),
  cargasRechazadas: async (victima, ayudante, ventana) =>
    prisma.cargaArchivoRechazo.create({
      data: { cargaArchivoId: await crearCarga(ayudante, ventana), rechazadoPorId: victima, motivo: "prueba" },
    }),
  ventanasCargaCreadas: (victima) => crearVentana(victima),
  ventanasCargaEliminadas: (victima, ayudante) => crearVentana(ayudante, victima),
  alertasRecibidas: (victima, _ayudante, ventana) => crearAlerta(ventana, victima),
  alertasDisparadas: (victima, ayudante, ventana) => crearAlerta(ventana, ayudante, victima),
  // RF-31: un mensaje escrito por la víctima (lado REVISOR) en el hilo del ayudante, y un mensaje
  // en el hilo de la víctima escrito por el ayudante. Ambos respetan el CHECK de coherencia de lado.
  mensajesCargaEscritos: async (victima, ayudante, ventana) =>
    crearMensaje(await crearCarga(ayudante, ventana), ventana, ayudante, victima),
  mensajesCargaRecibidos: async (victima, ayudante, ventana) =>
    crearMensaje(await crearCarga(ayudante, ventana), ventana, victima, ayudante),
};

function crearMensaje(cargaArchivoId: string, ventanaCargaId: string, notificadorId: string, autorId: string) {
  return prisma.mensajeCarga.create({
    data: { cargaArchivoId, ventanaCargaId, notificadorId, autorId, ladoAutor: "REVISOR", contenido: "prueba" },
  });
}

async function limpiar(): Promise<void> {
  const ids = usuariosCreados;
  await prisma.mensajeCarga.deleteMany({
    where: { OR: [{ notificadorId: { in: ids } }, { autorId: { in: ids } }] },
  });
  await prisma.alertaNotificacionVentana.deleteMany({
    where: { OR: [{ usuarioId: { in: ids } }, { disparadoPorId: { in: ids } }] },
  });
  await prisma.solicitudReemplazoCarga.deleteMany({
    where: { OR: [{ solicitadoPorId: { in: ids } }, { revisadoPorId: { in: ids } }] },
  });
  await prisma.cargaArchivoRechazo.deleteMany({ where: { rechazadoPorId: { in: ids } } });
  await prisma.cargaArchivoPublicada.deleteMany({ where: { publicadoPorId: { in: ids } } });
  await prisma.cargaArchivo.deleteMany({
    where: { OR: [{ usuarioId: { in: ids } }, { vistoBuenoPorId: { in: ids } }] },
  });
  await prisma.ventanaCarga.deleteMany({
    where: { OR: [{ creadoPorId: { in: ids } }, { eliminadaPorId: { in: ids } }] },
  });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  if (formatoId) await prisma.formatoExcel.deleteMany({ where: { id: formatoId } });
}

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(process.env.RF25_TEST_DATABASE, "true", "Requiere autorización de BD desechable");

  try {
    formatoId = (
      await prisma.formatoExcel.create({
        data: {
          nombre: `RF25-${marca}`,
          nombreArchivoPlantilla: "plantilla.csv",
          tipoContenidoPlantilla: "text/csv",
          tipoArchivo: "CSV",
          separadorCsv: "COMA",
          contenidoPlantilla: Uint8Array.from(Buffer.from("a,b\n")),
        },
        select: { id: true },
      })
    ).id;

    const admin = await crearUsuario("ADMIN");
    const revisor = await crearUsuario("REVISOR_REPOSITORIO");

    // --- Cuenta pendiente sin historial: se elimina y caen en cascada tokens y asignaciones ---
    const pendiente = await crearUsuario("NOTIFICADOR_RPC");
    await prisma.usuarioFormatoExcel.create({ data: { usuarioId: pendiente, formatoExcelId: formatoId } });
    await prisma.tokenRecuperacion.create({
      data: {
        usuarioId: pendiente,
        tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        origen: "ADMIN",
        expiraEn: new Date(Date.now() + 3_600_000),
      },
    });
    const sesionPendiente = await jwtService.emitir({ id: pendiente, perfilCodigo: "NOTIFICADOR_RPC", sesionVersion: 0 });
    assert.ok(await verificarSesion(sesionPendiente), "La sesión debe verificar antes de eliminar");

    const eliminado = await eliminarUsuario(pendiente, admin, "ADMIN", dependencias);
    assert.equal(eliminado.ok, true);
    assert.ok(eliminado.ok && eliminado.formatosQuitadosIds.includes(formatoId));
    assert.equal(eliminado.ok && eliminado.perfilCodigo, "NOTIFICADOR_RPC");
    assert.equal(await prisma.usuario.count({ where: { id: pendiente } }), 0);
    assert.equal(await prisma.tokenRecuperacion.count({ where: { usuarioId: pendiente } }), 0);
    assert.equal(await prisma.usuarioFormatoExcel.count({ where: { usuarioId: pendiente } }), 0);
    console.log("OK: cuenta pendiente sin historial eliminada; tokens y asignaciones en cascada");

    // `verificarSesion` usa `cache()` de React; fuera de un render no memoiza, así que consulta de nuevo.
    assert.equal(await verificarSesion(sesionPendiente), null, "La sesión del eliminado no debe verificar");
    console.log("OK: la sesión del usuario eliminado deja de verificar");

    const repetido = await eliminarUsuario(pendiente, admin, "ADMIN", dependencias);
    assert.deepEqual(repetido, { ok: false, motivo: "NO_ENCONTRADO" });
    console.log("OK: segunda eliminación responde NO_ENCONTRADO");

    // Dos eliminaciones SIMULTÁNEAS: la segunda choca con la primera (40001, que dentro de
    // `$queryRaw` llega como P2010) y debe terminar en NO_ENCONTRADO, nunca en un error sin traducir.
    for (let intento = 0; intento < 5; intento++) {
      const concurrente = await crearUsuario("NOTIFICADOR_RPC");
      const estados = (await Promise.all([repositorio.eliminar(concurrente, true), repositorio.eliminar(concurrente, true)]))
        .map((resultado) => resultado.estado)
        .sort();
      assert.deepEqual(estados, ["ELIMINADO", "NO_ENCONTRADO"]);
    }
    console.log("OK: doble eliminación concurrente -> ELIMINADO + NO_ENCONTRADO");

    // --- Cada relación de historial bloquea, y el listado la marca ---
    const ayudante = await crearUsuario("NOTIFICADOR_RPC");
    const ventanaAyudante = await crearVentana(admin);
    assert.deepEqual(
      Object.keys(FIXTURES).sort(),
      RELACIONES_HISTORIAL_USUARIO.map((relacion) => relacion.nombre).sort(),
      "Cada relación de historial necesita su fixture",
    );

    for (const relacion of RELACIONES_HISTORIAL_USUARIO) {
      const victima = await crearUsuario("NOTIFICADOR_RPC");
      await FIXTURES[relacion.nombre](victima, ayudante, ventanaAyudante);

      const pagina = await repositorio.listar({ termino: victima, pagina: 1, tamano: 5 });
      const fila = pagina.filas.find((candidato) => candidato.id === victima);
      assert.equal(fila?.tieneHistorial, true, `${relacion.nombre}: tieneHistorial en el listado`);

      const resultado = await eliminarUsuario(victima, admin, "ADMIN", dependencias);
      assert.equal(resultado.ok, false);
      assert.equal(!resultado.ok && resultado.motivo, "CON_HISTORIAL", relacion.nombre);
      assert.ok(
        !resultado.ok && resultado.motivo === "CON_HISTORIAL" && resultado.relacionesBloqueantes.includes(relacion.nombre),
        `${relacion.nombre}: debe figurar entre las relaciones bloqueantes`,
      );
      assert.equal(await prisma.usuario.count({ where: { id: victima } }), 1);
    }
    console.log(`OK: las ${RELACIONES_HISTORIAL_USUARIO.length} relaciones de historial bloquean y marcan tieneHistorial`);

    const sinHistorial = await crearUsuario("NOTIFICADOR_RPC", false);
    const paginaSinHistorial = await repositorio.listar({ termino: sinHistorial, pagina: 1, tamano: 5 });
    assert.equal(paginaSinHistorial.filas.find((f) => f.id === sinHistorial)?.tieneHistorial, false);
    console.log("OK: cuenta sin historial aparece con tieneHistorial=false");

    // --- La FK Restrict como defensa final: con el adaptador pg, la violación llega como P2003 ---
    const conCarga = await crearUsuario("NOTIFICADOR_RPC");
    await crearCarga(conCarga, ventanaAyudante);
    await assert.rejects(
      prisma.usuario.delete({ where: { id: conCarga } }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
    );
    console.log("OK: @prisma/adapter-pg expone la violación de FK como P2003");

    // --- Reglas de application/ ---
    assert.deepEqual(await eliminarUsuario(admin, admin, "ADMIN", dependencias), {
      ok: false,
      motivo: "AUTO_OPERACION",
      rut: admin,
    });
    console.log("OK: AUTO_OPERACION");

    const otroAdmin = await crearUsuario("ADMIN");
    assert.deepEqual(await eliminarUsuario(otroAdmin, revisor, "REVISOR_REPOSITORIO", dependencias), {
      ok: false,
      motivo: "PERFIL_ADMIN_RESTRINGIDO",
      rut: otroAdmin,
    });
    console.log("OK: REVISOR sobre ADMIN -> PERFIL_ADMIN_RESTRINGIDO");

    // Revalidación dentro de la transacción: simula que la cuenta fue ascendida a ADMIN después de
    // la lectura previa del caso de uso (se llama al repositorio directo con un actor no ADMIN).
    const ascendido = await crearUsuario("NOTIFICADOR_RPC");
    await prisma.usuario.update({ where: { id: ascendido }, data: { perfilCodigo: "ADMIN" } });
    assert.deepEqual(await repositorio.eliminar(ascendido, false), {
      estado: "PERFIL_ADMIN_RESTRINGIDO",
      rut: ascendido,
    });
    assert.equal(await prisma.usuario.count({ where: { id: ascendido } }), 1, "No debe borrarse");
    console.log("OK: revalidación de PERFIL_ADMIN_RESTRINGIDO sobre la fila bloqueada");

    // --- ULTIMO_ADMIN, directo contra el repositorio: se dejan inactivos los demás ADMIN ---
    const adminsActivosPrevios = await prisma.usuario.findMany({
      where: { perfilCodigo: "ADMIN", activo: true, id: { not: otroAdmin } },
      select: { id: true },
    });
    await prisma.usuario.updateMany({
      where: { id: { in: adminsActivosPrevios.map((fila) => fila.id) } },
      data: { activo: false },
    });
    try {
      assert.deepEqual(await repositorio.eliminar(otroAdmin, true), { estado: "ULTIMO_ADMIN", rut: otroAdmin });
      console.log("OK: ULTIMO_ADMIN");
    } finally {
      await prisma.usuario.updateMany({
        where: { id: { in: adminsActivosPrevios.map((fila) => fila.id) } },
        data: { activo: true },
      });
    }
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
