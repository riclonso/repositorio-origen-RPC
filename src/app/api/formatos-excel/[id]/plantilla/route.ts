import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerPlantillaFormatoExcel } from "@/modules/formatos-excel/application/use-cases/ObtenerPlantillaFormatoExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { obtenerFormatoExcel } from "@/modules/formatos-excel/application/use-cases/ObtenerFormatoExcel";
import { sincronizarCabeceraPlantillaExcelJs } from "@/modules/formatos-excel/infrastructure/escritura-plantilla/SincronizadorCabeceraPlantillaExcelJs";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  idFormatoExcelSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";
import { exigirSesion } from "@/app/api/_lib/http";
import { esPerfilAdministrador, esPerfilNotificador, esPerfilRevisorRepositorio } from "@/modules/perfiles/domain/entities/Perfil";

// El nombre de archivo viaja entre comillas dobles en `Content-Disposition`: se reemplazan por
// comillas simples para que un nombre de archivo manipulado no pueda cerrar el valor antes de
// tiempo.
function nombreParaDescarga(nombreArchivo: string): string {
  return nombreArchivo.replace(/"/g, "'");
}

// Único endpoint de todo el módulo que consulta `contenidoPlantilla`.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirSesion()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const puedeAdministrarFormato = esPerfilAdministrador(acceso.sesion.perfil) || esPerfilRevisorRepositorio(acceso.sesion.perfil);
  const esNotificadorAsignado =
    esPerfilNotificador(acceso.sesion.perfil) &&
    (await prismaFormatoExcelRepository.estaAsignadoYActivo(acceso.sesion.sub, idValido.data));

  if (!puedeAdministrarFormato && !esNotificadorAsignado) {
    return respuestaSinAcceso(403);
  }

  try {
    // La plantilla original no se reemplaza al editar, pero sus encabezados sí deben reflejar las
    // columnas vigentes. Por eso se leen en paralelo el binario y la configuración actual, y se
    // sincroniza la primera fila justo antes de descargar.
    const [plantilla, formato] = await Promise.all([
      obtenerPlantillaFormatoExcel(idValido.data, { repositorio: prismaFormatoExcelRepository }),
      obtenerFormatoExcel(idValido.data, { repositorio: prismaFormatoExcelRepository }),
    ]);

    if (!plantilla || !formato) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    const contenidoPlantilla = await sincronizarCabeceraPlantillaExcelJs(
      plantilla.contenidoPlantilla,
      plantilla.tipoContenidoPlantilla,
      formato.columnas.map((columna) => columna.nombre),
    );

    return new NextResponse(new Uint8Array(contenidoPlantilla), {
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
