import { directorioArchivosBioestadistica } from "@/infrastructure/config/env";
import {
  crearAlmacenArchivosDisco as crearAlmacenArchivosDiscoGeneral,
  type AlmacenArchivosDisco,
  type ResultadoLimpiezaTemporales,
} from "@/infrastructure/almacenamiento/AlmacenArchivosDisco";
import { BYTES_REVISION_FIRMA_CSV } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";

// RF-37: almacén de los archivos de Bioestadística. RF-38 generalizó la implementación a
// `src/infrastructure/almacenamiento/AlmacenArchivosDisco.ts` (la comparten las cargas del
// notificador); aquí queda solo la composición, sin cambios de comportamiento: mismo directorio base,
// mismas referencias `<anio>/<cargaId>.<ext>` y los mismos primeros bytes para revisar la firma.

export type { AlmacenArchivosDisco, ResultadoLimpiezaTemporales };

export function crearAlmacenArchivosDisco(obtenerDirectorioBase: () => string): AlmacenArchivosDisco {
  return crearAlmacenArchivosDiscoGeneral({
    obtenerDirectorioBase,
    etiqueta: "Bioestadística",
    bytesPrimeros: BYTES_REVISION_FIRMA_CSV,
  });
}

// Instancia de la aplicación, sobre `DIRECTORIO_ARCHIVOS_BIOESTADISTICA` (o su valor por defecto).
export const almacenArchivosBioestadistica = crearAlmacenArchivosDisco(directorioArchivosBioestadistica);
