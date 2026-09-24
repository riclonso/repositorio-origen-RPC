import { z } from "zod";
import {
  ESTADOS_SOLICITUD_REEMPLAZO_CARGA,
  LONGITUD_MAXIMA_COMENTARIO_REVISION,
  LONGITUD_MAXIMA_MOTIVO,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

export const solicitarReemplazoSchema = z.object({
  cargaArchivoId: z.uuid("Selecciona una carga válida"),
  motivo: z
    .string()
    .trim()
    .min(1, "Ingresa el motivo del reemplazo")
    .max(LONGITUD_MAXIMA_MOTIVO, `El motivo no puede superar los ${LONGITUD_MAXIMA_MOTIVO} caracteres`),
});
export type SolicitarReemplazoInput = z.infer<typeof solicitarReemplazoSchema>;

export const revisarSolicitudReemplazoSchema = z.object({
  decision: z.enum(["APROBAR", "RECHAZAR"], "Selecciona una decisión válida"),
  comentario: z
    .string()
    .trim()
    .max(LONGITUD_MAXIMA_COMENTARIO_REVISION, `El comentario no puede superar los ${LONGITUD_MAXIMA_COMENTARIO_REVISION} caracteres`)
    .optional(),
});
export type RevisarSolicitudReemplazoInput = z.infer<typeof revisarSolicitudReemplazoSchema>;

const PAGINA_POR_DEFECTO = 1;
const PAGINA_MAXIMA = 10_000;
const TAMANOS_PERMITIDOS = [25, 50, 100] as const;
const TAMANO_POR_DEFECTO = 25;

const CLAVES_FILTRO = ["page", "pageSize", "estado"] as const;

// Mismo criterio que `listadoCargasSchema`/`listado-usuarios.schema.ts`: aplana
// `string | string[] | undefined` a `string | undefined` antes de validar, para que el mismo
// esquema sirva tanto a un Route Handler (URLSearchParams) como a una página RSC (`searchParams`).
function aplanarParametros(entrada: unknown): Record<string, string | undefined> {
  if (typeof entrada !== "object" || entrada === null) {
    return {};
  }

  const origen = entrada as Record<string, unknown>;
  const aplanado: Record<string, string | undefined> = {};

  for (const clave of CLAVES_FILTRO) {
    const valor = Array.isArray(origen[clave]) ? origen[clave][0] : origen[clave];
    aplanado[clave] = typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
  }

  return aplanado;
}

export const listadoSolicitudesReemplazoSchema = z.preprocess(
  aplanarParametros,
  z.object({
    page: z.coerce.number().int().min(1).max(PAGINA_MAXIMA).default(PAGINA_POR_DEFECTO),
    pageSize: z.coerce
      .number()
      .int()
      .refine((valor): valor is (typeof TAMANOS_PERMITIDOS)[number] =>
        TAMANOS_PERMITIDOS.includes(valor as (typeof TAMANOS_PERMITIDOS)[number]),
      )
      .default(TAMANO_POR_DEFECTO),
    // Solo PENDIENTE por defecto: es la bandeja de trabajo del revisor/admin. Se puede pedir
    // explícitamente APROBADA/RECHAZADA para ver el histórico.
    estado: z.enum(ESTADOS_SOLICITUD_REEMPLAZO_CARGA).default("PENDIENTE"),
  }),
);
export type ListadoSolicitudesReemplazoInput = z.infer<typeof listadoSolicitudesReemplazoSchema>;

export const FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO = {
  page: PAGINA_POR_DEFECTO,
  pageSize: TAMANO_POR_DEFECTO,
  estado: "PENDIENTE",
} as const;
