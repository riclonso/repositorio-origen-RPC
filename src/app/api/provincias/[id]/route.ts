import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarProvincia } from "@/modules/provincias/application/use-cases/ActualizarProvincia";
import { eliminarProvincia } from "@/modules/provincias/application/use-cases/EliminarProvincia";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { auditarProvincia } from "@/modules/provincias/infrastructure/auditoria/auditarProvincia";
import { provinciaSchema } from "@/modules/provincias/schemas/provincia.schema";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import {
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import {
  aProvinciaDTO,
  respuestaCodigoConComunas,
  respuestaCodigoNoCoincide,
  respuestaDuplicado,
  respuestaEnUso,
  respuestaNoEncontrada,
  respuestaRegionInvalida,
  respuestaValidacion,
} from "../_lib/http";

type ContextoRuta = { params: Promise<{ id: string }> };

// Solo un UUID bien formado llega al log de auditoría como `provinciaId`: un id arbitrario de la
// URL no identifica a ninguna provincia y no debe ensuciar el histórico.
function idAuditable(id: string): string | null {
  const analisis = idRutaSchema.safeParse(id);
  return analisis.success ? analisis.data : null;
}

export async function PUT(request: Request, contexto: ContextoRuta) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarProvincia(acceso.sesion, request, {
        accion: "PROVINCIA_ACTUALIZADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        provinciaId: idAuditable(id),
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);

  if (!idValido.success) {
    auditarProvincia(acceso.sesion, request, {
      accion: "PROVINCIA_ACTUALIZADA",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      provinciaId: null,
    });
    return respuestaNoEncontrada();
  }

  // El body se lee DESPUÉS del guard: una petición sin permiso no llega a parsearse.
  const cuerpo = await request.json().catch(() => null);
  const datos = provinciaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaValidacion(datos.error);
  }

  try {
    const resultado = await actualizarProvincia(idValido.data, datos.data, {
      repositorio: prismaProvinciaRepository,
      repositorioRegiones: prismaRegionRepository,
    });

    if (!resultado.ok) {
      switch (resultado.motivo) {
        case "NO_ENCONTRADO":
          auditarProvincia(acceso.sesion, request, {
            accion: "PROVINCIA_ACTUALIZADA",
            resultado: "RECHAZADO",
            motivo: "NO_ENCONTRADO",
            provinciaId: idValido.data,
          });
          return respuestaNoEncontrada();
        case "CODIGO_CON_COMUNAS":
          auditarProvincia(acceso.sesion, request, {
            accion: "PROVINCIA_ACTUALIZADA",
            resultado: "RECHAZADO",
            motivo: "CODIGO_PROVINCIA_CON_COMUNAS",
            provinciaId: idValido.data,
            campos: ["codigo"],
          });
          return respuestaCodigoConComunas();
        case "REGION_INVALIDA":
          return respuestaRegionInvalida();
        case "CODIGO_NO_COINCIDE_REGION":
          return respuestaCodigoNoCoincide(resultado.codigoRegion);
        case "DUPLICADO":
          auditarProvincia(acceso.sesion, request, {
            accion: "PROVINCIA_ACTUALIZADA",
            resultado: "RECHAZADO",
            motivo: "DUPLICADO",
            provinciaId: idValido.data,
            regionId: datos.data.regionId,
            ...(resultado.campo ? { campos: [resultado.campo] } : {}),
          });
          return respuestaDuplicado(resultado.campo);
      }
    }

    auditarProvincia(acceso.sesion, request, {
      accion: "PROVINCIA_ACTUALIZADA",
      resultado: "EXITO",
      provinciaId: resultado.provincia.id,
      regionId: resultado.provincia.region.id,
      regionAnteriorId: resultado.regionAnteriorId ?? null,
    });

    return NextResponse.json({ provincia: aProvinciaDTO(resultado.provincia) });
  } catch (error) {
    logger.error("Error al actualizar provincia", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Eliminación FÍSICA: la provincia no tiene estado activo/inactivo.
export async function DELETE(request: Request, contexto: ContextoRuta) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarProvincia(acceso.sesion, request, {
        accion: "PROVINCIA_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        provinciaId: idAuditable(id),
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);

  if (!idValido.success) {
    auditarProvincia(acceso.sesion, request, {
      accion: "PROVINCIA_ELIMINADA",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      provinciaId: null,
    });
    return respuestaNoEncontrada();
  }

  try {
    const resultado = await eliminarProvincia(idValido.data, {
      repositorio: prismaProvinciaRepository,
    });

    if (!resultado.ok) {
      const enUso = resultado.motivo === "EN_USO";

      auditarProvincia(acceso.sesion, request, {
        accion: "PROVINCIA_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: enUso ? "PROVINCIA_EN_USO" : "NO_ENCONTRADO",
        provinciaId: idValido.data,
      });
      return enUso ? respuestaEnUso() : respuestaNoEncontrada();
    }

    auditarProvincia(acceso.sesion, request, {
      accion: "PROVINCIA_ELIMINADA",
      resultado: "EXITO",
      provinciaId: idValido.data,
      regionId: resultado.regionId,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("Error al eliminar provincia", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
