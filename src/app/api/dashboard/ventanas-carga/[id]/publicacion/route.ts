import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { cambiarPublicacionVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/CambiarPublicacionVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import { cambiarPublicacionVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
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
  respuestaVentanaArchivada,
  respuestaVentanaEliminada,
} from "@/app/api/dashboard/ventanas-carga/_lib/http";

// Publica/despublica una ventana de carga (RF-15 ampliación), en un endpoint dedicado y separado
// del PUT de fechas/tipo: mientras no esté publicada, el notificador no debe verla. Simétrico
// entre ADMIN y REVISOR_REPOSITORIO, sin restricción de ownership (a diferencia de la eliminación).
export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_PUBLICACION_CAMBIADA",
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

  const datos = cambiarPublicacionVentanaCargaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await cambiarPublicacionVentanaCarga(idValido.data, datos.data.publicada, {
      repositorio: prismaVentanaCargaRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "VENTANA_NO_ENCONTRADA") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_PUBLICACION_CAMBIADA",
          resultado: "RECHAZADO",
          motivo: "NO_ENCONTRADO",
          ventanaCargaId: idValido.data,
          publicada: datos.data.publicada,
        });
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      if (resultado.motivo === "VENTANA_ARCHIVADA") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_PUBLICACION_CAMBIADA",
          resultado: "RECHAZADO",
          motivo: "VENTANA_ARCHIVADA",
          ventanaCargaId: idValido.data,
          publicada: datos.data.publicada,
        });
        return respuestaVentanaArchivada();
      }

      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_PUBLICACION_CAMBIADA",
        resultado: "RECHAZADO",
        motivo: "VENTANA_ELIMINADA",
        ventanaCargaId: idValido.data,
        publicada: datos.data.publicada,
      });
      return respuestaVentanaEliminada();
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_PUBLICACION_CAMBIADA",
      resultado: "EXITO",
      ventanaCargaId: resultado.ventana.id,
      anio: resultado.ventana.anio,
      publicada: resultado.ventana.publicada,
    });

    const ahora = new Date();
    return NextResponse.json({
      ventana: aVentanaCargaDTO({ ...resultado.ventana, abierta: estaAbierta(resultado.ventana, ahora) }),
    });
  } catch (error) {
    logger.error("Error al cambiar la publicación de una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
