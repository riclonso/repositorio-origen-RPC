import { z } from "zod";
import {
  contrasenaSchema,
  emailSchema,
  MENSAJE_COMPLEJIDAD_CONTRASENA,
  MENSAJE_CONFIRMACION_CONTRASENA,
} from "@/shared/schemas/contrasena.schema";
import { LARGO_TOKEN_RECUPERACION } from "@/modules/auth/domain/entities/PasswordResetToken";

// Largo máximo de una dirección según RFC 5321: evita aceptar cuerpos arbitrariamente grandes
// en un endpoint público y anónimo.
const MAXIMO_LARGO_EMAIL = 254;

// Forma exacta de un token base64url de 32 bytes. Filtra basura antes de tocar la base de datos
// y antes de gastar un bcrypt. Un token que no la cumple recibe el mismo TOKEN_INVALIDO que
// cualquier otro rechazo: no se le regala al atacante la señal de que su formato era correcto.
export const FORMA_TOKEN_RECUPERACION = new RegExp(
  `^[A-Za-z0-9_-]{${LARGO_TOKEN_RECUPERACION}}$`,
);

const MENSAJE_EMAIL_INVALIDO = "Ingresa un email válido";

export const solicitarRecuperacionSchema = z.object({
  // El tope se comprueba antes de normalizar y parsear, para no procesar cuerpos enormes. Un
  // campo ausente o de otro tipo recibe el MISMO mensaje que un formato inválido: un endpoint
  // público y anónimo no devuelve la redacción interna de Zod ni explica en qué falló.
  email: z
    .string(MENSAJE_EMAIL_INVALIDO)
    .max(MAXIMO_LARGO_EMAIL, MENSAJE_EMAIL_INVALIDO)
    .pipe(emailSchema),
});

export type SolicitarRecuperacionInput = z.infer<typeof solicitarRecuperacionSchema>;

export const tokenRecuperacionSchema = z.string().regex(FORMA_TOKEN_RECUPERACION);

export const confirmarRecuperacionSchema = z.object({
  token: tokenRecuperacionSchema,
  // `z.string(mensaje)` solo cubre el caso "ausente o de otro tipo", para no filtrar la
  // redacción interna de Zod; las reglas de complejidad siguen siendo exactamente las
  // compartidas, sin duplicar ninguna.
  contrasena: z.string(MENSAJE_COMPLEJIDAD_CONTRASENA).pipe(contrasenaSchema),
});

export type ConfirmarRecuperacionInput = z.infer<typeof confirmarRecuperacionSchema>;

// Solo para el formulario: la confirmación se valida en el cliente y NO se envía al servidor.
// Espeja a `restablecerContrasenaFormSchema` del mantenedor.
export const confirmarRecuperacionFormSchema = z
  .object({
    contrasena: contrasenaSchema,
    confirmacionContrasena: z.string(),
  })
  .refine((datos) => datos.contrasena === datos.confirmacionContrasena, {
    message: MENSAJE_CONFIRMACION_CONTRASENA,
    path: ["confirmacionContrasena"],
  });
