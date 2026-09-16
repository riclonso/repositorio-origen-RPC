import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarTipoEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ActualizarTipoEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
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
} from "../_lib/http";

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
