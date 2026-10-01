// Puerto técnico del módulo: `application/` nunca sabe de SMTP ni de nodemailer, solo de este
// contrato. Plantilla FIJA y SIN el contenido del mensaje: el correo solo avisa que hay un mensaje
// nuevo y lleva al sistema, donde se lee con sesión.
export type DatosCorreoAvisoMensajeNuevo = {
  destinatario: { nombres: string; email: string };
  formatoExcelNombre: string;
  anio: number;
};

export interface EnviadorAvisoMensajeNuevo {
  disponible(): boolean;
  enviarAviso(datos: DatosCorreoAvisoMensajeNuevo): Promise<void>;
}
