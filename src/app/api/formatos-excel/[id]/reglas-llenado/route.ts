import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";
import { subirReglasLlenado } from "@/modules/formatos-excel/application/use-cases/SubirReglasLlenado";
import { eliminarReglasLlenado } from "@/modules/formatos-excel/application/use-cases/EliminarReglasLlenado";
import { abrirReglasLlenado } from "@/modules/formatos-excel/application/use-cases/ObtenerReglasLlenadoParaNotificador";
import { auditarReglasLlenado } from "@/modules/formatos-excel/infrastructure/auditoria/auditarReglasLlenado";
import {
  MENSAJE_REGLAS_EXCEDE_TAMANO,
  MENSAJE_TIPO_REGLAS_INVALIDO,
  nombreArchivoReglasSchema,
} from "@/modules/formatos-excel/schemas/reglas-llenado.schema";
import { CABECERA_NOMBRE_ARCHIVO } from "@/shared/schemas/nombreArchivoSubida.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idFormatoExcelSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";
import {
  dependenciasEscrituraReglas,
  dependenciasLecturaReglas,
  registrarFalloReglas,
  respuestaDescargaReglas,
  tamanoDeclarado,
} from "@/app/api/formatos-excel/_lib/reglasLlenado";

// RF-45: archivo de reglas para llenar el archivo a notificar, uno por formato. ADMIN y
// REVISOR_REPOSITORIO lo administran para cualquier formato, con el mismo criterio que la edición del
// formato (`PUT /api/formatos-excel/[id]`, `exigirAdminORevisor()` sin otra restricción).
//
// `/api/**` no pasa por `src/proxy.ts`: el guard vive en cada handler.

type Contexto = { params: Promise<{ id: string }> };

const MENSAJE_SIN_REGLAS = "El formato no tiene un archivo de reglas de llenado";

function respuestaFormatoNoEncontrado(): NextResponse {
  return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
}

// Subida o reemplazo. El CUERPO es el binario crudo (no `formData()`) y el nombre original viaja en
// `X-Nombre-Archivo` (URI-encoded). Formato, `Content-Length` y extensión se validan ANTES de leer el
// cuerpo; el contenido real se verifica contra la extensión ya en disco.
export async function PUT(request: Request, contexto: Contexto) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarReglasLlenado(acceso.sesion, request, {
        accion: "REGLAS_LLENADO_SUBIDAS",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        formatoExcelId: idFormatoExcelSchema.safeParse(id).success ? id : null,
      });
    }
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    auditarReglasLlenado(acceso.sesion, request, {
      accion: "REGLAS_LLENADO_SUBIDAS",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      formatoExcelId: null,
    });
    return respuestaFormatoNoEncontrado();
  }

  const nombre = nombreArchivoReglasSchema.safeParse(request.headers.get(CABECERA_NOMBRE_ARCHIVO));

  if (!nombre.success) {
    return respuestaError(nombre.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400, {
      campo: "archivo",
      codigo: "ARCHIVO_INVALIDO",
    });
  }

  try {
    const resultado = await subirReglasLlenado(
      {
        formatoExcelId: idValido.data,
        nombreArchivoOriginal: nombre.data,
        tamanoDeclarado: tamanoDeclarado(request),
        cuerpo: request.body,
        subidoPorId: acceso.sesion.sub,
        ahora: new Date(),
      },
      dependenciasEscrituraReglas,
    );

    if (!resultado.ok) {
      const base = { accion: "REGLAS_LLENADO_SUBIDAS" as const, resultado: "RECHAZADO" as const, formatoExcelId: idValido.data };

      switch (resultado.motivo) {
        case "FORMATO_NO_ENCONTRADO":
          auditarReglasLlenado(acceso.sesion, request, { ...base, motivo: "NO_ENCONTRADO" });
          return respuestaFormatoNoEncontrado();
        case "SIN_LONGITUD":
          return respuestaError("Falta el tamaño del archivo en la petición", 411, { codigo: "SIN_LONGITUD" });
        case "EXCEDE_TAMANO":
          auditarReglasLlenado(acceso.sesion, request, {
            ...base,
            motivo: "EXCEDE_TAMANO",
            extension: resultado.extension ?? null,
          });
          return respuestaError(MENSAJE_REGLAS_EXCEDE_TAMANO, 413, { campo: "archivo", codigo: "EXCEDE_TAMANO" });
        case "TIPO_INVALIDO":
          auditarReglasLlenado(acceso.sesion, request, {
            ...base,
            motivo: "TIPO_INVALIDO",
            extension: resultado.extension ?? null,
          });
          return respuestaError(MENSAJE_TIPO_REGLAS_INVALIDO, 400, { campo: "archivo", codigo: "TIPO_INVALIDO" });
        case "VACIO":
          return respuestaError("El archivo está vacío", 400, { campo: "archivo", codigo: "ARCHIVO_VACIO" });
      }
    }

    auditarReglasLlenado(acceso.sesion, request, {
      accion: resultado.reemplazo ? "REGLAS_LLENADO_REEMPLAZADAS" : "REGLAS_LLENADO_SUBIDAS",
      resultado: "EXITO",
      formatoExcelId: idValido.data,
      extension: resultado.reglas.extension,
      tamanoBytes: resultado.reglas.tamanoBytes,
    });

    return NextResponse.json(
      {
        reglas: {
          nombreArchivoOriginal: resultado.reglas.nombreArchivoOriginal,
          extension: resultado.reglas.extension,
          tamanoBytes: resultado.reglas.tamanoBytes,
          subidoEn: resultado.reglas.subidoEn.toISOString(),
        },
      },
      { status: resultado.reemplazo ? 200 : 201 },
    );
  } catch (error) {
    logger.error("Error al subir el archivo de reglas de llenado de un formato", {
      formatoExcelId: idValido.data,
      ...detalleErrorSeguro(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

export async function DELETE(request: Request, contexto: Contexto) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarReglasLlenado(acceso.sesion, request, {
        accion: "REGLAS_LLENADO_ELIMINADAS",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        formatoExcelId: idFormatoExcelSchema.safeParse(id).success ? id : null,
      });
    }
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    auditarReglasLlenado(acceso.sesion, request, {
      accion: "REGLAS_LLENADO_ELIMINADAS",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      formatoExcelId: null,
    });
    return respuestaFormatoNoEncontrado();
  }

  try {
    const resultado = await eliminarReglasLlenado(idValido.data, {
      ...dependenciasLecturaReglas,
      registrarFallo: registrarFalloReglas,
    });

    if (!resultado.ok) {
      auditarReglasLlenado(acceso.sesion, request, {
        accion: "REGLAS_LLENADO_ELIMINADAS",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        formatoExcelId: idValido.data,
      });
      return respuestaError(MENSAJE_SIN_REGLAS, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarReglasLlenado(acceso.sesion, request, {
      accion: "REGLAS_LLENADO_ELIMINADAS",
      resultado: "EXITO",
      formatoExcelId: idValido.data,
      extension: resultado.reglas.extension,
      tamanoBytes: resultado.reglas.tamanoBytes,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("Error al eliminar el archivo de reglas de llenado de un formato", {
      formatoExcelId: idValido.data,
      ...detalleErrorSeguro(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Descarga administrativa. Las descargas no se auditan (decisión explícita).
export async function GET(_request: Request, contexto: Contexto) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaFormatoNoEncontrado();
  }

  try {
    const archivo = await abrirReglasLlenado(idValido.data, dependenciasLecturaReglas);

    if (!archivo) {
      return respuestaError(MENSAJE_SIN_REGLAS, 404, { codigo: "NO_ENCONTRADO" });
    }

    return respuestaDescargaReglas(archivo);
  } catch (error) {
    logger.error("Error al descargar el archivo de reglas de llenado de un formato", {
      formatoExcelId: idValido.data,
      ...detalleErrorSeguro(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
