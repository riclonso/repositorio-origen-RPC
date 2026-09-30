// Integración de RF-30 (el usuario pertenece a un establecimiento; obligatorio solo para
// NOTIFICADOR_RPC). Ejecutar SOLO contra una base PostgreSQL local y DESECHABLE con las migraciones
// aplicadas (los perfiles los siembran las propias migraciones). Nunca contra la base de desarrollo
// compartida ni producción:
//
//   USUARIO_ESTABLECIMIENTO_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/usuario-establecimiento.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaUsuarioRepository } from "../src/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { prismaPerfilRepository } from "../src/modules/perfiles/infrastructure/repositories/PrismaPerfilRepository";
import { prismaFormatoExcelRepository } from "../src/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { prismaEstablecimientoRepository } from "../src/modules/establecimiento/infrastructure/repositories/PrismaEstablecimientoRepository";
import { crearUsuario, type DatosCreacionUsuario } from "../src/modules/usuarios/application/use-cases/CrearUsuario";
import { actualizarUsuario } from "../src/modules/usuarios/application/use-cases/ActualizarUsuario";
import { listarUsuarios } from "../src/modules/usuarios/application/use-cases/ListarUsuarios";
import { eliminarUsuario } from "../src/modules/usuarios/application/use-cases/EliminarUsuario";
import { listarEstablecimientosParaSelect } from "../src/modules/establecimiento/application/use-cases/ListarEstablecimientosParaSelect";
import type { DatosEdicionUsuario, Usuario } from "../src/modules/usuarios/domain/entities/Usuario";
import { EstablecimientoInvalidoError } from "../src/modules/usuarios/domain/errors/EstablecimientoInvalidoError";
import { PerfilInvalidoError } from "../src/modules/usuarios/domain/errors/PerfilInvalidoError";
import { FormatoExcelInvalidoError } from "../src/modules/usuarios/domain/errors/FormatoExcelInvalidoError";
import {
  crearUsuarioSchema,
  editarUsuarioSchema,
  MENSAJE_ESTABLECIMIENTO_REQUERIDO,
} from "../src/modules/usuarios/schemas/usuario.schema";
import { listadoUsuariosSchema } from "../src/modules/usuarios/schemas/listado-usuarios.schema";

const dependencias = {
  repositorio: prismaUsuarioRepository,
  repositorioPerfiles: prismaPerfilRepository,
  repositorioFormatosExcel: prismaFormatoExcelRepository,
  repositorioEstablecimientos: prismaEstablecimientoRepository,
};

// Actor ADMIN ficticio: ninguna regla anti-autobloqueo de estas pruebas depende de su id.
const ACTOR_ID = randomUUID();
const marca = `rf30${randomUUID().slice(0, 8)}`;
const usuariosCreados: string[] = [];
const establecimientosCreados: string[] = [];
let tipoId = "";
let contadorRut = 0;

// RUTs de relleno únicos: el caso de uso no valida el dígito verificador (lo hace el esquema).
function rutUnico(): string {
  contadorRut += 1;
  return `${marca}-${contadorRut}`;
}

async function crearEstablecimiento(activo: boolean): Promise<string> {
  const establecimiento = await prisma.establecimiento.create({
    data: {
      rut: `${marca}-est-${randomUUID()}`,
      nombre: `Establecimiento ${marca} ${activo ? "activo" : "inactivo"}`,
      direccion: "Calle Falsa 123",
      tipoId,
      activo,
    },
    select: { id: true },
  });
  establecimientosCreados.push(establecimiento.id);
  return establecimiento.id;
}

function datosAlta(
  perfilCodigo: string,
  establecimientoId: string | null,
): DatosCreacionUsuario {
  const rut = rutUnico();
  return {
    nombres: "Prueba",
    apellidos: `Establecimiento ${marca}`,
    rut,
    email: `${rut}@example.invalid`,
    perfilCodigo,
    formatosExcelIds: [],
    establecimientoId,
  };
}

async function altaExitosa(perfilCodigo: string, establecimientoId: string | null): Promise<Usuario> {
  const resultado = await crearUsuario(datosAlta(perfilCodigo, establecimientoId), "ADMIN", dependencias);
  assert.ok(resultado.ok, `Alta ${perfilCodigo} con establecimiento ${establecimientoId ?? "null"}`);
  usuariosCreados.push(resultado.usuario.id);
  return resultado.usuario;
}

function datosEdicion(usuario: Usuario, cambios: Partial<DatosEdicionUsuario>): DatosEdicionUsuario {
  return {
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    email: usuario.email,
    perfilCodigo: usuario.perfilCodigo,
    establecimientoId: usuario.establecimientoId,
    formatosExcelIds: [],
    ...cambios,
  };
}

function probarEsquemas(establecimientoId: string): void {
  const base = {
    nombres: "Ana",
    apellidos: "Prueba",
    rut: "11111111-1",
    email: "ana@example.invalid",
  };

  const notificadorSin = crearUsuarioSchema.safeParse({
    ...base,
    perfilCodigo: "NOTIFICADOR_RPC",
    formatosExcelIds: [randomUUID()],
    establecimientoId: "",
  });
  assert.ok(!notificadorSin.success, "El esquema rechaza notificador sin establecimiento");
  const problema = notificadorSin.error.issues.find((issue) => issue.path[0] === "establecimientoId");
  assert.equal(problema?.message, MENSAJE_ESTABLECIMIENTO_REQUERIDO);

  const adminSin = crearUsuarioSchema.safeParse({ ...base, perfilCodigo: "ADMIN" });
  assert.ok(adminSin.success, "ADMIN sin establecimiento es válido (campo omitido)");
  assert.equal(adminSin.data.establecimientoId, null, "Campo omitido se normaliza a null");

  const revisorVacio = crearUsuarioSchema.safeParse({
    ...base,
    perfilCodigo: "REVISOR_REPOSITORIO",
    establecimientoId: "",
  });
  assert.ok(revisorVacio.success && revisorVacio.data.establecimientoId === null, "\"\" se normaliza a null");

  const noUuid = crearUsuarioSchema.safeParse({ ...base, perfilCodigo: "ADMIN", establecimientoId: "x" });
  assert.ok(!noUuid.success, "Un establecimiento que no es UUID se rechaza");

  const editarNotificadorSin = editarUsuarioSchema.safeParse({
    nombres: "Ana",
    apellidos: "Prueba",
    email: "ana@example.invalid",
    perfilCodigo: "NOTIFICADOR_RPC",
    formatosExcelIds: [randomUUID()],
    establecimientoId: null,
  });
  assert.ok(!editarNotificadorSin.success, "La edición también exige establecimiento al notificador");

  const editarNotificadorCon = editarUsuarioSchema.safeParse({
    nombres: "Ana",
    apellidos: "Prueba",
    email: "ana@example.invalid",
    perfilCodigo: "NOTIFICADOR_RPC",
    formatosExcelIds: [randomUUID()],
    establecimientoId,
  });
  assert.ok(editarNotificadorCon.success, "Notificador con establecimiento es válido");

  const filtro = listadoUsuariosSchema.safeParse({ establecimiento: establecimientoId });
  assert.ok(filtro.success && filtro.data.establecimiento === establecimientoId, "Filtro por establecimiento");
  assert.ok(!listadoUsuariosSchema.safeParse({ establecimiento: "x" }).success, "Filtro no UUID se rechaza");
  console.log("OK: esquemas Zod (alta, edición y filtro del listado)");
}

async function probarAlta(activo: string, inactivo: string): Promise<void> {
  assert.deepEqual(
    await crearUsuario(datosAlta("NOTIFICADOR_RPC", null), "ADMIN", dependencias),
    { ok: false, motivo: "ESTABLECIMIENTO_REQUERIDO" },
    "Notificador sin establecimiento se rechaza en application/",
  );

  await altaExitosa("ADMIN", null);
  await altaExitosa("REVISOR_REPOSITORIO", null);

  assert.deepEqual(
    await crearUsuario(datosAlta("NOTIFICADOR_RPC", inactivo), "ADMIN", dependencias),
    { ok: false, motivo: "ESTABLECIMIENTO_INVALIDO" },
    "Establecimiento inactivo se rechaza",
  );
  assert.deepEqual(
    await crearUsuario(datosAlta("REVISOR_REPOSITORIO", randomUUID()), "ADMIN", dependencias),
    { ok: false, motivo: "ESTABLECIMIENTO_INVALIDO" },
    "Establecimiento inexistente se rechaza (también para perfiles donde es opcional)",
  );

  const notificador = await altaExitosa("NOTIFICADOR_RPC", activo);
  assert.equal(notificador.establecimientoId, activo);
  assert.ok(notificador.establecimientoNombre?.includes(marca), "Trae el nombre del establecimiento");
  console.log("OK: alta (requerido, opcional, inactivo, inexistente, activo)");
}

async function probarEdicion(): Promise<void> {
  const estA = await crearEstablecimiento(true);
  const estB = await crearEstablecimiento(false);
  const notificador = await altaExitosa("NOTIFICADOR_RPC", estA);

  // A pasa a inactivo DESPUÉS de asignarse: conservarlo sigue siendo válido.
  await prisma.establecimiento.update({ where: { id: estA }, data: { activo: false } });
  const conserva = await actualizarUsuario(
    notificador.id,
    datosEdicion(notificador, { nombres: "Renombrado" }),
    ACTOR_ID,
    "ADMIN",
    dependencias,
  );
  assert.ok(conserva.ok, "Conservar un establecimiento ya inactivo es válido");
  assert.deepEqual(conserva.camposModificados, ["nombres"], "Sin cambio de establecimiento");

  assert.deepEqual(
    await actualizarUsuario(
      notificador.id,
      datosEdicion(notificador, { establecimientoId: estB }),
      ACTOR_ID,
      "ADMIN",
      dependencias,
    ),
    { ok: false, motivo: "ESTABLECIMIENTO_INVALIDO" },
    "Cambiar a otro establecimiento inactivo se rechaza",
  );

  assert.deepEqual(
    await actualizarUsuario(
      notificador.id,
      datosEdicion(notificador, { establecimientoId: null }),
      ACTOR_ID,
      "ADMIN",
      dependencias,
    ),
    { ok: false, motivo: "ESTABLECIMIENTO_REQUERIDO" },
    "Quitar el establecimiento a un notificador se rechaza",
  );

  // De notificador a revisor: puede quitarse el establecimiento.
  const aRevisor = await actualizarUsuario(
    notificador.id,
    datosEdicion(notificador, { perfilCodigo: "REVISOR_REPOSITORIO", establecimientoId: null }),
    ACTOR_ID,
    "ADMIN",
    dependencias,
  );
  assert.ok(aRevisor.ok, "De notificador a revisor se puede quitar el establecimiento");
  assert.equal(aRevisor.usuario.establecimientoId, null);
  assert.equal(aRevisor.usuario.establecimientoNombre, null);
  assert.ok(aRevisor.camposModificados.includes("establecimientoId"), "camposModificados lo informa");
  assert.ok(aRevisor.camposModificados.includes("perfilCodigo"));

  // Revisor sin establecimiento que pasa a notificador: lo exige.
  assert.deepEqual(
    await actualizarUsuario(
      notificador.id,
      datosEdicion(aRevisor.usuario, { perfilCodigo: "NOTIFICADOR_RPC" }),
      ACTOR_ID,
      "ADMIN",
      dependencias,
    ),
    { ok: false, motivo: "ESTABLECIMIENTO_REQUERIDO" },
    "Cambio de perfil a notificador exige establecimiento",
  );

  // Una vez quitado, el inactivo A ya no es "el vigente": reasignarlo se rechaza.
  assert.deepEqual(
    await actualizarUsuario(
      notificador.id,
      datosEdicion(aRevisor.usuario, { perfilCodigo: "NOTIFICADOR_RPC", establecimientoId: estA }),
      ACTOR_ID,
      "ADMIN",
      dependencias,
    ),
    { ok: false, motivo: "ESTABLECIMIENTO_INVALIDO" },
    "Reasignar un inactivo que ya no es el vigente se rechaza",
  );

  // Notificador previo a RF-30 (NULL en la base): se le exige al editarlo.
  const legado = await altaExitosa("REVISOR_REPOSITORIO", null);
  await prisma.usuario.update({ where: { id: legado.id }, data: { perfilCodigo: "NOTIFICADOR_RPC" } });
  const legadoLeido = await prismaUsuarioRepository.obtenerPorId(legado.id);
  assert.ok(legadoLeido);
  assert.deepEqual(
    await actualizarUsuario(
      legado.id,
      datosEdicion(legadoLeido, { nombres: "Solo nombre" }),
      ACTOR_ID,
      "ADMIN",
      dependencias,
    ),
    { ok: false, motivo: "ESTABLECIMIENTO_REQUERIDO" },
    "Notificador existente sin establecimiento debe recibir uno al editarse",
  );
  console.log("OK: edición (conservar inactivo, cambiar, quitar, cambio de perfil, legado)");
}

async function probarListado(): Promise<void> {
  const estFiltro = await crearEstablecimiento(true);
  const conEst1 = await altaExitosa("NOTIFICADOR_RPC", estFiltro);
  const conEst2 = await altaExitosa("REVISOR_REPOSITORIO", estFiltro);
  const sinEst = await altaExitosa("ADMIN", null);

  const todos = await listarUsuarios(
    { termino: marca, pagina: 1, tamano: 100 },
    { repositorio: prismaUsuarioRepository },
  );
  const filaSinEst = todos.filas.find((fila) => fila.id === sinEst.id);
  assert.ok(filaSinEst, "Un usuario sin establecimiento aparece en el listado (LEFT JOIN)");
  assert.equal(filaSinEst.establecimientoId, null);
  assert.equal(filaSinEst.establecimientoNombre, null);
  const filaConEst = todos.filas.find((fila) => fila.id === conEst1.id);
  assert.equal(filaConEst?.establecimientoId, estFiltro);
  assert.ok(filaConEst?.establecimientoNombre?.includes(marca));

  const filtrado = await listarUsuarios(
    { establecimiento: estFiltro, pagina: 1, tamano: 100 },
    { repositorio: prismaUsuarioRepository },
  );
  assert.deepEqual(
    filtrado.filas.map((fila) => fila.id).sort(),
    [conEst1.id, conEst2.id].sort(),
    "El filtro devuelve solo los usuarios de ese establecimiento",
  );
  assert.equal(filtrado.paginacion.total, 2, "El conteo coincide con el filtro");

  const paginado = await listarUsuarios(
    { establecimiento: estFiltro, pagina: 1, tamano: 1 },
    { repositorio: prismaUsuarioRepository },
  );
  assert.equal(paginado.filas.length, 1);
  assert.equal(paginado.paginacion.total, 2, "El conteo no depende del tamaño de página");

  const combinado = await listarUsuarios(
    { establecimiento: estFiltro, perfil: "NOTIFICADOR_RPC", pagina: 1, tamano: 100 },
    { repositorio: prismaUsuarioRepository },
  );
  assert.deepEqual(combinado.filas.map((fila) => fila.id), [conEst1.id], "Se combina con perfil");

  const inexistente = await listarUsuarios(
    { establecimiento: randomUUID(), pagina: 1, tamano: 100 },
    { repositorio: prismaUsuarioRepository },
  );
  assert.equal(inexistente.paginacion.total, 0, "Un id inexistente devuelve una lista vacía");
  console.log("OK: listado (LEFT JOIN, filtro y conteo)");
}

async function probarOpcionesSelect(activo: string, inactivo: string): Promise<void> {
  const soloActivos = await listarEstablecimientosParaSelect(
    { soloActivos: true },
    { repositorio: prismaEstablecimientoRepository },
  );
  assert.ok(soloActivos.some((opcion) => opcion.id === activo));
  assert.ok(!soloActivos.some((opcion) => opcion.id === inactivo), "Sin inactivos por defecto");

  const conIncluido = await listarEstablecimientosParaSelect(
    { soloActivos: true, incluirIds: [inactivo] },
    { repositorio: prismaEstablecimientoRepository },
  );
  const incluido = conIncluido.find((opcion) => opcion.id === inactivo);
  assert.ok(incluido && !incluido.activo, "incluirIds trae el inactivo, marcado como tal");

  const todos = await listarEstablecimientosParaSelect(
    { soloActivos: false },
    { repositorio: prismaEstablecimientoRepository },
  );
  assert.ok(todos.some((opcion) => opcion.id === inactivo), "soloActivos=false trae inactivos");
  console.log("OK: opciones del select de establecimiento");
}

async function probarEliminacionFisica(): Promise<void> {
  const est = await crearEstablecimiento(true);
  const usuario = await altaExitosa("NOTIFICADOR_RPC", est);

  const resultado = await eliminarUsuario(usuario.id, ACTOR_ID, "ADMIN", {
    repositorio: prismaUsuarioRepository,
  });
  assert.ok(resultado.ok, "RF-25: un usuario sin historial con establecimiento se elimina");
  assert.equal(await prisma.usuario.count({ where: { id: usuario.id } }), 0);
  assert.equal(await prisma.establecimiento.count({ where: { id: est } }), 1, "El establecimiento queda");

  // La FK Restrict impide borrar físicamente un establecimiento con usuarios.
  const otro = await altaExitosa("REVISOR_REPOSITORIO", est);
  await assert.rejects(
    prisma.establecimiento.delete({ where: { id: est } }),
    (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
    "Restrict bloquea el DELETE de un establecimiento con usuarios",
  );
  assert.equal(await prisma.usuario.count({ where: { id: otro.id } }), 1);
  console.log("OK: eliminación física RF-25 y FK Restrict");
}

async function probarTraduccionFk(): Promise<void> {
  // Directo contra el repositorio, saltándose el caso de uso: simula el establecimiento borrado
  // entre la comprobación y la escritura.
  const rut = rutUnico();
  await assert.rejects(
    prismaUsuarioRepository.crear({
      nombres: "Prueba",
      apellidos: `FK ${marca}`,
      rut,
      email: `${rut}@example.invalid`,
      username: rut,
      perfilCodigo: "REVISOR_REPOSITORIO",
      activo: true,
      contrasenaHash: null,
      formatosExcelIds: [],
      establecimientoId: randomUUID(),
    }),
    (error: unknown) =>
      error instanceof EstablecimientoInvalidoError && !(error instanceof PerfilInvalidoError),
    "P2003 de establecimiento en el INSERT se traduce a EstablecimientoInvalidoError",
  );

  const usuario = await altaExitosa("REVISOR_REPOSITORIO", null);
  await assert.rejects(
    prismaUsuarioRepository.actualizar(usuario.id, {
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      email: usuario.email,
      perfilCodigo: usuario.perfilCodigo,
      establecimientoId: randomUUID(),
      formatosExcelIds: [],
    }),
    (error: unknown) => error instanceof EstablecimientoInvalidoError,
    "P2003 de establecimiento en el UPDATE se traduce a EstablecimientoInvalidoError",
  );

  // La misma lectura del nombre de la FK (adaptador pg) distingue también los formatos.
  await assert.rejects(
    prismaUsuarioRepository.actualizar(usuario.id, {
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      email: usuario.email,
      perfilCodigo: usuario.perfilCodigo,
      establecimientoId: null,
      formatosExcelIds: [randomUUID()],
    }),
    (error: unknown) => error instanceof FormatoExcelInvalidoError,
    "P2003 de formato se traduce a FormatoExcelInvalidoError",
  );

  // El fallback del perfil sigue intacto.
  await assert.rejects(
    prismaUsuarioRepository.actualizar(usuario.id, {
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      email: usuario.email,
      perfilCodigo: "PERFIL_QUE_NO_EXISTE",
      establecimientoId: null,
      formatosExcelIds: [],
    }),
    (error: unknown) => error instanceof PerfilInvalidoError,
    "P2003 de perfil sigue traduciéndose a PerfilInvalidoError",
  );
  console.log("OK: traducción de P2003 (establecimiento, formato y perfil)");
}

async function limpiar(): Promise<void> {
  await prisma.usuario.deleteMany({ where: { id: { in: usuariosCreados } } });
  await prisma.establecimiento.deleteMany({ where: { id: { in: establecimientosCreados } } });
  if (tipoId) {
    await prisma.tipoEstablecimiento.deleteMany({ where: { id: tipoId } });
  }
}

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(
    process.env.USUARIO_ESTABLECIMIENTO_TEST_DATABASE,
    "true",
    "Requiere autorización de BD desechable",
  );

  try {
    const tipo = await prisma.tipoEstablecimiento.create({
      data: { nombre: `Tipo ${marca}`, nombreNormalizado: `tipo ${marca}` },
      select: { id: true },
    });
    tipoId = tipo.id;

    const activo = await crearEstablecimiento(true);
    const inactivo = await crearEstablecimiento(false);

    probarEsquemas(activo);
    await probarAlta(activo, inactivo);
    await probarEdicion();
    await probarListado();
    await probarOpcionesSelect(activo, inactivo);
    await probarEliminacionFisica();
    await probarTraduccionFk();
    console.log("usuario-establecimiento.integration: OK");
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
