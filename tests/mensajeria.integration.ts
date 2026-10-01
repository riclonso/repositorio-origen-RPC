// Integración de RF-31 (mensajería entre REVISOR_REPOSITORIO y NOTIFICADOR_RPC sobre cargas).
// Ejecutar SOLO contra una base PostgreSQL local y DESECHABLE con las migraciones aplicadas (los
// perfiles los siembran las propias migraciones). Nunca contra la base de desarrollo compartida ni
// producción:
//
//   MENSAJERIA_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/mensajeria.integration.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaMensajeCargaRepository as repositorio } from "../src/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { prismaCargaArchivoRepository as repositorioCargas } from "../src/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  enviarMensajeRevisor,
  enviarMensajeRevisorEnConversacion,
} from "../src/modules/mensajeria/application/use-cases/EnviarMensajeRevisor";
import { responderMensajeNotificador } from "../src/modules/mensajeria/application/use-cases/ResponderMensajeNotificador";
import { listarConversacionesVentana } from "../src/modules/mensajeria/application/use-cases/ListarConversacionesVentana";
import {
  obtenerHiloVentanaNotificador,
  obtenerHiloVentanaRevisor,
} from "../src/modules/mensajeria/application/use-cases/ObtenerHiloVentana";
import { marcarMensajesLeidos } from "../src/modules/mensajeria/application/use-cases/MarcarMensajesLeidos";
import {
  listarVentanasConNoLeidosSinTarjeta,
  obtenerResumenMensajesPorVentana,
} from "../src/modules/mensajeria/application/use-cases/ObtenerResumenMensajesPorVentana";
import type {
  DatosCorreoAvisoMensajeNuevo,
  EnviadorAvisoMensajeNuevo,
} from "../src/modules/mensajeria/application/ports";
import {
  avisarMensajeNuevo,
  type DestinatarioAvisoMensaje,
} from "../src/modules/mensajeria/application/use-cases/AvisarMensajeNuevo";
import { eliminarUsuario } from "../src/modules/usuarios/application/use-cases/EliminarUsuario";
import { prismaUsuarioRepository } from "../src/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";

const dependencias = { repositorio, repositorioCargas };
const marca = randomUUID().slice(0, 8);
const usuariosCreados: string[] = [];
const ventanasCreadas: string[] = [];
let formatoId = "";
let anioSiguiente = 5000 + Math.floor(Math.random() * 1000) * 10;

type EstadoCarga = "PENDIENTE_VISTO_BUENO" | "APROBADA" | "RECHAZADA";

async function esperar(ms: number): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver, ms));
}

async function crearUsuario(perfilCodigo: string): Promise<string> {
  const id = randomUUID();
  await prisma.usuario.create({
    data: {
      id,
      nombres: "Prueba",
      apellidos: `Mensajería ${marca}`,
      rut: id,
      email: `${id}@example.invalid`,
      username: id,
      perfilCodigo,
    },
  });
  usuariosCreados.push(id);
  return id;
}

async function crearVentana(creadoPorId: string): Promise<string> {
  const ventana = await prisma.ventanaCarga.create({
    data: {
      anio: anioSiguiente++,
      fechaApertura: new Date("2026-01-01T00:00:00Z"),
      fechaVencimiento: new Date("2026-12-31T23:59:00Z"),
      formatoExcelId: formatoId,
      creadoPorId,
      plantillaAlerta: "<p>prueba</p>",
    },
    select: { id: true },
  });
  ventanasCreadas.push(ventana.id);
  return ventana.id;
}

async function crearCarga(
  usuarioId: string,
  ventanaCargaId: string,
  estado: EstadoCarga,
  finalizada: boolean,
): Promise<string> {
  const carga = await prisma.cargaArchivo.create({
    data: {
      formatoExcelId: formatoId,
      usuarioId,
      ventanaCargaId,
      nombreArchivoOriginal: `prueba-${randomUUID().slice(0, 4)}.csv`,
      tipoContenidoArchivo: "text/csv",
      contenidoArchivo: Uint8Array.from(Buffer.from("a,b\n1,2\n")),
      cantidadFilasDatos: 1,
      cantidadErrores: 0,
      estado,
      ...(finalizada ? { finalizadaEn: new Date() } : {}),
    },
    select: { id: true },
  });
  return carga.id;
}

async function limpiar(): Promise<void> {
  const ids = usuariosCreados;
  await prisma.mensajeCarga.deleteMany({
    where: { OR: [{ notificadorId: { in: ids } }, { autorId: { in: ids } }] },
  });
  await prisma.cargaArchivo.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.ventanaCarga.deleteMany({ where: { id: { in: ventanasCreadas } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  if (formatoId) await prisma.formatoExcel.deleteMany({ where: { id: formatoId } });
}

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(process.env.MENSAJERIA_TEST_DATABASE, "true", "Requiere autorización de BD desechable");

  try {
    formatoId = (
      await prisma.formatoExcel.create({
        data: {
          nombre: `RF31-${marca}`,
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
    const revisorA = await crearUsuario("REVISOR_REPOSITORIO");
    const revisorB = await crearUsuario("REVISOR_REPOSITORIO");
    const notificadorA = await crearUsuario("NOTIFICADOR_RPC");
    const notificadorB = await crearUsuario("NOTIFICADOR_RPC");
    const ventana1 = await crearVentana(admin);
    const ventana2 = await crearVentana(admin);

    const pendienteA1 = await crearCarga(notificadorA, ventana1, "PENDIENTE_VISTO_BUENO", true);
    const sinFinalizarB1 = await crearCarga(notificadorB, ventana1, "PENDIENTE_VISTO_BUENO", false);
    const aprobadaB2 = await crearCarga(notificadorB, ventana2, "APROBADA", true);
    const rechazadaB2 = await crearCarga(notificadorB, ventana2, "RECHAZADA", true);

    // --- Revisor sobre una carga pendiente y finalizada ---
    const primero = await enviarMensajeRevisor(
      { cargaArchivoId: pendienteA1, autorId: revisorA, contenido: "¿Puedes revisar la fila 3?" },
      dependencias,
    );
    assert.ok(primero.ok);
    assert.equal(primero.mensaje.notificadorId, notificadorA, "notificadorId copiado desde la carga");
    assert.equal(primero.mensaje.ventanaCargaId, ventana1, "ventanaCargaId copiado desde la carga");
    assert.equal(primero.mensaje.ladoAutor, "REVISOR");
    assert.equal(primero.eraPrimerNoLeido, true);
    console.log("OK: revisor envía sobre carga pendiente y finalizada");

    await esperar(5);
    const segundo = await enviarMensajeRevisor(
      { cargaArchivoId: pendienteA1, autorId: revisorB, contenido: "Otro detalle" },
      dependencias,
    );
    assert.ok(segundo.ok);
    assert.equal(segundo.eraPrimerNoLeido, false, "Solo el primero de una tanda dispara el correo");
    console.log("OK: eraPrimerNoLeido solo en el primero de una tanda");

    // --- Rechazos del revisor ---
    for (const cargaArchivoId of [aprobadaB2, rechazadaB2, sinFinalizarB1]) {
      const resultado = await enviarMensajeRevisor({ cargaArchivoId, autorId: revisorA, contenido: "x" }, dependencias);
      assert.deepEqual(resultado, { ok: false, motivo: "NO_PENDIENTE" });
    }
    assert.deepEqual(
      await enviarMensajeRevisor({ cargaArchivoId: randomUUID(), autorId: revisorA, contenido: "x" }, dependencias),
      { ok: false, motivo: "NO_ENCONTRADO" },
    );
    console.log("OK: APROBADA, RECHAZADA y sin finalizar -> NO_PENDIENTE; inexistente -> NO_ENCONTRADO");

    // --- Notificador ---
    assert.deepEqual(
      await responderMensajeNotificador(
        { notificadorId: notificadorB, ventanaCargaId: ventana1, contenido: "hola" },
        { repositorio },
      ),
      { ok: false, motivo: "SIN_CONVERSACION" },
    );
    console.log("OK: notificador sin conversación -> SIN_CONVERSACION");

    // Una carga rechazada y otra nueva en la misma ventana: la respuesta se asocia a la carga del
    // ÚLTIMO mensaje del revisor.
    await prisma.cargaArchivo.update({ where: { id: pendienteA1 }, data: { estado: "RECHAZADA" } });
    const nuevaA1 = await crearCarga(notificadorA, ventana1, "PENDIENTE_VISTO_BUENO", true);
    await esperar(5);
    const sobreNueva = await enviarMensajeRevisor(
      { cargaArchivoId: nuevaA1, autorId: revisorA, contenido: "Sobre el archivo nuevo" },
      dependencias,
    );
    assert.ok(sobreNueva.ok);
    await esperar(5);
    const respuestaA = await responderMensajeNotificador(
      { notificadorId: notificadorA, ventanaCargaId: ventana1, contenido: "Corregido" },
      { repositorio },
    );
    assert.ok(respuestaA.ok);
    assert.equal(respuestaA.mensaje.cargaArchivoId, nuevaA1, "Asociada a la carga del último mensaje del revisor");
    assert.equal(respuestaA.mensaje.autorId, notificadorA);
    console.log("OK: respuesta asociada a la carga del último mensaje del revisor");

    // --- Propiedad del hilo ---
    const hiloAjeno = await obtenerHiloVentanaNotificador(
      { ventanaCargaId: ventana1, notificadorId: notificadorB },
      { repositorio },
    );
    assert.deepEqual(hiloAjeno, { mensajes: [], hayMasAntiguos: false, puedeResponder: false });
    const hiloPropio = await obtenerHiloVentanaNotificador(
      { ventanaCargaId: ventana1, notificadorId: notificadorA },
      { repositorio },
    );
    assert.equal(hiloPropio.mensajes.length, 4);
    assert.equal(hiloPropio.puedeResponder, true);
    assert.equal(hiloPropio.mensajes[0]?.id, primero.mensaje.id, "Orden cronológico ascendente");
    console.log("OK: el notificador B no ve el hilo del A; el A ve el suyo en orden");

    // --- Conversación en la ventana 2 y conteos por ventana en una sola llamada ---
    const pendienteB2 = await crearCarga(notificadorB, ventana2, "PENDIENTE_VISTO_BUENO", true);
    const aB2 = await enviarMensajeRevisor(
      { cargaArchivoId: pendienteB2, autorId: revisorA, contenido: "Hola B" },
      dependencias,
    );
    assert.ok(aB2.ok);
    await esperar(5);
    const respuestaB1 = await responderMensajeNotificador(
      { notificadorId: notificadorB, ventanaCargaId: ventana2, contenido: "Respuesta 1" },
      { repositorio },
    );
    await esperar(5);
    const respuestaB2 = await responderMensajeNotificador(
      { notificadorId: notificadorB, ventanaCargaId: ventana2, contenido: "Respuesta 2" },
      { repositorio },
    );
    assert.ok(respuestaB1.ok && respuestaB2.ok);

    // --- GET del hilo (revisor): 404 si el par no tiene mensajes NI carga pendiente ---
    assert.deepEqual(
      await obtenerHiloVentanaRevisor({ ventanaCargaId: ventana2, notificadorId: notificadorA }, dependencias),
      { ok: false, motivo: "NO_ENCONTRADO" },
    );
    assert.deepEqual(
      await obtenerHiloVentanaRevisor({ ventanaCargaId: ventana1, notificadorId: notificadorB }, dependencias),
      { ok: false, motivo: "NO_ENCONTRADO" },
      "Una carga pendiente SIN finalizar no habilita el hilo",
    );
    assert.deepEqual(
      await obtenerHiloVentanaRevisor({ ventanaCargaId: ventana1, notificadorId: randomUUID() }, dependencias),
      { ok: false, motivo: "NO_ENCONTRADO" },
    );
    const pendienteB1 = await crearCarga(notificadorB, ventana1, "PENDIENTE_VISTO_BUENO", true);
    const hiloSinMensajes = await obtenerHiloVentanaRevisor(
      { ventanaCargaId: ventana1, notificadorId: notificadorB },
      dependencias,
    );
    assert.ok(hiloSinMensajes.ok);
    assert.equal(hiloSinMensajes.hilo.mensajes.length, 0);
    assert.equal(hiloSinMensajes.hilo.cargaDestino?.id, pendienteB1, "Sin mensajes, el destino es la pendiente");
    console.log("OK: GET del hilo -> 404 sin mensajes ni pendiente; 200 con pendiente aunque no haya mensajes");

    // --- Anti-ráfaga POR VENTANA: el no leído de B en la ventana 2 no bloquea el aviso en la 1 ---
    await esperar(5);
    const aB1 = await enviarMensajeRevisor(
      { cargaArchivoId: pendienteB1, autorId: revisorA, contenido: "Hola B, sobre la ventana 1" },
      dependencias,
    );
    assert.ok(aB1.ok);
    assert.equal(aB1.eraPrimerNoLeido, true, "Un no leído en OTRA ventana no bloquea el correo");
    await esperar(5);
    const aB1Segundo = await enviarMensajeRevisor(
      { cargaArchivoId: pendienteB1, autorId: revisorB, contenido: "Otro sobre la ventana 1" },
      dependencias,
    );
    assert.ok(aB1Segundo.ok);
    assert.equal(aB1Segundo.eraPrimerNoLeido, false, "Dentro de la misma ventana sí aplica la anti-ráfaga");
    console.log("OK: anti-ráfaga por ventana");

    // --- Resúmenes de los inicios (dos groupBy) ---
    // Revisor con tarjeta solo para la ventana 1: los totales se acotan a ella, los no leídos no.
    const resumenRevisor = await obtenerResumenMensajesPorVentana(
      { lado: "REVISOR" },
      { repositorio },
      [ventana1],
    );
    assert.deepEqual(resumenRevisor.porVentana, { [ventana1]: { total: 6, noLeidos: 1 } });
    assert.equal(resumenRevisor.noLeidosPorVentana[ventana1], 1);
    assert.equal(resumenRevisor.noLeidosPorVentana[ventana2], 2, "Los no leídos abarcan ventanas sin tarjeta");
    const resumenB = await obtenerResumenMensajesPorVentana(
      { lado: "NOTIFICADOR", notificadorId: notificadorB },
      { repositorio },
    );
    assert.deepEqual(resumenB.porVentana, {
      [ventana1]: { total: 2, noLeidos: 2 },
      [ventana2]: { total: 3, noLeidos: 1 },
    });
    console.log("OK: conteos por ventana correctos para varias ventanas en una sola llamada");

    const sinTarjeta = await listarVentanasConNoLeidosSinTarjeta(resumenRevisor.noLeidosPorVentana, [ventana1], {
      repositorio,
    });
    assert.deepEqual(
      sinTarjeta.filter((ventana) => ventanasCreadas.includes(ventana.ventanaCargaId)).map((ventana) => ventana.ventanaCargaId),
      [ventana2],
    );
    console.log("OK: el banner lista solo las ventanas con no leídos sin tarjeta");

    const conversaciones = await listarConversacionesVentana(ventana1, { repositorio });
    assert.deepEqual(
      conversaciones.map((conversacion) => [conversacion.notificadorId, conversacion.noLeidos]),
      [
        [notificadorA, 1],
        [notificadorB, 0],
      ],
      "Primero las que tienen respuestas sin leer",
    );
    console.log("OK: columna izquierda con conteo de no leídos y orden");

    // --- Lectura con corte `hasta` ---
    const actualizados = await marcarMensajesLeidos(
      { notificadorId: notificadorB, ventanaCargaId: ventana2, ladoLector: "REVISOR", hasta: respuestaB1.mensaje.creadoEn },
      { repositorio },
    );
    assert.equal(actualizados, 1);
    const tras = await obtenerResumenMensajesPorVentana({ lado: "REVISOR" }, { repositorio });
    assert.deepEqual(tras.porVentana[ventana2], { total: 3, noLeidos: 1 }, "El mensaje posterior a `hasta` sigue sin leer");
    console.log("OK: la lectura con `hasta` no marca un mensaje posterior");

    // Tras leer, el siguiente mensaje del revisor vuelve a ser "primer no leído".
    await marcarMensajesLeidos(
      { notificadorId: notificadorB, ventanaCargaId: ventana2, ladoLector: "NOTIFICADOR", hasta: new Date() },
      { repositorio },
    );
    await esperar(5);
    const despuesDeLeer = await enviarMensajeRevisor(
      { cargaArchivoId: pendienteB2, autorId: revisorB, contenido: "Gracias" },
      dependencias,
    );
    assert.ok(despuesDeLeer.ok && despuesDeLeer.eraPrimerNoLeido);
    console.log("OK: tras leer, el próximo mensaje vuelve a disparar el correo");

    // --- Ajuste A2: conversación existente sin carga pendiente ---
    await prisma.cargaArchivo.update({ where: { id: pendienteB2 }, data: { estado: "APROBADA" } });
    const hiloRevisor = await obtenerHiloVentanaRevisor(
      { ventanaCargaId: ventana2, notificadorId: notificadorB },
      dependencias,
    );
    assert.ok(hiloRevisor.ok);
    assert.equal(hiloRevisor.hilo.cargaPendiente, null);
    assert.equal(hiloRevisor.hilo.cargaDestino?.id, pendienteB2, "Destino = carga del último mensaje");
    await esperar(5);
    const continuar = await enviarMensajeRevisorEnConversacion(
      { ventanaCargaId: ventana2, notificadorId: notificadorB, autorId: revisorA, contenido: "Un detalle más" },
      dependencias,
    );
    assert.ok(continuar.ok);
    assert.equal(continuar.mensaje.cargaArchivoId, pendienteB2);
    assert.deepEqual(
      await enviarMensajeRevisorEnConversacion(
        { ventanaCargaId: ventana2, notificadorId: notificadorA, autorId: revisorA, contenido: "x" },
        dependencias,
      ),
      { ok: false, motivo: "SIN_CONVERSACION" },
    );
    console.log("OK: conversación existente sin pendiente se asocia al último mensaje; sin conversación -> SIN_CONVERSACION");

    // Con carga pendiente en el par, la conversación existente se asocia a ella.
    const enPendiente = await enviarMensajeRevisorEnConversacion(
      { ventanaCargaId: ventana1, notificadorId: notificadorA, autorId: revisorB, contenido: "Sigue pendiente" },
      dependencias,
    );
    assert.ok(enPendiente.ok);
    assert.equal(enPendiente.mensaje.cargaArchivoId, nuevaA1);
    console.log("OK: con carga pendiente, la conversación existente se asocia a ella");

    // --- Aviso por correo (`avisarMensajeNuevo`), con el puerto y el destinatario inyectados ---
    const buscarDestinatario = async (id: string): Promise<DestinatarioAvisoMensaje | null> => {
      const usuario = await prismaUsuarioRepository.obtenerPorId(id);
      return usuario ? { nombres: usuario.nombres, email: usuario.email, activo: usuario.activo } : null;
    };
    const datosAviso = { notificadorId: notificadorA, formatoExcelNombre: `RF31-${marca}`, anio: 2026 };

    // ENVIADO: el puerto recibe solo destinatario, formato y año (nunca el contenido).
    const enviados: DatosCorreoAvisoMensajeNuevo[] = [];
    const mailerQueRegistra: EnviadorAvisoMensajeNuevo = {
      disponible: () => true,
      enviarAviso: async (datos) => {
        enviados.push(datos);
      },
    };
    assert.equal(await avisarMensajeNuevo(datosAviso, { enviador: mailerQueRegistra, buscarDestinatario }), "ENVIADO");
    assert.equal(enviados.length, 1);
    assert.deepEqual(Object.keys(enviados[0] ?? {}).sort(), ["anio", "destinatario", "formatoExcelNombre"]);
    assert.equal(enviados[0]?.destinatario.email, `${notificadorA}@example.invalid`);
    console.log("OK: aviso ENVIADO sin el contenido del mensaje");

    // OMITIDO: correo no disponible (ni siquiera busca al destinatario ni llama al envío).
    let busquedas = 0;
    const mailerNoDisponible: EnviadorAvisoMensajeNuevo = {
      disponible: () => false,
      enviarAviso: async () => assert.fail("No debe enviar si el correo no está disponible"),
    };
    assert.equal(
      await avisarMensajeNuevo(datosAviso, {
        enviador: mailerNoDisponible,
        buscarDestinatario: async (id) => {
          busquedas++;
          return buscarDestinatario(id);
        },
      }),
      "OMITIDO",
    );
    assert.equal(busquedas, 0);

    // OMITIDO: cuenta inactiva o inexistente.
    const mailerQueNoDebeLlamarse: EnviadorAvisoMensajeNuevo = {
      disponible: () => true,
      enviarAviso: async () => assert.fail("No debe enviar a una cuenta inactiva o inexistente"),
    };
    await prisma.usuario.update({ where: { id: notificadorA }, data: { activo: false } });
    assert.equal(
      await avisarMensajeNuevo(datosAviso, { enviador: mailerQueNoDebeLlamarse, buscarDestinatario }),
      "OMITIDO",
    );
    await prisma.usuario.update({ where: { id: notificadorA }, data: { activo: true } });
    assert.equal(
      await avisarMensajeNuevo(
        { ...datosAviso, notificadorId: randomUUID() },
        { enviador: mailerQueNoDebeLlamarse, buscarDestinatario },
      ),
      "OMITIDO",
    );
    console.log("OK: aviso OMITIDO sin correo disponible, con cuenta inactiva o inexistente");

    // SMTP caído: el mensaje ya quedó guardado ANTES del aviso; el error se PROPAGA (el Route Handler
    // lo atrapa en el `.catch` de `after()` y lo registra) y el caso de uso no escribe nada.
    const mailerQueFalla: EnviadorAvisoMensajeNuevo = {
      disponible: () => true,
      enviarAviso: async () => {
        throw new Error("SMTP caído");
      },
    };
    const conFallo = await enviarMensajeRevisor(
      { cargaArchivoId: nuevaA1, autorId: revisorA, contenido: "Con SMTP caído" },
      dependencias,
    );
    assert.ok(conFallo.ok);
    const mensajesAntesDelAviso = await prisma.mensajeCarga.count({ where: { notificadorId: notificadorA } });
    await assert.rejects(
      avisarMensajeNuevo(
        { notificadorId: conFallo.carga.usuarioId, formatoExcelNombre: conFallo.carga.formatoExcelNombre, anio: conFallo.carga.anio },
        { enviador: mailerQueFalla, buscarDestinatario },
      ),
      /SMTP caído/,
    );
    const guardado = await prisma.mensajeCarga.findUnique({ where: { id: conFallo.mensaje.id }, select: { contenido: true } });
    assert.equal(guardado?.contenido, "Con SMTP caído", "El mensaje sigue guardado tras el fallo del SMTP");
    assert.equal(
      await prisma.mensajeCarga.count({ where: { notificadorId: notificadorA } }),
      mensajesAntesDelAviso,
      "El aviso fallido no escribe ni borra nada",
    );
    console.log("OK: un fallo del SMTP se propaga al llamador y no afecta al mensaje ya guardado");

    // --- CHECK de coherencia de lado ---
    await assert.rejects(
      prisma.mensajeCarga.create({
        data: {
          cargaArchivoId: nuevaA1,
          ventanaCargaId: ventana1,
          notificadorId: notificadorA,
          autorId: revisorA,
          ladoAutor: "NOTIFICADOR",
          contenido: "suplantación",
        },
      }),
    );
    console.log("OK: el CHECK rechaza un mensaje NOTIFICADOR con autor distinto del notificador");

    // --- RF-25: una cuenta con mensajes solo puede desactivarse ---
    const dependenciasUsuarios = { repositorio: prismaUsuarioRepository };
    const eliminarRevisor = await eliminarUsuario(revisorB, admin, "ADMIN", dependenciasUsuarios);
    assert.ok(
      !eliminarRevisor.ok &&
        eliminarRevisor.motivo === "CON_HISTORIAL" &&
        eliminarRevisor.relacionesBloqueantes.includes("mensajesCargaEscritos"),
    );
    const eliminarNotificador = await eliminarUsuario(notificadorA, admin, "ADMIN", dependenciasUsuarios);
    assert.ok(
      !eliminarNotificador.ok &&
        eliminarNotificador.motivo === "CON_HISTORIAL" &&
        eliminarNotificador.relacionesBloqueantes.includes("mensajesCargaRecibidos"),
    );
    console.log("OK: eliminar una cuenta con mensajes -> CON_HISTORIAL");
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
