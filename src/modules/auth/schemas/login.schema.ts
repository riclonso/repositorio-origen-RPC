import { z } from "zod";
import { esRutValido, normalizarRut } from "@/shared/utils/rut";

export const loginSchema = z.object({
  rut: z
    .string()
    .trim()
    .min(1, "Ingresa tu RUT")
    .refine(esRutValido, "Ingresa un RUT válido")
    .transform(normalizarRut),
  contrasena: z.string().min(1, "Ingresa tu contraseña"),
});

export type LoginInput = z.infer<typeof loginSchema>;
