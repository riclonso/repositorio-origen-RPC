import type {
  DatosCorreoAvisoMensajeRevisores,
  DestinatarioAvisoRevisores,
  EnviadorAvisoMensajeRevisores,
} from "@/modules/mensajeria/application/ports";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

export type NotificadorAvisoMensaje = {
  nombreCompleto: string;
  establecimientoNombre: string | null;
};

// Destinatario cuyo envío falló, con el error capturado. El llamador lo registra en
// `fallas-correo.txt` (RF-44); este caso de uso no conoce el logger.
export type FalloAvisoRevisores = { destinatario: DestinatarioAvisoRevisores; error: unknown };

export type ResultadoAvisarMensajeNuevoRevisores =
  | { estado: "OMITIDO" }
  | {
      estado: "ENVIADO";
      enviados: number;
      fallidos: FalloAvisoRevisores[];
      // Formato y año de la ventana, ya resueltos: el llamador nombra la ventana en el registro de
      // fallas sin volver a consultarla.
      formatoExcelNombre: string;
      anio: number;
    };

// RF-31 (ampliación): correo de aviso al equipo revisor cuando el notificador responde en su hilo.
// Nunca lleva el contenido del mensaje (el puerto ni siquiera lo recibe). Se omite si el envío de
// correo no está disponible (sin consultar nada), si el notificador o la ventana ya no existen, o si
// no hay destinatarios. El fallo de un destinatario NO corta a los demás: se acumula en `fallidos`
// para que el llamador lo registre. Un fallo al preparar (consultas) se propaga. No escribe en BD:
// el mensaje ya quedó guardado antes.
export async function avisarMensajeNuevoRevisores(
  datos: { notificadorId: string; ventanaCargaId: string },
  dependencias: {
    enviador: EnviadorAvisoMensajeRevisores;
    buscarNotificador: (id: string) => Promise<NotificadorAvisoMensaje | null>;
    repositorio: Pick<MensajeCargaRepository, "obtenerEtiquetasVentanas">;
  },
): Promise<ResultadoAvisarMensajeNuevoRevisores> {
  if (!dependencias.enviador.disponible()) {
    return { estado: "OMITIDO" };
  }

  const [notificador, etiquetas] = await Promise.all([
    dependencias.buscarNotificador(datos.notificadorId),
    dependencias.repositorio.obtenerEtiquetasVentanas([datos.ventanaCargaId]),
  ]);
  const etiqueta = etiquetas.find((candidata) => candidata.ventanaCargaId === datos.ventanaCargaId);

  if (!notificador || !etiqueta) {
    return { estado: "OMITIDO" };
  }

  const destinatarios = await dependencias.enviador.resolverDestinatarios();

  if (destinatarios.length === 0) {
    return { estado: "OMITIDO" };
  }

  const datosCorreo: DatosCorreoAvisoMensajeRevisores = {
    notificadorNombre: notificador.nombreCompleto,
    establecimientoNombre: notificador.establecimientoNombre,
    formatoExcelNombre: etiqueta.formatoExcelNombre,
    anio: etiqueta.anio,
  };

  // Captura POR destinatario: un fallo no corta a los demás. Lanzarlos juntos no abre una ráfaga
  // de conexiones: la implementación SMTP del puerto es un pool de una sola conexión que encola los
  // mensajes (mismo criterio que la confirmación de visto bueno).
  const desenlaces = await Promise.all(
    destinatarios.map((destinatario) =>
      dependencias.enviador.enviarAviso(destinatario, datosCorreo).then(
        (): FalloAvisoRevisores | null => null,
        (error: unknown): FalloAvisoRevisores => ({ destinatario, error }),
      ),
    ),
  );
  const fallidos = desenlaces.filter((desenlace): desenlace is FalloAvisoRevisores => desenlace !== null);

  return {
    estado: "ENVIADO",
    enviados: destinatarios.length - fallidos.length,
    fallidos,
    formatoExcelNombre: etiqueta.formatoExcelNombre,
    anio: etiqueta.anio,
  };
}
