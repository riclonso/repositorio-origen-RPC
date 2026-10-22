import type { DestinatarioEquipoRevisor } from "@/modules/usuarios/domain/entities/DestinatarioEquipoRevisor";

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

// RF-31 (ampliación): aviso al equipo revisor cuando el notificador responde. Igual que el aviso al
// notificador, el puerto NUNCA recibe el contenido del mensaje ni su longitud: solo quién respondió
// y sobre qué formato y año.
export type DatosCorreoAvisoMensajeRevisores = {
  notificadorNombre: string;
  // `null` si la cuenta no tiene establecimiento (cuentas previas a RF-30): se omite en el correo.
  establecimientoNombre: string | null;
  formatoExcelNombre: string;
  anio: number;
};

// A quién va cada correo. El buzón compartido no es una persona: se saluda al equipo. Alias del tipo
// de `modules/usuarios/`, donde vive la ÚNICA regla de destinatarios del equipo revisor (RF-44).
export type DestinatarioAvisoRevisores = DestinatarioEquipoRevisor;

export interface EnviadorAvisoMensajeRevisores {
  disponible(): boolean;
  // Buzón compartido si `BUZON_COMPARTIDO_REVISOR_EMAIL` está configurada, o un destinatario por
  // cada REVISOR_REPOSITORIO activo si no (nunca todos en el mismo To/CC). La implementación delega
  // en `obtenerDestinatariosEquipoRevisor` (`modules/usuarios/infrastructure/destinatarios/`).
  resolverDestinatarios(): Promise<DestinatarioAvisoRevisores[]>;
  // Un correo a UN solo destinatario.
  enviarAviso(destinatario: DestinatarioAvisoRevisores, datos: DatosCorreoAvisoMensajeRevisores): Promise<void>;
}
