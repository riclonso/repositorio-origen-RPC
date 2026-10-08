import { NextResponse, after } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { registrarIntentoSubida } from "@/infrastructure/logging/logUpload";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import {
  recibirArchivoBioestadistica,
  type ContextoProcesamientoBioestadistica,
} from "@/modules/bioestadistica/application/use-cases/RecibirArchivoBioestadistica";
import { procesarCargaBioestadistica } from "@/modules/bioestadistica/application/use-cases/ProcesarCargaBioestadistica";
import type { CargaBioestadistica } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import { almacenArchivosBioestadistica } from "@/modules/bioestadistica/infrastructure/almacenamiento/AlmacenArchivosDisco";
import {
  lectorArchivoLibreBioestadistica,
  lectorArchivoLibreBioestadisticaRecepcion,
} from "@/modules/bioestadistica/infrastructure/lectura-archivo/LectorArchivoLibreStreamingExcelJs";
import { limitadorProcesamientoBioestadistica } from "@/modules/bioestadistica/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";
import { prismaSolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository";
import {
  auditarBioestadistica,
  capturarTransporte,
  type TransporteAuditoria,
} from "@/modules/bioestadistica/infrastructure/auditoria/auditarBioestadistica";
import {
  CABECERA_NOMBRE_ARCHIVO,
  nombreArchivoBioestadisticaSchema,
  subirArchivoBioestadisticaSchema,
} from "@/modules/bioestadistica/schemas/bioestadistica.schema";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirBioestadistica,
  motivoAuditoriaRecepcion,
  respuestaError,
  respuestaRechazoRecepcion,
  respuestaSinAcceso,
} from "@/app/api/bioestadistica/_lib/http";

const ACCION_RECIBIDA = "CARGA_BIOESTADISTICA_RECIBIDA" as const;
const ACCION_PROCESADA = "CARGA_BIOESTADISTICA_PROCESADA" as const;

// `null` si falta la cabecera (`Number(null)` sería 0) o no es un entero no negativo.
function tamanoDeclarado(request: Request): number | null {
  const cabecera = request.headers.get("content-length");
  if (cabecera === null || cabecera.trim() === "") return null;

  const valor = Number(cabecera);
  return Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
}

// Procesamiento asíncrono (en `after()`, ya respondido el 202): filas por lotes y activación, con
// a lo más dos a la vez en el proceso. Su desenlace se audita y se registra en upload.txt; un error
// técnico va a errores.txt sin contenido del archivo.
async function procesarEnSegundoPlano(
  carga: CargaBioestadistica,
  contexto: ContextoProcesamientoBioestadistica,
  sesion: SesionPayload,
  transporte: TransporteAuditoria,
): Promise<void> {
  try {
    const resultado = await limitadorProcesamientoBioestadistica.ejecutar(() =>
      procesarCargaBioestadistica(carga.id, contexto, {
        repositorio: prismaCargaBioestadisticaRepository,
        lector: lectorArchivoLibreBioestadistica,
        almacen: almacenArchivosBioestadistica,
      }),
    );

    if (resultado.estado === "OMITIDA") return;

    const exito = resultado.estado === "ACTIVA";

    registrarIntentoSubida({
      evento: exito ? "procesamiento_exitoso" : "procesamiento_fallido",
      usuarioId: sesion.sub,
      origen: "BIOESTADISTICA",
      anio: carga.anio,
      tipoArchivoBioestadistica: carga.tipoArchivo,
      cargaBioestadisticaId: carga.id,
      ...(exito ? { cantidadFilasDatos: resultado.cantidadFilasDatos } : { motivo: resultado.motivo }),
      ip: transporte.ip,
    });

    auditarBioestadistica(sesion, transporte, {
      accion: ACCION_PROCESADA,
      resultado: exito ? "EXITO" : "RECHAZADO",
      ...(exito ? { cantidadFilasDatos: resultado.cantidadFilasDatos } : { motivo: resultado.motivo }),
      anio: carga.anio,
      tipoArchivoBioestadistica: carga.tipoArchivo,
      cargaBioestadisticaId: carga.id,
      cargaReemplazadaId: exito ? (contexto.reemplazo?.cargaAnteriorId ?? null) : null,
    });
  } catch (error) {
    logger.error("Error al procesar un archivo de Bioestadística", {
      cargaBioestadisticaId: carga.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// RF-37: subida de un archivo de Defunciones o Egresos para un año. El CUERPO es el binario crudo
// (`fetch(url, { body: archivo })`), leído en streaming desde `request.body`: nunca `formData()`, que
// cargaría hasta 300 MB en memoria. `anio` y `tipoArchivo` viajan en la URL y el nombre original en la
// cabecera `X-Nombre-Archivo` (codificado con `encodeURIComponent`). Responde 202 con la carga en
// PROCESANDO; el resto ocurre en `after()`.
//
// `/api/**` no pasa por `src/proxy.ts` (que truncaría el cuerpo a 10 MB): el guard vive aquí.
export async function POST(request: Request) {
  const acceso = await exigirBioestadistica();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const transporte = capturarTransporte(request);
  const parametros = subirArchivoBioestadisticaSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parametros.success) {
    return respuestaError(parametros.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  const { anio, tipoArchivo } = parametros.data;
  const nombre = nombreArchivoBioestadisticaSchema.safeParse(request.headers.get(CABECERA_NOMBRE_ARCHIVO));

  if (!nombre.success) {
    auditarBioestadistica(acceso.sesion, transporte, {
      accion: ACCION_RECIBIDA,
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
      anio,
      tipoArchivoBioestadistica: tipoArchivo,
    });
    return respuestaError(nombre.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400, { codigo: "ARCHIVO_INVALIDO" });
  }

  try {
    const resultado = await recibirArchivoBioestadistica(
      {
        usuarioId: acceso.sesion.sub,
        anio,
        tipoArchivo,
        nombreArchivoOriginal: nombre.data,
        tamanoDeclarado: tamanoDeclarado(request),
        cuerpo: request.body,
        ahora: new Date(),
      },
      {
        repositorioCargas: prismaCargaBioestadisticaRepository,
        repositorioSolicitudes: prismaSolicitudReemplazoBioestadisticaRepository,
        repositorioVentanas: prismaVentanaCargaRepository,
        consultaUsuarios: prismaUsuarioRepository,
        almacen: almacenArchivosBioestadistica,
        lector: lectorArchivoLibreBioestadisticaRecepcion,
      },
    );

    if (!resultado.ok) {
      registrarIntentoSubida({
        evento: "subida_fallida",
        usuarioId: acceso.sesion.sub,
        origen: "BIOESTADISTICA",
        anio,
        tipoArchivoBioestadistica: tipoArchivo,
        motivo: resultado.motivo,
        ip: transporte.ip,
      });
      auditarBioestadistica(acceso.sesion, transporte, {
        accion: ACCION_RECIBIDA,
        resultado: "RECHAZADO",
        motivo: motivoAuditoriaRecepcion(resultado.motivo),
        anio,
        tipoArchivoBioestadistica: tipoArchivo,
      });
      return respuestaRechazoRecepcion(resultado.motivo, resultado.motivo === "ESTRUCTURA_INVALIDA" ? resultado.detalle : null);
    }

    const { carga, contexto } = resultado;

    registrarIntentoSubida({
      evento: "subida_exitosa",
      usuarioId: acceso.sesion.sub,
      origen: "BIOESTADISTICA",
      anio,
      tipoArchivoBioestadistica: tipoArchivo,
      cargaBioestadisticaId: carga.id,
      tamanoBytes: carga.tamanoBytes,
      ip: transporte.ip,
    });
    auditarBioestadistica(acceso.sesion, transporte, {
      accion: ACCION_RECIBIDA,
      resultado: "EXITO",
      anio,
      tipoArchivoBioestadistica: tipoArchivo,
      cargaBioestadisticaId: carga.id,
      cargaReemplazadaId: contexto.reemplazo?.cargaAnteriorId ?? null,
      tamanoBytes: carga.tamanoBytes,
    });

    const sesion = acceso.sesion;
    after(() => procesarEnSegundoPlano(carga, contexto, sesion, transporte));

    return NextResponse.json({ carga: { id: carga.id, estado: carga.estado } }, { status: 202 });
  } catch (error) {
    logger.error("Error al recibir un archivo de Bioestadística", {
      anio,
      tipoArchivoBioestadistica: tipoArchivo,
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
