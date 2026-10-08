import { respuestaDescarga } from "@/app/api/_lib/descarga";
import { logger } from "@/infrastructure/logging/logger";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { obtenerFormatoExcel } from "@/modules/formatos-excel/application/use-cases/ObtenerFormatoExcel";
import { generarPlantillaDesdeColumnasExcelJs } from "@/modules/formatos-excel/infrastructure/escritura-plantilla/GeneradorPlantillaExcelJs";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  TIPO_CONTENIDO_CSV,
  idFormatoExcelSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";
import { exigirSesion } from "@/app/api/_lib/http";
import { esPerfilAdministrador, esPerfilNotificador, esPerfilRevisorRepositorio } from "@/modules/perfiles/domain/entities/Perfil";

// Nombre de la plantilla generada: el del formato, sin los caracteres que Windows no admite en un
// nombre de archivo (el nombre del archivo original no se expone).
function nombreArchivoDesdeFormato(nombreFormato: string): string {
  return nombreFormato.replace(/[\\/:*?"<>|]/g, "_").trim() || "plantilla";
}

// La plantilla se genera desde la configuración vigente del formato en la BD (solo encabezados),
// para todos los perfiles. El archivo que se subió al crear el formato (`contenidoPlantilla`) no
// se lee ni se entrega: puede traer filas de ejemplo con datos reales, otras hojas o metadatos.
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
    const formato = await obtenerFormatoExcel(idValido.data, {
      repositorio: prismaFormatoExcelRepository,
    });

    if (!formato) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    // El notificador (que descarga desde la ventana de carga) recibe SIEMPRE un `.xlsx`, aunque el
    // formato sea CSV: es más cómodo de llenar en Excel. ADMIN y REVISOR_REPOSITORIO reciben el tipo
    // de archivo del formato.
    const plantilla = await generarPlantillaDesdeColumnasExcelJs(
      formato.columnas.map((columna) => columna.nombre),
      puedeAdministrarFormato ? formato.tipoArchivo : "EXCEL",
      formato.separadorCsv,
    );

    // CSV: UTF-8 con BOM (lo escribe el generador) y `charset` explícito, para que la "ñ" y las
    // tildes no se vean rotas al abrirlo.
    const tipoContenido =
      plantilla.tipoContenido === TIPO_CONTENIDO_CSV
        ? `${TIPO_CONTENIDO_CSV}; charset=utf-8`
        : plantilla.tipoContenido;

    return respuestaDescarga({
      flujo: new Uint8Array(plantilla.contenido),
      tipoContenido,
      nombreArchivo: `${nombreArchivoDesdeFormato(formato.nombre)}.${plantilla.extension}`,
    });
  } catch (error) {
    logger.error("Error al descargar la plantilla de un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
