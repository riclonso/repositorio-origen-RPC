// Puertos técnicos del módulo (RF-37): `application/` nunca sabe de `node:fs`, exceljs, fast-csv ni
// SMTP, solo de estos contratos. Las implementaciones viven en `infrastructure/`.
import type { FormatoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import type { TipoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";

export type ResultadoGuardadoTemporal =
  | {
      ok: true;
      referenciaTemporal: string;
      tamanoBytes: number;
      sha256: string;
      // Primeros bytes del archivo (hasta `BYTES_REVISION_FIRMA_CSV`), para revisar la firma.
      primerosBytes: Uint8Array;
    }
  | { ok: false; motivo: "VACIO" | "EXCEDE_TAMANO" };

export type ArchivoAbierto = {
  flujo: ReadableStream<Uint8Array>;
  tamanoBytes: number;
};

// Almacén de los binarios en disco. Las referencias son RELATIVAS al directorio base y las genera
// siempre el servidor (nunca a partir del nombre que envió el cliente).
export interface AlmacenArchivos {
  // Copia el flujo a un archivo temporal contando bytes (corta al superar `limiteBytes`) y
  // calculando el SHA-256 mientras recibe. Ante cualquier corte, el temporal ya queda eliminado.
  guardarTemporal(origen: ReadableStream<Uint8Array>, limiteBytes: number): Promise<ResultadoGuardadoTemporal>;
  // Mueve el temporal a su ubicación definitiva `<anio>/<cargaId>.<extension>` y devuelve su referencia.
  moverDefinitivo(referenciaTemporal: string, anio: number, cargaId: string, extension: "xlsx" | "csv"): Promise<string>;
  // `null` si el archivo ya no existe.
  abrirLectura(referencia: string): Promise<ArchivoAbierto | null>;
  // Idempotente: eliminar algo que ya no existe no es un error.
  eliminar(referencia: string): Promise<void>;
}

export type ValorCeldaLibre = string | number | boolean | Date | null;

export type FilaArchivoLibre = {
  // Número real de la fila en el archivo (la 1 es la de encabezados).
  numeroFila: number;
  // Posición 0 = primera columna.
  valores: ValorCeldaLibre[];
};

// Lector en streaming de archivos de formato libre (.xlsx primera hoja, o .csv con separador y
// codificación detectados). Nunca carga el archivo completo en memoria.
export interface LectorArchivoLibreStreaming {
  // Celdas de la fila 1 como texto ("" las vacías). Solo lee esa fila.
  leerEncabezados(referencia: string, formato: FormatoArchivoBioestadistica): Promise<string[]>;
  // Filas desde la 2 en adelante, en orden. Lanza si el archivo no se puede interpretar.
  recorrerFilas(referencia: string, formato: FormatoArchivoBioestadistica): AsyncIterable<FilaArchivoLibre>;
}

// Acota cuántos procesamientos corren a la vez dentro del proceso (memoria y CPU).
export interface LimitadorConcurrencia {
  ejecutar<T>(tarea: () => Promise<T>): Promise<T>;
}

// Solo lo que este módulo necesita de una cuenta: su establecimiento (copiado en la carga). Lo
// satisface `prismaUsuarioRepository` sin un adaptador nuevo.
export interface ConsultaEstablecimientoUsuario {
  obtenerPorId(id: string): Promise<{ establecimientoId: string | null } | null>;
}

export type DatosCorreoRevisionSolicitudBioestadistica = {
  destinatario: { nombres: string; email: string };
  tipoArchivo: TipoArchivoBioestadistica;
  anio: number;
  nombreArchivoOriginal: string;
  estado: "APROBADA" | "RECHAZADA";
  comentarioRevision: string | null;
  // Hasta cuándo habilita la aprobación (`null` en un rechazo o si el año ya no admite
  // autorizaciones).
  venceEl: Date | null;
};

export interface EnviadorNotificacionSolicitudBioestadistica {
  disponible(): boolean;
  enviarResultadoRevision(datos: DatosCorreoRevisionSolicitudBioestadistica): Promise<void>;
}
