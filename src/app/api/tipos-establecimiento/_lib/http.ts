import { NextResponse } from "next/server";
import { z } from "zod";
import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import { respuestaError } from "@/app/api/_lib/http";

export const MENSAJE_NO_ENCONTRADO = "El tipo de establecimiento no existe";
export const MENSAJE_DUPLICADO = "Ya existe un tipo con ese nombre";

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
