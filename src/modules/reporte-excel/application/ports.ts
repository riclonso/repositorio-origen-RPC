import type { FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type {
  ErrorCargaArchivo,
  ResultadoValidacionArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Interfaces técnicas del módulo. `application/` nunca importa `exceljs`, `node:fs` ni SMTP
// directamente: solo depende de estos puertos. Las implementaciones viven en `infrastructure/`.

// Interfaz técnica para generar el Excel de errores descargable desde el detalle de una carga
// propia (RF-14 ampliación). Nunca recibe ni escribe datos de contenido de celdas del archivo
// original (nombres, RUTs, etc.), solo el detalle de errores.
export interface GeneradorExcelErrores {
  generar(errores: ErrorCargaArchivo[]): Promise<Buffer>;
}

// --- RF-38: binarios en disco ---

export type ResultadoGuardadoTemporal =
  | {
      ok: true;
      referenciaTemporal: string;
      tamanoBytes: number;
      sha256: string;
      // Primeros bytes del archivo, para revisar la firma.
      primerosBytes: Uint8Array;
    }
  | { ok: false; motivo: "VACIO" | "EXCEDE_TAMANO" };

export type ArchivoAbierto = {
  flujo: ReadableStream<Uint8Array>;
  tamanoBytes: number;
};

// Almacén de los binarios de las cargas. Las referencias son RELATIVAS al directorio base y las
// genera siempre el servidor (nunca a partir del nombre que envió el cliente). Lo satisface la
// implementación compartida `infrastructure/almacenamiento/AlmacenArchivosDisco.ts`.
export interface AlmacenArchivosCarga {
  // Copia el flujo a un temporal contando bytes (corta al superar `limiteBytes`) y calculando el
  // SHA-256 mientras recibe. Ante cualquier corte, el temporal ya queda eliminado.
  guardarTemporal(origen: ReadableStream<Uint8Array>, limiteBytes: number, cifrado?: { usuarioId: string; excel: boolean; archivoId: string }): Promise<ResultadoGuardadoTemporal>;
  // Mueve el temporal a `<anio>/<cargaId>.<extension>` y devuelve su referencia.
  moverDefinitivo(referenciaTemporal: string, anio: number, cargaId: string, extension: "xlsx" | "csv"): Promise<string>;
  // `null` si el archivo ya no existe.
  abrirLectura(referencia: string): Promise<ArchivoAbierto | null>;
  // Idempotente: eliminar algo que ya no existe no es un error.
  eliminar(referencia: string): Promise<void>;
}

// Acota cuántas tareas pesadas corren a la vez dentro del proceso (memoria y CPU).
export interface LimitadorConcurrencia {
  ejecutar<T>(tarea: () => Promise<T>): Promise<T>;
}

// --- RF-38: validación en streaming ---

export type ContextoVentanaValidacion = { fechaApertura: Date; fechaVencimiento: Date; anio: number };

// Valida el archivo ya guardado contra el formato (columnas, reglas y enumerados vigentes al
// procesar) y la ventana. Lanza si el archivo no se puede leer (ZIP inválido, demasiado grande una
// vez descomprimido, error de E/S); el caso de uso lo traduce a `ARCHIVO_NO_PROCESADO`.
export interface ValidadorArchivoReporte {
  validar(
    fuente: { referencia: string },
    formato: FormatoExcel,
    ventana: ContextoVentanaValidacion,
  ): Promise<ResultadoValidacionArchivo>;
}

// --- RF-38: descarga con "Fecha y hora de notificación" ---

export type FuenteDescarga = { referencia: string } | { contenido: Buffer };

export type ArchivoGenerado = {
  flujo: ReadableStream<Uint8Array>;
  tipoContenido: string;
};

// Genera la copia en streaming. Devuelve el flujo antes de recorrer la hoja; los errores de
// lectura cortan la descarga. La señal cancela también la preparación previa a la primera fila.
export interface GeneradorDescargaCarga {
  generar(entrada: {
    fuente: FuenteDescarga;
    tipoContenido: string;
    fechaNotificacion: Date;
    // Quién la pide (id de usuario): la implementación admite una sola generación a la vez por
    // solicitante y lanza si ya tiene otra en curso o si no hay capacidad dentro de la espera máxima.
    solicitanteId?: string;
    signal?: AbortSignal;
  }): Promise<ArchivoGenerado>;
}

// Puertos de correo (rechazo/confirmación de carga aprobada), mismo criterio que
// `solicitudes-reemplazo/application/ports.ts`: `application/` nunca sabe de SMTP ni de
// nodemailer. Ninguno de los dos se invoca desde un caso de uso: el envío se dispara desde el
// Route Handler, dentro de `after()`, para que un fallo de SMTP nunca revierta ni retrase la
// escritura ya persistida (mismo patrón que `RevisarSolicitudReemplazo`).
export type DatosCorreoRechazoCarga = {
  destinatario: { nombres: string; email: string };
  formatoExcelNombre: string;
  anio: number;
  nombreArchivoOriginal: string;
  motivo: string;
};

export interface EnviadorNotificacionRechazoCarga {
  disponible(): boolean;
  enviarRechazo(datos: DatosCorreoRechazoCarga): Promise<void>;
}

export type DatosCorreoConfirmacionVistoBueno = {
  notificador: { nombres: string; email: string };
  formatoExcelNombre: string;
  anio: number;
  nombreArchivoOriginal: string;
};

export interface EnviadorConfirmacionVistoBueno {
  disponible(): boolean;
  enviarConfirmacionNotificador(datos: DatosCorreoConfirmacionVistoBueno): Promise<void>;
  // Buzón compartido si `BUZON_COMPARTIDO_REVISOR_EMAIL` está configurada, o un correo INDIVIDUAL
  // por cada revisor activo si no (nunca todos en el mismo To/CC): la resolución de a quién enviar
  // vive en la implementación de infraestructura, que es la única que conoce la variable de
  // entorno y el repositorio de usuarios.
  enviarConfirmacionRevisores(datos: Omit<DatosCorreoConfirmacionVistoBueno, "notificador">): Promise<void>;
}
