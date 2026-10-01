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
import { logger } from "@/infrastructure/logging/logger";
import {
  avisarMensajeNuevo,
  type DestinatarioAvisoMensaje,
} from "@/modules/mensajeria/application/use-cases/AvisarMensajeNuevo";
import type { ConversacionVentanaResumen } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { avisoMensajeMailer } from "@/modules/mensajeria/infrastructure/email/AvisoMensajeMailer";
import type { ConversacionVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
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

// Adaptador de infraestructura para el caso de uso: solo los tres datos que necesita el aviso.
async function buscarDestinatarioAviso(usuarioId: string): Promise<DestinatarioAvisoMensaje | null> {
  const usuario = await prismaUsuarioRepository.obtenerPorId(usuarioId);
  return usuario ? { nombres: usuario.nombres, email: usuario.email, activo: usuario.activo } : null;
}

// El correo al notificador se DIFIERE con `after()`: el mensaje ya quedó guardado y el 201 no
// depende del SMTP. Anti-ráfaga por ventana: solo se programa si, antes de este mensaje, el
// notificador no tenía mensajes del equipo revisor sin leer en esa ventana (`eraPrimerNoLeido`).
// Las demás reglas (correo no disponible, cuenta inexistente o inactiva) viven en
// `avisarMensajeNuevo`; un fallo del envío solo se registra.
export function programarAvisoMensajeNuevo(carga: CargaArchivo, eraPrimerNoLeido: boolean): void {
  if (!eraPrimerNoLeido) return;

  after(() =>
    avisarMensajeNuevo(
      { notificadorId: carga.usuarioId, formatoExcelNombre: carga.formatoExcelNombre, anio: carga.anio },
      { enviador: avisoMensajeMailer, buscarDestinatario: buscarDestinatarioAviso },
    ).catch((error: unknown) => {
      logger.error("Error al enviar el correo de aviso de un mensaje nuevo sobre una carga", {
        cargaArchivoId: carga.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}
