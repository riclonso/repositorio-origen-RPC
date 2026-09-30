import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarTipoEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ActualizarTipoEstablecimiento";
import { eliminarTipoEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/EliminarTipoEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { auditarTipoEstablecimiento } from "@/modules/tipoEstablecimiento/infrastructure/auditoria/auditarTipoEstablecimiento";
import { tipoEstablecimientoSchema } from "@/modules/tipoEstablecimiento/schemas/tipoEstablecimiento.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import {
  MENSAJE_NO_ENCONTRADO,
  aTipoEstablecimientoDTO,
  idTipoSchema,
  respuestaDuplicado,
  respuestaEnUso,
} from "../_lib/http";

type ContextoRuta = { params: Promise<{ id: string }> };

// Solo un UUID bien formado llega al log de auditoría como `tipoEstablecimientoId`: un id
// arbitrario de la URL no identifica a ningún tipo y no debe ensuciar el histórico.
function idAuditable(id: string): string | null {
  const analisis = idTipoSchema.safeParse(id);
  return analisis.success ? analisis.data : null;
}

function respuestaNoEncontrado(): NextResponse {
  return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
}

export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdmin(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idTipoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = tipoEstablecimientoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await actualizarTipoEstablecimiento(idValido.data, datos.data, {
      repositorio: prismaTipoEstablecimientoRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      return respuestaDuplicado();
    }

    return NextResponse.json({ tipo: aTipoEstablecimientoDTO(resultado.tipo) });
  } catch (error) {
    logger.error("Error al actualizar tipo de establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// RF-29: eliminación FÍSICA de un tipo sin uso. No hay pre-chequeo de conteo: la FK Restrict de
// `establecimiento.tipoId` decide, y un tipo en uso responde 409 (solo puede desactivarse).
export async function DELETE(request: Request, contexto: ContextoRuta) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarTipoEstablecimiento(acceso.sesion, request, {
        accion: "TIPO_ESTABLECIMIENTO_ELIMINADO",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        tipoEstablecimientoId: idAuditable(id),
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idTipoSchema.safeParse(id);

  if (!idValido.success) {
    auditarTipoEstablecimiento(acceso.sesion, request, {
      accion: "TIPO_ESTABLECIMIENTO_ELIMINADO",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      tipoEstablecimientoId: null,
    });
    return respuestaNoEncontrado();
  }

  try {
    const resultado = await eliminarTipoEstablecimiento(idValido.data, {
      repositorio: prismaTipoEstablecimientoRepository,
    });

    if (!resultado.ok) {
      const enUso = resultado.motivo === "EN_USO";

      auditarTipoEstablecimiento(acceso.sesion, request, {
        accion: "TIPO_ESTABLECIMIENTO_ELIMINADO",
        resultado: "RECHAZADO",
        motivo: enUso ? "TIPO_ESTABLECIMIENTO_EN_USO" : "NO_ENCONTRADO",
        tipoEstablecimientoId: idValido.data,
      });
      return enUso ? respuestaEnUso() : respuestaNoEncontrado();
    }

    auditarTipoEstablecimiento(acceso.sesion, request, {
      accion: "TIPO_ESTABLECIMIENTO_ELIMINADO",
      resultado: "EXITO",
      tipoEstablecimientoId: idValido.data,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("Error al eliminar tipo de establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
