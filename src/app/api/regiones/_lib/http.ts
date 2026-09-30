import type { NextResponse } from "next/server";
import type { CampoUnicoRegion, Region } from "@/modules/regiones/domain/entities/Region";
import { respuestaError } from "@/app/api/_lib/http";

export const MENSAJE_NO_ENCONTRADO = "La región no existe";
// Neutral a propósito: hoy la bloquean las provincias, mañana podría ser otra tabla.
export const MENSAJE_EN_USO =
  "La región tiene registros asociados (por ejemplo, provincias) y no puede eliminarse.";
export const MENSAJE_CODIGO_CON_PROVINCIAS =
  "No se puede cambiar el código: la región tiene provincias asociadas";

// Mensajes de duplicado por campo. NO exponen ningún dato de la región en conflicto.
const MENSAJES_DUPLICADO: Record<CampoUnicoRegion, string> = {
  nombre: "Ya existe una región con ese nombre",
  codigo: "Ya existe una región con ese código",
  numero: "Ya existe una región con ese número",
};
const MENSAJE_DUPLICADO_GENERAL = "Ya existe una región con esos datos";

export type RegionDTO = Omit<Region, "createdAt"> & { createdAt: string };

export function aRegionDTO(region: Region): RegionDTO {
  return {
    id: region.id,
    nombre: region.nombre,
    codigo: region.codigo,
    numero: region.numero,
    createdAt: region.createdAt.toISOString(),
  };
}

export function respuestaNoEncontrada(): NextResponse {
  return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
}

// `campo` viaja en el cuerpo para que el formulario marque el input que choca. Si el motor no
// permitió precisarlo (carrera capturada como P2002 sin detalle), se responde sin campo.
export function respuestaDuplicado(campo: CampoUnicoRegion | null): NextResponse {
  if (!campo) {
    return respuestaError(MENSAJE_DUPLICADO_GENERAL, 409, { codigo: "DUPLICADO" });
  }

  return respuestaError(MENSAJES_DUPLICADO[campo], 409, { campo, codigo: "DUPLICADO" });
}

export function respuestaEnUso(): NextResponse {
  return respuestaError(MENSAJE_EN_USO, 409, { codigo: "REGION_EN_USO" });
}

// RF-27: `campo: "codigo"` para que el formulario de región marque el input de código.
export function respuestaCodigoConProvincias(): NextResponse {
  return respuestaError(MENSAJE_CODIGO_CON_PROVINCIAS, 409, {
    campo: "codigo",
    codigo: "CODIGO_REGION_CON_PROVINCIAS",
  });
}
