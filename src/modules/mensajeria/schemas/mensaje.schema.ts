import { z } from "zod";
import { LONGITUD_MAXIMA_MENSAJE } from "@/modules/mensajeria/domain/entities/MensajeCarga";

// Compartido entre el servidor (Route Handlers) y el cliente (`HiloMensajes.tsx`), para que ambas
// validaciones no diverjan. Normaliza CRLF a LF antes de medir y rechaza el carácter nulo, que
// PostgreSQL no acepta en columnas de texto y terminaría en un 500.
export const contenidoMensajeSchema = z
  .string()
  .transform((valor) => valor.replace(/\r\n?/g, "\n").trim())
  .pipe(
    z
      .string()
      .min(1, "Escribe un mensaje")
      .max(LONGITUD_MAXIMA_MENSAJE, `El mensaje no puede superar los ${LONGITUD_MAXIMA_MENSAJE} caracteres`)
      .refine((valor) => !valor.includes("\u0000"), "El mensaje contiene caracteres no permitidos"),
  );

// `POST /api/revisor/mensajes`: el revisor inicia (o escribe sobre) una carga pendiente concreta.
export const enviarMensajeRevisorSchema = z.object({
  cargaArchivoId: z.uuid("La carga indicada no es válida"),
  contenido: contenidoMensajeSchema,
});
export type EnviarMensajeRevisorInput = z.infer<typeof enviarMensajeRevisorSchema>;

// Continuar una conversación existente (revisor) o responder (notificador): el servidor resuelve
// a qué carga se asocia, el cliente solo envía el texto.
export const contenidoMensajeCuerpoSchema = z.object({
  contenido: contenidoMensajeSchema,
});
export type ContenidoMensajeCuerpoInput = z.infer<typeof contenidoMensajeCuerpoSchema>;

// Marca de lectura: solo los mensajes con `creadoEn <= hasta` (lo que el cliente realmente mostró).
export const marcarLecturaSchema = z.object({
  hasta: z.iso.datetime({ offset: true }).transform((valor) => new Date(valor)),
});
export type MarcarLecturaInput = z.infer<typeof marcarLecturaSchema>;
