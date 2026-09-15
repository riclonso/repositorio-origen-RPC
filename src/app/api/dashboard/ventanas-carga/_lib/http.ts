import { NextResponse } from "next/server";
import type { VentanaCargaConEstado } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import {
  exigirAdminORevisor,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoAdminORevisor,
} from "@/app/api/_lib/http";

export { exigirAdminORevisor, respuestaError, respuestaSinAcceso, type AccesoAdminORevisor };

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "La ventana de carga no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

export const idVentanaCargaSchema = idRutaSchema;

export type VentanaCargaDTO = Omit<
  VentanaCargaConEstado,
  "fechaApertura" | "fechaVencimiento" | "eliminadaEn" | "createdAt" | "updatedAt"
> & {
  fechaApertura: string;
  fechaVencimiento: string;
  eliminadaEn: string | null;
  createdAt: string;
  updatedAt: string;
};

export function aVentanaCargaDTO(ventana: VentanaCargaConEstado): VentanaCargaDTO {
  return {
    ...ventana,
    fechaApertura: ventana.fechaApertura.toISOString(),
    fechaVencimiento: ventana.fechaVencimiento.toISOString(),
    eliminadaEn: ventana.eliminadaEn ? ventana.eliminadaEn.toISOString() : null,
    createdAt: ventana.createdAt.toISOString(),
    updatedAt: ventana.updatedAt.toISOString(),
  };
}

export function respuestaAnioDuplicado(anio: number): NextResponse {
  return respuestaError(`Ya existe una ventana de carga para el año ${anio}`, 409, {
    campo: "anio",
    codigo: "ANIO_DUPLICADO",
  });
}

export function respuestaRangoInvalido(mensaje: string): NextResponse {
  return respuestaError(mensaje, 400, { campo: "fechaVencimiento", codigo: "RANGO_INVALIDO" });
}

export function respuestaVentanaEliminada(): NextResponse {
  return respuestaError("Esta ventana ya fue eliminada", 409, { codigo: "VENTANA_ELIMINADA" });
}

// El formato de archivo seleccionado no existe o no está activo (salvo que sea el que la ventana
// ya tenía asignado, ver `editarVentanaCarga`). Mismo estilo que `respuestaRangoInvalido`.
export function respuestaFormatoInvalido(): NextResponse {
  return respuestaError("El formato de archivo seleccionado no existe o no está activo", 400, {
    campo: "formatoExcelId",
    codigo: "FORMATO_INVALIDO",
  });
}

// Distinto del 403 de `respuestaSinAcceso` (perfil sin acceso al recurso en absoluto): este es el
// rechazo de negocio cuando un REVISOR_REPOSITORIO intenta eliminar una ventana que no creó él.
export function respuestaSinPermisoEliminar(): NextResponse {
  return respuestaError("Solo puedes eliminar ventanas de carga que tú creaste", 403, {
    codigo: "SIN_PERMISO",
  });
}
