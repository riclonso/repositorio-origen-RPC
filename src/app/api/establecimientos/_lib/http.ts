import { NextResponse } from "next/server";
import { z } from "zod";
import type {
  CampoUnico,
  Establecimiento,
} from "@/modules/establecimiento/domain/entities/Establecimiento";
import { respuestaError } from "@/app/api/_lib/http";

export const MENSAJE_NO_ENCONTRADO = "El establecimiento no existe";

// El `id` de ruta se valida como UUID: un identificador mal formado responde 404, no 500.
export const idEstablecimientoSchema = z.uuid();

export type EstablecimientoDTO = Omit<Establecimiento, "createdAt"> & { createdAt: string };

export function aEstablecimientoDTO(establecimiento: Establecimiento): EstablecimientoDTO {
  return { ...establecimiento, createdAt: establecimiento.createdAt.toISOString() };
}

// Los mensajes NO exponen ningún dato del registro en conflicto.
const MENSAJES_DUPLICADO: Record<CampoUnico, string> = {
  rut: "Ya existe un establecimiento con ese RUT",
};

export function respuestaDuplicado(campo: CampoUnico): NextResponse {
  return respuestaError(MENSAJES_DUPLICADO[campo], 409, { campo, codigo: "DUPLICADO" });
}

// Un tipo inexistente o dado de baja es un dato inválido del formulario, no un fallo del
// servidor: se responde 400 sobre el campo y nunca se deja escalar la violación de FK a un 500.
export function respuestaTipoInvalido(): NextResponse {
  return respuestaError("El tipo seleccionado no está disponible", 400, {
    campo: "tipoId",
    codigo: "TIPO_INVALIDO",
  });
}
