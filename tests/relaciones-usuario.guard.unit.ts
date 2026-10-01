// Prueba de guardia de RF-25 (eliminación física de usuarios). No necesita base de datos:
//
//   npx tsx tests/relaciones-usuario.guard.unit.ts
//
// Lee `prisma/schema.prisma`, extrae las relaciones INVERSAS del bloque `model Usuario` (campos cuyo
// tipo es otro modelo y que no declaran `fields:`, es decir, tablas que apuntan a `usuario`) y las
// compara con la clasificación de `relacionesHistorialUsuario.ts`. Falla si alguien agrega una
// relación hacia `Usuario` sin decidir si es historial (bloquea la eliminación) o descartable (cae
// en cascada), o si la clasificación nombra una relación que ya no existe.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RELACIONES_DESCARTABLES_USUARIO,
  RELACIONES_HISTORIAL_USUARIO,
} from "../src/modules/usuarios/infrastructure/repositories/relacionesHistorialUsuario";

const TIPOS_ESCALARES = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

function extraerBloqueModelo(schema: string, modelo: string): string {
  const inicio = schema.search(new RegExp(`^model ${modelo} \\{`, "m"));
  assert.notEqual(inicio, -1, `No se encontró model ${modelo} en schema.prisma`);
  const fin = schema.indexOf("\n}", inicio);
  assert.notEqual(fin, -1, `model ${modelo} sin cierre`);
  // Solo el cuerpo: sin la línea `model X {`, que de otro modo parecería un campo.
  return schema.slice(schema.indexOf("{", inicio) + 1, fin);
}

function extraerRelacionesInversas(bloque: string, enumeraciones: Set<string>): string[] {
  const relaciones: string[] = [];

  for (const linea of bloque.split(/\r?\n/)) {
    const sinComentario = linea.replace(/\/\/.*$/, "").trim();
    const coincidencia = /^(\w+)\s+([A-Z]\w*)(\[\]|\?)?(\s|$)/.exec(sinComentario);
    if (!coincidencia) continue;

    const [, campo, tipo] = coincidencia;
    if (TIPOS_ESCALARES.has(tipo) || enumeraciones.has(tipo)) continue;
    // Con `fields:` es una relación de ida (p. ej. `perfil`), no una tabla que apunta a usuario.
    if (sinComentario.includes("fields:")) continue;

    relaciones.push(campo);
  }

  return relaciones;
}

function main(): void {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const enumeraciones = new Set(
    Array.from(schema.matchAll(/^enum (\w+) \{/gm), (coincidencia) => coincidencia[1]),
  );

  const enSchema = extraerRelacionesInversas(extraerBloqueModelo(schema, "Usuario"), enumeraciones);
  const historial = RELACIONES_HISTORIAL_USUARIO.map((relacion) => relacion.nombre);
  const descartables = [...RELACIONES_DESCARTABLES_USUARIO];
  const clasificadas = [...historial, ...descartables];

  assert.equal(historial.length, 12, "Se esperaban 12 relaciones de historial");
  assert.equal(descartables.length, 2, "Se esperaban 2 relaciones descartables");
  assert.equal(new Set(clasificadas).size, clasificadas.length, "Una relación está clasificada dos veces");

  const sinClasificar = enSchema.filter((relacion) => !clasificadas.includes(relacion));
  const inexistentes = clasificadas.filter((relacion) => !enSchema.includes(relacion));

  assert.deepEqual(
    sinClasificar,
    [],
    `Relaciones de Usuario sin clasificar en relacionesHistorialUsuario.ts: ${sinClasificar.join(", ")}`,
  );
  assert.deepEqual(
    inexistentes,
    [],
    `Relaciones clasificadas que no existen en model Usuario: ${inexistentes.join(", ")}`,
  );

  console.log(
    `OK: ${enSchema.length} relaciones inversas de Usuario clasificadas (${historial.length} historial, ${descartables.length} descartables)`,
  );
}

main();
