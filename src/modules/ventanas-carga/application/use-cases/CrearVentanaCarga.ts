import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import { fechaDentroDelAnio } from "@/modules/ventanas-carga/domain/entities/rangoAnio";
import { VentanaCargaDuplicadaError } from "@/modules/ventanas-carga/domain/errors/VentanaCargaDuplicadaError";
import { FormatoInvalidoVentanaCargaError } from "@/modules/ventanas-carga/domain/errors/FormatoInvalidoVentanaCargaError";

export type DatosCreacionVentanaCarga = {
  anio: number;
  fechaApertura: Date;
  fechaVencimiento: Date;
  formatoExcelId: string;
  creadoPorId: string;
};

export type ResultadoCrearVentanaCarga =
  | { ok: true; ventana: VentanaCarga }
  | { ok: false; motivo: "ANIO_DUPLICADO" }
  | { ok: false; motivo: "RANGO_INVALIDO" }
  | { ok: false; motivo: "FORMATO_INVALIDO" };

// Como mucho una ventana por año calendario y formato (`(anio, formatoExcelId)` es único mientras
// no esté eliminada). Se comprueba antes de escribir y además se captura `P2002`/`P2003` como
// segunda capa de defensa contra la ventana de carrera de dos administradores creando la misma
// ventana a la vez, o contra un formato que se dio de baja física entre la comprobación y el
// INSERT (no ocurre hoy porque no hay borrado físico de formatos, pero cierra el caso igual).
export async function crearVentanaCarga(
  datos: DatosCreacionVentanaCarga,
  dependencias: { repositorio: VentanaCargaRepository; repositorioFormatosExcel: FormatoExcelRepository },
): Promise<ResultadoCrearVentanaCarga> {
  // Revalidado aquí también (ya lo valida `crearVentanaCargaSchema.superRefine` en el Route
  // Handler): mismo criterio de defensa en profundidad que ya usa `editarVentanaCarga`, para
  // que un futuro caller directo de este caso de uso no pueda saltarse la regla de rango.
  if (
    datos.fechaVencimiento <= datos.fechaApertura ||
    !fechaDentroDelAnio(datos.fechaApertura, datos.anio) ||
    !fechaDentroDelAnio(datos.fechaVencimiento, datos.anio)
  ) {
    return { ok: false, motivo: "RANGO_INVALIDO" };
  }

  const formatoActivo = await dependencias.repositorioFormatosExcel.existeActivo(datos.formatoExcelId);

  if (!formatoActivo) {
    return { ok: false, motivo: "FORMATO_INVALIDO" };
  }

  const existente = await dependencias.repositorio.obtenerPorAnioYFormato(datos.anio, datos.formatoExcelId);

  if (existente) {
    return { ok: false, motivo: "ANIO_DUPLICADO" };
  }

  try {
    const ventana = await dependencias.repositorio.crear(datos);
    return { ok: true, ventana };
  } catch (error) {
    if (error instanceof VentanaCargaDuplicadaError) {
      return { ok: false, motivo: "ANIO_DUPLICADO" };
    }

    if (error instanceof FormatoInvalidoVentanaCargaError) {
      return { ok: false, motivo: "FORMATO_INVALIDO" };
    }

    throw error;
  }
}
