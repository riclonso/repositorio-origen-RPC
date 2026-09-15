import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerCargaPropia } from "@/modules/reporte-excel/application/use-cases/ObtenerCargaPropia";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { generadorErroresExcelJs } from "@/modules/reporte-excel/infrastructure/generacion-excel/GeneradorErroresExcelJs";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirNotificador,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/notificador/cargas/_lib/http";

const TIPO_CONTENIDO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// El nombre de archivo viaja entre comillas dobles en `Content-Disposition`: se reemplazan por
// comillas simples para que un nombre de archivo manipulado no pueda cerrar el valor antes de
// tiempo, mismo criterio que la descarga del binario original en `/api/dashboard/cargas/[id]/archivo`.
function nombreParaDescarga(nombreArchivoOriginal: string): string {
  const sinExtension = nombreArchivoOriginal.replace(/\.[^./\\]+$/, "");
  return `errores-${sinExtension}.xlsx`.replace(/"/g, "'");
}

// Ownership explícito por `usuarioId = sesión.sub`, mismo criterio que el resto de
// `/api/notificador/cargas/**`: una carga que no es del actor responde 404, nunca se distingue
// "no existe" de "no es tuya". También 404 si no tiene ningún error (no tiene sentido descargar
// un Excel vacío). Es una lectura: no se audita.
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

    if (!carga || carga.errores.length === 0) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    const buffer = await generadorErroresExcelJs.generar(carga.errores);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": TIPO_CONTENIDO_XLSX,
        "Content-Disposition": `attachment; filename="${nombreParaDescarga(carga.nombreArchivoOriginal)}"`,
      },
    });
  } catch (error) {
    logger.error("Error al generar el Excel de errores de una carga propia", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
