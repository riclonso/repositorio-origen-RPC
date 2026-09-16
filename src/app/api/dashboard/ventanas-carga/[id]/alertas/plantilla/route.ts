import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarPlantillaAlertaVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/ActualizarPlantillaAlertaVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import { actualizarPlantillaAlertaVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
import { estaAbierta } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aVentanaCargaDTO,
  exigirAdminORevisor,
  idVentanaCargaSchema,
  respuestaError,
  respuestaPlaceholderInvalido,
  respuestaSinAcceso,
} from "@/app/api/dashboard/ventanas-carga/_lib/http";

// RF-17: guarda la plantilla HTML editada en el editor enriquecido. El HTML crudo del cliente
// SIEMPRE pasa por `sanitizarPlantillaAlertaHtml` dentro del caso de uso antes de persistirse;
// este handler nunca reenvía el body recibido sin pasar por ahí.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_PLANTILLA_ALERTA_ACTUALIZADA",
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

  const datos = actualizarPlantillaAlertaVentanaCargaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await actualizarPlantillaAlertaVentanaCarga(idValido.data, datos.data.plantillaAlerta, {
      repositorio: prismaVentanaCargaRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "PLACEHOLDER_INVALIDO") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_PLANTILLA_ALERTA_ACTUALIZADA",
          resultado: "RECHAZADO",
          motivo: "PLACEHOLDER_INVALIDO",
          ventanaCargaId: idValido.data,
        });
        return respuestaPlaceholderInvalido(resultado.placeholder);
      }

      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_PLANTILLA_ALERTA_ACTUALIZADA",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        ventanaCargaId: idValido.data,
      });
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_PLANTILLA_ALERTA_ACTUALIZADA",
      resultado: "EXITO",
      ventanaCargaId: resultado.ventana.id,
      anio: resultado.ventana.anio,
    });

    const ahora = new Date();
    return NextResponse.json({
      ventana: aVentanaCargaDTO({ ...resultado.ventana, abierta: estaAbierta(resultado.ventana, ahora) }),
    });
  } catch (error) {
    logger.error("Error al actualizar la plantilla de alerta de una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
