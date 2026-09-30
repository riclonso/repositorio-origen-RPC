import type { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type {
  CampoUnicoProvincia,
  Provincia,
} from "@/modules/provincias/domain/entities/Provincia";
import { MENSAJE_DATOS_INVALIDOS, respuestaError } from "@/app/api/_lib/http";

export const MENSAJE_NO_ENCONTRADO = "La provincia no existe";
// Neutral a propósito: hoy la bloquean las comunas, mañana podría ser otra tabla.
export const MENSAJE_EN_USO =
  "La provincia tiene registros asociados (por ejemplo, comunas) y no puede eliminarse.";
export const MENSAJE_CODIGO_CON_COMUNAS =
  "No se puede cambiar el código: la provincia tiene comunas asociadas";
export const MENSAJE_REGION_INVALIDA = "La región seleccionada no existe";

// Mensajes de duplicado por campo. NO exponen ningún dato de la provincia en conflicto.
const MENSAJES_DUPLICADO: Record<CampoUnicoProvincia, string> = {
  nombre: "Ya existe una provincia con ese nombre en la región",
  codigo: "Ya existe una provincia con ese código",
};
const MENSAJE_DUPLICADO_GENERAL = "Ya existe una provincia con esos datos";

// Nunca incluye `nombreNormalizado`: la entidad ni siquiera lo declara.
export type ProvinciaDTO = {
  id: string;
  nombre: string;
  codigo: string;
  regionId: string;
  regionNombre: string;
  regionCodigo: string;
  createdAt: string;
};

export function aProvinciaDTO(provincia: Provincia): ProvinciaDTO {
  return {
    id: provincia.id,
    nombre: provincia.nombre,
    codigo: provincia.codigo,
    regionId: provincia.region.id,
    regionNombre: provincia.region.nombre,
    regionCodigo: provincia.region.codigo,
    createdAt: provincia.createdAt.toISOString(),
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
export function respuestaDuplicado(campo: CampoUnicoProvincia | null): NextResponse {
  if (!campo) {
    return respuestaError(MENSAJE_DUPLICADO_GENERAL, 409, { codigo: "DUPLICADO" });
  }

  return respuestaError(MENSAJES_DUPLICADO[campo], 409, { campo, codigo: "DUPLICADO" });
}

export function respuestaEnUso(): NextResponse {
  return respuestaError(MENSAJE_EN_USO, 409, { codigo: "PROVINCIA_EN_USO" });
}

// RF-28: `campo: "codigo"` para que el formulario de provincia marque el input de código.
export function respuestaCodigoConComunas(): NextResponse {
  return respuestaError(MENSAJE_CODIGO_CON_COMUNAS, 409, {
    campo: "codigo",
    codigo: "CODIGO_PROVINCIA_CON_COMUNAS",
  });
}

// Reglas de negocio que dependen de la región: son 400 (datos incorrectos del formulario), no se
// auditan, y marcan el campo que el operador debe corregir.
export function respuestaRegionInvalida(): NextResponse {
  return respuestaError(MENSAJE_REGION_INVALIDA, 400, {
    campo: "regionId",
    codigo: "REGION_INVALIDA",
  });
}

export function respuestaCodigoNoCoincide(codigoRegion: string): NextResponse {
  return respuestaError(
    `El código debe comenzar con el código de la región (${codigoRegion})`,
    400,
    { campo: "codigo", codigo: "CODIGO_NO_COINCIDE_REGION" },
  );
}
