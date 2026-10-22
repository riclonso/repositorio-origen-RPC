import { after } from "next/server";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoNotificador,
} from "@/app/api/_lib/http";
import {
  aMensajeVista,
  respuestaRecursoNoEncontrado,
  respuestaSinConversacion,
} from "@/app/api/_lib/mensajeria";
import { nombreVentanaCarga, registrarFallaCorreo } from "@/infrastructure/logging/fallasCorreo";
import {
  avisarMensajeNuevoRevisores,
  type NotificadorAvisoMensaje,
} from "@/modules/mensajeria/application/use-cases/AvisarMensajeNuevoRevisores";
import type { ResultadoResponderMensajeNotificador } from "@/modules/mensajeria/application/use-cases/ResponderMensajeNotificador";
import { avisoMensajeRevisoresMailer } from "@/modules/mensajeria/infrastructure/email/AvisoMensajeMailer";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import {
  aDestinatarioFallaCorreo,
  destinatarioEquipoRevisorSinConsultar,
} from "@/modules/usuarios/infrastructure/destinatarios/obtenerDestinatariosEquipoRevisor";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";

// RF-31: helpers de `/api/notificador/ventanas-carga/**` (mensajería del lado notificador).
// Reexporta el guard genérico y los helpers compartidos de mensajería.
export {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aMensajeVista,
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
  respuestaSinConversacion,
  type AccesoNotificador,
};

// Adaptador de infraestructura para el caso de uso: solo el nombre completo y el establecimiento.
async function buscarNotificadorAviso(usuarioId: string): Promise<NotificadorAvisoMensaje | null> {
  const usuario = await prismaUsuarioRepository.obtenerPorId(usuarioId);
  return usuario
    ? { nombreCompleto: `${usuario.nombres} ${usuario.apellidos}`, establecimientoNombre: usuario.establecimientoNombre }
    : null;
}

// Lo que el Route Handler recibe de `responderMensajeNotificador` cuando el mensaje quedó guardado.
type RespuestaNotificadorGuardada = Extract<ResultadoResponderMensajeNotificador, { ok: true }>;

// RF-31 (ampliación): el correo al equipo revisor se DIFIERE con `after()`: el mensaje ya quedó
// guardado y el 201 no depende del SMTP. Anti-ráfaga por hilo (notificador, ventana): solo se
// programa si, antes de este mensaje, el equipo revisor no tenía respuestas sin leer de este
// notificador en esa ventana (`eraPrimerNoLeido`). Las demás reglas viven en
// `avisarMensajeNuevoRevisores`. RF-44: toda falla del camino del aviso (conteo anti-ráfaga, SMTP
// sin configurar, preparación o envío por destinatario) solo se registra en `fallas-correo.txt`;
// nunca llega al usuario. Nunca con el contenido del mensaje.
export function programarAvisoMensajeRevisores(guardado: RespuestaNotificadorGuardada): void {
  const { mensaje } = guardado;
  const contexto = {
    tipoAviso: "AVISO_MENSAJE_REVISORES" as const,
    referencias: { cargaArchivoId: mensaje.cargaArchivoId, mensajeCargaId: mensaje.id },
  };
  // Sin consultas extra solo para registrar: el nombre de la ventana se conoce recién cuando el
  // caso de uso la resuelve.
  const ventanaSinNombre = { ventanaCargaId: mensaje.ventanaCargaId, nombre: null };

  if (guardado.conteoFallido) {
    registrarFallaCorreo({
      ...contexto,
      etapa: "PREPARACION",
      ventana: ventanaSinNombre,
      destinatario: destinatarioEquipoRevisorSinConsultar(),
      error: guardado.errorConteoAviso,
    });
    return;
  }

  if (!guardado.eraPrimerNoLeido) return;

  // Una sola entrada por aviso (no por revisor): sin SMTP no se consulta a quién iría.
  if (!avisoMensajeRevisoresMailer.disponible()) {
    registrarFallaCorreo({
      ...contexto,
      etapa: "SIN_CONFIGURACION",
      ventana: ventanaSinNombre,
      destinatario: destinatarioEquipoRevisorSinConsultar(),
    });
    return;
  }

  after(() =>
    avisarMensajeNuevoRevisores(
      { notificadorId: mensaje.notificadorId, ventanaCargaId: mensaje.ventanaCargaId },
      {
        enviador: avisoMensajeRevisoresMailer,
        buscarNotificador: buscarNotificadorAviso,
        repositorio: prismaMensajeCargaRepository,
      },
    )
      .then((resultado) => {
        if (resultado.estado !== "ENVIADO") return;

        const ventana = {
          ventanaCargaId: mensaje.ventanaCargaId,
          nombre: nombreVentanaCarga(resultado.formatoExcelNombre, resultado.anio),
        };

        for (const fallo of resultado.fallidos) {
          registrarFallaCorreo({
            ...contexto,
            etapa: "ENVIO",
            ventana,
            destinatario: aDestinatarioFallaCorreo(fallo.destinatario),
            error: fallo.error,
          });
        }
      })
      .catch((error: unknown) => {
        registrarFallaCorreo({
          ...contexto,
          etapa: "PREPARACION",
          ventana: ventanaSinNombre,
          destinatario: destinatarioEquipoRevisorSinConsultar(),
          error,
        });
      }),
  );
}
