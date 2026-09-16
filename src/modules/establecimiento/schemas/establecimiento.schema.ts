import { z } from "zod";
import { esRutValido, normalizarRut } from "@/shared/utils/rut";

const LARGO_MAXIMO_NOMBRE = 160;
const LARGO_MAXIMO_DIRECCION = 200;

// El RUT de empresa se valida con dígito verificador y se guarda normalizado. `tipoId` es un
// uuid: la opción vacía del selector ("Selecciona un tipo") no calza y se rechaza, forzando una
// elección explícita. La existencia y vigencia del tipo la comprueba el caso de uso.
export const establecimientoSchema = z.object({
  rut: z
    .string()
    .trim()
    .refine(esRutValido, "Ingresa un RUT válido")
    .transform(normalizarRut),
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresa el nombre del establecimiento")
    .max(LARGO_MAXIMO_NOMBRE, "El nombre no puede superar los 160 caracteres"),
  direccion: z
    .string()
    .trim()
    .min(1, "Ingresa la dirección")
    .max(LARGO_MAXIMO_DIRECCION, "La dirección no puede superar los 200 caracteres"),
  tipoId: z.uuid("Selecciona un tipo de establecimiento"),
});

export type EstablecimientoInput = z.infer<typeof establecimientoSchema>;

// El alta y la edición validan lo mismo: el RUT es editable tras crear.
export const crearEstablecimientoSchema = establecimientoSchema;
export const editarEstablecimientoSchema = establecimientoSchema;

// El formulario valida lo mismo que el servidor.
export const establecimientoFormSchema = establecimientoSchema;

export const cambiarEstadoEstablecimientoSchema = z.object({
  activo: z.boolean(),
});

export type CambiarEstadoEstablecimientoInput = z.infer<
  typeof cambiarEstadoEstablecimientoSchema
>;
