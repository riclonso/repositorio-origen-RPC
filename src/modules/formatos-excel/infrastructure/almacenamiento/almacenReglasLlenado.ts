import { directorioArchivosReglas } from "@/infrastructure/config/env";
import { crearAlmacenArchivosDisco } from "@/infrastructure/almacenamiento/AlmacenArchivosDisco";

// RF-45: archivos de reglas de llenado en disco (`DIRECTORIO_ARCHIVOS_REGLAS`), sin cifrado. Se piden
// 8 bytes iniciales: la firma OLE2 (.doc/.xls) es la más larga de las que se revisan.
const BYTES_FIRMA = 8;

export const almacenReglasLlenado = crearAlmacenArchivosDisco({
  obtenerDirectorioBase: directorioArchivosReglas,
  etiqueta: "reglas de llenado",
  bytesPrimeros: BYTES_FIRMA,
});
