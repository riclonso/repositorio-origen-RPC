import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarEstablecimiento } from "@/modules/establecimiento/application/use-cases/ActualizarEstablecimiento";
import { prismaEstablecimientoRepository } from "@/modules/establecimiento/infrastructure/repositories/PrismaEstablecimientoRepository";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { editarEstablecimientoSchema } from "@/modules/establecimiento/schemas/establecimiento.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import {
  MENSAJE_NO_ENCONTRADO,
  aEstablecimientoDTO,
  idEstablecimientoSchema,
  respuestaDuplicado,
  respuestaTipoInvalido,
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

  const idValido = idEstablecimientoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = editarEstablecimientoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await actualizarEstablecimiento(idValido.data, datos.data, {
      repositorio: prismaEstablecimientoRepository,
      repositorioTipos: prismaTipoEstablecimientoRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "TIPO_INVALIDO") {
        return respuestaTipoInvalido();
      }

      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      return respuestaDuplicado(resultado.campo);
    }

    return NextResponse.json({ establecimiento: aEstablecimientoDTO(resultado.establecimiento) });
  } catch (error) {
    logger.error("Error al actualizar establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
