import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { DatosEdicionVentanaCarga, VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import { fechaDentroDelAnio } from "@/modules/ventanas-carga/domain/entities/rangoAnio";
import { FormatoInvalidoVentanaCargaError } from "@/modules/ventanas-carga/domain/errors/FormatoInvalidoVentanaCargaError";

export type ResultadoEditarVentanaCarga =
  | { ok: true; ventana: VentanaCarga }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" }
  | { ok: false; motivo: "VENTANA_ELIMINADA" }
  | { ok: false; motivo: "RANGO_INVALIDO" }
  | { ok: false; motivo: "FORMATO_INVALIDO" };

// Las fechas y el formato de archivo de una ventana se pueden editar SIEMPRE, incluso si ya tiene
// cargas asociadas (decisión explícita del diseño de RF-15): este caso de uso no comprueba cargas
// existentes. El `anio` es inmutable y no se recibe aquí: se resuelve leyendo la ventana
// existente, así que el rango siempre se revalida contra el año real y nunca contra uno que el
// cliente pudiera enviar por error. El `formatoExcelId` debe corresponder a un formato activo,
// salvo que sea el mismo que la ventana ya tenía (conserva su valor actual aunque haya sido dado
// de baja mientras tanto — mismo criterio ya usado en `modules/usuarios/` para perfiles/formatos).
export async function editarVentanaCarga(
  id: string,
  datos: DatosEdicionVentanaCarga,
  dependencias: { repositorio: VentanaCargaRepository; repositorioFormatosExcel: FormatoExcelRepository },
): Promise<ResultadoEditarVentanaCarga> {
  const ventana = await dependencias.repositorio.obtenerPorId(id);

  if (!ventana) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  // Una ventana eliminada (aunque sea lógicamente, con cargas asociadas) no se vuelve a editar:
  // no tiene sentido cambiarle las fechas a un recurso que ya se dio de baja.
  if (ventana.eliminadaEn) {
    return { ok: false, motivo: "VENTANA_ELIMINADA" };
  }

  if (datos.fechaVencimiento <= datos.fechaApertura) {
    return { ok: false, motivo: "RANGO_INVALIDO" };
  }

  if (
    !fechaDentroDelAnio(datos.fechaApertura, ventana.anio) ||
    !fechaDentroDelAnio(datos.fechaVencimiento, ventana.anio)
  ) {
    return { ok: false, motivo: "RANGO_INVALIDO" };
  }

  if (datos.formatoExcelId !== ventana.formatoExcelId) {
    const formatoActivo = await dependencias.repositorioFormatosExcel.existeActivo(datos.formatoExcelId);

    if (!formatoActivo) {
      return { ok: false, motivo: "FORMATO_INVALIDO" };
    }
  }

  try {
    const actualizada = await dependencias.repositorio.actualizar(id, datos);

    if (!actualizada) {
      return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
    }

    return { ok: true, ventana: actualizada };
  } catch (error) {
    if (error instanceof FormatoInvalidoVentanaCargaError) {
      return { ok: false, motivo: "FORMATO_INVALIDO" };
    }

    throw error;
  }
}
