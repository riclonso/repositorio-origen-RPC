import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { enviarAlertaIndividualVentana } from "@/modules/ventanas-carga/application/use-cases/EnviarAlertaIndividualVentana";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaAlertaNotificacionRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaAlertaNotificacionRepository";
import { alertaVentanaMailer } from "@/modules/ventanas-carga/infrastructure/email/AlertaVentanaMailer";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import { enviarAlertaIndividualSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idVentanaCargaSchema,
  respuestaDestinatarioNoPendiente,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/ventanas-carga/_lib/http";

// RF-17: envío individual desde el modal de una fila de la tabla de pendientes. Revalida en
// servidor que el destinatario sigue pendiente (nunca confía en el id recibido del cliente).
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ALERTA_INDIVIDUAL_ENVIADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        ventanaCargaId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idVentanaCargaSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = enviarAlertaIndividualSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await enviarAlertaIndividualVentana(
      idValido.data,
      datos.data.usuarioId,
      datos.data.mensaje,
      acceso.sesion.sub,
      {
        repositorioVentanas: prismaVentanaCargaRepository,
        repositorioAlertas: prismaAlertaNotificacionRepository,
        enviadorCorreo: alertaVentanaMailer,
      },
    );

    if (!resultado.ok) {
      if (resultado.motivo === "DESTINATARIO_NO_PENDIENTE") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_ALERTA_INDIVIDUAL_ENVIADA",
          resultado: "RECHAZADO",
          motivo: "DESTINATARIO_NO_PENDIENTE",
          ventanaCargaId: idValido.data,
          destinatarioId: datos.data.usuarioId,
        });
        return respuestaDestinatarioNoPendiente();
      }

      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ALERTA_INDIVIDUAL_ENVIADA",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        ventanaCargaId: idValido.data,
        destinatarioId: datos.data.usuarioId,
      });
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_ALERTA_INDIVIDUAL_ENVIADA",
      resultado: "EXITO",
      ventanaCargaId: idValido.data,
      destinatarioId: datos.data.usuarioId,
      loteId: resultado.loteId,
      cantidadExitos: resultado.resultado === "EXITO" ? 1 : 0,
      cantidadErrores: resultado.resultado === "ERROR" ? 1 : 0,
    });

    return NextResponse.json({ loteId: resultado.loteId, resultado: resultado.resultado });
  } catch (error) {
    logger.error("Error al enviar la alerta individual de una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
