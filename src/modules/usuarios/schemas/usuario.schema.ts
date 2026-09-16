import { z } from "zod";
import { esRutValido, normalizarRut } from "@/shared/utils/rut";
import { codigoPerfilSchema } from "@/modules/perfiles/schemas/perfil.schema";
import {
  contrasenaSchema,
  emailSchema,
  MENSAJE_CONFIRMACION_CONTRASENA,
} from "@/shared/schemas/contrasena.schema";

// La regla de email vive en `shared/schemas/` porque también la usan `modules/auth/`
// (recuperación) y los componentes de `shared/components/`. Se re-exporta aquí para no cambiar
// los imports existentes del mantenedor. Al CREAR no se pide contraseña (la cuenta nace pendiente
// y la persona la fija por el enlace); el fijado MANUAL por el administrador —opción alternativa
// al enlace— sí valida la contraseña con `restablecerContrasenaSchema` (abajo).
export { emailSchema } from "@/shared/schemas/contrasena.schema";

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

// Sin contraseña: al crear, la cuenta queda pendiente de activación y la persona fija su
// contraseña con el enlace de un solo uso que recibe por correo.
export const crearUsuarioSchema = usuarioSchema.extend({
  perfilCodigo: codigoPerfilSchema,
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

// El formulario de alta ya no pide contraseña, así que su esquema de formulario coincide con el
// de creación: no hay confirmación de contraseña que validar en el cliente.
export const crearUsuarioFormSchema = crearUsuarioSchema;

// Fijado MANUAL de la contraseña por el administrador (opción alternativa al envío de enlace).
// Al servidor solo viaja la contraseña definitiva; la confirmación se valida en el cliente.
export const restablecerContrasenaSchema = z.object({
  contrasena: contrasenaSchema,
});

export type RestablecerContrasenaInput = z.infer<typeof restablecerContrasenaSchema>;

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
