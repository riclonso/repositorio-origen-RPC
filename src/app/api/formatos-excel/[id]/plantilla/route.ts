import { NextResponse } from "next/server";
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

// El nombre de archivo viaja entre comillas dobles en `Content-Disposition`: se reemplazan por
// comillas simples para que un nombre de archivo manipulado no pueda cerrar el valor antes de
// tiempo.
function nombreParaDescarga(nombreArchivo: string): string {
  return nombreArchivo.replace(/"/g, "'");
}

// `filename` (ASCII, con los caracteres fuera de rango reemplazados) para clientes antiguos y
// `filename*` (RFC 5987, UTF-8 percent-encoded) para que "Año_Región.csv" llegue con su nombre
// real. Se quitan también los saltos de línea para que el nombre no pueda inyectar cabeceras.
function encabezadoDescarga(nombreArchivo: string): string {
  const nombreSeguro = nombreParaDescarga(nombreArchivo).replace(/[\r\n]/g, "");
  const nombreAscii = nombreSeguro.replace(/[^\x20-\x7e]/g, "_");
  // `encodeURIComponent` deja pasar `'()*`, que RFC 5987 no admite sin codificar.
  const nombreCodificado = encodeURIComponent(nombreSeguro).replace(
    /['()*]/g,
    (caracter) => `%${caracter.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${nombreAscii}"; filename*=UTF-8''${nombreCodificado}`;
}

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

    return new NextResponse(new Uint8Array(plantilla.contenido), {
      status: 200,
      headers: {
        "Content-Type": tipoContenido,
        "Content-Disposition": encabezadoDescarga(
          `${nombreArchivoDesdeFormato(formato.nombre)}.${plantilla.extension}`,
        ),
      },
    });
  } catch (error) {
    logger.error("Error al descargar la plantilla de un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
