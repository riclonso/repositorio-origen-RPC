import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { enviarAlertaMasivaVentana } from "@/modules/ventanas-carga/application/use-cases/EnviarAlertaMasivaVentana";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaAlertaNotificacionRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaAlertaNotificacionRepository";
import { alertaVentanaMailer } from "@/modules/ventanas-carga/infrastructure/email/AlertaVentanaMailer";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idVentanaCargaSchema,
  respuestaError,
  respuestaSinAcceso,
  respuestaSinPendientes,
} from "@/app/api/dashboard/ventanas-carga/_lib/http";

// RF-17: envío masivo, manual, a todos los notificadores pendientes de esta ventana. Un intento
// por destinatario, sin reintento (a diferencia del ciclo automático).
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ALERTA_MASIVA_ENVIADA",
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

  try {
    const resultado = await enviarAlertaMasivaVentana(idValido.data, acceso.sesion.sub, {
      repositorioVentanas: prismaVentanaCargaRepository,
      repositorioAlertas: prismaAlertaNotificacionRepository,
      enviadorCorreo: alertaVentanaMailer,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "SIN_PENDIENTES") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_ALERTA_MASIVA_ENVIADA",
          resultado: "RECHAZADO",
          motivo: "SIN_PENDIENTES",
          ventanaCargaId: idValido.data,
        });
        return respuestaSinPendientes();
      }

      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ALERTA_MASIVA_ENVIADA",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        ventanaCargaId: idValido.data,
      });
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    const cantidadExitos = resultado.resultados.filter((fila) => fila.resultado === "EXITO").length;
    const cantidadErrores = resultado.resultados.length - cantidadExitos;

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_ALERTA_MASIVA_ENVIADA",
      resultado: "EXITO",
      ventanaCargaId: idValido.data,
      loteId: resultado.loteId,
      cantidadExitos,
      cantidadErrores,
    });

    return NextResponse.json({ loteId: resultado.loteId, cantidadExitos, cantidadErrores });
  } catch (error) {
    logger.error("Error al enviar la alerta masiva de una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
