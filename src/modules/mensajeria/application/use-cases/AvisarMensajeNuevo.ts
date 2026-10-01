import type { EnviadorAvisoMensajeNuevo } from "@/modules/mensajeria/application/ports";

export type DestinatarioAvisoMensaje = {
  nombres: string;
  email: string;
  activo: boolean;
};

export type ResultadoAvisarMensajeNuevo = "ENVIADO" | "OMITIDO";

// RF-31: correo de aviso al notificador cuando el equipo revisor le escribe. Nunca lleva el
// contenido del mensaje (el puerto ni siquiera lo recibe). Se omite si el envío de correo no está
// disponible o si la cuenta ya no existe o está inactiva. Un fallo del envío se PROPAGA: quien
// llama (el Route Handler, desde `after()`) lo registra; el mensaje ya quedó guardado antes y este
// caso de uso no escribe nada.
export async function avisarMensajeNuevo(
  datos: { notificadorId: string; formatoExcelNombre: string; anio: number },
  dependencias: {
    enviador: EnviadorAvisoMensajeNuevo;
    buscarDestinatario: (id: string) => Promise<DestinatarioAvisoMensaje | null>;
  },
): Promise<ResultadoAvisarMensajeNuevo> {
  if (!dependencias.enviador.disponible()) {
    return "OMITIDO";
  }

  const destinatario = await dependencias.buscarDestinatario(datos.notificadorId);

  if (!destinatario || !destinatario.activo) {
    return "OMITIDO";
  }

  await dependencias.enviador.enviarAviso({
    destinatario: { nombres: destinatario.nombres, email: destinatario.email },
    formatoExcelNombre: datos.formatoExcelNombre,
    anio: datos.anio,
  });

  return "ENVIADO";
}
