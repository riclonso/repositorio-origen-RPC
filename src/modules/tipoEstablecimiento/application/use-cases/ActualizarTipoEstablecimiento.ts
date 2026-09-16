import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";
import { TipoEstablecimientoDuplicadoError } from "@/modules/tipoEstablecimiento/domain/errors/TipoEstablecimientoDuplicadoError";
import { derivarNombreNormalizado } from "@/modules/tipoEstablecimiento/schemas/tipoEstablecimiento.schema";

export type DatosActualizacionTipo = {
  nombre: string;
};

export type ResultadoActualizarTipo =
  | { ok: true; tipo: TipoEstablecimiento }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "DUPLICADO" };

export async function actualizarTipoEstablecimiento(
  id: string,
  datos: DatosActualizacionTipo,
  dependencias: { repositorio: TipoEstablecimientoRepository },
): Promise<ResultadoActualizarTipo> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Se excluye el propio id: renombrar sin cambiar el normalizado (p.ej. corregir mayúsculas) no
  // debe chocar consigo mismo.
  if (await dependencias.repositorio.buscarConflictoNombre(nombreNormalizado, id)) {
    return { ok: false, motivo: "DUPLICADO" };
  }

  try {
    const tipo = await dependencias.repositorio.actualizar(id, {
      nombre: datos.nombre,
      nombreNormalizado,
    });

    return { ok: true, tipo };
  } catch (error) {
    if (error instanceof TipoEstablecimientoDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO" };
    }

    throw error;
  }
}
