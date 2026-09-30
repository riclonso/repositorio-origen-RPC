import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarComunas } from "@/modules/comunas/application/use-cases/ListarComunas";
import { crearComuna } from "@/modules/comunas/application/use-cases/CrearComuna";
import { prismaComunaRepository } from "@/modules/comunas/infrastructure/repositories/PrismaComunaRepository";
import { auditarComuna } from "@/modules/comunas/infrastructure/auditoria/auditarComuna";
import { comunaSchema, filtroComunasSchema } from "@/modules/comunas/schemas/comuna.schema";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import {
  MENSAJE_ERROR_INTERNO,
  exigirAdmin,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import {
  aComunaDTO,
  respuestaCodigoNoCoincide,
  respuestaDuplicado,
  respuestaProvinciaInvalida,
  respuestaValidacion,
} from "./_lib/http";

// Un parámetro ausente o vacío equivale a "sin filtro".
function leerParametro(parametros: URLSearchParams, nombre: string): string | undefined {
  const valor = parametros.get(nombre);
  return valor === null || valor === "" ? undefined : valor;
}

// GET /api/comunas?regionId=<uuid>&provinciaId=<uuid>. Ambos opcionales y combinados con AND; uno
// malformado es 400 (lectura: no se audita).
export async function GET(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const parametros = new URL(request.url).searchParams;
  const filtro = filtroComunasSchema.safeParse({
    regionId: leerParametro(parametros, "regionId"),
    provinciaId: leerParametro(parametros, "provinciaId"),
  });

  if (!filtro.success) {
    return respuestaValidacion(filtro.error);
  }

  try {
    const comunas = await listarComunas(filtro.data, { repositorio: prismaComunaRepository });
    return NextResponse.json({ datos: comunas.map(aComunaDTO) });
  } catch (error) {
    logger.error("Error al listar comunas", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

export async function POST(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarComuna(acceso.sesion, request, {
        accion: "COMUNA_CREADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  // El body se lee DESPUÉS del guard: una petición sin permiso no llega a parsearse.
  const cuerpo = await request.json().catch(() => null);
  const datos = comunaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaValidacion(datos.error);
  }

  try {
    const resultado = await crearComuna(datos.data, {
      repositorio: prismaComunaRepository,
      repositorioProvincias: prismaProvinciaRepository,
    });

    if (!resultado.ok) {
      switch (resultado.motivo) {
        case "PROVINCIA_INVALIDA":
          return respuestaProvinciaInvalida();
        case "CODIGO_NO_COINCIDE_PROVINCIA":
          return respuestaCodigoNoCoincide(resultado.codigoProvincia);
        case "DUPLICADO":
          auditarComuna(acceso.sesion, request, {
            accion: "COMUNA_CREADA",
            resultado: "RECHAZADO",
            motivo: "DUPLICADO",
            provinciaId: datos.data.provinciaId,
            ...(resultado.campo ? { campos: [resultado.campo] } : {}),
          });
          return respuestaDuplicado(resultado.campo);
      }
    }

    auditarComuna(acceso.sesion, request, {
      accion: "COMUNA_CREADA",
      resultado: "EXITO",
      comunaId: resultado.comuna.id,
      provinciaId: resultado.comuna.provincia.id,
    });

    return NextResponse.json({ comuna: aComunaDTO(resultado.comuna) }, { status: 201 });
  } catch (error) {
    logger.error("Error al crear comuna", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
