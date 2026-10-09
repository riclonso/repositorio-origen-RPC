import assert from "node:assert/strict";
import test from "node:test";
import { listarNotificacionesRevision, paginarNotificaciones } from "../src/modules/notificaciones/application/ListarNotificacionesRevision";
import type { NotificacionRevision } from "../src/modules/notificaciones/domain/NotificacionRevision";

const avisos: NotificacionRevision[] = Array.from({ length: 9 }, (_, indice) => ({
  id: `${indice % 2 ? "archivo" : "reemplazo"}-${indice}`,
  nombre: `Notificador ${indice}`, accion: indice % 2 ? "ARCHIVO_ENVIADO" : "REEMPLAZO_SOLICITADO",
  leido: false, ventanaCargaId: `ventana-${indice}`, fecha: new Date(Date.UTC(2026, 9, 9, indice)).toISOString(),
}));
test("mezcla archivos y reemplazos por fecha y entrega cuatro avisos por página sin perder los restantes", () => {
  const primera = paginarNotificaciones(avisos, 1);
  const segunda = paginarNotificaciones(avisos, 2);
  const tercera = paginarNotificaciones(avisos, 3);
  assert.equal(primera.length, 4);
  assert.equal(segunda.length, 4);
  assert.equal(tercera.length, 1);
  assert.equal(primera[0].id, "reemplazo-8");
  assert.equal(primera[1].id, "archivo-7");
  assert.equal(primera[0].ventanaCargaId, "ventana-8");
  assert.equal(new Set([...primera, ...segunda, ...tercera].map(a => a.id)).size, 9);
  assert.equal(paginarNotificaciones([], 1).length, 0);
});
test("empates mantienen orden estable y entradas de página inválidas no consultan el repositorio", () => {
  const iguales = avisos.map(a => ({ ...a, fecha: avisos[0].fecha }));
  assert.deepEqual(paginarNotificaciones(iguales, 1), paginarNotificaciones([...iguales].reverse(), 1));
  const repositorio = { marcarLeida: async () => true, listar: async () => { throw new Error("No debe consultarse"); } };
  for (const pagina of [0, -1, NaN, 1.5, Infinity, 2501]) {
    assert.throws(() => listarNotificacionesRevision(pagina, "revisor", repositorio), /inválida/);
  }
});


test("la lectura descuenta una vez y conserva los avisos leídos cuando el contador llega a cero", async () => {
  const { registrarLecturaEnBandeja } = await import("../src/modules/notificaciones/application/RegistrarLecturaEnBandeja");
  const bandeja = { notificaciones: [avisos[0]], total: 1, noLeidas: 1 };
  const leida = registrarLecturaEnBandeja(bandeja, avisos[0]);
  assert.equal(leida.noLeidas, 0);
  assert.equal(leida.total, 1);
  assert.equal(leida.notificaciones[0].leido, true);
  assert.equal(bandeja.notificaciones[0].leido, false);
  assert.equal(registrarLecturaEnBandeja(leida, avisos[0]), leida);
});

test("una confirmación antigua no marca como leído otro envío del mismo archivo", async () => {
  const { registrarLecturaEnBandeja } = await import("../src/modules/notificaciones/application/RegistrarLecturaEnBandeja");
  const nuevoEnvio = { ...avisos[0], fecha: avisos[1].fecha };
  const bandeja = { notificaciones: [nuevoEnvio], total: 1, noLeidas: 1 };
  assert.equal(registrarLecturaEnBandeja(bandeja, avisos[0]), bandeja);
});
