import type { Usuario } from "@/modules/usuarios/domain/entities/Usuario";

// RF-44: ÚNICA definición de a quién se le escribe cuando un correo va "al equipo revisor"
// (confirmación de carga aprobada, aviso de respuesta de un notificador). Antes esta regla estaba
// duplicada en `VistoBuenoCargaMailer` y `AvisoMensajeMailer`.
//
// El buzón compartido no es una persona: se saluda al equipo y no tiene id de usuario.
export type DestinatarioEquipoRevisor =
  | { tipo: "BUZON_COMPARTIDO"; email: string }
  | { tipo: "REVISOR"; revisorId: string; nombres: string; apellidos: string; rut: string; email: string };

export type RevisorActivo = Pick<Usuario, "id" | "nombres" | "apellidos" | "rut" | "email">;

// Regla pura:
//   - Si hay buzón compartido configurado (no vacío), UN solo destinatario: el buzón.
//   - Si no, un destinatario por cada revisor activo (cada uno recibe su PROPIO correo, nunca todos
//     en el mismo To/CC: expondría el correo de un revisor a otro).
//   - Nunca mezcla el buzón con los revisores individuales.
export function elegirDestinatariosEquipoRevisor(
  buzonCompartido: string | null,
  revisoresActivos: readonly RevisorActivo[],
): DestinatarioEquipoRevisor[] {
  const buzon = buzonCompartido?.trim() ?? "";

  if (buzon.length > 0) {
    return [{ tipo: "BUZON_COMPARTIDO", email: buzon }];
  }

  return revisoresActivos.map((revisor) => ({
    tipo: "REVISOR",
    revisorId: revisor.id,
    nombres: revisor.nombres,
    apellidos: revisor.apellidos,
    rut: revisor.rut,
    email: revisor.email,
  }));
}
