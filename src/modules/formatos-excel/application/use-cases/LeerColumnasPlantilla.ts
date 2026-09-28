import type { LectorPlantilla } from "@/modules/formatos-excel/application/ports";
import type { SeparadorCsv, TipoArchivo } from "@/modules/formatos-excel/domain/entities/FormatoExcel";

export type ColumnaDetectada = { orden: number; nombre: string };

export type DatosLeerColumnasPlantilla = {
  buffer: Buffer;
  tipoContenido: string;
  // Tipo que el usuario eligió en el asistente vs. el detectado por el servidor a partir del
  // contenido real del archivo (nunca del cliente). Deben coincidir.
  tipoArchivoDeclarado: TipoArchivo;
  tipoArchivoDetectado: TipoArchivo;
  separadorCsv: SeparadorCsv | null;
};

export type ResultadoLeerColumnasPlantilla =
  | { ok: true; columnas: ColumnaDetectada[] }
  | { ok: false; motivo: "TIPO_NO_COINCIDE" }
  | { ok: false; motivo: "SIN_COLUMNAS" }
  | { ok: false; motivo: "COLUMNAS_DUPLICADAS"; nombre: string };

// Lee la primera fila de la plantilla hasta donde no estén vacías (ya resuelto por el puerto) y
// aplica las reglas de negocio que no dependen del formato del archivo: el archivo debe ser del
// tipo elegido, debe haber al menos una columna, y ningún encabezado puede repetirse dentro de la
// misma plantilla. La comparación de nombres ignora mayúsculas/espacios porque dos encabezados
// "RUT" y "rut" son el mismo conflicto para quien luego deba mapear el archivo subido contra esta
// configuración.
export async function leerColumnasPlantilla(
  datos: DatosLeerColumnasPlantilla,
  dependencias: { lectorPlantilla: LectorPlantilla },
): Promise<ResultadoLeerColumnasPlantilla> {
  if (datos.tipoArchivoDeclarado !== datos.tipoArchivoDetectado) {
    return { ok: false, motivo: "TIPO_NO_COINCIDE" };
  }

  const columnas = await dependencias.lectorPlantilla.leer(datos.buffer, datos.tipoContenido, {
    separadorCsv: datos.separadorCsv,
  });
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
