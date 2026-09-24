import type { ErrorCargaArchivo, ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Interfaz técnica del módulo. `application/` nunca importa `exceljs` directamente: solo depende
// de este puerto. Agnóstica de si el archivo es `.xlsx` o `.csv`; esa decisión la toma la
// implementación de `infrastructure/` a partir del `tipoContenido` recibido.
//
// `filas[i]` corresponde siempre a la fila de archivo `i + 2` (la fila 1 es el encabezado): el
// arreglo incluye toda fila entre la 2 y la última usada en la hoja, aunque venga totalmente
// vacía, para que el índice nunca se desalinee del número de fila real que ve el usuario al abrir
// el archivo.
export interface LectorArchivoReporte {
  leer(
    buffer: Buffer,
    tipoContenido: string,
  ): Promise<{ encabezados: string[]; filas: Record<string, ValorCeldaArchivo>[] }>;
}

// Interfaz técnica para generar el Excel de errores descargable desde el detalle de una carga
// propia (RF-14 ampliación). Mismo criterio que `LectorArchivoReporte`: `application/` nunca
// importa `exceljs` directamente, solo depende de este puerto. Nunca recibe ni escribe datos de
// contenido de celdas del archivo original (nombres, RUTs, etc.), solo el detalle de errores.
export interface GeneradorExcelErrores {
  generar(errores: ErrorCargaArchivo[]): Promise<Buffer>;
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
