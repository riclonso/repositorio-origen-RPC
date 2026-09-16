import type {
  CampoUnico,
  DatosEdicionEstablecimiento,
  Establecimiento,
} from "@/modules/establecimiento/domain/entities/Establecimiento";
import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";
import { EstablecimientoDuplicadoError } from "@/modules/establecimiento/domain/errors/EstablecimientoDuplicadoError";
import { TipoInvalidoError } from "@/modules/establecimiento/domain/errors/TipoInvalidoError";

export type DatosActualizacionEstablecimiento = DatosEdicionEstablecimiento;

export type ResultadoActualizarEstablecimiento =
  | { ok: true; establecimiento: Establecimiento }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "TIPO_INVALIDO" }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnico; rut: string };

export async function actualizarEstablecimiento(
  id: string,
  datos: DatosActualizacionEstablecimiento,
  dependencias: {
    repositorio: EstablecimientoRepository;
    repositorioTipos: TipoEstablecimientoRepository;
  },
): Promise<ResultadoActualizarEstablecimiento> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Conservar el tipo que el establecimiento ya tiene siempre es válido, aunque el catálogo lo
  // haya dado de baja. Asignar un tipo dado de baja DISTINTO del actual se rechaza. Si el tipo
  // llega a borrarse, la violación de FK (P2003) se traduce igual a TIPO_INVALIDO.
  const conservaSuTipo = datos.tipoId === actual.tipoId;

  if (!conservaSuTipo && !(await dependencias.repositorioTipos.existeActivo(datos.tipoId))) {
    return { ok: false, motivo: "TIPO_INVALIDO" };
  }

  if (datos.rut !== actual.rut) {
    const conflicto = await dependencias.repositorio.buscarConflicto({ rut: datos.rut }, id);

    if (conflicto) {
      return { ok: false, motivo: "DUPLICADO", campo: conflicto, rut: datos.rut };
    }
  }

  try {
    const establecimiento = await dependencias.repositorio.actualizar(id, datos);

    return { ok: true, establecimiento };
  } catch (error) {
    if (error instanceof EstablecimientoDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo, rut: datos.rut };
    }

    // El tipo pudo eliminarse entre la comprobación y el UPDATE.
    if (error instanceof TipoInvalidoError) {
      return { ok: false, motivo: "TIPO_INVALIDO" };
    }

    throw error;
  }
}
