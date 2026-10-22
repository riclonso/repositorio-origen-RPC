import type { SeparadorCsv } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ExtensionReglasLlenado } from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";

// Opciones de lectura de un CSV. `separadorCsv` se ignora al leer un `.xlsx`.
export type OpcionesLecturaArchivo = { separadorCsv: SeparadorCsv | null };

// Interfaz técnica del módulo. `application/` nunca importa `exceljs` directamente: solo depende
// de este puerto. Agnóstica de si la plantilla es `.xlsx` o `.csv`; esa decisión la toma la
// implementación de `infrastructure/` a partir del `tipoContenido` recibido.
export interface LectorPlantilla {
  leer(
    buffer: Buffer,
    tipoContenido: string,
    opciones: OpcionesLecturaArchivo,
  ): Promise<{ orden: number; nombre: string }[]>;
}

// RF-45: almacén en disco de los archivos de reglas de llenado. Lo satisface por tipado estructural
// `crearAlmacenArchivosDisco` (`src/infrastructure/almacenamiento/`).
export type ResultadoGuardadoTemporalReglas =
  | { ok: true; referenciaTemporal: string; tamanoBytes: number; sha256: string; primerosBytes: Uint8Array }
  | { ok: false; motivo: "VACIO" | "EXCEDE_TAMANO" };

export type ArchivoReglasAbierto = { flujo: ReadableStream<Uint8Array>; tamanoBytes: number };

export interface AlmacenReglasLlenado {
  guardarTemporal(origen: ReadableStream<Uint8Array>, limiteBytes: number): Promise<ResultadoGuardadoTemporalReglas>;
  moverDefinitivoEn(referenciaTemporal: string, referenciaDestino: string): Promise<string>;
  abrirLectura(referencia: string): Promise<ArchivoReglasAbierto | null>;
  // Idempotente: eliminar algo que ya no existe no es un error.
  eliminar(referencia: string): Promise<void>;
}

// RF-45: verifica que el contenido real del archivo (ya en el temporal) corresponda a la extensión.
export interface DetectorTipoDocumento {
  corresponde(referenciaTemporal: string, extension: ExtensionReglasLlenado): Promise<boolean>;
}

// RF-45: registro de una falla no fatal (p. ej. no se pudo borrar el archivo anterior tras el commit).
// `application/` no conoce el logger: el Route Handler inyecta uno que escribe en errores.txt.
export type RegistrarFalloNoFatal = (contexto: string, error: unknown) => void;

// RF-45: decide si una ventana tiene tarjeta en el panel del notificador (mismo predicado que
// `/notificador`) y devuelve su formato; `null` si no la tiene.
export interface AutorizadorVentanaNotificador {
  formatoDeVentanaConTarjeta(usuarioId: string, ventanaCargaId: string): Promise<string | null>;
}
