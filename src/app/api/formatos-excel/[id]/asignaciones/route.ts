import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarCandidatosAsignacionFormato } from "@/modules/formatos-excel/application/use-cases/ListarCandidatosAsignacionFormato";
import { asignarFormatoAUsuariosMasivo } from "@/modules/formatos-excel/application/use-cases/AsignarFormatoAUsuariosMasivo";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { auditarFormatoExcel } from "@/modules/formatos-excel/infrastructure/auditoria/auditarFormatoExcel";
import { asignacionMasivaFormatoSchema } from "@/modules/formatos-excel/schemas/formato-excel.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idFormatoExcelSchema,
  respuestaConflictoConcurrente,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";

const ACCION = "FORMATO_EXCEL_ASIGNACION_MASIVA" as const;

// Candidatos del modal de asignación masiva: NOTIFICADOR_RPC activos, con si ya tienen el formato
// y si es su único formato. Lectura: no se audita.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const resultado = await listarCandidatosAsignacionFormato(idValido.data, {
      repositorio: prismaFormatoExcelRepository,
    });

    if (!resultado.ok) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return NextResponse.json({ candidatos: resultado.candidatos });
  } catch (error) {
    logger.error("Error al listar candidatos de asignación de un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Asignación masiva con procesamiento parcial: aplica lo aplicable y devuelve, solo con ids, lo
// omitido. El cliente resuelve los nombres con la lista que ya tiene cargada.
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        formatoExcelId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = asignacionMasivaFormatoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await asignarFormatoAUsuariosMasivo(idValido.data, datos.data, {
      repositorio: prismaFormatoExcelRepository,
    });

    if (!resultado.ok) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        formatoExcelId: idValido.data,
        ...(resultado.motivo === "FORMATO_INVALIDO" ? { formatoExcelNombre: resultado.nombre } : {}),
      });

      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }
      if (resultado.motivo === "CONFLICTO_CONCURRENTE") return respuestaConflictoConcurrente();
      return respuestaError("El formato está inactivo: actívalo antes de cambiar sus asignaciones.", 409, {
        codigo: "FORMATO_INVALIDO",
      });
    }

    const { clasificacion } = resultado;
    const huboCambios = clasificacion.aAgregar.length + clasificacion.aQuitar.length > 0;

    auditarFormatoExcel(acceso.sesion, request, {
      accion: ACCION,
      resultado: huboCambios ? "EXITO" : "SIN_EFECTO",
      formatoExcelId: idValido.data,
      formatoExcelNombre: resultado.nombre,
      usuariosAgregadosIds: clasificacion.aAgregar,
      usuariosQuitadosIds: clasificacion.aQuitar,
      usuariosNoElegiblesIds: clasificacion.noElegibles,
      usuariosExcluidosUltimoFormatoIds: clasificacion.excluidosUltimoFormato,
    });

    return NextResponse.json({
      cantidadAgregados: clasificacion.aAgregar.length,
      cantidadQuitados: clasificacion.aQuitar.length,
      sinCambioIds: clasificacion.sinCambio,
      noElegiblesIds: clasificacion.noElegibles,
      excluidosUltimoFormatoIds: clasificacion.excluidosUltimoFormato,
    });
  } catch (error) {
    logger.error("Error al asignar masivamente un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
