import type { EnviadorAvisoMensajeNuevo } from "@/modules/mensajeria/application/ports";

// `apellidos` y `rut` no van en el correo: solo los usa quien llama para registrar una falla de
// envío (RF-44).
export type DestinatarioAvisoMensaje = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  activo: boolean;
};

export type ResultadoAvisarMensajeNuevo =
  | { estado: "OMITIDO" }
  | { estado: "ENVIADO" }
  // RF-44: el envío falló. Vuelve el error y el destinatario para que el llamador lo registre en
  // `fallas-correo.txt`; el caso de uso no conoce el logger.
  | { estado: "FALLIDO"; error: unknown; destinatario: DestinatarioAvisoMensaje };

// RF-31: correo de aviso al notificador cuando el equipo revisor le escribe. Nunca lleva el
// contenido del mensaje (el puerto ni siquiera lo recibe). Se omite si el envío de correo no está
// disponible o si la cuenta ya no existe o está inactiva. Solo el ENVÍO se captura (FALLIDO); un
// fallo al buscar al destinatario se propaga y quien llama lo registra como falla de preparación.
// El mensaje ya quedó guardado antes y este caso de uso no escribe nada.
export async function avisarMensajeNuevo(
  datos: { notificadorId: string; formatoExcelNombre: string; anio: number },
  dependencias: {
    enviador: EnviadorAvisoMensajeNuevo;
    buscarDestinatario: (id: string) => Promise<DestinatarioAvisoMensaje | null>;
  },
): Promise<ResultadoAvisarMensajeNuevo> {
  if (!dependencias.enviador.disponible()) {
    return { estado: "OMITIDO" };
  }

  const destinatario = await dependencias.buscarDestinatario(datos.notificadorId);

  if (!destinatario || !destinatario.activo) {
    return { estado: "OMITIDO" };
  }

  try {
    await dependencias.enviador.enviarAviso({
      destinatario: { nombres: destinatario.nombres, email: destinatario.email },
      formatoExcelNombre: datos.formatoExcelNombre,
      anio: datos.anio,
    });
  } catch (error) {
    return { estado: "FALLIDO", error, destinatario };
  }

  return { estado: "ENVIADO" };
}
