import { z } from "zod";
import {
  EXTENSIONES_REGLAS_LLENADO,
  TAMANO_MAXIMO_REGLAS_LLENADO,
  extensionReglasLlenadoDesdeNombre,
} from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";

// RF-45: reglas compartidas entre el formulario (cliente) y el Route Handler (servidor).

export const LONGITUD_MAXIMA_NOMBRE_REGLAS = 255;

export const TAMANO_MAXIMO_REGLAS_TEXTO = `${TAMANO_MAXIMO_REGLAS_LLENADO / (1024 * 1024)} MB`;

// Valor del atributo `accept` del `<input type="file">`.
export const ACEPTAR_REGLAS_LLENADO = EXTENSIONES_REGLAS_LLENADO.map((extension) => `.${extension}`).join(",");

export const MENSAJE_TIPO_REGLAS_INVALIDO =
  "El archivo debe ser un documento Word (.docx, .doc), Excel (.xlsx, .xls) o de texto (.txt) válido";

export const MENSAJE_REGLAS_EXCEDE_TAMANO = `El archivo supera el máximo de ${TAMANO_MAXIMO_REGLAS_TEXTO}`;

// Quita caracteres de control (incluidos NUL y saltos de línea) y cualquier ruta que traiga el nombre.
export function limpiarNombreArchivoReglas(nombre: string): string {
  let limpio = "";
  for (const caracter of nombre) {
    const codigo = caracter.charCodeAt(0);
    if (codigo >= 0x20 && codigo !== 0x7f) limpio += caracter;
  }
  const segmentos = limpio.split(/[\\/]/);
  return (segmentos[segmentos.length - 1] ?? "").trim();
}

// Nombre original tal como llega en la cabecera `X-Nombre-Archivo` (codificado con
// `encodeURIComponent`). Un valor mal codificado se trata como vacío.
export const nombreArchivoReglasSchema = z.preprocess(
  (valor) => {
    if (typeof valor !== "string") return valor;
    try {
      return limpiarNombreArchivoReglas(decodeURIComponent(valor));
    } catch {
      return "";
    }
  },
  z
    .string({ error: "Indica el nombre del archivo" })
    .min(1, "Indica el nombre del archivo")
    .max(
      LONGITUD_MAXIMA_NOMBRE_REGLAS,
      `El nombre del archivo no puede superar los ${LONGITUD_MAXIMA_NOMBRE_REGLAS} caracteres`,
    ),
);

// Validación previa en el cliente (la definitiva, contra el contenido, la hace el servidor).
export function validarArchivoReglasEnCliente(archivo: { name: string; size: number }): string | null {
  if (!extensionReglasLlenadoDesdeNombre(archivo.name)) return MENSAJE_TIPO_REGLAS_INVALIDO;
  if (archivo.size === 0) return "El archivo está vacío";
  if (archivo.size > TAMANO_MAXIMO_REGLAS_LLENADO) return MENSAJE_REGLAS_EXCEDE_TAMANO;
  if (limpiarNombreArchivoReglas(archivo.name).length > LONGITUD_MAXIMA_NOMBRE_REGLAS) {
    return `El nombre del archivo no puede superar los ${LONGITUD_MAXIMA_NOMBRE_REGLAS} caracteres`;
  }
  return null;
}
