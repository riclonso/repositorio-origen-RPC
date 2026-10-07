import { z } from "zod";
import {
  LONGITUD_MAXIMA_NOMBRE_ARCHIVO,
  extensionAdmitida,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import { TIPOS_ARCHIVO_BIOESTADISTICA } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import { LONGITUD_MAXIMA_MOTIVO } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { anioVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";

// RF-37. Compartidos entre los Route Handlers y la UI del área Bioestadística.

export const tipoArchivoBioestadisticaSchema = z.enum(TIPOS_ARCHIVO_BIOESTADISTICA, "Selecciona un tipo de archivo válido");

// Parámetros de la subida (`POST /api/bioestadistica/cargas?anio=…&tipoArchivo=…`): el cuerpo es el
// binario crudo, así que los datos viajan en la URL.
export const subirArchivoBioestadisticaSchema = z.object({
  anio: anioVentanaCargaSchema,
  tipoArchivo: tipoArchivoBioestadisticaSchema,
});

// Cabecera usada para el nombre original del archivo (el cuerpo es binario, no multipart).
export const CABECERA_NOMBRE_ARCHIVO = "x-nombre-archivo";

// Caracteres de control (incluidos saltos de línea): no tienen cabida en un nombre de archivo y
// podrían romper el `Content-Disposition` de la descarga.
function tieneCaracteresControl(texto: string): boolean {
  for (const caracter of texto) {
    const codigo = caracter.charCodeAt(0);
    if (codigo < 0x20 || codigo === 0x7f) return true;
  }
  return false;
}

// El cliente envía el nombre con `encodeURIComponent` (las cabeceras HTTP no admiten tildes). Se
// decodifica aquí; un valor mal codificado se trata como inválido.
export const nombreArchivoBioestadisticaSchema = z.preprocess(
  (valor) => {
    if (typeof valor !== "string") return valor;
    try {
      return decodeURIComponent(valor).trim();
    } catch {
      return "";
    }
  },
  z
    .string({ error: "Indica el nombre del archivo" })
    .min(1, "Indica el nombre del archivo")
    .max(LONGITUD_MAXIMA_NOMBRE_ARCHIVO, `El nombre del archivo no puede superar los ${LONGITUD_MAXIMA_NOMBRE_ARCHIVO} caracteres`)
    .refine((nombre) => !tieneCaracteresControl(nombre), "El nombre del archivo no es válido")
    .refine(extensionAdmitida, "El archivo debe tener extensión .xlsx o .csv"),
);

export const solicitarReemplazoBioestadisticaSchema = z.object({
  cargaBioestadisticaId: z.uuid("Selecciona un archivo válido"),
  motivo: z
    .string()
    .trim()
    .min(1, "Ingresa el motivo del reemplazo")
    .max(LONGITUD_MAXIMA_MOTIVO, `El motivo no puede superar los ${LONGITUD_MAXIMA_MOTIVO} caracteres`),
});

const PAGINA_POR_DEFECTO = 1;
const PAGINA_MAXIMA = 10_000;
const TAMANOS_PERMITIDOS = [25, 50, 100] as const;
const TAMANO_POR_DEFECTO = 25;
const CLAVES_FILTRO = ["anio", "tipoArchivo", "page", "pageSize"] as const;

// Mismo criterio que `listadoSolicitudesReemplazoSchema`: aplana `string | string[] | undefined`
// para que el esquema sirva a una página RSC (`searchParams`) y a un Route Handler.
function aplanarParametros(entrada: unknown): Record<string, string | undefined> {
  if (typeof entrada !== "object" || entrada === null) return {};

  const origen = entrada as Record<string, unknown>;
  const aplanado: Record<string, string | undefined> = {};

  for (const clave of CLAVES_FILTRO) {
    const valor = Array.isArray(origen[clave]) ? origen[clave][0] : origen[clave];
    aplanado[clave] = typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
  }

  return aplanado;
}

// Filtro del listado administrativo por año. `anio` es opcional en la URL: sin él, la página usa el
// año más reciente con archivos.
export const listadoCargasBioestadisticaSchema = z.preprocess(
  aplanarParametros,
  z.object({
    anio: anioVentanaCargaSchema.optional(),
    tipoArchivo: tipoArchivoBioestadisticaSchema.optional(),
    page: z.coerce.number().int().min(1).max(PAGINA_MAXIMA).default(PAGINA_POR_DEFECTO),
    pageSize: z.coerce
      .number()
      .int()
      .refine((valor): valor is (typeof TAMANOS_PERMITIDOS)[number] =>
        TAMANOS_PERMITIDOS.includes(valor as (typeof TAMANOS_PERMITIDOS)[number]),
      )
      .default(TAMANO_POR_DEFECTO),
  }),
);
export type ListadoCargasBioestadisticaInput = z.infer<typeof listadoCargasBioestadisticaSchema>;

export const FILTRO_LISTADO_CARGAS_BIOESTADISTICA_POR_DEFECTO: ListadoCargasBioestadisticaInput = {
  page: PAGINA_POR_DEFECTO,
  pageSize: TAMANO_POR_DEFECTO,
};
