import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { AlertaNotificacionRepository } from "@/modules/ventanas-carga/domain/repositories/AlertaNotificacionRepository";
import type { EnviadorCorreoAlerta } from "@/modules/ventanas-carga/application/ports";
import { MARCADOR_ENLACE_SISTEMA, sanitizarMensajeResueltoHtml } from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";
import { describirFalloEnvio } from "@/shared/utils/describirFalloEnvio";

export type ResultadoEnviarAlertaIndividualVentana =
  | { ok: true; loteId: string; resultado: "EXITO" | "ERROR" }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" }
  | { ok: false; motivo: "DESTINATARIO_NO_PENDIENTE" };

function asuntoAlerta(formatoExcelNombre: string, anio: number): string {
  return `Recordatorio: reporta tu archivo de ${formatoExcelNombre} (${anio})`;
}

export type DependenciasEnvioAlertaIndividual = {
  repositorioVentanas: VentanaCargaRepository;
  repositorioAlertas: AlertaNotificacionRepository;
  enviadorCorreo: EnviadorCorreoAlerta;
};

// RF-17: envío individual, manual, disparado por un ADMIN/REVISOR_REPOSITORIO desde el modal de
// una fila de la tabla de pendientes. `mensaje` ya viene con los placeholders resueltos por el
// operador (el modal se precarga con el mensaje ya resuelto server-side), pero puede contener el
// marcador `{{enlaceSistema}}` residual si el operador volvió a pulsar el botón de enlace dentro
// del editor: se reemplaza aquí de forma idempotente antes de sanitizar y enviar. Revalida en
// servidor que el destinatario sigue pendiente (nunca confía en que el cliente no manipuló el id),
// mismo criterio de "nunca confiar en datos del cliente" del resto del proyecto.
export async function enviarAlertaIndividualVentana(
  id: string,
  usuarioId: string,
  mensajeHtml: string,
  actorId: string,
  dependencias: DependenciasEnvioAlertaIndividual,
): Promise<ResultadoEnviarAlertaIndividualVentana> {
  const ventana = await dependencias.repositorioVentanas.obtenerPorId(id);

  if (!ventana) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  const pendientes = await dependencias.repositorioVentanas.listarNotificadoresPendientes(id);
  const destinatario = pendientes.find((pendiente) => pendiente.id === usuarioId);

  if (!destinatario) {
    return { ok: false, motivo: "DESTINATARIO_NO_PENDIENTE" };
  }

  const urlEnlaceSistema = dependencias.enviadorCorreo.construirUrlEnlaceSistema();
  const mensajeConEnlaceResuelto = mensajeHtml.replaceAll(MARCADOR_ENLACE_SISTEMA, urlEnlaceSistema);
  const mensajeSanitizado = sanitizarMensajeResueltoHtml(mensajeConEnlaceResuelto, urlEnlaceSistema);
  const asunto = asuntoAlerta(ventana.formatoExcelNombre, ventana.anio);
  const loteId = crypto.randomUUID();

  let resultado: "EXITO" | "ERROR" = "EXITO";
  let detalleError: string | null = null;

  try {
    await dependencias.enviadorCorreo.enviar({
      destinatarioEmail: destinatario.email,
      asunto,
      html: mensajeSanitizado,
    });
  } catch (error) {
    resultado = "ERROR";
    detalleError = describirFalloEnvio(error);
  }

  await dependencias.repositorioAlertas.crearLote([
    {
      loteId,
      ventanaCargaId: id,
      usuarioId: destinatario.id,
      tipo: "MANUAL_INDIVIDUAL",
      resultado,
      asunto,
      mensaje: mensajeSanitizado,
      detalleError,
      disparadoPorId: actorId,
      fechaProgramada: null,
    },
  ]);

  return { ok: true, loteId, resultado };
}
