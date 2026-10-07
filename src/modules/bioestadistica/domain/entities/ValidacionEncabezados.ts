import { MAXIMO_COLUMNAS_BIOESTADISTICA } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";

export type MotivoEncabezadosInvalidos = "SIN_ENCABEZADOS" | "ENCABEZADO_VACIO" | "ENCABEZADO_DUPLICADO" | "DEMASIADAS_COLUMNAS";

export type ResultadoValidacionEncabezados =
  | { ok: true; encabezados: string[] }
  | { ok: false; motivo: MotivoEncabezadosInvalidos; columna?: number };

export const MENSAJES_ENCABEZADOS_INVALIDOS: Record<MotivoEncabezadosInvalidos, string> = {
  SIN_ENCABEZADOS: "La primera fila del archivo debe traer los nombres de las columnas.",
  ENCABEZADO_VACIO: "Hay una columna sin nombre entre los encabezados de la primera fila.",
  ENCABEZADO_DUPLICADO: "Hay dos columnas con el mismo nombre en la primera fila.",
  DEMASIADAS_COLUMNAS: `El archivo no puede tener más de ${MAXIMO_COLUMNAS_BIOESTADISTICA} columnas.`,
};

// RF-37: valida la fila 1 de un archivo de formato libre. Los encabezados llegan hasta la última
// celda NO vacía (las vacías del final se descartan). Se rechazan: ninguna columna, una vacía en
// medio, nombres repetidos (con `trim` y sin distinguir mayúsculas) y más de
// `MAXIMO_COLUMNAS_BIOESTADISTICA` columnas. Devuelve los nombres ya recortados. Función pura.
export function validarEncabezados(celdas: readonly string[]): ResultadoValidacionEncabezados {
  const recortadas = celdas.map((celda) => celda.trim());

  let ultimaConValor = recortadas.length - 1;
  while (ultimaConValor >= 0 && recortadas[ultimaConValor] === "") ultimaConValor -= 1;

  const encabezados = recortadas.slice(0, ultimaConValor + 1);

  if (encabezados.length === 0) return { ok: false, motivo: "SIN_ENCABEZADOS" };
  if (encabezados.length > MAXIMO_COLUMNAS_BIOESTADISTICA) return { ok: false, motivo: "DEMASIADAS_COLUMNAS" };

  const vistos = new Set<string>();

  for (const [indice, encabezado] of encabezados.entries()) {
    if (encabezado === "") return { ok: false, motivo: "ENCABEZADO_VACIO", columna: indice + 1 };

    const clave = encabezado.toLocaleLowerCase("es");
    if (vistos.has(clave)) return { ok: false, motivo: "ENCABEZADO_DUPLICADO", columna: indice + 1 };
    vistos.add(clave);
  }

  return { ok: true, encabezados };
}
