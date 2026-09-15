import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerCargaPropia } from "@/modules/reporte-excel/application/use-cases/ObtenerCargaPropia";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aCargaArchivoDTO,
  exigirNotificador,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/notificador/cargas/_lib/http";

// Ownership explícito por `usuarioId = sesión.sub`: una carga que no es del actor responde 404,
// nunca se distingue "no existe" de "no es tuya" hacia afuera.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const carga = await obtenerCargaPropia(idValido.data, acceso.sesion.sub, {
      repositorio: prismaCargaArchivoRepository,
    });

    if (!carga) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return NextResponse.json({ carga: aCargaArchivoDTO(carga) });
  } catch (error) {
    logger.error("Error al obtener una carga de archivo propia", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
