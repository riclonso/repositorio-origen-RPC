// RF-38: limitador de concurrencia generalizado y `ejecutarMientrasFluye`: el turno se
// ocupa mientras se CONSUME el flujo y se libera al terminar, al fallar o cuando el cliente lo
// cancela; si la creación del flujo lanza, el turno se libera y el error se propaga.
//
//   npx tsx tests/limitador-concurrencia.unit.ts
import assert from "node:assert/strict";
import {
  ClaveOcupadaError,
  LimitadorOcupadoError,
  crearExclusionPorClave,
  crearLimitadorConcurrencia,
  ejecutarMientrasFluye,
} from "../src/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";

// El decorador del generador importa el logger (y este `env.ts`): valores ficticios, `import()` tardío.
process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";

let fallos = 0;
let ejecutadas = 0;

async function prueba(nombre: string, cuerpo: () => void | Promise<void>): Promise<void> {
  ejecutadas += 1;
  try {
    await cuerpo();
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`FALLA ${nombre}`);
    console.error(error);
  }
}

function flujoDeTrozos(cantidad: number): ReadableStream<Uint8Array> {
  let emitidos = 0;
  return new ReadableStream({
    pull(controlador) {
      if (emitidos >= cantidad) {
        controlador.close();
        return;
      }
      emitidos += 1;
      controlador.enqueue(new Uint8Array([emitidos]));
    },
  });
}

// ¿Se puede obtener un turno de inmediato?
async function hayTurnoLibre(limitador: ReturnType<typeof crearLimitadorConcurrencia>): Promise<boolean> {
  let obtenido = false;
  const tarea = limitador.ejecutar(async () => {
    obtenido = true;
  });
  await new Promise((resolver) => setTimeout(resolver, 20));
  const libre = obtenido;
  await tarea;
  return libre;
}

async function main(): Promise<void> {
  await prueba("el turno se mantiene mientras el flujo no se consume y se libera al terminarlo", async () => {
    const limitador = crearLimitadorConcurrencia(1);
    const flujo = await ejecutarMientrasFluye(limitador, async () => flujoDeTrozos(3));

    const ocupado = limitador.ejecutar(async () => "segunda");
    let terminoSegunda = false;
    void ocupado.then(() => {
      terminoSegunda = true;
    });
    await new Promise((resolver) => setTimeout(resolver, 20));
    assert.equal(terminoSegunda, false, "la segunda tarea espera mientras el flujo sigue abierto");

    assert.equal((await new Response(flujo).arrayBuffer()).byteLength, 3);
    assert.equal(await ocupado, "segunda");
  });

  await prueba("cancelar el flujo (cliente que cierra la descarga) libera el turno", async () => {
    const limitador = crearLimitadorConcurrencia(1);
    const flujo = await ejecutarMientrasFluye(limitador, async () => flujoDeTrozos(1000));
    const lector = flujo.getReader();
    await lector.read();
    await lector.cancel();
    assert.equal(await hayTurnoLibre(limitador), true);
  });

  await prueba("si crear el flujo lanza, el error se propaga y el turno queda libre", async () => {
    const limitador = crearLimitadorConcurrencia(1);
    await assert.rejects(
      () =>
        ejecutarMientrasFluye(limitador, async () => {
          throw new Error("no se pudo abrir");
        }),
      /no se pudo abrir/,
    );
    assert.equal(await hayTurnoLibre(limitador), true);
  });

  await prueba("un flujo que falla a mitad libera el turno", async () => {
    const limitador = crearLimitadorConcurrencia(1);
    const flujo = await ejecutarMientrasFluye(
      limitador,
      async () =>
        new ReadableStream<Uint8Array>({
          pull(controlador) {
            controlador.error(new Error("roto"));
          },
        }),
    );
    await assert.rejects(() => new Response(flujo).arrayBuffer());
    assert.equal(await hayTurnoLibre(limitador), true);
  });

  await prueba("espera máxima: quien no obtiene turno a tiempo se rechaza y sale de la cola", async () => {
    const limitador = crearLimitadorConcurrencia(1);
    let soltarPrimera: () => void = () => undefined;
    const primera = limitador.ejecutar(() => new Promise<void>((resolver) => (soltarPrimera = resolver)));

    let ejecutoLaQueExpiro = false;
    await assert.rejects(
      () =>
        limitador.ejecutar(
          async () => {
            ejecutoLaQueExpiro = true;
          },
          { esperaMaximaMs: 30 },
        ),
      (error: unknown) => error instanceof LimitadorOcupadoError,
    );

    soltarPrimera();
    await primera;
    // El turno liberado no quedó consumido por la que abandonó la espera.
    assert.equal(await hayTurnoLibre(limitador), true);
    assert.equal(ejecutoLaQueExpiro, false);
  });

  await prueba("espera máxima: con turno a tiempo, la tarea corre normalmente", async () => {
    const limitador = crearLimitadorConcurrencia(1);
    const primera = limitador.ejecutar(() => new Promise<void>((resolver) => setTimeout(resolver, 20)));
    assert.equal(await limitador.ejecutar(async () => "segunda", { esperaMaximaMs: 1_000 }), "segunda");
    await primera;
  });

  await prueba("exclusión por clave: una a la vez por clave, independiente entre claves, liberación idempotente", () => {
    const exclusion = crearExclusionPorClave();
    const liberarA = exclusion.adquirir("usuario-a");
    assert.throws(() => exclusion.adquirir("usuario-a"), (error: unknown) => error instanceof ClaveOcupadaError);
    const liberarB = exclusion.adquirir("usuario-b");
    liberarA();
    liberarA();
    exclusion.adquirir("usuario-a")();
    liberarB();
  });

  await prueba("descargas generadas: una por usuario mientras fluye; la espera vencida libera al usuario", async () => {
    const { conLimitadorDescargas } = await import(
      "../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs"
    );
    const limitador = crearLimitadorConcurrencia(1);
    const generador = conLimitadorDescargas(
      { generar: async () => ({ flujo: flujoDeTrozos(2), tipoContenido: "x" }) },
      limitador,
      { esperaMaximaMs: 30 },
    );
    const entrada = { fuente: { referencia: "r" }, tipoContenido: "x", fechaNotificacion: new Date() };

    const primera = await generador.generar({ ...entrada, solicitanteId: "u1" });
    await assert.rejects(() => generador.generar({ ...entrada, solicitanteId: "u1" }), (error: unknown) => error instanceof ClaveOcupadaError);
    // Otro usuario no tiene turno (máximo 1) y su espera vence: 503 aguas arriba.
    await assert.rejects(() => generador.generar({ ...entrada, solicitanteId: "u2" }), (error: unknown) => error instanceof LimitadorOcupadoError);

    await new Response(primera.flujo).arrayBuffer();
    // Terminado el flujo, ambos pueden volver a descargar (u2 ya no quedó bloqueado por su espera vencida).
    const otra = await generador.generar({ ...entrada, solicitanteId: "u2" });
    await new Response(otra.flujo).arrayBuffer();
    const deNuevo = await generador.generar({ ...entrada, solicitanteId: "u1" });
    await deNuevo.flujo.cancel();
    assert.equal(await hayTurnoLibre(limitador), true);
  });

  console.log(`\n${ejecutadas - fallos}/${ejecutadas} pruebas OK`);
  if (fallos > 0) process.exitCode = 1;
}

void main();
