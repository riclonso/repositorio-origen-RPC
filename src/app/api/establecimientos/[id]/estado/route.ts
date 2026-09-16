import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { cambiarEstadoEstablecimiento } from "@/modules/establecimiento/application/use-cases/CambiarEstadoEstablecimiento";
import { prismaEstablecimientoRepository } from "@/modules/establecimiento/infrastructure/repositories/PrismaEstablecimientoRepository";
import { cambiarEstadoEstablecimientoSchema } from "@/modules/establecimiento/schemas/establecimiento.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import { MENSAJE_NO_ENCONTRADO, aEstablecimientoDTO, idEstablecimientoSchema } from "../../_lib/http";

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdmin(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idEstablecimientoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = cambiarEstadoEstablecimientoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await cambiarEstadoEstablecimiento(idValido.data, datos.data.activo, {
      repositorio: prismaEstablecimientoRepository,
    });

    if (!resultado.ok) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return NextResponse.json({ establecimiento: aEstablecimientoDTO(resultado.establecimiento) });
  } catch (error) {
    logger.error("Error al cambiar el estado de un establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
