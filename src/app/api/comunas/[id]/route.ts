import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarComuna } from "@/modules/comunas/application/use-cases/ActualizarComuna";
import { eliminarComuna } from "@/modules/comunas/application/use-cases/EliminarComuna";
import { prismaComunaRepository } from "@/modules/comunas/infrastructure/repositories/PrismaComunaRepository";
import { auditarComuna } from "@/modules/comunas/infrastructure/auditoria/auditarComuna";
import { comunaSchema } from "@/modules/comunas/schemas/comuna.schema";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import {
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import {
  aComunaDTO,
  respuestaCodigoNoCoincide,
  respuestaDuplicado,
  respuestaEnUso,
  respuestaNoEncontrada,
  respuestaProvinciaInvalida,
  respuestaValidacion,
} from "../_lib/http";

type ContextoRuta = { params: Promise<{ id: string }> };

// Solo un UUID bien formado llega al log de auditoría como `comunaId`: un id arbitrario de la URL
// no identifica a ninguna comuna y no debe ensuciar el histórico.
function idAuditable(id: string): string | null {
  const analisis = idRutaSchema.safeParse(id);
  return analisis.success ? analisis.data : null;
}

export async function PUT(request: Request, contexto: ContextoRuta) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarComuna(acceso.sesion, request, {
        accion: "COMUNA_ACTUALIZADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        comunaId: idAuditable(id),
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);

  if (!idValido.success) {
    auditarComuna(acceso.sesion, request, {
      accion: "COMUNA_ACTUALIZADA",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      comunaId: null,
    });
    return respuestaNoEncontrada();
  }

  // El body se lee DESPUÉS del guard: una petición sin permiso no llega a parsearse.
  const cuerpo = await request.json().catch(() => null);
  const datos = comunaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaValidacion(datos.error);
  }

  try {
    const resultado = await actualizarComuna(idValido.data, datos.data, {
      repositorio: prismaComunaRepository,
      repositorioProvincias: prismaProvinciaRepository,
    });

    if (!resultado.ok) {
      switch (resultado.motivo) {
        case "NO_ENCONTRADO":
          auditarComuna(acceso.sesion, request, {
            accion: "COMUNA_ACTUALIZADA",
            resultado: "RECHAZADO",
            motivo: "NO_ENCONTRADO",
            comunaId: idValido.data,
          });
          return respuestaNoEncontrada();
        case "PROVINCIA_INVALIDA":
          return respuestaProvinciaInvalida();
        case "CODIGO_NO_COINCIDE_PROVINCIA":
          return respuestaCodigoNoCoincide(resultado.codigoProvincia);
        case "DUPLICADO":
          auditarComuna(acceso.sesion, request, {
            accion: "COMUNA_ACTUALIZADA",
            resultado: "RECHAZADO",
            motivo: "DUPLICADO",
            comunaId: idValido.data,
            provinciaId: datos.data.provinciaId,
            ...(resultado.campo ? { campos: [resultado.campo] } : {}),
          });
          return respuestaDuplicado(resultado.campo);
      }
    }

    auditarComuna(acceso.sesion, request, {
      accion: "COMUNA_ACTUALIZADA",
      resultado: "EXITO",
      comunaId: resultado.comuna.id,
      provinciaId: resultado.comuna.provincia.id,
      provinciaAnteriorId: resultado.provinciaAnteriorId ?? null,
    });

    return NextResponse.json({ comuna: aComunaDTO(resultado.comuna) });
  } catch (error) {
    logger.error("Error al actualizar comuna", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Eliminación FÍSICA: la comuna no tiene estado activo/inactivo.
export async function DELETE(request: Request, contexto: ContextoRuta) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarComuna(acceso.sesion, request, {
        accion: "COMUNA_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        comunaId: idAuditable(id),
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);

  if (!idValido.success) {
    auditarComuna(acceso.sesion, request, {
      accion: "COMUNA_ELIMINADA",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
      comunaId: null,
    });
    return respuestaNoEncontrada();
  }

  try {
    const resultado = await eliminarComuna(idValido.data, { repositorio: prismaComunaRepository });

    if (!resultado.ok) {
      const enUso = resultado.motivo === "EN_USO";

      auditarComuna(acceso.sesion, request, {
        accion: "COMUNA_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: enUso ? "COMUNA_EN_USO" : "NO_ENCONTRADO",
        comunaId: idValido.data,
      });
      return enUso ? respuestaEnUso() : respuestaNoEncontrada();
    }

    auditarComuna(acceso.sesion, request, {
      accion: "COMUNA_ELIMINADA",
      resultado: "EXITO",
      comunaId: idValido.data,
      provinciaId: resultado.provinciaId,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("Error al eliminar comuna", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
