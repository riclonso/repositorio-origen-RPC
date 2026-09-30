import { z } from "zod";
import { normalizarNombre } from "@/shared/utils/texto";

const LARGO_MAXIMO_NOMBRE = 120;
export const NUMERO_REGION_MINIMO = 1;
export const NUMERO_REGION_MAXIMO = 99;

const MENSAJE_NUMERO = `Ingresa un número entero entre ${NUMERO_REGION_MINIMO} y ${NUMERO_REGION_MAXIMO}`;

// Esquema único de alta y edición, compartido por el Route Handler y el formulario. Aquí solo se
// valida la FORMA; la unicidad la comprueba el caso de uso contra el repositorio.
//
// `numero` es estrictamente numérico (sin `z.coerce`): la API recibe JSON y el formulario convierte
// su texto antes de validar (ver `aNumeroRegion`), de modo que `true` o `"5"` no pasan como número.
export const regionSchema = z.object({
  nombre: z
    .string({ error: "Ingresa el nombre de la región" })
    .trim()
    .min(1, "Ingresa el nombre de la región")
    .max(LARGO_MAXIMO_NOMBRE, "El nombre no puede superar los 120 caracteres"),
  // CHAR(2): exactamente dos dígitos con cero a la izquierda. No se rellena "8" a "08" en
  // silencio: se exige el valor completo.
  codigo: z
    .string({ error: "Ingresa 2 dígitos, p. ej. 08" })
    .trim()
    .regex(/^\d{2}$/, "Ingresa 2 dígitos, p. ej. 08"),
  numero: z
    .number({ error: MENSAJE_NUMERO })
    .int(MENSAJE_NUMERO)
    .min(NUMERO_REGION_MINIMO, MENSAJE_NUMERO)
    .max(NUMERO_REGION_MAXIMO, MENSAJE_NUMERO),
});

export type RegionInput = z.infer<typeof regionSchema>;

// Convierte el texto del campo "Número" del formulario al valor que espera `regionSchema`. Un campo
// vacío o con algo distinto de dígitos ("1.5", "1e1", "0x10") produce `NaN`, que el esquema
// rechaza con su mensaje propio.
export function aNumeroRegion(texto: string): number {
  const recortado = texto.trim();
  return /^\d+$/.test(recortado) ? Number(recortado) : Number.NaN;
}

// Deriva la clave de unicidad desde el nombre. Vive junto al esquema para que servidor y
// aplicación deriven el normalizado de una sola forma.
export function derivarNombreNormalizado(nombre: string): string {
  return normalizarNombre(nombre);
}
