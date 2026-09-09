import { z } from "zod";
import { esRutValido, normalizarRut } from "@/shared/utils/rut";

export const usuarioSchema = z.object({
  nombres: z.string().trim().min(1, "Ingresa el nombre"),
  apellidos: z.string().trim().min(1, "Ingresa el apellido"),
  rut: z
    .string()
    .trim()
    .refine(esRutValido, "Ingresa un RUT válido")
    .transform(normalizarRut),
  email: z.string().trim().email("Ingresa un email válido"),
  username: z.string().trim().min(1, "Ingresa un nombre de usuario"),
});

export type UsuarioInput = z.infer<typeof usuarioSchema>;
