import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";
import { TipoEstablecimientoDuplicadoError } from "@/modules/tipoEstablecimiento/domain/errors/TipoEstablecimientoDuplicadoError";
import { derivarNombreNormalizado } from "@/modules/tipoEstablecimiento/schemas/tipoEstablecimiento.schema";

export type DatosCreacionTipo = {
  nombre: string;
};

export type ResultadoCrearTipo =
  | { ok: true; tipo: TipoEstablecimiento }
  | { ok: false; motivo: "DUPLICADO" };

export async function crearTipoEstablecimiento(
  datos: DatosCreacionTipo,
  dependencias: { repositorio: TipoEstablecimientoRepository },
): Promise<ResultadoCrearTipo> {
  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Unicidad en dos capas: chequeo previo aquí + constraint @unique capturada como P2002 abajo.
  if (await dependencias.repositorio.buscarConflictoNombre(nombreNormalizado)) {
    return { ok: false, motivo: "DUPLICADO" };
  }

  try {
    const tipo = await dependencias.repositorio.crear({
      nombre: datos.nombre,
      nombreNormalizado,
    });

    return { ok: true, tipo };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarConflictoNombre` y el INSERT.
    if (error instanceof TipoEstablecimientoDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO" };
    }

    throw error;
  }
}
