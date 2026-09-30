import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarRegion } from "@/modules/regiones/application/use-cases/ActualizarRegion";
import { eliminarRegion } from "@/modules/regiones/application/use-cases/EliminarRegion";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { auditarRegion } from "@/modules/regiones/infrastructure/auditoria/auditarRegion";
import { regionSchema } from "@/modules/regiones/schemas/region.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import {
  aRegionDTO,
  respuestaCodigoConProvincias,
  respuestaDuplicado,
  respuestaEnUso,
  respuestaNoEncontrada,
} from "../_lib/http";

type ContextoRuta = { params: Promise<{ id: string }> };

// Solo un UUID bien formado llega al log de auditoría como `regionId`: un id arbitrario de la URL
// no identifica a ninguna región y no debe ensuciar el histórico.
function idAuditable(id: string): string | null {
  const analisis = idRutaSchema.safeParse(id);
  return analisis.success ? analisis.data : null;
}

export async function PUT(request: Request, contexto: ContextoRuta) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarRegion(acceso.sesion, request, {
        accion: "REGION_ACTUALIZADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        regionId: idAuditable(id),
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);

  if (!idValido.success) {
    auditarRegion(acceso.sesion, request, {
      accion: "REGION_ACTUALIZADA",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      regionId: null,
    });
    return respuestaNoEncontrada();
  }

  // El body se lee DESPUÉS del guard: una petición sin permiso no llega a parsearse.
  const cuerpo = await request.json().catch(() => null);
  const datos = regionSchema.safeParse(cuerpo);

  if (!datos.success) {
    const primerProblema = datos.error.issues[0];
    return respuestaError(primerProblema?.message ?? MENSAJE_DATOS_INVALIDOS, 400, {
      campo: primerProblema?.path[0] ? String(primerProblema.path[0]) : undefined,
    });
  }

  try {
    const resultado = await actualizarRegion(idValido.data, datos.data, {
      repositorio: prismaRegionRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "NO_ENCONTRADO") {
        auditarRegion(acceso.sesion, request, {
          accion: "REGION_ACTUALIZADA",
          resultado: "RECHAZADO",
          motivo: "NO_ENCONTRADO",
          regionId: idValido.data,
        });
        return respuestaNoEncontrada();
      }

      if (resultado.motivo === "CODIGO_CON_PROVINCIAS") {
        auditarRegion(acceso.sesion, request, {
          accion: "REGION_ACTUALIZADA",
          resultado: "RECHAZADO",
          motivo: "CODIGO_REGION_CON_PROVINCIAS",
          regionId: idValido.data,
          campos: ["codigo"],
        });
        return respuestaCodigoConProvincias();
      }

      auditarRegion(acceso.sesion, request, {
        accion: "REGION_ACTUALIZADA",
        resultado: "RECHAZADO",
        motivo: "DUPLICADO",
        regionId: idValido.data,
        ...(resultado.campo ? { campos: [resultado.campo] } : {}),
      });
      return respuestaDuplicado(resultado.campo);
    }

    auditarRegion(acceso.sesion, request, {
      accion: "REGION_ACTUALIZADA",
      resultado: "EXITO",
      regionId: resultado.region.id,
    });

    return NextResponse.json({ region: aRegionDTO(resultado.region) });
  } catch (error) {
    logger.error("Error al actualizar región", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Eliminación FÍSICA: la región no tiene estado activo/inactivo.
export async function DELETE(request: Request, contexto: ContextoRuta) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarRegion(acceso.sesion, request, {
        accion: "REGION_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        regionId: idAuditable(id),
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);

  if (!idValido.success) {
    auditarRegion(acceso.sesion, request, {
      accion: "REGION_ELIMINADA",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      regionId: null,
    });
    return respuestaNoEncontrada();
  }

  try {
    const resultado = await eliminarRegion(idValido.data, { repositorio: prismaRegionRepository });

    if (!resultado.ok) {
      const enUso = resultado.motivo === "EN_USO";

      auditarRegion(acceso.sesion, request, {
        accion: "REGION_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: enUso ? "REGION_EN_USO" : "NO_ENCONTRADO",
        regionId: idValido.data,
      });
      return enUso ? respuestaEnUso() : respuestaNoEncontrada();
    }

    auditarRegion(acceso.sesion, request, {
      accion: "REGION_ELIMINADA",
      resultado: "EXITO",
      regionId: idValido.data,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("Error al eliminar región", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
