// Tipos de dato enumerados definidos por el usuario. Cada formato tiene los suyos (no hay catálogo
// global): un nombre y la lista de valores permitidos. Este archivo es la ÚNICA fuente de la regla
// de comparación y de los límites: la usan el esquema Zod (al definir), `application/` (al
// revalidar las referencias) y `reporte-excel` (al validar una carga).

export const MAXIMO_TIPOS_ENUMERADOS = 20;
export const MAXIMO_VALORES_ENUMERADO = 1000;
export const LARGO_MAXIMO_VALOR_ENUMERADO = 100;
export const LARGO_MAXIMO_NOMBRE_ENUMERADO = 60;

// Hasta esta cantidad de valores, el mensaje de error al notificador lista los permitidos; con más,
// el mensaje solo nombra el tipo (un listado de cientos de valores no ayuda a corregir la celda).
export const MAXIMO_VALORES_EN_MENSAJE = 10;

// Regla de comparación: NFC (para que "é" precompuesta y "e" + acento combinante sean el mismo
// texto), sin espacios en los extremos y sin distinguir mayúsculas. Los acentos SÍ se distinguen
// ("Si" ≠ "Sí"). Se usa igual al definir (para rechazar "SI" y "si" como duplicados) y al validar
// una celda, así que lo que el usuario ve como "repetido" es exactamente lo que la validación
// considera igual.
export function normalizarValorEnumerado(texto: string): string {
  return texto.normalize("NFC").trim().toLocaleLowerCase("es");
}

type ConNombre = { nombre: string };

// Busca un tipo enumerado por nombre con la misma regla de comparación que sus valores. Las
// columnas guardan el nombre (no un id), así que esta es la resolución de esa referencia.
export function buscarTipoEnumeradoPorNombre<T extends ConNombre>(
  tiposEnumerados: readonly T[],
  nombre: string,
): T | undefined {
  const nombreNormalizado = normalizarValorEnumerado(nombre);
  return tiposEnumerados.find((tipo) => normalizarValorEnumerado(tipo.nombre) === nombreNormalizado);
}

// Mensaje de `TIPO_DATO_INVALIDO` para una columna enumerada. NUNCA incluye el valor recibido en
// la celda (mismo criterio que el resto de los errores de carga). Largo acotado por los límites de
// arriba: a lo sumo 10 valores de 100 caracteres más el nombre del tipo y de la columna, muy por
// debajo del límite de una celda de Excel (32.767) en el informe de errores descargable.
export function mensajeValorNoPermitidoEnumerado(
  nombreColumna: string,
  tipoEnumerado: { nombre: string; valores: readonly string[] },
): string {
  const base = `El valor de "${nombreColumna}" no está entre los valores permitidos de «${tipoEnumerado.nombre}»`;

  if (tipoEnumerado.valores.length > MAXIMO_VALORES_EN_MENSAJE) {
    return base;
  }

  return `${base}: ${tipoEnumerado.valores.join(", ")}`;
}
