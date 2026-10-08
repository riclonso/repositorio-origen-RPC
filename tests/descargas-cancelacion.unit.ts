// npx tsx --test tests/descargas-cancelacion.unit.ts
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { setTimeout as pausa } from "node:timers/promises";
import test from "node:test";
import {
  alTerminarFlujo,
  crearLimitadorConcurrencia,
} from "../src/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";
import { recorrerFilasPrimeraHojaXlsx } from "../src/infrastructure/hojas-calculo/leerHojaStreamingExcelJs";

process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";

function fuenteDetenida() {
  const lecturas: Readable[] = [];
  return {
    lecturas,
    fuenteZip: {
      size: async () => 8192,
      stream() {
        const lectura = new Readable({ read() {} });
        lecturas.push(lectura);
        return lectura;
      },
    },
  };
}

const entrada = {
  fuente: { referencia: "archivo.xlsx" },
  tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  fechaNotificacion: new Date("2026-10-08T19:00:00Z"),
  solicitanteId: "revisor",
};

test("abortar en cola retira la tarea sin consumir un turno posterior", { timeout: 2000 }, async () => {
  const limitador = crearLimitadorConcurrencia(1);
  let liberar!: () => void;
  const primera = limitador.ejecutar(() => new Promise<void>((resolver) => { liberar = resolver; }));
  await pausa(0);
  const control = new AbortController();
  let ejecutada = false;
  const esperando = limitador.ejecutar(async () => { ejecutada = true; }, { signal: control.signal });
  control.abort();
  await assert.rejects(esperando, { name: "AbortError" });
  liberar();
  await primera;
  assert.equal(await limitador.ejecutar(async () => "libre"), "libre");
  assert.equal(ejecutada, false);
});

test("abortar un read pendiente cancela el origen y finaliza una sola vez", { timeout: 2000 }, async () => {
  let cancelaciones = 0;
  let finales = 0;
  const control = new AbortController();
  const flujo = alTerminarFlujo(new ReadableStream({ cancel() { cancelaciones += 1; } }), () => { finales += 1; }, control.signal);
  const lector = flujo.getReader();
  const pendiente = lector.read();
  control.abort();
  await assert.rejects(pendiente, { name: "AbortError" });
  await pausa(0);
  assert.equal(cancelaciones, 1);
  assert.equal(finales, 1);
});

test("abortar el lector antes de la primera fila cierra las lecturas ZIP", { timeout: 2000 }, async () => {
  const fuente = fuenteDetenida();
  const control = new AbortController();
  const iterador = recorrerFilasPrimeraHojaXlsx({ fuenteZip: fuente.fuenteZip }, { signal: control.signal });
  const primera = iterador.next();
  await pausa(0);
  assert.ok(fuente.lecturas.length > 0);
  control.abort();
  await assert.rejects(primera);
  assert.ok(fuente.lecturas.every((lectura) => lectura.destroyed));
});

test("la respuesta empieza antes de leer la hoja y la desconexión permite reintentar", { timeout: 3000 }, async () => {
  const { conLimitadorDescargas, crearGeneradorDescargaCargaExcelJs } = await import("../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs");
  const fuente = fuenteDetenida();
  const generador = conLimitadorDescargas(crearGeneradorDescargaCargaExcelJs({
    rutaAbsoluta: () => "sin-uso",
    fuenteXlsx: async () => fuente.fuenteZip,
  }), crearLimitadorConcurrencia(1));
  const control = new AbortController();
  const primera = await generador.generar({ ...entrada, signal: control.signal });
  const lector = primera.flujo.getReader();
  const bytes = await lector.read();
  assert.ok(bytes.value && bytes.value.byteLength > 0, "envía bytes aunque la lectura de entrada no avanza");
  control.abort();
  await assert.rejects(lector.read(), { name: "AbortError" });
  await pausa(0);
  assert.ok(fuente.lecturas.every((lectura) => lectura.destroyed));
  const segunda = await generador.generar(entrada);
  await segunda.flujo.cancel();
  await pausa(0);
  assert.ok(fuente.lecturas.every((lectura) => lectura.destroyed));
});

test("el límite de inactividad corta lecturas y libera al usuario y el turno", { timeout: 3000 }, async () => {
  const { conLimitadorDescargas, crearGeneradorDescargaCargaExcelJs } = await import("../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs");
  const fuente = fuenteDetenida();
  const generador = conLimitadorDescargas(crearGeneradorDescargaCargaExcelJs({
    rutaAbsoluta: () => "sin-uso",
    fuenteXlsx: async () => fuente.fuenteZip,
  }), crearLimitadorConcurrencia(1), { inactividadMaximaMs: 40 });
  const primera = await generador.generar(entrada);
  await pausa(80);
  await assert.rejects(() => new Response(primera.flujo).arrayBuffer(), { name: "TimeoutError" });
  assert.ok(fuente.lecturas.every((lectura) => lectura.destroyed));
  const siguiente = await generador.generar(entrada);
  await siguiente.flujo.cancel();
});

test("una descarga que avanza puede durar más que el límite de inactividad", { timeout: 3000 }, async () => {
  const { conLimitadorDescargas } = await import("../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs");
  const generador = conLimitadorDescargas({
    async generar() {
      let emitidos = 0;
      return {
        tipoContenido: "application/octet-stream",
        flujo: new ReadableStream<Uint8Array>({
          async pull(controlador) {
            await pausa(20);
            if (emitidos === 10) controlador.close();
            else controlador.enqueue(new Uint8Array([emitidos++]));
          },
        }),
      };
    },
  }, crearLimitadorConcurrencia(1), { inactividadMaximaMs: 100 });
  const descarga = await generador.generar(entrada);
  assert.equal((await new Response(descarga.flujo).arrayBuffer()).byteLength, 10);
});

test("cancelar mientras se espera turno también libera la exclusión del usuario", { timeout: 3000 }, async () => {
  const { conLimitadorDescargas } = await import("../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs");
  const generador = conLimitadorDescargas({
    generar: async () => ({ tipoContenido: "x", flujo: new ReadableStream<Uint8Array>() }),
  }, crearLimitadorConcurrencia(1));
  const primera = await generador.generar({ ...entrada, solicitanteId: "otro-revisor" });
  const control = new AbortController();
  const enCola = generador.generar({ ...entrada, signal: control.signal });
  control.abort();
  await assert.rejects(enCola, { name: "AbortError" });
  await primera.flujo.cancel();
  const reintento = await generador.generar(entrada);
  await reintento.flujo.cancel();
});
