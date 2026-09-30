import { z } from "zod";
import { normalizarNombre } from "@/shared/utils/texto";

const LARGO_MAXIMO_NOMBRE = 120;
const MENSAJE_CODIGO = "Ingresa 3 dígitos, p. ej. 081";
const MENSAJE_REGION = "Selecciona una región";

// Esquema único de alta y edición, compartido por el Route Handler y el formulario. Aquí solo se
// valida la FORMA; la existencia de la región, el prefijo del código y la unicidad los comprueba
// el caso de uso contra los repositorios.
export const provinciaSchema = z.object({
  nombre: z
    .string({ error: "Ingresa el nombre de la provincia" })
    .trim()
    .min(1, "Ingresa el nombre de la provincia")
    .max(LARGO_MAXIMO_NOMBRE, "El nombre no puede superar los 120 caracteres"),
  // CHAR(3): exactamente tres dígitos. No se rellena "81" a "081" en silencio: se exige el valor
  // completo.
  codigo: z.string({ error: MENSAJE_CODIGO }).trim().regex(/^\d{3}$/, MENSAJE_CODIGO),
  regionId: z.uuid({ error: MENSAJE_REGION }),
});

export type ProvinciaInput = z.infer<typeof provinciaSchema>;

// Filtro del listado (`GET /api/provincias?regionId=`). Un `regionId` malformado es un 400 en la
// API; la página, en cambio, lo ignora.
export const filtroProvinciasSchema = z.object({
  regionId: z.uuid().optional(),
});

// Deriva la clave de unicidad desde el nombre. Vive junto al esquema para que servidor y
// aplicación deriven el normalizado de una sola forma.
export function derivarNombreNormalizado(nombre: string): string {
  return normalizarNombre(nombre);
}
