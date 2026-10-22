import { after, type NextResponse } from "next/server";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirRevisor,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoRevisor,
} from "@/app/api/_lib/http";
import {
  aMensajeVista,
  respuestaRecursoNoEncontrado,
  respuestaSinConversacion,
} from "@/app/api/_lib/mensajeria";
import {
  destinatarioUsuario,
  registrarFallaCorreo,
  ventanaFallaCorreo,
} from "@/infrastructure/logging/fallasCorreo";
import {
  avisarMensajeNuevo,
  type DestinatarioAvisoMensaje,
} from "@/modules/mensajeria/application/use-cases/AvisarMensajeNuevo";
import type { ResultadoEnviarMensajeRevisor } from "@/modules/mensajeria/application/use-cases/EnviarMensajeRevisor";
import type { ConversacionVentanaResumen } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { avisoMensajeMailer } from "@/modules/mensajeria/infrastructure/email/AvisoMensajeMailer";
import type { ConversacionVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";

// RF-31: helpers de `/api/revisor/**`. Reexporta el guard genérico y los helpers compartidos de
// mensajería, mismo patrón que el resto de carpetas de API.
export {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aMensajeVista,
  exigirRevisor,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
  respuestaSinConversacion,
  type AccesoRevisor,
};

export function aConversacionVista(conversacion: ConversacionVentanaResumen): ConversacionVista {
  return {
    notificadorId: conversacion.notificadorId,
    nombreCompleto: conversacion.nombreCompleto,
    rut: conversacion.rut,
    noLeidos: conversacion.noLeidos,
    ultimoMensajeEn: conversacion.ultimoMensajeEn.toISOString(),
  };
}

export function respuestaCargaNoEncontrada(): NextResponse {
  return respuestaError("La carga no existe", 404, { codigo: "NO_ENCONTRADO" });
}

// Genérico (409), sin distinguir si la carga ya fue decidida o todavía no fue finalizada, mismo
// criterio que `respuestaCargaNoPendiente` de `/api/dashboard/cargas`.
export function respuestaCargaNoPendiente(): NextResponse {
  return respuestaError(
    "Solo puedes iniciar una conversación sobre una carga pendiente de decisión que el notificador ya haya enviado",
    409,
    { codigo: "NO_PENDIENTE" },
  );
}

// Adaptador de infraestructura para el caso de uso: los datos que necesita el aviso, más apellidos
// y RUT para el registro de fallas de correo (RF-44).
async function buscarDestinatarioAviso(usuarioId: string): Promise<DestinatarioAvisoMensaje | null> {
  const usuario = await prismaUsuarioRepository.obtenerPorId(usuarioId);
  return usuario
    ? {
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        rut: usuario.rut,
        email: usuario.email,
        activo: usuario.activo,
      }
    : null;
}

// Lo que el Route Handler recibe de `enviarMensajeRevisor*` cuando el mensaje quedó guardado.
type MensajeRevisorGuardado = Extract<ResultadoEnviarMensajeRevisor, { ok: true }>;

// El correo al notificador se DIFIERE con `after()`: el mensaje ya quedó guardado y el 201 no
// depende del SMTP. Anti-ráfaga por ventana: solo se programa si, antes de este mensaje, el
// notificador no tenía mensajes del equipo revisor sin leer en esa ventana (`eraPrimerNoLeido`).
// Las demás reglas (correo no disponible, cuenta inexistente o inactiva) viven en
// `avisarMensajeNuevo`. RF-44: toda falla del camino del aviso (conteo anti-ráfaga, SMTP sin
// configurar, preparación o envío) solo se registra en `fallas-correo.txt`; nunca llega al usuario.
export function programarAvisoMensajeNuevo(guardado: MensajeRevisorGuardado): void {
  const { mensaje, carga } = guardado;
  const contexto = {
    tipoAviso: "AVISO_MENSAJE_NOTIFICADOR" as const,
    ventana: ventanaFallaCorreo(carga),
    referencias: { cargaArchivoId: carga.id, mensajeCargaId: mensaje.id },
  };
  const destinatarioConocido = destinatarioUsuario({ id: carga.usuarioId, rut: carga.usuarioRut });

  if (guardado.conteoFallido) {
    registrarFallaCorreo({
      ...contexto,
      etapa: "PREPARACION",
      destinatario: destinatarioConocido,
      error: guardado.errorConteoAviso,
    });
    return;
  }

  if (!guardado.eraPrimerNoLeido) return;

  if (!avisoMensajeMailer.disponible()) {
    registrarFallaCorreo({ ...contexto, etapa: "SIN_CONFIGURACION", destinatario: destinatarioConocido });
    return;
  }

  after(() =>
    avisarMensajeNuevo(
      { notificadorId: carga.usuarioId, formatoExcelNombre: carga.formatoExcelNombre, anio: carga.anio },
      { enviador: avisoMensajeMailer, buscarDestinatario: buscarDestinatarioAviso },
    )
      .then((resultado) => {
        if (resultado.estado !== "FALLIDO") return;

        registrarFallaCorreo({
          ...contexto,
          etapa: "ENVIO",
          destinatario: destinatarioUsuario({ id: carga.usuarioId, ...resultado.destinatario }),
          error: resultado.error,
        });
      })
      .catch((error: unknown) => {
        registrarFallaCorreo({ ...contexto, etapa: "PREPARACION", destinatario: destinatarioConocido, error });
      }),
  );
}
