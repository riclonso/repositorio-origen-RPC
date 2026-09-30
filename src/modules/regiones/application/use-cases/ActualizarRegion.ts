import type { CampoUnicoRegion, Region } from "@/modules/regiones/domain/entities/Region";
import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";
import { RegionDuplicadaError } from "@/modules/regiones/domain/errors/RegionDuplicadaError";
import { derivarNombreNormalizado } from "@/modules/regiones/schemas/region.schema";

export type DatosActualizacionRegion = {
  nombre: string;
  codigo: string;
  numero: number;
};

export type ResultadoActualizarRegion =
  | { ok: true; region: Region }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "CODIGO_CON_PROVINCIAS" }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnicoRegion | null };

export async function actualizarRegion(
  id: string,
  datos: DatosActualizacionRegion,
  dependencias: { repositorio: RegionRepository },
): Promise<ResultadoActualizarRegion> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // RF-27: el código de cada provincia empieza con el de su región. Recodificar una región con
  // provincias las dejaría incoherentes, así que se bloquea; nombre y número siguen editables.
  // Riesgo aceptado: no hay bloqueo entre esta lectura y el UPDATE, así que una provincia creada
  // en ese intervalo podría quedar con el prefijo antiguo (ventana de milisegundos en un
  // mantenedor de uso esporádico por administradores).
  if (datos.codigo !== actual.codigo && (await dependencias.repositorio.tieneProvincias(id))) {
    return { ok: false, motivo: "CODIGO_CON_PROVINCIAS" };
  }

  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Se excluye el propio id: guardar sin cambiar un valor único (p. ej. corregir una tilde del
  // nombre conservando código y número) no debe chocar consigo mismo.
  const campoEnConflicto = await dependencias.repositorio.buscarConflicto(
    { nombreNormalizado, codigo: datos.codigo, numero: datos.numero },
    id,
  );

  if (campoEnConflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: campoEnConflicto };
  }

  try {
    const region = await dependencias.repositorio.actualizar(id, {
      nombre: datos.nombre,
      nombreNormalizado,
      codigo: datos.codigo,
      numero: datos.numero,
    });

    // Otra petición la eliminó entre la lectura y la escritura.
    if (!region) {
      return { ok: false, motivo: "NO_ENCONTRADO" };
    }

    return { ok: true, region };
  } catch (error) {
    if (error instanceof RegionDuplicadaError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo };
    }

    throw error;
  }
}
