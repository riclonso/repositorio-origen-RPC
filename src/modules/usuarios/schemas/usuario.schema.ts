import { z } from "zod";
import { esRutValido, normalizarRut } from "@/shared/utils/rut";

// Texto único para las reglas de complejidad: el proyecto muestra solo `issues[0].message`,
// así que separar los mensajes obligaría al operador a corregir la contraseña a cuentagotas.
export const MENSAJE_COMPLEJIDAD_CONTRASENA =
  "La contraseña debe tener al menos 8 caracteres e incluir una mayúscula, una minúscula y un número.";

const MENSAJE_TOPE_CONTRASENA = "La contraseña es demasiado larga. Usa menos caracteres, sobre todo si incluye tildes o eñes.";
const MENSAJE_CONFIRMACION_CONTRASENA = "Las contraseñas no coinciden.";

const LARGO_MINIMO_CONTRASENA = 8;
// bcrypt trunca en 72 BYTES, no en 72 caracteres: con tildes o eñes 72 caracteres los superan
// y el resto se descartaría en silencio.
const MAXIMO_BYTES_CONTRASENA = 72;

const codificadorUtf8 = new TextEncoder();

function cumpleComplejidad(contrasena: string): boolean {
  return (
    contrasena.length >= LARGO_MINIMO_CONTRASENA &&
    /[a-z]/.test(contrasena) &&
    /[A-Z]/.test(contrasena) &&
    /\d/.test(contrasena)
  );
}

// Sin `.trim()`: recortar espacios alteraría la contraseña que el operador realmente tecleó.
export const contrasenaSchema = z
  .string()
  .refine(cumpleComplejidad, MENSAJE_COMPLEJIDAD_CONTRASENA)
  .refine(
    (contrasena) => codificadorUtf8.encode(contrasena).length <= MAXIMO_BYTES_CONTRASENA,
    MENSAJE_TOPE_CONTRASENA,
  );

export const rolSchema = z.enum(["ADMIN", "USUARIO"]);

// El UNIQUE de PostgreSQL distingue mayúsculas, así que el email se normaliza siempre
// (creación y edición) para que "A@x.cl" y "a@x.cl" no convivan como cuentas distintas.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Ingresa un email válido"));

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
  rol: rolSchema,
  contrasena: contrasenaSchema,
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

// El RUT y el username no se editan: el RUT es la credencial de acceso.
export const editarUsuarioSchema = z.object({
  nombres: z.string().trim().min(1, "Ingresa el nombre"),
  apellidos: z.string().trim().min(1, "Ingresa el apellido"),
  email: emailSchema,
  rol: rolSchema,
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
