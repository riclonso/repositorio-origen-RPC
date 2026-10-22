import {
  destinatarioUsuario,
  registrarFallaCorreo,
  ventanaFallaCorreo,
  type ReferenciasFallaCorreo,
} from "@/infrastructure/logging/fallasCorreo";
import type { FalloEnvioAlerta } from "@/modules/ventanas-carga/application/ports";
import type { NotificadorPendiente } from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";

// RF-44: traduce lo que devuelven los casos de uso de alertas a entradas de `fallas-correo.txt`.
// Lo usan el scheduler y los dos Route Handlers de envío manual. La fila ERROR de
// `alerta_notificacion_ventana` (con el diagnóstico saneado) se sigue escribiendo igual en el caso
// de uso; esto es un registro adicional.

type ModalidadAlerta = NonNullable<ReferenciasFallaCorreo["modalidad"]>;

export function registrarFallosEnvioAlerta(fallos: readonly FalloEnvioAlerta[], modalidad: ModalidadAlerta): void {
  for (const fallo of fallos) {
    registrarFallaCorreo({
      tipoAviso: "ALERTA_VENTANA",
      etapa: "ENVIO",
      ventana: ventanaFallaCorreo(fallo),
      destinatario: destinatarioUsuario(fallo.destinatario),
      referencias: { loteId: fallo.loteId, modalidad },
      error: fallo.error,
    });
  }
}

// Una entrada por aviso (ventana), no por destinatario, salvo el envío individual, que ya conoce
// al suyo.
export function registrarAlertaSinConfiguracion(
  ventana: { ventanaCargaId: string; formatoExcelNombre: string; anio: number },
  modalidad: ModalidadAlerta,
  destinatario: NotificadorPendiente | null = null,
): void {
  registrarFallaCorreo({
    tipoAviso: "ALERTA_VENTANA",
    etapa: "SIN_CONFIGURACION",
    ventana: ventanaFallaCorreo(ventana),
    destinatario: destinatario ? destinatarioUsuario(destinatario) : null,
    referencias: { modalidad },
  });
}
