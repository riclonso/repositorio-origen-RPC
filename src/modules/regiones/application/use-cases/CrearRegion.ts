import type { CampoUnicoRegion, Region } from "@/modules/regiones/domain/entities/Region";
import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";
import { RegionDuplicadaError } from "@/modules/regiones/domain/errors/RegionDuplicadaError";
import { derivarNombreNormalizado } from "@/modules/regiones/schemas/region.schema";

export type DatosCreacionRegion = {
  nombre: string;
  codigo: string;
  numero: number;
};

export type ResultadoCrearRegion =
  | { ok: true; region: Region }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnicoRegion | null };

export async function crearRegion(
  datos: DatosCreacionRegion,
  dependencias: { repositorio: RegionRepository },
): Promise<ResultadoCrearRegion> {
  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Unicidad en dos capas: chequeo previo aquí (una sola consulta con OR) + constraints @unique
  // capturadas como P2002 en el repositorio.
  const campoEnConflicto = await dependencias.repositorio.buscarConflicto({
    nombreNormalizado,
    codigo: datos.codigo,
    numero: datos.numero,
  });

  if (campoEnConflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: campoEnConflicto };
  }

  try {
    const region = await dependencias.repositorio.crear({
      nombre: datos.nombre,
      nombreNormalizado,
      codigo: datos.codigo,
      numero: datos.numero,
    });

    return { ok: true, region };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarConflicto` y el INSERT.
    if (error instanceof RegionDuplicadaError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo };
    }

    throw error;
  }
}
