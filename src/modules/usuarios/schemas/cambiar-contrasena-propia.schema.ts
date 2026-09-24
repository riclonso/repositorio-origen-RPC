import { z } from "zod";
import { contrasenaSchema, MENSAJE_CONFIRMACION_CONTRASENA } from "@/shared/schemas/contrasena.schema";

// Autoservicio (`PUT /api/cuenta/contrasena`): a diferencia de `restablecerContrasenaSchema`
// (fijado manual por un administrador para un tercero), aquí la propia persona debe probar que
// conoce la contraseña vigente. La confirmación de la nueva contraseña se valida solo en el
// cliente (`cambiarContrasenaPropiaFormSchema`, abajo), mismo criterio que
// `restablecerContrasenaFormSchema`: al servidor solo viaja la contraseña definitiva.
export const cambiarContrasenaPropiaSchema = z.object({
  contrasenaActual: z.string().min(1, "Ingresa tu contraseña actual"),
  contrasenaNueva: contrasenaSchema,
});

export type CambiarContrasenaPropiaInput = z.infer<typeof cambiarContrasenaPropiaSchema>;

export const cambiarContrasenaPropiaFormSchema = cambiarContrasenaPropiaSchema
  .extend({ confirmacionContrasena: z.string() })
  .refine((datos) => datos.contrasenaNueva === datos.confirmacionContrasena, {
    message: MENSAJE_CONFIRMACION_CONTRASENA,
    path: ["confirmacionContrasena"],
  });
