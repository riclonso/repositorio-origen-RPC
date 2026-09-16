import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarTiposEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimiento";
import { crearTipoEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/CrearTipoEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { tipoEstablecimientoSchema } from "@/modules/tipoEstablecimiento/schemas/tipoEstablecimiento.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import { aTipoEstablecimientoDTO, respuestaDuplicado } from "./_lib/http";

export async function GET() {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  try {
    // Catálogo chico: se listan activos e inactivos, ordenados por nombre, para poder reactivar.
    const tipos = await listarTiposEstablecimiento(
      {},
      { repositorio: prismaTipoEstablecimientoRepository },
    );

    return NextResponse.json({ datos: tipos.map(aTipoEstablecimientoDTO) });
  } catch (error) {
    logger.error("Error al listar tipos de establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

export async function POST(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = tipoEstablecimientoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await crearTipoEstablecimiento(datos.data, {
      repositorio: prismaTipoEstablecimientoRepository,
    });

    if (!resultado.ok) {
      return respuestaDuplicado();
    }

    return NextResponse.json(
      { tipo: aTipoEstablecimientoDTO(resultado.tipo) },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Error al crear tipo de establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
