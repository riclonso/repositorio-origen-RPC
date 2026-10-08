import { z } from "zod";
import { nombreArchivoSubidaSinRutaSchema } from "@/shared/schemas/nombreArchivoSubida.schema";
export const TAMANO_PARTE = 50 * 1024 * 1024;
export const TAMANO_MAXIMO = 300 * 1024 * 1024;
export const inicioSubidaSchema = z.object({
  tamanoBytes: z.number().int().positive().max(TAMANO_MAXIMO),
  nombreArchivo: nombreArchivoSubidaSinRutaSchema,
});
export const idSubidaSchema = z.uuid();
export const indiceParteSchema = z.coerce.number().int().min(0).max(5);
export const manifiestoSchema = z.object({
  id: z.uuid(), usuarioId: z.string().min(1), cargaId: z.uuid(),
  origen: z.enum(["notificador", "bioestadistica"]),
  parametros: z.record(z.string(), z.string()), nombreArchivo: z.string(),
  tamanoBytes: z.number().int().positive().max(TAMANO_MAXIMO),
  actualizado: z.number(), estado: z.enum(["RECEPCION", "COMPLETANDO", "COMPLETADA"]),
  partes: z.array(z.object({ referencia: z.string(), sha256: z.string(), tamanoBytes: z.number() })),
  resultado: z.object({ estado: z.number(), cuerpo: z.unknown() }).optional(),
});
export type ManifiestoSubida = z.infer<typeof manifiestoSchema>;
