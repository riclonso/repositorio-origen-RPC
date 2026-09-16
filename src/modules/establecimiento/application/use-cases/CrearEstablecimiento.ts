import type {
  CampoUnico,
  Establecimiento,
} from "@/modules/establecimiento/domain/entities/Establecimiento";
import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";
import { EstablecimientoDuplicadoError } from "@/modules/establecimiento/domain/errors/EstablecimientoDuplicadoError";
import { TipoInvalidoError } from "@/modules/establecimiento/domain/errors/TipoInvalidoError";

export type DatosCreacionEstablecimiento = {
  rut: string;
  nombre: string;
  direccion: string;
  tipoId: string;
};

export type ResultadoCrearEstablecimiento =
  | { ok: true; establecimiento: Establecimiento }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnico; rut: string }
  | { ok: false; motivo: "TIPO_INVALIDO" };

export async function crearEstablecimiento(
  datos: DatosCreacionEstablecimiento,
  dependencias: {
    repositorio: EstablecimientoRepository;
    repositorioTipos: TipoEstablecimientoRepository;
  },
): Promise<ResultadoCrearEstablecimiento> {
  // El esquema solo valida la FORMA del tipoId: que el tipo exista y esté vigente se comprueba
  // aquí, para responder un 400 de validación y no un 500 por clave foránea.
  if (!(await dependencias.repositorioTipos.existeActivo(datos.tipoId))) {
    return { ok: false, motivo: "TIPO_INVALIDO" };
  }

  const conflicto = await dependencias.repositorio.buscarConflicto({ rut: datos.rut });

  if (conflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: conflicto, rut: datos.rut };
  }

  try {
    const establecimiento = await dependencias.repositorio.crear({
      rut: datos.rut,
      nombre: datos.nombre,
      direccion: datos.direccion,
      tipoId: datos.tipoId,
    });

    return { ok: true, establecimiento };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarConflicto` y el INSERT.
    if (error instanceof EstablecimientoDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo, rut: datos.rut };
    }

    // Misma ventana, para el tipo: pudo eliminarse entre la comprobación y el INSERT.
    if (error instanceof TipoInvalidoError) {
      return { ok: false, motivo: "TIPO_INVALIDO" };
    }

    throw error;
  }
}
