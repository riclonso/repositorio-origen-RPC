import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { cambiarArchivadoVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/CambiarArchivadoVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import { cambiarArchivadoVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
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

// Archiva/desarchiva una ventana de carga, en un endpoint dedicado y separado del PUT de
// fechas/formato y del PATCH de publicación. Simétrico entre ADMIN y REVISOR_REPOSITORIO, sin
// restricción de ownership (a diferencia de la eliminación) ni de estado previo: se puede
// archivar cualquier ventana, en cualquier estado. Archivar apaga la publicación en la misma
// escritura atómica (ver `cambiarArchivadoVentanaCarga`).
export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ARCHIVO_CAMBIADO",
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

  const datos = cambiarArchivadoVentanaCargaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await cambiarArchivadoVentanaCarga(idValido.data, datos.data.archivada, {
      repositorio: prismaVentanaCargaRepository,
    });

    if (!resultado.ok) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ARCHIVO_CAMBIADO",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        ventanaCargaId: idValido.data,
        archivada: datos.data.archivada,
      });
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_ARCHIVO_CAMBIADO",
      resultado: "EXITO",
      ventanaCargaId: resultado.ventana.id,
      anio: resultado.ventana.anio,
      archivada: resultado.ventana.archivada,
      publicada: resultado.ventana.publicada,
    });

    const ahora = new Date();
    return NextResponse.json({
      ventana: aVentanaCargaDTO({ ...resultado.ventana, abierta: estaAbierta(resultado.ventana, ahora) }),
    });
  } catch (error) {
    logger.error("Error al cambiar el archivado de una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
