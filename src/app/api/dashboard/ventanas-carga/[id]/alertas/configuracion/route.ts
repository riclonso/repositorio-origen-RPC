import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { configurarAlertasVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/ConfigurarAlertasVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import { configurarAlertasVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
import { estaAbierta } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aVentanaCargaDTO,
  exigirAdminORevisor,
  idVentanaCargaSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/ventanas-carga/_lib/http";

// RF-17: activa/desactiva el envío automático de alertas de una ventana. Simétrico entre ADMIN y
// REVISOR_REPOSITORIO, mismo criterio que `publicacion`/`archivado`.
export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ALERTAS_CONFIGURADAS",
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

  const datos = configurarAlertasVentanaCargaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await configurarAlertasVentanaCarga(idValido.data, datos.data, {
      repositorio: prismaVentanaCargaRepository,
    });

    if (!resultado.ok) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ALERTAS_CONFIGURADAS",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        ventanaCargaId: idValido.data,
      });
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_ALERTAS_CONFIGURADAS",
      resultado: "EXITO",
      ventanaCargaId: resultado.ventana.id,
      anio: resultado.ventana.anio,
      diasAnticipacionInicio: resultado.ventana.diasAnticipacionInicio,
      intervaloRepeticionDias: resultado.ventana.intervaloRepeticionDias,
    });

    const ahora = new Date();
    return NextResponse.json({
      ventana: aVentanaCargaDTO({ ...resultado.ventana, abierta: estaAbierta(resultado.ventana, ahora) }),
    });
  } catch (error) {
    logger.error("Error al configurar las alertas de una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
