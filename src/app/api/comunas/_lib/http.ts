import type { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { CampoUnicoComuna, Comuna } from "@/modules/comunas/domain/entities/Comuna";
import { MENSAJE_DATOS_INVALIDOS, respuestaError } from "@/app/api/_lib/http";

export const MENSAJE_NO_ENCONTRADO = "La comuna no existe";
export const MENSAJE_EN_USO = "La comuna tiene registros asociados y no puede eliminarse.";
export const MENSAJE_PROVINCIA_INVALIDA = "La provincia seleccionada no existe";

// Mensajes de duplicado por campo. NO exponen ningún dato de la comuna en conflicto.
const MENSAJES_DUPLICADO: Record<CampoUnicoComuna, string> = {
  nombre: "Ya existe una comuna con ese nombre en la provincia",
  codigo: "Ya existe una comuna con ese código",
};
const MENSAJE_DUPLICADO_GENERAL = "Ya existe una comuna con esos datos";

// Nunca incluye `nombreNormalizado`: la entidad ni siquiera lo declara.
export type ComunaDTO = {
  id: string;
  nombre: string;
  codigo: string;
  provinciaId: string;
  provinciaNombre: string;
  provinciaCodigo: string;
  regionId: string;
  regionNombre: string;
  regionCodigo: string;
  createdAt: string;
};

export function aComunaDTO(comuna: Comuna): ComunaDTO {
  return {
    id: comuna.id,
    nombre: comuna.nombre,
    codigo: comuna.codigo,
    provinciaId: comuna.provincia.id,
    provinciaNombre: comuna.provincia.nombre,
    provinciaCodigo: comuna.provincia.codigo,
    regionId: comuna.provincia.region.id,
    regionNombre: comuna.provincia.region.nombre,
    regionCodigo: comuna.provincia.region.codigo,
    createdAt: comuna.createdAt.toISOString(),
  };
}

// 400 con el primer problema de validación y el campo al que corresponde.
export function respuestaValidacion(error: ZodError): NextResponse {
  const primerProblema = error.issues[0];
  return respuestaError(primerProblema?.message ?? MENSAJE_DATOS_INVALIDOS, 400, {
    campo: primerProblema?.path[0] ? String(primerProblema.path[0]) : undefined,
  });
}

export function respuestaNoEncontrada(): NextResponse {
  return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
}

// `campo` viaja en el cuerpo para que el formulario marque el input que choca. Si el motor no
// permitió precisarlo (carrera capturada como P2002 sin detalle), se responde sin campo.
export function respuestaDuplicado(campo: CampoUnicoComuna | null): NextResponse {
  if (!campo) {
    return respuestaError(MENSAJE_DUPLICADO_GENERAL, 409, { codigo: "DUPLICADO" });
  }

  return respuestaError(MENSAJES_DUPLICADO[campo], 409, { campo, codigo: "DUPLICADO" });
}

export function respuestaEnUso(): NextResponse {
  return respuestaError(MENSAJE_EN_USO, 409, { codigo: "COMUNA_EN_USO" });
}

// Reglas de negocio que dependen de la provincia: son 400 (datos incorrectos del formulario), no
// se auditan, y marcan el campo que el operador debe corregir.
export function respuestaProvinciaInvalida(): NextResponse {
  return respuestaError(MENSAJE_PROVINCIA_INVALIDA, 400, {
    campo: "provinciaId",
    codigo: "PROVINCIA_INVALIDA",
  });
}

export function respuestaCodigoNoCoincide(codigoProvincia: string): NextResponse {
  return respuestaError(
    `El código debe comenzar con el código de la provincia (${codigoProvincia})`,
    400,
    { campo: "codigo", codigo: "CODIGO_NO_COINCIDE_PROVINCIA" },
  );
}
