import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { registrarIntentoSubida } from "@/infrastructure/logging/logUpload";
import { validarYCargarArchivo } from "@/modules/reporte-excel/application/use-cases/ValidarYCargarArchivo";
import { listarCargasPropias } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { lectorArchivoReporteExcelJs } from "@/modules/reporte-excel/infrastructure/lectura-archivo/LectorArchivoReporteExcelJs";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { auditarCargaArchivo } from "@/modules/reporte-excel/infrastructure/auditoria/auditarCargaArchivo";
import { extraerIp } from "@/shared/utils/peticion";
import {
  listadoCargasSchema,
  subirCargaArchivoSchema,
} from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  TAMANO_MAXIMO_ARCHIVO,
  aCargaArchivoDTO,
  aCargaArchivoResumenDTO,
  exigirNotificador,
  respuestaArchivoInvalido,
  respuestaCargaPendienteDeDecision,
  respuestaError,
  respuestaFormatoNoAsignado,
  respuestaReemplazoNoAutorizado,
  respuestaSinAcceso,
  respuestaSinVentanaAbierta,
  tipoContenidoDesdeArchivo,
  tipoContenidoDesdeNombre,
} from "@/app/api/notificador/cargas/_lib/http";

// Cargas propias del notificador en sesión, paginadas y filtrables por estado/formato. Lectura,
// no se audita.
export async function GET(request: Request) {
  const acceso = await exigirNotificador();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const { searchParams } = new URL(request.url);
  const filtro = listadoCargasSchema.safeParse(Object.fromEntries(searchParams));

  if (!filtro.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await listarCargasPropias(
      {
        usuarioId: acceso.sesion.sub,
        estado: filtro.data.estado,
        formatoExcelId: filtro.data.formatoExcelId,
        pagina: filtro.data.page,
        tamano: filtro.data.pageSize,
      },
      { repositorio: prismaCargaArchivoRepository },
    );

    return NextResponse.json({
      datos: resultado.filas.map(aCargaArchivoResumenDTO),
      paginacion: resultado.paginacion,
    });
  } catch (error) {
    logger.error("Error al listar las cargas propias de un notificador", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Sube y valida un archivo contra un formato asignado. `formatoExcelId` del cliente SIEMPRE se
// valida contra la asignación vigente antes de leer el archivo; nunca se confía en el valor
// recibido.
export async function POST(request: Request) {
  const acceso = await exigirNotificador();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const formData = await request.formData().catch(() => null);
  const archivo = formData?.get("archivo");
  const formatoExcelIdBruto = formData?.get("formatoExcelId");
  const anioBruto = formData?.get("anio");

  const datos = subirCargaArchivoSchema.safeParse({
    formatoExcelId: typeof formatoExcelIdBruto === "string" ? formatoExcelIdBruto : "",
    anio: typeof anioBruto === "string" ? anioBruto : "",
  });

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  if (!(archivo instanceof File)) {
    registrarIntentoSubida({
      evento: "subida_fallida",
      usuarioId: acceso.sesion.sub,
      formatoExcelId: datos.data.formatoExcelId,
      motivo: "ARCHIVO_INVALIDO",
      ip: extraerIp(request),
    });
    auditarCargaArchivo(acceso.sesion, request, {
      accion: "CARGA_ARCHIVO_REGISTRADA",
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
      formatoExcelId: datos.data.formatoExcelId,
    });
    return respuestaArchivoInvalido("Selecciona un archivo para subir");
  }

  if (archivo.size === 0) {
    auditarCargaArchivo(acceso.sesion, request, {
      accion: "CARGA_ARCHIVO_REGISTRADA",
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
      formatoExcelId: datos.data.formatoExcelId,
    });
    return respuestaArchivoInvalido("El archivo está vacío. Selecciona un archivo con datos");
  }

  // Primer filtro, barato: rechaza una extensión no soportada sin leer el archivo completo.
  if (!tipoContenidoDesdeNombre(archivo.name)) {
    auditarCargaArchivo(acceso.sesion, request, {
      accion: "CARGA_ARCHIVO_REGISTRADA",
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
      formatoExcelId: datos.data.formatoExcelId,
    });
    return respuestaArchivoInvalido("El archivo debe tener extensión .xlsx o .csv");
  }

  if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
    auditarCargaArchivo(acceso.sesion, request, {
      accion: "CARGA_ARCHIVO_REGISTRADA",
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
      formatoExcelId: datos.data.formatoExcelId,
    });
    return respuestaArchivoInvalido("El archivo no puede superar los 10 MB");
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());

    if (buffer.byteLength > TAMANO_MAXIMO_ARCHIVO) {
      auditarCargaArchivo(acceso.sesion, request, {
        accion: "CARGA_ARCHIVO_REGISTRADA",
        resultado: "RECHAZADO",
        motivo: "ARCHIVO_INVALIDO",
        formatoExcelId: datos.data.formatoExcelId,
      });
      return respuestaArchivoInvalido("El archivo no puede superar los 10 MB");
    }

    // Validación de fondo: la firma real de los primeros bytes, no solo la extensión del nombre.
    const tipoContenido = tipoContenidoDesdeArchivo(archivo.name, buffer);

    if (!tipoContenido) {
      registrarIntentoSubida({
        evento: "subida_fallida",
        usuarioId: acceso.sesion.sub,
        formatoExcelId: datos.data.formatoExcelId,
        motivo: "ARCHIVO_INVALIDO",
        ip: null,
      });
      auditarCargaArchivo(acceso.sesion, request, {
        accion: "CARGA_ARCHIVO_REGISTRADA",
        resultado: "RECHAZADO",
        motivo: "ARCHIVO_INVALIDO",
        formatoExcelId: datos.data.formatoExcelId,
      });
      return respuestaArchivoInvalido("El contenido del archivo no corresponde a su extensión");
    }

    const resultado = await validarYCargarArchivo(
      {
        formatoExcelId: datos.data.formatoExcelId,
        anio: datos.data.anio,
        usuarioId: acceso.sesion.sub,
        nombreArchivoOriginal: archivo.name,
        tipoContenidoArchivo: tipoContenido,
        contenidoArchivo: buffer,
      },
      {
        repositorio: prismaCargaArchivoRepository,
        repositorioFormatosExcel: prismaFormatoExcelRepository,
        repositorioVentanasCarga: prismaVentanaCargaRepository,
        repositorioSolicitudesReemplazo: prismaSolicitudReemplazoCargaRepository,
        lector: lectorArchivoReporteExcelJs,
      },
    );

    if (!resultado.ok) {
      registrarIntentoSubida({
        evento: "subida_fallida",
        usuarioId: acceso.sesion.sub,
        formatoExcelId: datos.data.formatoExcelId,
        motivo: resultado.motivo,
        ip: null,
      });
      auditarCargaArchivo(acceso.sesion, request, {
        accion: "CARGA_ARCHIVO_REGISTRADA",
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        formatoExcelId: datos.data.formatoExcelId,
      });
      if (resultado.motivo === "FORMATO_NO_ASIGNADO") {
        return respuestaFormatoNoAsignado();
      }

      if (resultado.motivo === "REEMPLAZO_NO_AUTORIZADO") {
        return respuestaReemplazoNoAutorizado();
      }

      if (resultado.motivo === "CARGA_PENDIENTE_DECISION") {
        return respuestaCargaPendienteDeDecision();
      }

      // `SIN_VENTANA_ABIERTA` y `VENTANA_NO_PUBLICADA` comparten la misma respuesta genérica: no
      // debe revelarse que existe un borrador, mismo criterio que ya distingue
      // `FORMATO_NO_ASIGNADO` de "nunca existió" vs. "se dio de baja".
      return respuestaSinVentanaAbierta();
    }

    // El archivo se pudo leer y procesar, tenga o no errores de fila: es una subida exitosa
    // desde el punto de vista del log de subidas (distinto del resultado de validación).
    registrarIntentoSubida({
      evento: "subida_exitosa",
      usuarioId: acceso.sesion.sub,
      formatoExcelId: datos.data.formatoExcelId,
      ip: extraerIp(request),
    });
    auditarCargaArchivo(acceso.sesion, request, {
      accion: "CARGA_ARCHIVO_REGISTRADA",
      resultado: "EXITO",
      formatoExcelId: datos.data.formatoExcelId,
      cargaArchivoId: resultado.carga.id,
      cantidadErrores: resultado.carga.cantidadErrores,
    });

    return NextResponse.json({ carga: aCargaArchivoDTO(resultado.carga) }, { status: 201 });
  } catch (error) {
    logger.error("Error al validar y cargar un archivo de reporte", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
