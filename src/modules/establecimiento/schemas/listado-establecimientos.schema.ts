import { z } from "zod";
import { normalizarRut } from "@/shared/utils/rut";

const PAGINA_POR_DEFECTO = 1;
const PAGINA_MAXIMA = 10_000;
const TAMANO_POR_DEFECTO = 20;
// Tope obligatorio: sin él, `?tamano=999999` vuelca la tabla completa en una sola respuesta.
const TAMANO_MAXIMO = 100;
const LARGO_MAXIMO_TERMINO = 100;

const CLAVES_FILTRO = ["pagina", "tamano", "q", "tipo", "activo"] as const;

// Un token con forma de RUT ("76.123.456-7") se normaliza antes de compararlo contra la columna
// `rut`, que guarda "76123456-7".
const FORMA_RUT = /^[\d.\-kK]+$/;

function normalizarTermino(termino: string): string {
  return termino
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => (FORMA_RUT.test(token) && /\d/.test(token) ? normalizarRut(token) : token))
    .join(" ");
}

// Los parámetros llegan como `string`, `string[]`, `null` o ausentes según el consumidor
// (URLSearchParams del Route Handler o searchParams de la página). Se aplanan a
// `string | undefined` para que el resto del esquema trabaje siempre con la misma forma.
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

export const listadoEstablecimientosSchema = z
  .preprocess(
    aplanarParametros,
    z.object({
      pagina: z.coerce.number().int().min(1).max(PAGINA_MAXIMA).default(PAGINA_POR_DEFECTO),
      tamano: z.coerce.number().int().min(1).max(TAMANO_MAXIMO).default(TAMANO_POR_DEFECTO),
      q: z
        .string()
        .trim()
        .max(LARGO_MAXIMO_TERMINO, "El texto de búsqueda no puede superar los 100 caracteres")
        .optional()
        .transform((valor) => {
          if (!valor) return undefined;
          const normalizado = normalizarTermino(valor);
          return normalizado.length > 0 ? normalizado : undefined;
        }),
      // Solo se valida la FORMA (uuid). Un tipo bien formado pero inexistente devuelve una lista
      // vacía, no un 400: es un filtro de búsqueda, no una mutación.
      tipo: z.uuid().optional(),
      activo: z
        .enum(["true", "false"])
        .optional()
        .transform((valor) => (valor === undefined ? undefined : valor === "true")),
    }),
  )
  .transform((datos) => ({
    termino: datos.q,
    tipo: datos.tipo,
    activo: datos.activo,
    pagina: datos.pagina,
    tamano: datos.tamano,
  }));

// Filtro por defecto: lo usa la página RSC cuando la URL viene editada a mano y no valida, para
// caer a un listado usable en vez de reventar la pantalla.
export const FILTRO_LISTADO_POR_DEFECTO = {
  pagina: PAGINA_POR_DEFECTO,
  tamano: TAMANO_POR_DEFECTO,
} as const;
