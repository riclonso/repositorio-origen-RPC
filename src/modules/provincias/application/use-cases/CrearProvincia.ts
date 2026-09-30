import type { CampoUnicoProvincia, Provincia } from "@/modules/provincias/domain/entities/Provincia";
import type { ProvinciaRepository } from "@/modules/provincias/domain/repositories/ProvinciaRepository";
import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";
import { ProvinciaDuplicadaError } from "@/modules/provincias/domain/errors/ProvinciaDuplicadaError";
import { RegionInvalidaError } from "@/modules/provincias/domain/errors/RegionInvalidaError";
import { derivarNombreNormalizado } from "@/modules/provincias/schemas/provincia.schema";
import { validarRegionDeProvincia } from "./validarRegionDeProvincia";

export type DatosCreacionProvincia = {
  nombre: string;
  codigo: string;
  regionId: string;
};

export type ResultadoCrearProvincia =
  | { ok: true; provincia: Provincia }
  | { ok: false; motivo: "REGION_INVALIDA" }
  | { ok: false; motivo: "CODIGO_NO_COINCIDE_REGION"; codigoRegion: string }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnicoProvincia | null };

export type DependenciasEscrituraProvincia = {
  repositorio: ProvinciaRepository;
  repositorioRegiones: RegionRepository;
};

export async function crearProvincia(
  datos: DatosCreacionProvincia,
  dependencias: DependenciasEscrituraProvincia,
): Promise<ResultadoCrearProvincia> {
  const validacion = await validarRegionDeProvincia(
    datos.regionId,
    datos.codigo,
    dependencias.repositorioRegiones,
  );

  if (!validacion.ok) {
    return validacion;
  }

  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Unicidad en dos capas: chequeo previo aquí (una sola consulta con OR) + constraints UNIQUE
  // capturadas como P2002 en el repositorio.
  const campoEnConflicto = await dependencias.repositorio.buscarConflicto({
    codigo: datos.codigo,
    regionId: datos.regionId,
    nombreNormalizado,
  });

  if (campoEnConflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: campoEnConflicto };
  }

  try {
    const provincia = await dependencias.repositorio.crear({
      nombre: datos.nombre,
      nombreNormalizado,
      codigo: datos.codigo,
      regionId: datos.regionId,
    });

    return { ok: true, provincia };
  } catch (error) {
    // Cierran la ventana de carrera entre las validaciones y el INSERT.
    if (error instanceof ProvinciaDuplicadaError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo };
    }

    if (error instanceof RegionInvalidaError) {
      return { ok: false, motivo: "REGION_INVALIDA" };
    }

    throw error;
  }
}
