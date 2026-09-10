import { z } from "zod";

const MENSAJE_PUERTO_SMTP = "SMTP_PORT debe ser un número entero entre 1 y 65535";

// `z.coerce.number()` con `.default()` no sirve aquí: `coerce` convierte `undefined` en `NaN`
// antes de que el default entre en juego. El default se aplica sobre el string y recién
// entonces se convierte. Un valor no numérico produce `NaN`, que `z.number()` rechaza.
const puertoSmtpSchema = z
  .string()
  .optional()
  .default("587")
  .transform((valor) => Number(valor))
  .pipe(
    z
      .number({ error: MENSAJE_PUERTO_SMTP })
      .int(MENSAJE_PUERTO_SMTP)
      .min(1, MENSAJE_PUERTO_SMTP)
      .max(65535, MENSAJE_PUERTO_SMTP),
  );

const booleanoSchema = z.enum(["true", "false"]);

// El grupo SMTP completo es OPCIONAL: sin él la aplicación arranca y opera normalmente, solo
// queda desactivado el autoservicio de recuperación de contraseña. Declararlo obligatorio
// repetiría la falla ya documentada en docs/resumen-tecnico.md, porque `next build` evalúa los
// Route Handlers, esos importan este módulo y este hace `parse()` al importarse: una variable
// obligatoria ausente en el servidor de compilación rompe el build entero. Además, el servidor
// de build no tiene ninguna razón para conocer la contraseña de una casilla institucional.
const schema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL no está definida"),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET debe tener al menos 32 caracteres"),
    TRUST_PROXY: booleanoSchema.optional(),
    APP_URL: z.url("APP_URL debe ser una URL absoluta válida").optional(),
    SMTP_HOST: z.string().min(1, "SMTP_HOST no puede estar vacía").optional(),
    SMTP_PORT: puertoSmtpSchema,
    SMTP_SECURE: booleanoSchema.optional(),
    SMTP_USER: z.string().min(1, "SMTP_USER no puede estar vacía").optional(),
    SMTP_PASSWORD: z.string().min(1, "SMTP_PASSWORD no puede estar vacía").optional(),
    SMTP_FROM: z.string().min(1, "SMTP_FROM no puede estar vacía").optional(),
    SMTP_REJECT_UNAUTHORIZED: booleanoSchema.optional(),
  })
  // Validación de todo o nada: el peor escenario posible es una configuración a medias que
  // arranca sin quejarse y falla en cada envío. Con esto, o el grupo está completo o no está,
  // y el error aparece en el arranque con un mensaje explícito.
  .superRefine((valores, contexto) => {
    if (valores.SMTP_HOST) {
      if (!valores.SMTP_FROM) {
        contexto.addIssue({
          code: "custom",
          path: ["SMTP_FROM"],
          message: "SMTP_FROM es obligatoria cuando se define SMTP_HOST",
        });
      }

      if (!valores.APP_URL) {
        contexto.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "APP_URL es obligatoria cuando se define SMTP_HOST",
        });
      }
    }

    if (Boolean(valores.SMTP_USER) !== Boolean(valores.SMTP_PASSWORD)) {
      contexto.addIssue({
        code: "custom",
        path: ["SMTP_PASSWORD"],
        message: "SMTP_USER y SMTP_PASSWORD deben definirse juntas o no definirse",
      });
    }
  });

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  TRUST_PROXY: process.env.TRUST_PROXY,
  APP_URL: process.env.APP_URL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM: process.env.SMTP_FROM,
  SMTP_REJECT_UNAUTHORIZED: process.env.SMTP_REJECT_UNAUTHORIZED,
});

export type ConfigSmtp = {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario?: string;
  contrasena?: string;
  remitente: string;
  rechazarNoAutorizado: boolean;
  // `APP_URL` ya normalizada, sin barra final. El enlace del correo se construye SIEMPRE
  // desde aquí y JAMÁS desde la cabecera `Host` de la petición: derivarlo del request es el
  // vector clásico de host header poisoning.
  urlBase: string;
};

const PUERTO_TLS_IMPLICITO = 465;

function sinBarraFinal(url: string): string {
  return url.replace(/\/+$/, "");
}

// Único punto donde se decide si el sistema puede enviar correo. El `superRefine` de arriba
// garantiza que si hay host, hay también remitente y URL base, así que aquí no hay que
// revalidar nada.
function construirConfigSmtp(): ConfigSmtp | null {
  if (!env.SMTP_HOST || !env.SMTP_FROM || !env.APP_URL) {
    return null;
  }

  return {
    host: env.SMTP_HOST,
    puerto: env.SMTP_PORT,
    seguro: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : env.SMTP_PORT === PUERTO_TLS_IMPLICITO,
    ...(env.SMTP_USER ? { usuario: env.SMTP_USER } : {}),
    ...(env.SMTP_PASSWORD ? { contrasena: env.SMTP_PASSWORD } : {}),
    remitente: env.SMTP_FROM,
    rechazarNoAutorizado: env.SMTP_REJECT_UNAUTHORIZED !== "false",
    urlBase: sinBarraFinal(env.APP_URL),
  };
}

export const configSmtp: ConfigSmtp | null = construirConfigSmtp();

// Nombres de las variables que faltan para poder enviar correo. Está vacío exactamente cuando
// `configSmtp` no es `null`. Solo nombres, nunca valores: se registra en `errores.txt` para que
// quien lea el log sepa qué definir, sin filtrar ningún secreto.
export function variablesSmtpFaltantes(): string[] {
  const requeridas: ReadonlyArray<readonly [string, string | undefined]> = [
    ["SMTP_HOST", env.SMTP_HOST],
    ["SMTP_FROM", env.SMTP_FROM],
    ["APP_URL", env.APP_URL],
  ];

  return requeridas.filter(([, valor]) => !valor).map(([nombre]) => nombre);
}
