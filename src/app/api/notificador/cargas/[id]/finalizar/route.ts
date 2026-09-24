import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { finalizarYEnviarCarga } from "@/modules/reporte-excel/application/use-cases/FinalizarYEnviarCarga";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { auditarCargaArchivo } from "@/modules/reporte-excel/infrastructure/auditoria/auditarCargaArchivo";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aCargaArchivoDTO,
  exigirNotificador,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/notificador/cargas/_lib/http";

const ACCION = "CARGA_ARCHIVO_FINALIZADA" as const;

// Reemplaza al viejo "dar visto bueno" del propio notificador (corrección: fin de la
// autoaprobación). Solo el mismo notificador que subió el archivo puede finalizarlo y enviarlo a
// decisión de un tercero; es irreversible: no hay endpoint ni UI para deshacerlo, y no admite doble
// finalización.
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarCargaArchivo(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        cargaArchivoId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const resultado = await finalizarYEnviarCarga(idValido.data, acceso.sesion.sub, {
      repositorio: prismaCargaArchivoRepository,
    });

    if (!resultado.ok) {
      auditarCargaArchivo(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        cargaArchivoId: idValido.data,
      });

      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarCargaArchivo(acceso.sesion, request, {
      accion: ACCION,
      resultado: "EXITO",
      cargaArchivoId: resultado.carga.id,
      formatoExcelId: resultado.carga.formatoExcelId,
    });

    return NextResponse.json({ carga: aCargaArchivoDTO(resultado.carga) });
  } catch (error) {
    logger.error("Error al finalizar y enviar una carga de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
