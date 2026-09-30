import { z } from "zod";
import { normalizarNombre } from "@/shared/utils/texto";

const LARGO_MAXIMO_NOMBRE = 120;
const MENSAJE_CODIGO = "Ingresa 5 dígitos, p. ej. 08101";
const MENSAJE_PROVINCIA = "Selecciona una provincia";

// Esquema único de alta y edición, compartido por el Route Handler y el formulario. Aquí solo se
// valida la FORMA; la existencia de la provincia, el prefijo del código y la unicidad los
// comprueba el caso de uso contra los repositorios.
export const comunaSchema = z.object({
  nombre: z
    .string({ error: "Ingresa el nombre de la comuna" })
    .trim()
    .min(1, "Ingresa el nombre de la comuna")
    .max(LARGO_MAXIMO_NOMBRE, "El nombre no puede superar los 120 caracteres"),
  // CHAR(5): exactamente cinco dígitos. No se rellena "8101" a "08101" en silencio: se exige el
  // valor completo.
  codigo: z.string({ error: MENSAJE_CODIGO }).trim().regex(/^\d{5}$/, MENSAJE_CODIGO),
  provinciaId: z.uuid({ error: MENSAJE_PROVINCIA }),
});

export type ComunaInput = z.infer<typeof comunaSchema>;

// Filtros del listado (`GET /api/comunas?regionId=&provinciaId=`), combinados con AND. Un id
// malformado es un 400 en la API; la página, en cambio, lo ignora.
export const filtroComunasSchema = z.object({
  regionId: z.uuid().optional(),
  provinciaId: z.uuid().optional(),
});

export type FiltroComunasInput = z.infer<typeof filtroComunasSchema>;

// Deriva la clave de unicidad desde el nombre. Vive junto al esquema para que servidor y
// aplicación deriven el normalizado de una sola forma.
export function derivarNombreNormalizado(nombre: string): string {
  return normalizarNombre(nombre);
}
