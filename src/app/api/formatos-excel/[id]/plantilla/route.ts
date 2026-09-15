import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerPlantillaFormatoExcel } from "@/modules/formatos-excel/application/use-cases/ObtenerPlantillaFormatoExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdmin,
  idFormatoExcelSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";

// El nombre de archivo viaja entre comillas dobles en `Content-Disposition`: se reemplazan por
// comillas simples para que un nombre de archivo manipulado no pueda cerrar el valor antes de
// tiempo.
function nombreParaDescarga(nombreArchivo: string): string {
  return nombreArchivo.replace(/"/g, "'");
}

// Único endpoint de todo el módulo que consulta `contenidoPlantilla`.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const plantilla = await obtenerPlantillaFormatoExcel(idValido.data, {
      repositorio: prismaFormatoExcelRepository,
    });

    if (!plantilla) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return new NextResponse(new Uint8Array(plantilla.contenidoPlantilla), {
      status: 200,
      headers: {
        "Content-Type": plantilla.tipoContenidoPlantilla,
        "Content-Disposition": `attachment; filename="${nombreParaDescarga(plantilla.nombreArchivoPlantilla)}"`,
      },
    });
  } catch (error) {
    logger.error("Error al descargar la plantilla de un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
