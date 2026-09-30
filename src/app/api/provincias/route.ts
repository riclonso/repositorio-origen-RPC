import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarProvincias } from "@/modules/provincias/application/use-cases/ListarProvincias";
import { crearProvincia } from "@/modules/provincias/application/use-cases/CrearProvincia";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { auditarProvincia } from "@/modules/provincias/infrastructure/auditoria/auditarProvincia";
import {
  filtroProvinciasSchema,
  provinciaSchema,
} from "@/modules/provincias/schemas/provincia.schema";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import {
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import {
  aProvinciaDTO,
  respuestaCodigoNoCoincide,
  respuestaDuplicado,
  respuestaRegionInvalida,
  respuestaValidacion,
} from "./_lib/http";

// GET /api/provincias?regionId=<uuid>. Sin `regionId` (o vacío) lista todas; uno malformado es 400
// (lectura: no se audita).
export async function GET(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const regionIdBruto = new URL(request.url).searchParams.get("regionId");
  const filtro = filtroProvinciasSchema.safeParse({
    regionId: regionIdBruto === null || regionIdBruto === "" ? undefined : regionIdBruto,
  });

  if (!filtro.success) {
    return respuestaValidacion(filtro.error);
  }

  try {
    const provincias = await listarProvincias(filtro.data, {
      repositorio: prismaProvinciaRepository,
    });
    return NextResponse.json({ datos: provincias.map(aProvinciaDTO) });
  } catch (error) {
    logger.error("Error al listar provincias", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

export async function POST(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarProvincia(acceso.sesion, request, {
        accion: "PROVINCIA_CREADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  // El body se lee DESPUÉS del guard: una petición sin permiso no llega a parsearse.
  const cuerpo = await request.json().catch(() => null);
  const datos = provinciaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaValidacion(datos.error);
  }

  try {
    const resultado = await crearProvincia(datos.data, {
      repositorio: prismaProvinciaRepository,
      repositorioRegiones: prismaRegionRepository,
    });

    if (!resultado.ok) {
      switch (resultado.motivo) {
        case "REGION_INVALIDA":
          return respuestaRegionInvalida();
        case "CODIGO_NO_COINCIDE_REGION":
          return respuestaCodigoNoCoincide(resultado.codigoRegion);
        case "DUPLICADO":
          auditarProvincia(acceso.sesion, request, {
            accion: "PROVINCIA_CREADA",
            resultado: "RECHAZADO",
            motivo: "DUPLICADO",
            regionId: datos.data.regionId,
            ...(resultado.campo ? { campos: [resultado.campo] } : {}),
          });
          return respuestaDuplicado(resultado.campo);
      }
    }

    auditarProvincia(acceso.sesion, request, {
      accion: "PROVINCIA_CREADA",
      resultado: "EXITO",
      provinciaId: resultado.provincia.id,
      regionId: resultado.provincia.region.id,
    });

    return NextResponse.json({ provincia: aProvinciaDTO(resultado.provincia) }, { status: 201 });
  } catch (error) {
    logger.error("Error al crear provincia", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
