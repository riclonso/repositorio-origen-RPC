import { z } from "zod";
import { esRutValido, normalizarRut } from "@/shared/utils/rut";
import { codigoPerfilSchema } from "@/modules/perfiles/schemas/perfil.schema";
import {
  contrasenaSchema,
  emailSchema,
  MENSAJE_CONFIRMACION_CONTRASENA,
} from "@/shared/schemas/contrasena.schema";

// Las reglas de contraseña y de email viven en `shared/schemas/` porque también las usan
// `modules/auth/` (recuperación) y los componentes de `shared/components/`. Se re-exportan aquí
// para no cambiar los imports existentes del mantenedor.
export {
  contrasenaSchema,
  emailSchema,
  REGLAS_CONTRASENA,
  MENSAJE_COMPLEJIDAD_CONTRASENA,
  MENSAJE_CONFIRMACION_CONTRASENA,
  MENSAJE_COINCIDENCIA_CONTRASENA,
} from "@/shared/schemas/contrasena.schema";

export const usuarioSchema = z.object({
  nombres: z.string().trim().min(1, "Ingresa el nombre"),
  apellidos: z.string().trim().min(1, "Ingresa el apellido"),
  rut: z
    .string()
    .trim()
    .refine(esRutValido, "Ingresa un RUT válido")
    .transform(normalizarRut),
  email: emailSchema,
});

export type UsuarioInput = z.infer<typeof usuarioSchema>;

export const crearUsuarioSchema = usuarioSchema.extend({
  perfilCodigo: codigoPerfilSchema,
  contrasena: contrasenaSchema,
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

// El RUT y el username no se editan: el RUT es la credencial de acceso.
export const editarUsuarioSchema = z.object({
  nombres: z.string().trim().min(1, "Ingresa el nombre"),
  apellidos: z.string().trim().min(1, "Ingresa el apellido"),
  email: emailSchema,
  perfilCodigo: codigoPerfilSchema,
});

export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;

export const cambiarEstadoSchema = z.object({
  activo: z.boolean(),
});

export type CambiarEstadoInput = z.infer<typeof cambiarEstadoSchema>;

export const restablecerContrasenaSchema = z.object({
  contrasena: contrasenaSchema,
});

export type RestablecerContrasenaInput = z.infer<typeof restablecerContrasenaSchema>;

// Esquemas de formulario: la confirmación se valida en el cliente y NO se envía al servidor.

export const crearUsuarioFormSchema = crearUsuarioSchema
  .extend({ confirmacionContrasena: z.string() })
  .refine((datos) => datos.contrasena === datos.confirmacionContrasena, {
    message: MENSAJE_CONFIRMACION_CONTRASENA,
    path: ["confirmacionContrasena"],
  });

export const restablecerContrasenaFormSchema = restablecerContrasenaSchema
  .extend({ confirmacionContrasena: z.string() })
  .refine((datos) => datos.contrasena === datos.confirmacionContrasena, {
    message: MENSAJE_CONFIRMACION_CONTRASENA,
    path: ["confirmacionContrasena"],
  });

// El username no se ingresa: siempre es el RUT normalizado de la persona
// (regla de negocio, ver CLAUDE.md). Derivarlo con esta función al crear un usuario.
export function derivarUsername(rut: string): string {
  return normalizarRut(rut);
}
