import { z } from "zod";
import { normalizarNombre } from "@/shared/utils/texto";

const LARGO_MAXIMO_NOMBRE = 120;

// El nombre conserva su forma original (mayúsculas y tildes); el normalizado es derivado y solo
// se usa como clave de unicidad. La existencia del duplicado la comprueba el caso de uso contra
// el repositorio; aquí solo se valida la FORMA.
export const tipoEstablecimientoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresa el nombre del tipo")
    .max(LARGO_MAXIMO_NOMBRE, "El nombre no puede superar los 120 caracteres"),
});

export type TipoEstablecimientoInput = z.infer<typeof tipoEstablecimientoSchema>;

export const cambiarEstadoTipoSchema = z.object({
  activo: z.boolean(),
});

export type CambiarEstadoTipoInput = z.infer<typeof cambiarEstadoTipoSchema>;

// El formulario de alta y edición valida lo mismo que el servidor: un único nombre.
export const tipoEstablecimientoFormSchema = tipoEstablecimientoSchema;

// Deriva la clave de unicidad desde el nombre. Vive junto al esquema para que servidor y
// aplicación deriven el normalizado de una sola forma.
export function derivarNombreNormalizado(nombre: string): string {
  return normalizarNombre(nombre);
}
