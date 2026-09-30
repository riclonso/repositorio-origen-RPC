import type { CampoUnicoComuna, Comuna } from "@/modules/comunas/domain/entities/Comuna";
import type { ComunaRepository } from "@/modules/comunas/domain/repositories/ComunaRepository";
import type { ProvinciaRepository } from "@/modules/provincias/domain/repositories/ProvinciaRepository";
import { ComunaDuplicadaError } from "@/modules/comunas/domain/errors/ComunaDuplicadaError";
import { ProvinciaInvalidaError } from "@/modules/comunas/domain/errors/ProvinciaInvalidaError";
import { derivarNombreNormalizado } from "@/modules/comunas/schemas/comuna.schema";
import { validarProvinciaDeComuna } from "./validarProvinciaDeComuna";

export type DatosCreacionComuna = {
  nombre: string;
  codigo: string;
  provinciaId: string;
};

export type ResultadoCrearComuna =
  | { ok: true; comuna: Comuna }
  | { ok: false; motivo: "PROVINCIA_INVALIDA" }
  | { ok: false; motivo: "CODIGO_NO_COINCIDE_PROVINCIA"; codigoProvincia: string }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnicoComuna | null };

export type DependenciasEscrituraComuna = {
  repositorio: ComunaRepository;
  repositorioProvincias: ProvinciaRepository;
};

export async function crearComuna(
  datos: DatosCreacionComuna,
  dependencias: DependenciasEscrituraComuna,
): Promise<ResultadoCrearComuna> {
  const validacion = await validarProvinciaDeComuna(
    datos.provinciaId,
    datos.codigo,
    dependencias.repositorioProvincias,
  );

  if (!validacion.ok) {
    return validacion;
  }

  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Unicidad en dos capas: chequeo previo aquí (una sola consulta con OR) + constraints UNIQUE
  // capturadas como P2002 en el repositorio.
  const campoEnConflicto = await dependencias.repositorio.buscarConflicto({
    codigo: datos.codigo,
    provinciaId: datos.provinciaId,
    nombreNormalizado,
  });

  if (campoEnConflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: campoEnConflicto };
  }

  try {
    const comuna = await dependencias.repositorio.crear({
      nombre: datos.nombre,
      nombreNormalizado,
      codigo: datos.codigo,
      provinciaId: datos.provinciaId,
    });

    return { ok: true, comuna };
  } catch (error) {
    // Cierran la ventana de carrera entre las validaciones y el INSERT.
    if (error instanceof ComunaDuplicadaError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo };
    }

    if (error instanceof ProvinciaInvalidaError) {
      return { ok: false, motivo: "PROVINCIA_INVALIDA" };
    }

    throw error;
  }
}
