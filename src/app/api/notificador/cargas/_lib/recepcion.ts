import { NextResponse, after } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";
import { registrarIntentoSubida } from "@/infrastructure/logging/logUpload";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { recibirArchivoCarga } from "@/modules/reporte-excel/application/use-cases/RecibirArchivoCarga";
import { procesarCargaArchivo } from "@/modules/reporte-excel/application/use-cases/ProcesarCargaArchivo";
import { listarCargasPropias } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";
import { listarCargasPanelNotificador } from "@/modules/reporte-excel/application/use-cases/ListarCargasPanelNotificador";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { almacenArchivosCargas } from "@/modules/reporte-excel/infrastructure/almacenamiento/almacenArchivosCargas";
import { limitadorValidacionCargas } from "@/modules/reporte-excel/infrastructure/concurrencia/limitadoresCargas";
import { validadorArchivoReporte } from "@/modules/reporte-excel/infrastructure/composicion";
import {
  auditarCargaArchivoConTransporte,
  capturarTransporteCarga,
  type TransporteAuditoriaCarga,
} from "@/modules/reporte-excel/infrastructure/auditoria/auditarCargaArchivo";
import {
  listadoCargasSchema,
  subirCargaArchivoSchema,
} from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import { CABECERA_NOMBRE_ARCHIVO, nombreArchivoSubidaSinRutaSchema } from "@/shared/schemas/nombreArchivoSubida.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aCargaArchivoResumenDTO,
  exigirNotificador,
  motivoAuditoriaRecepcionCarga,
  respuestaArchivoInvalido,
  respuestaError,
  respuestaRechazoRecepcionCarga,
  respuestaSinAcceso,
  tipoContenidoDesdePrimerosBytes,
} from "@/app/api/notificador/cargas/_lib/http";

const ACCION_REGISTRADA = "CARGA_ARCHIVO_REGISTRADA" as const;
const ACCION_PROCESADA = "CARGA_ARCHIVO_PROCESADA" as const;

// Cargas propias del notificador en sesión, paginadas y filtrables por estado/formato (o, con
// `vista=panel`, las del panel `/notificador`). Incluyen `publicacionActiva`. Lectura, no se audita.
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
    // Refresco del panel `/notificador`: misma fuente que su Server Component, para que el estado de
    // cada tarjeta no dependa del corte de una página.
    if (filtro.data.vista === "panel") {
      const cargas = await listarCargasPanelNotificador(acceso.sesion.sub, {
        repositorio: prismaCargaArchivoRepository,
      });

      return NextResponse.json({ datos: cargas.map(aCargaArchivoResumenDTO) });
    }

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

// `null` si falta la cabecera (`Number(null)` sería 0) o no es un entero no negativo.
function tamanoDeclarado(request: Request): number | null {
  const cabecera = request.headers.get("content-length");
  if (cabecera === null || cabecera.trim() === "") return null;

  const valor = Number(cabecera);
  return Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
}

// RF-38: validación asíncrona (en `after()`, ya respondido el 202), con a lo más
// `MAXIMO_VALIDACIONES_CARGAS_SIMULTANEAS` a la vez en el proceso. Su desenlace se audita y se
// registra en upload.txt; la causa técnica de un archivo ilegible va a errores.txt sin contenido.
async function procesarEnSegundoPlano(
  carga: CargaArchivo,
  sesion: SesionPayload,
  transporte: TransporteAuditoriaCarga,
): Promise<void> {
  try {
    const resultado = await limitadorValidacionCargas.ejecutar(() =>
      procesarCargaArchivo(carga.id, {
        repositorio: prismaCargaArchivoRepository,
        repositorioFormatosExcel: prismaFormatoExcelRepository,
        repositorioVentanasCarga: prismaVentanaCargaRepository,
        validador: validadorArchivoReporte,
      }),
    );

    if (resultado.estado === "OMITIDA") return;

    if (resultado.estado === "NO_PROCESADA") {
      logger.error("No se pudo procesar el archivo de una carga del notificador", {
        cargaArchivoId: carga.id,
        error: resultado.causa instanceof Error ? resultado.causa.name : "desconocido",
      });
      registrarIntentoSubida({
        evento: "procesamiento_fallido",
        usuarioId: sesion.sub,
        formatoExcelId: carga.formatoExcelId,
        cargaArchivoId: carga.id,
        motivo: "ARCHIVO_NO_PROCESADO",
        ip: transporte.ip,
      });
      auditarCargaArchivoConTransporte(sesion, transporte, {
        accion: ACCION_PROCESADA,
        resultado: "RECHAZADO",
        motivo: "ARCHIVO_NO_PROCESADO",
        formatoExcelId: carga.formatoExcelId,
        cargaArchivoId: carga.id,
      });
      return;
    }

    registrarIntentoSubida({
      evento: "procesamiento_exitoso",
      usuarioId: sesion.sub,
      formatoExcelId: carga.formatoExcelId,
      cargaArchivoId: carga.id,
      cantidadFilasDatos: resultado.resultado.cantidadFilasDatos,
      ip: transporte.ip,
    });
    auditarCargaArchivoConTransporte(sesion, transporte, {
      accion: ACCION_PROCESADA,
      resultado: "EXITO",
      formatoExcelId: carga.formatoExcelId,
      cargaArchivoId: carga.id,
      estadoResultante: resultado.resultado.estado,
      cantidadErrores: resultado.resultado.cantidadErrores,
      cantidadFilasDatos: resultado.resultado.cantidadFilasDatos,
    });
  } catch (error) {
    // Falla técnica (p. ej. la base cayó): la carga queda PROCESANDO y la libera el arranque o la
    // expiración de 2 horas.
    logger.error("Error al procesar una carga del notificador en segundo plano", {
      cargaArchivoId: carga.id,
      ...detalleErrorSeguro(error),
    });
  }
}

// RF-38: subida de un archivo del notificador. El CUERPO es el binario crudo (`fetch`/XHR con
// `body: archivo`), leído en streaming desde `request.body` directo a disco: nunca `formData()`, que
// cargaría hasta 300 MB en memoria. `formatoExcelId` y `anio` viajan en la URL y el nombre original
// en la cabecera `X-Nombre-Archivo` (codificado con `encodeURIComponent`). Todo lo barato (asignación
// del formato, ventana, decisión pendiente, reemplazo, procesamiento en curso) se revalida ANTES de
// leer el cuerpo. Responde 202 con la carga en PROCESANDO; la validación ocurre en `after()`.
//
// `/api/**` no pasa por `src/proxy.ts` (que truncaría el cuerpo a 10 MB): el guard vive aquí.
export async function recibirCompleto(request: Request, cargaIdReservada?: string) {
  const acceso = await exigirNotificador();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const transporte = capturarTransporteCarga(request);
  const datos = subirCargaArchivoSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  const { formatoExcelId, anio } = datos.data;
  const nombre = nombreArchivoSubidaSinRutaSchema.safeParse(request.headers.get(CABECERA_NOMBRE_ARCHIVO));

  if (!nombre.success) {
    registrarIntentoSubida({
      evento: "subida_fallida",
      usuarioId: acceso.sesion.sub,
      formatoExcelId,
      motivo: "ARCHIVO_INVALIDO",
      ip: transporte.ip,
    });
    auditarCargaArchivoConTransporte(acceso.sesion, transporte, {
      accion: ACCION_REGISTRADA,
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
      formatoExcelId,
    });
    return respuestaArchivoInvalido(nombre.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS);
  }

  try {
    const resultado = await recibirArchivoCarga(
      {
        cargaIdReservada,
        usuarioId: acceso.sesion.sub,
        formatoExcelId,
        anio,
        nombreArchivoOriginal: nombre.data,
        tamanoDeclarado: tamanoDeclarado(request),
        cuerpo: request.body,
        ahora: new Date(),
      },
      dependenciasRecepcion,
    );

    if (!resultado.ok) {
      registrarIntentoSubida({
        evento: "subida_fallida",
        usuarioId: acceso.sesion.sub,
        formatoExcelId,
        motivo: resultado.motivo,
        ip: transporte.ip,
      });
      auditarCargaArchivoConTransporte(acceso.sesion, transporte, {
        accion: ACCION_REGISTRADA,
        resultado: "RECHAZADO",
        motivo: motivoAuditoriaRecepcionCarga(resultado.motivo),
        formatoExcelId,
      });
      return respuestaRechazoRecepcionCarga(resultado.motivo);
    }

    const { carga, tamanoBytes } = resultado;

    registrarIntentoSubida({
      evento: "subida_exitosa",
      usuarioId: acceso.sesion.sub,
      formatoExcelId,
      cargaArchivoId: carga.id,
      tamanoBytes,
      ip: transporte.ip,
    });
    auditarCargaArchivoConTransporte(acceso.sesion, transporte, {
      accion: ACCION_REGISTRADA,
      resultado: "EXITO",
      formatoExcelId,
      cargaArchivoId: carga.id,
      tamanoBytes,
    });

    const sesion = acceso.sesion;
    after(() => procesarEnSegundoPlano(carga, sesion, transporte));

    return NextResponse.json({ carga: { id: carga.id, estado: carga.estado } }, { status: 202 });
  } catch (error) {
    // Solo nombre y código: un error de `fs` (disco lleno, permisos) llevaría la ruta en el mensaje.
    logger.error("Error al recibir un archivo de reporte del notificador", {
      formatoExcelId,
      ...detalleErrorSeguro(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

export const dependenciasRecepcion = {
        repositorio: prismaCargaArchivoRepository,
        repositorioFormatosExcel: prismaFormatoExcelRepository,
        repositorioVentanasCarga: prismaVentanaCargaRepository,
        repositorioSolicitudesReemplazo: prismaSolicitudReemplazoCargaRepository,
        almacen: almacenArchivosCargas,
        detectarTipoContenido: tipoContenidoDesdePrimerosBytes,
      };
