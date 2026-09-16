import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { cambiarEstadoTipoEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/CambiarEstadoTipoEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { cambiarEstadoTipoSchema } from "@/modules/tipoEstablecimiento/schemas/tipoEstablecimiento.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import { MENSAJE_NO_ENCONTRADO, aTipoEstablecimientoDTO, idTipoSchema } from "../../_lib/http";

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
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

  const datos = cambiarEstadoTipoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await cambiarEstadoTipoEstablecimiento(idValido.data, datos.data.activo, {
      repositorio: prismaTipoEstablecimientoRepository,
    });

    if (!resultado.ok) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return NextResponse.json({ tipo: aTipoEstablecimientoDTO(resultado.tipo) });
  } catch (error) {
    logger.error("Error al cambiar el estado de un tipo de establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
