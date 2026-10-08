import { directorioArchivosCargas } from "@/infrastructure/config/env";
import { crearAlmacenArchivosDisco } from "@/infrastructure/almacenamiento/AlmacenArchivosDisco";

// RF-38: los archivos del notificador se guardan en disco (`DIRECTORIO_ARCHIVOS_CARGAS`), no en `Bytes`.
// Solo se aceptan `.xlsx` (RF-23): basta con los 4 bytes de la firma ZIP.
const BYTES_FIRMA_ZIP = 4;

export const almacenArchivosCargas = crearAlmacenArchivosDisco({
  obtenerDirectorioBase: directorioArchivosCargas,
  etiqueta: "cargas del notificador",
  bytesPrimeros: BYTES_FIRMA_ZIP,
});
