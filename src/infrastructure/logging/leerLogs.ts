import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { prisma } from "@/infrastructure/database/prisma";
import {
  archivosFallasCorreoEnOrden,
  type TipoAvisoCorreo,
} from "@/infrastructure/logging/catalogoFallasCorreo";

// Lector de los archivos de log del sistema. Node-only (usa `node:fs`): jamás debe importarse
// desde un Client Component ni desde `src/proxy.ts`. Vive junto a `logger.ts` porque lee lo que
// ese módulo escribe.

export const TIPOS_LOG = ["errores", "auditoria", "accesos", "fallas-correo"] as const;
export type TipoLog = (typeof TIPOS_LOG)[number];

// Allowlist fija tipo -> archivos, del más antiguo al más reciente. El tipo NUNCA se concatena a
// una ruta: se resuelve contra este mapa, de modo que ningún valor de la URL puede escaparse del
// directorio `logs/`. `fallas-correo` (RF-44) es el único que rota en su propio transporte: se
// leen también sus archivos rotados, en orden, como si fueran uno solo.
const ARCHIVOS_POR_TIPO: Record<TipoLog, readonly string[]> = {
  errores: ["errores.txt"],
  auditoria: ["auditoria.txt"],
  accesos: ["accesos.txt"],
  "fallas-correo": archivosFallasCorreoEnOrden(),
};

export function esTipoLog(valor: string | undefined): valor is TipoLog {
  return (TIPOS_LOG as readonly (string | undefined)[]).includes(valor);
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
  // RF-44: solo aplica a `fallas-correo`; `undefined` = todos los tipos de aviso.
  tipoAviso?: TipoAvisoCorreo;
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

// RF-44: filtro por tipo de aviso del registro de fallas de correo. Sin filtro, todo coincide.
function coincideTipoAviso(entrada: EntradaLog, filtro: FiltroLog): boolean {
  return filtro.tipoAviso === undefined || entrada.campos.tipoAviso === filtro.tipoAviso;
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

// Lee varios archivos en orden como si fueran uno solo (los rotados de `fallas-correo`, del más
// antiguo al activo). Un archivo que desaparece entre el `stat` y la apertura (rotación en curso)
// se trata como vacío en vez de romper la página.
async function* lineasDe(rutas: readonly string[]): AsyncGenerator<string> {
  for (const ruta of rutas) {
    const flujo = createReadStream(ruta, { encoding: "utf8" });
    const lector = createInterface({ input: flujo, crlfDelay: Infinity });
    // ENOENT por una rotación entre el `stat` y la lectura: sin este manejador el error del flujo
    // quedaría sin escuchar. Cerrar el lector termina la iteración de ese archivo.
    flujo.on("error", () => lector.close());
    try {
      for await (const linea of lector) {
        if (linea.trim().length > 0) yield linea;
      }
    } finally {
      lector.close();
      flujo.destroy();
    }
  }
}

async function rutasExistentes(tipo: TipoLog): Promise<string[]> {
  const candidatas = ARCHIVOS_POR_TIPO[tipo].map((archivo) => path.join(process.cwd(), "logs", archivo));
  const existentes = await Promise.all(
    candidatas.map((ruta) =>
      stat(ruta).then(
        () => ruta,
        () => null,
      ),
    ),
  );
  return existentes.filter((ruta): ruta is string => ruta !== null);
}

export async function leerLog(tipo: TipoLog, filtro: FiltroLog): Promise<ResultadoLog> {
  const vacio: ResultadoLog = {
    entradas: [],
    total: 0,
    pagina: 1,
    tamano: filtro.tamano,
    totalPaginas: 1,
  };

  // Un archivo que aún no existe (Winston lo crea en la primera escritura) no es un error.
  const rutas = await rutasExistentes(tipo);
  if (rutas.length === 0) return vacio;

  const coincide = (linea: string) => {
    const entrada = normalizar(linea, 0);
    return dentroDelRango(fechaLocalDe(entrada.timestamp), filtro) && coincideTipoAviso(entrada, filtro);
  };

  // Pasada 1: contar cuántas líneas cumplen el filtro, sin guardar ninguna. Así el número de
  // páginas y el rango "X a Y de Z" son exactos por más grande que sea el archivo.
  let total = 0;
  for await (const linea of lineasDe(rutas)) {
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
  for await (const linea of lineasDe(rutas)) {
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
