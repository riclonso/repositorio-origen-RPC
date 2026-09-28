import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { prisma } from "@/infrastructure/database/prisma";

// Lector de los archivos de log del sistema. Node-only (usa `node:fs`): jamás debe importarse
// desde un Client Component ni desde `src/proxy.ts`. Vive junto a `logger.ts` porque lee lo que
// ese módulo escribe.

export type TipoLog = "errores" | "auditoria";

// Allowlist fija tipo -> archivo. El tipo NUNCA se concatena a una ruta: se resuelve contra este
// mapa, de modo que ningún valor de la URL puede escaparse del directorio `logs/`.
const ARCHIVO_POR_TIPO: Record<TipoLog, string> = {
  errores: "errores.txt",
  auditoria: "auditoria.txt",
};

export function esTipoLog(valor: string | undefined): valor is TipoLog {
  return valor === "errores" || valor === "auditoria";
}

// Tamaños de página ofrecidos. El primero es el valor por defecto.
export const TAMANOS_PAGINA = [25, 50, 100] as const;
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number];
export const TAMANO_PAGINA_POR_DEFECTO: TamanoPagina = TAMANOS_PAGINA[0];

export function normalizarTamano(valor: string | undefined): TamanoPagina {
  const numero = Number(valor);
  return (TAMANOS_PAGINA as readonly number[]).includes(numero)
    ? (numero as TamanoPagina)
    : TAMANO_PAGINA_POR_DEFECTO;
}

// Fecha de calendario en formato YYYY-MM-DD. Como los input[type=date] emiten justo eso y las
// cadenas ISO se ordenan lexicográficamente, no hace falta ninguna aritmética de zona horaria.
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaValida(valor: string | undefined): valor is string {
  return typeof valor === "string" && FORMATO_FECHA.test(valor);
}

export type FiltroLog = {
  // Fechas de calendario locales (America/Santiago), inclusivas. `undefined` = sin cota.
  desde?: string;
  hasta?: string;
  pagina: number;
  tamano: TamanoPagina;
};

export type EntradaLog = {
  indice: number;
  timestamp: string | null;
  nivel: string | null;
  mensaje: string | null;
  campos: Record<string, unknown>;
  crudo: string | null;
};

export type ResultadoLog = {
  entradas: EntradaLog[];
  total: number; // total de líneas que cumplen el filtro de fecha
  pagina: number; // página efectiva (acotada al rango válido)
  tamano: TamanoPagina;
  totalPaginas: number;
};

export async function leerErroresPersistentes(filtro: FiltroLog): Promise<ResultadoLog> {
  const where = {
    createdAt: {
      ...(filtro.desde ? { gte: new Date(`${filtro.desde}T00:00:00.000Z`) } : {}),
      ...(filtro.hasta ? { lte: new Date(`${filtro.hasta}T23:59:59.999Z`) } : {}),
    },
  };
  const total = await prisma.registroErrorSistema.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));
  const pagina = Math.min(Math.max(1, Math.trunc(filtro.pagina)), totalPaginas);
  const registros = await prisma.registroErrorSistema.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (pagina - 1) * filtro.tamano,
    take: filtro.tamano,
  });

  return {
    entradas: registros.map((registro, indice) => ({
      indice: (pagina - 1) * filtro.tamano + indice,
      timestamp: registro.createdAt.toISOString(),
      nivel: "error",
      mensaje: registro.mensaje,
      campos: registro.campos && typeof registro.campos === "object" && !Array.isArray(registro.campos)
        ? registro.campos as Record<string, unknown>
        : {},
      crudo: null,
    })),
    total,
    pagina,
    tamano: filtro.tamano,
    totalPaginas,
  };
}

// Convierte el instante absoluto de una entrada a su fecha de calendario en Santiago. Comparar
// esa fecha (string) contra `desde`/`hasta` es correcto con y sin horario de verano.
const formatoFechaLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function fechaLocalDe(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const fecha = new Date(timestamp);
  if (Number.isNaN(fecha.getTime())) return null;
  return formatoFechaLocal.format(fecha); // en-CA da YYYY-MM-DD
}

function normalizar(linea: string, indice: number): EntradaLog {
  try {
    const objeto = JSON.parse(linea) as Record<string, unknown>;
    const { timestamp, level, message, ...resto } = objeto;
    return {
      indice,
      timestamp: typeof timestamp === "string" ? timestamp : null,
      nivel: typeof level === "string" ? level : null,
      mensaje: typeof message === "string" ? message : null,
      campos: resto,
      crudo: null,
    };
  } catch {
    return { indice, timestamp: null, nivel: null, mensaje: null, campos: {}, crudo: linea };
  }
}

// Decide si una entrada entra en el rango. Una entrada sin fecha legible se incluye solo cuando
// no hay filtro de fecha; si el usuario acotó por día, esconder lo que no tiene fecha es lo
// esperado.
function dentroDelRango(fechaLocal: string | null, filtro: FiltroLog): boolean {
  if (!filtro.desde && !filtro.hasta) return true;
  if (!fechaLocal) return false;
  if (filtro.desde && fechaLocal < filtro.desde) return false;
  if (filtro.hasta && fechaLocal > filtro.hasta) return false;
  return true;
}

async function* lineasDe(ruta: string): AsyncGenerator<string> {
  const lector = createInterface({
    input: createReadStream(ruta, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  try {
    for await (const linea of lector) {
      if (linea.trim().length > 0) yield linea;
    }
  } finally {
    lector.close();
  }
}

export async function leerLog(tipo: TipoLog, filtro: FiltroLog): Promise<ResultadoLog> {
  const ruta = path.join(process.cwd(), "logs", ARCHIVO_POR_TIPO[tipo]);
  const vacio: ResultadoLog = {
    entradas: [],
    total: 0,
    pagina: 1,
    tamano: filtro.tamano,
    totalPaginas: 1,
  };

  try {
    await stat(ruta);
  } catch {
    // El archivo aún no existe (Winston lo crea en la primera escritura): no es un error.
    return vacio;
  }

  const coincide = (linea: string) =>
    dentroDelRango(fechaLocalDe(normalizar(linea, 0).timestamp), filtro);

  // Pasada 1: contar cuántas líneas cumplen el filtro, sin guardar ninguna. Así el número de
  // páginas y el rango "X a Y de Z" son exactos por más grande que sea el archivo.
  let total = 0;
  for await (const linea of lineasDe(ruta)) {
    if (coincide(linea)) total++;
  }

  if (total === 0) return vacio;

  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));
  // Se acota la página al rango válido: un `?pagina=999` escrito a mano cae en la última página
  // en vez de mostrar un vacío desconcertante.
  const pagina = Math.min(Math.max(1, Math.trunc(filtro.pagina)), totalPaginas);

  // La página 1 son las MÁS RECIENTES. En orden de archivo (viejo -> nuevo), eso es la cola.
  // Índices de archivo [inicioArchivo, finArchivo) que corresponden a esta página.
  const finArchivo = total - (pagina - 1) * filtro.tamano;
  const inicioArchivo = Math.max(0, finArchivo - filtro.tamano);

  // Pasada 2: recolectar solo esa ventana. En memoria nunca hay más de `tamano` entradas.
  const ventana: EntradaLog[] = [];
  let posicion = 0;
  for await (const linea of lineasDe(ruta)) {
    if (!coincide(linea)) continue;
    if (posicion >= inicioArchivo && posicion < finArchivo) {
      ventana.push(normalizar(linea, posicion));
    }
    posicion++;
    if (posicion >= finArchivo) break; // ya pasamos la ventana pedida
  }

  return {
    entradas: ventana.reverse(), // más recientes primero
    total,
    pagina,
    tamano: filtro.tamano,
    totalPaginas,
  };
}
