import { NextResponse } from "next/server";
import { z } from "zod";
import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import { respuestaError } from "@/app/api/_lib/http";

export const MENSAJE_NO_ENCONTRADO = "El tipo de establecimiento no existe";
export const MENSAJE_DUPLICADO = "Ya existe un tipo con ese nombre";
export const MENSAJE_EN_USO =
  "No se puede eliminar: el tipo está asociado a uno o más establecimientos. Puedes desactivarlo.";

// El `id` de ruta se valida como UUID: un identificador mal formado responde 404, no 500.
export const idTipoSchema = z.uuid();

export type TipoEstablecimientoDTO = Omit<TipoEstablecimiento, "createdAt"> & {
  createdAt: string;
};

export function aTipoEstablecimientoDTO(tipo: TipoEstablecimiento): TipoEstablecimientoDTO {
  return { ...tipo, createdAt: tipo.createdAt.toISOString() };
}

// El mensaje NO expone ningún dato del registro en conflicto.
export function respuestaDuplicado(): NextResponse {
  return respuestaError(MENSAJE_DUPLICADO, 409, { campo: "nombre", codigo: "DUPLICADO" });
}

// RF-29: no dice cuántos ni cuáles establecimientos usan el tipo.
export function respuestaEnUso(): NextResponse {
  return respuestaError(MENSAJE_EN_USO, 409, { codigo: "TIPO_ESTABLECIMIENTO_EN_USO" });
}
