import type { LectorPlantilla } from "@/modules/formatos-excel/application/ports";

export type ColumnaDetectada = { orden: number; nombre: string };

export type ResultadoLeerColumnasPlantilla =
  | { ok: true; columnas: ColumnaDetectada[] }
  | { ok: false; motivo: "SIN_COLUMNAS" }
  | { ok: false; motivo: "COLUMNAS_DUPLICADAS"; nombre: string };

// Lee la primera fila de la plantilla hasta donde no estén vacías (ya resuelto por el puerto) y
// aplica las dos reglas de negocio que no dependen del formato del archivo: debe haber al menos
// una columna, y ningún encabezado puede repetirse dentro de la misma plantilla. La comparación
// de nombres ignora mayúsculas/espacios porque dos encabezados "RUT" y "rut" son el mismo
// conflicto para quien luego deba mapear el archivo subido contra esta configuración.
export async function leerColumnasPlantilla(
  buffer: Buffer,
  tipoContenido: string,
  dependencias: { lectorPlantilla: LectorPlantilla },
): Promise<ResultadoLeerColumnasPlantilla> {
  const columnas = await dependencias.lectorPlantilla.leer(buffer, tipoContenido);
  const columnasNoVacias = columnas.filter((columna) => columna.nombre.trim().length > 0);

  if (columnasNoVacias.length === 0) {
    return { ok: false, motivo: "SIN_COLUMNAS" };
  }

  const nombresVistos = new Set<string>();

  for (const columna of columnasNoVacias) {
    const clave = columna.nombre.trim().toLowerCase();

    if (nombresVistos.has(clave)) {
      return { ok: false, motivo: "COLUMNAS_DUPLICADAS", nombre: columna.nombre };
    }

    nombresVistos.add(clave);
  }

  return { ok: true, columnas: columnasNoVacias };
}
