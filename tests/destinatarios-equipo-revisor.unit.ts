// RF-44: regla única de destinatarios del equipo revisor (función pura, sin BD ni variables de
// entorno).
//
//   npx tsx tests/destinatarios-equipo-revisor.unit.ts
import assert from "node:assert/strict";
import {
  elegirDestinatariosEquipoRevisor,
  type RevisorActivo,
} from "../src/modules/usuarios/domain/entities/DestinatarioEquipoRevisor";

const revisores: RevisorActivo[] = [
  { id: "r1", nombres: "Ana María", apellidos: "Pérez", rut: "11111111-1", email: "ana@example.invalid" },
  { id: "r2", nombres: "Luis", apellidos: "Soto", rut: "22222222-2", email: "luis@example.invalid" },
];

// Con buzón compartido: UN destinatario, el buzón, aunque haya revisores activos.
const conBuzon = elegirDestinatariosEquipoRevisor("equipo@example.invalid", revisores);
assert.deepEqual(conBuzon, [{ tipo: "BUZON_COMPARTIDO", email: "equipo@example.invalid" }]);
console.log("OK: con buzón compartido -> un solo destinatario (el buzón)");

// Buzón vacío o solo espacios = ausente: un destinatario individual por revisor.
for (const buzonVacio of ["", "   ", null]) {
  const individuales = elegirDestinatariosEquipoRevisor(buzonVacio, revisores);
  assert.deepEqual(individuales, [
    { tipo: "REVISOR", revisorId: "r1", nombres: "Ana María", apellidos: "Pérez", rut: "11111111-1", email: "ana@example.invalid" },
    { tipo: "REVISOR", revisorId: "r2", nombres: "Luis", apellidos: "Soto", rut: "22222222-2", email: "luis@example.invalid" },
  ]);
}
console.log("OK: buzón vacío o ausente -> un destinatario individual por revisor activo");

// Sin buzón y sin revisores: nadie.
assert.deepEqual(elegirDestinatariosEquipoRevisor(null, []), []);
console.log("OK: sin buzón ni revisores -> sin destinatarios");

// Nunca mezcla el buzón con los revisores individuales.
for (const [buzon, lista] of [
  ["equipo@example.invalid", revisores],
  [null, revisores],
  ["equipo@example.invalid", []],
] as const) {
  const destinatarios = elegirDestinatariosEquipoRevisor(buzon, lista);
  const tipos = new Set(destinatarios.map((destinatario) => destinatario.tipo));
  assert.ok(tipos.size <= 1, "Nunca mezcla BUZON_COMPARTIDO con REVISOR");
}
console.log("OK: nunca mezcla el buzón con revisores individuales");

// El buzón se recorta: un valor con espacios alrededor no viaja tal cual al To.
assert.deepEqual(elegirDestinatariosEquipoRevisor("  equipo@example.invalid ", []), [
  { tipo: "BUZON_COMPARTIDO", email: "equipo@example.invalid" },
]);
console.log("OK: destinatarios del equipo revisor");
