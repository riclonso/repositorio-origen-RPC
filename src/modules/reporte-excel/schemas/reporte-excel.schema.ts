import { z } from "zod";
import { ESTADOS_CARGA_ARCHIVO } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { anioVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";

// El archivo en sí NO se valida con Zod (viaje binario dentro de un `multipart/form-data`): se
// valida fuera, en el Route Handler, igual que `formatos-excel/route.ts` (extensión, tamaño y
// firma real de bytes).
export const subirCargaArchivoSchema = z.object({
  formatoExcelId: z.uuid("Selecciona un formato de archivo válido"),
  // RF-15: año de la ventana de carga elegida por el notificador. Reutiliza el mismo rango que
  // `ventanas-carga` (evita que ambos esquemas diverjan con el tiempo). Solo valida la FORMA
  // (entero razonable); que exista una ventana ABIERTA para ese año se revalida siempre en
  // `ValidarYCargarArchivo`, nunca se confía en lo que el cliente declara.
  anio: anioVentanaCargaSchema,
});
export type SubirCargaArchivoInput = z.infer<typeof subirCargaArchivoSchema>;

const PAGINA_POR_DEFECTO = 1;
const PAGINA_MAXIMA = 10_000;
const TAMANOS_PERMITIDOS = [25, 50, 100] as const;
const TAMANO_POR_DEFECTO = 25;

const CLAVES_FILTRO = ["page", "pageSize", "estado", "formatoExcelId"] as const;

// Mismo criterio que `listado-usuarios.schema.ts`: aplana `string | string[] | undefined` a
// `string | undefined` antes de validar, para que el mismo esquema sirva tanto a un Route
// Handler (URLSearchParams) como a una página RSC (`searchParams`).
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

export const listadoCargasSchema = z.preprocess(
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
    // Solo se valida la FORMA del código: un estado bien formado pero sin coincidencias
    // devuelve una lista vacía, no un 400, mismo criterio que `perfil` en `listado-usuarios`.
    estado: z.enum(ESTADOS_CARGA_ARCHIVO).optional(),
    formatoExcelId: z.uuid().optional(),
  }),
);
export type ListadoCargasInput = z.infer<typeof listadoCargasSchema>;

// Filtro por defecto: lo usa la página RSC cuando la URL viene editada a mano y no valida.
export const FILTRO_LISTADO_CARGAS_POR_DEFECTO = {
  page: PAGINA_POR_DEFECTO,
  pageSize: TAMANO_POR_DEFECTO,
} as const;
