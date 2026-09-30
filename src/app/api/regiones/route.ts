import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarRegiones } from "@/modules/regiones/application/use-cases/ListarRegiones";
import { crearRegion } from "@/modules/regiones/application/use-cases/CrearRegion";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { auditarRegion } from "@/modules/regiones/infrastructure/auditoria/auditarRegion";
import { regionSchema } from "@/modules/regiones/schemas/region.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import { aRegionDTO, respuestaDuplicado } from "./_lib/http";

export async function GET() {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  try {
    const regiones = await listarRegiones({ repositorio: prismaRegionRepository });
    return NextResponse.json({ datos: regiones.map(aRegionDTO) });
  } catch (error) {
    logger.error("Error al listar regiones", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

export async function POST(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarRegion(acceso.sesion, request, {
        accion: "REGION_CREADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = regionSchema.safeParse(cuerpo);

  if (!datos.success) {
    const primerProblema = datos.error.issues[0];
    return respuestaError(primerProblema?.message ?? MENSAJE_DATOS_INVALIDOS, 400, {
      campo: primerProblema?.path[0] ? String(primerProblema.path[0]) : undefined,
    });
  }

  try {
    const resultado = await crearRegion(datos.data, { repositorio: prismaRegionRepository });

    if (!resultado.ok) {
      auditarRegion(acceso.sesion, request, {
        accion: "REGION_CREADA",
        resultado: "RECHAZADO",
        motivo: "DUPLICADO",
        ...(resultado.campo ? { campos: [resultado.campo] } : {}),
      });
      return respuestaDuplicado(resultado.campo);
    }

    auditarRegion(acceso.sesion, request, {
      accion: "REGION_CREADA",
      resultado: "EXITO",
      regionId: resultado.region.id,
    });

    return NextResponse.json({ region: aRegionDTO(resultado.region) }, { status: 201 });
  } catch (error) {
    logger.error("Error al crear región", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
