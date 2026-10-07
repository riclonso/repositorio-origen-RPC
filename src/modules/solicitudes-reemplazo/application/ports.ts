// Puerto técnico del módulo: `application/` nunca sabe de SMTP ni de nodemailer, solo de este
// contrato. Plantilla FIJA (no enriquecida/configurable, a diferencia de las alertas de
// ventanas-carga): un solo método cubre el único correo que dispara este módulo, el resultado de
// la revisión (aprobación o rechazo).
export type DatosCorreoRevisionSolicitudReemplazo = {
  destinatario: { nombres: string; email: string };
  formatoExcelNombre: string;
  anio: number;
  nombreArchivoOriginal: string;
  estado: "APROBADA" | "RECHAZADA";
  comentarioRevision: string | null;
  // RF-36: instante real hasta el cual la aprobación habilita subir el reemplazo
  // (`fechaVencimientoSolicitud`). `null` en un rechazo.
  venceEl: Date | null;
};

export interface EnviadorNotificacionSolicitudReemplazo {
  disponible(): boolean;
  enviarResultadoRevision(datos: DatosCorreoRevisionSolicitudReemplazo): Promise<void>;
}
