import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarEstablecimientos } from "@/modules/establecimiento/application/use-cases/ListarEstablecimientos";
import { crearEstablecimiento } from "@/modules/establecimiento/application/use-cases/CrearEstablecimiento";
import { prismaEstablecimientoRepository } from "@/modules/establecimiento/infrastructure/repositories/PrismaEstablecimientoRepository";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { listadoEstablecimientosSchema } from "@/modules/establecimiento/schemas/listado-establecimientos.schema";
import { crearEstablecimientoSchema } from "@/modules/establecimiento/schemas/establecimiento.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import { aEstablecimientoDTO, respuestaDuplicado, respuestaTipoInvalido } from "./_lib/http";

export async function GET(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const parametros = Object.fromEntries(new URL(request.url).searchParams);
  const filtro = listadoEstablecimientosSchema.safeParse(parametros);

  if (!filtro.success) {
    return respuestaError(filtro.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await listarEstablecimientos(filtro.data, {
      repositorio: prismaEstablecimientoRepository,
    });

    return NextResponse.json({
      datos: resultado.filas.map(aEstablecimientoDTO),
      paginacion: resultado.paginacion,
    });
  } catch (error) {
    logger.error("Error al listar establecimientos", {
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
  const datos = crearEstablecimientoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await crearEstablecimiento(datos.data, {
      repositorio: prismaEstablecimientoRepository,
      repositorioTipos: prismaTipoEstablecimientoRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "TIPO_INVALIDO") {
        return respuestaTipoInvalido();
      }

      return respuestaDuplicado(resultado.campo);
    }

    return NextResponse.json(
      { establecimiento: aEstablecimientoDTO(resultado.establecimiento) },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Error al crear establecimiento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
