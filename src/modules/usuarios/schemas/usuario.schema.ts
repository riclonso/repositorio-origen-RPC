import { z } from "zod";
import { esRutValido, normalizarRut } from "@/shared/utils/rut";
import { codigoPerfilSchema } from "@/modules/perfiles/schemas/perfil.schema";
import { esPerfilNotificador } from "@/modules/perfiles/domain/entities/Perfil";
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

// Máximo razonable: nada impide que un notificador tenga varios formatos, pero un arreglo sin
// tope permitiría construir a mano un payload arbitrariamente grande contra la API.
const MAXIMO_FORMATOS_EXCEL = 50;

const formatosExcelIdsSchema = z
  .array(z.uuid())
  .max(MAXIMO_FORMATOS_EXCEL, `No puedes asignar más de ${MAXIMO_FORMATOS_EXCEL} formatos`)
  .refine((ids) => new Set(ids).size === ids.length, "No repitas el mismo formato")
  .default([]);

// Regla cruzada perfil/formatos, compartida entre alta y edición: solo NOTIFICADOR_RPC puede (y
// debe) tener formatos de archivo asignados. La existencia y vigencia de cada id se comprueba
// más adelante, en el caso de uso, contra el repositorio (mismo criterio que `perfilCodigo`).
function validarFormatosExcelSegunPerfil(
  datos: { perfilCodigo: string; formatosExcelIds: string[] },
  contexto: z.RefinementCtx,
): void {
  const esNotificador = esPerfilNotificador(datos.perfilCodigo);

  if (esNotificador && datos.formatosExcelIds.length === 0) {
    contexto.addIssue({
      code: "custom",
      path: ["formatosExcelIds"],
      message: "Selecciona al menos un formato de archivo para este perfil",
    });
  }

  if (!esNotificador && datos.formatosExcelIds.length > 0) {
    contexto.addIssue({
      code: "custom",
      path: ["formatosExcelIds"],
      message: "Solo el perfil Notificador RPC puede tener formatos de archivo asignados",
    });
  }
}

// Objeto "plano" (sin `superRefine`), para poder seguir usando `.extend()` en
// `crearUsuarioFormSchema` (Zod no permite `.extend()` sobre el resultado de `.superRefine()`).
const crearUsuarioObjectSchema = usuarioSchema.extend({
  perfilCodigo: codigoPerfilSchema,
  contrasena: contrasenaSchema,
  formatosExcelIds: formatosExcelIdsSchema,
});

export const crearUsuarioSchema = crearUsuarioObjectSchema.superRefine(validarFormatosExcelSegunPerfil);

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

// El RUT y el username no se editan: el RUT es la credencial de acceso.
export const editarUsuarioSchema = z
  .object({
    nombres: z.string().trim().min(1, "Ingresa el nombre"),
    apellidos: z.string().trim().min(1, "Ingresa el apellido"),
    email: emailSchema,
    perfilCodigo: codigoPerfilSchema,
    formatosExcelIds: formatosExcelIdsSchema,
  })
  .superRefine(validarFormatosExcelSegunPerfil);

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

export const crearUsuarioFormSchema = crearUsuarioObjectSchema
  .extend({ confirmacionContrasena: z.string() })
  .superRefine((datos, contexto) => {
    validarFormatosExcelSegunPerfil(datos, contexto);

    if (datos.contrasena !== datos.confirmacionContrasena) {
      contexto.addIssue({
        code: "custom",
        path: ["confirmacionContrasena"],
        message: MENSAJE_CONFIRMACION_CONTRASENA,
      });
    }
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
