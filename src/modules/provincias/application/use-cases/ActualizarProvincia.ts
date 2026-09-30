import type { CampoUnicoProvincia, Provincia } from "@/modules/provincias/domain/entities/Provincia";
import { ProvinciaDuplicadaError } from "@/modules/provincias/domain/errors/ProvinciaDuplicadaError";
import { RegionInvalidaError } from "@/modules/provincias/domain/errors/RegionInvalidaError";
import { derivarNombreNormalizado } from "@/modules/provincias/schemas/provincia.schema";
import type { DependenciasEscrituraProvincia } from "./CrearProvincia";
import { validarRegionDeProvincia } from "./validarRegionDeProvincia";

export type DatosActualizacionProvincia = {
  nombre: string;
  codigo: string;
  // Puede cambiar: se permite mover una provincia a otra región, siempre que el código siga
  // empezando con el código de la región nueva.
  regionId: string;
};

export type ResultadoActualizarProvincia =
  // `regionAnteriorId` solo viene si la provincia cambió de región (para auditarlo).
  | { ok: true; provincia: Provincia; regionAnteriorId?: string }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "CODIGO_CON_COMUNAS" }
  | { ok: false; motivo: "REGION_INVALIDA" }
  | { ok: false; motivo: "CODIGO_NO_COINCIDE_REGION"; codigoRegion: string }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnicoProvincia | null };

export async function actualizarProvincia(
  id: string,
  datos: DatosActualizacionProvincia,
  dependencias: DependenciasEscrituraProvincia,
): Promise<ResultadoActualizarProvincia> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // RF-28: el código de cada comuna empieza con el de su provincia. Recodificar una provincia con
  // comunas las dejaría incoherentes, así que se bloquea (y con ello también moverla de región,
  // que exige cambiar el prefijo); el nombre sigue editable.
  // Riesgo aceptado: no hay bloqueo entre esta lectura y el UPDATE, así que una comuna creada en
  // ese intervalo podría quedar con el prefijo antiguo (ventana de milisegundos en un mantenedor
  // de uso esporádico por administradores). Mismo criterio que `actualizarRegion`.
  if (datos.codigo !== actual.codigo && (await dependencias.repositorio.tieneComunas(id))) {
    return { ok: false, motivo: "CODIGO_CON_COMUNAS" };
  }

  const validacion = await validarRegionDeProvincia(
    datos.regionId,
    datos.codigo,
    dependencias.repositorioRegiones,
  );

  if (!validacion.ok) {
    return validacion;
  }

  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Se excluye el propio id: guardar sin cambiar un valor único (p. ej. corregir una tilde del
  // nombre conservando el código) no debe chocar consigo mismo.
  const campoEnConflicto = await dependencias.repositorio.buscarConflicto(
    { codigo: datos.codigo, regionId: datos.regionId, nombreNormalizado },
    id,
  );

  if (campoEnConflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: campoEnConflicto };
  }

  try {
    const provincia = await dependencias.repositorio.actualizar(id, {
      nombre: datos.nombre,
      nombreNormalizado,
      codigo: datos.codigo,
      regionId: datos.regionId,
    });

    // Otra petición la eliminó entre la lectura y la escritura.
    if (!provincia) {
      return { ok: false, motivo: "NO_ENCONTRADO" };
    }

    return actual.region.id !== provincia.region.id
      ? { ok: true, provincia, regionAnteriorId: actual.region.id }
      : { ok: true, provincia };
  } catch (error) {
    if (error instanceof ProvinciaDuplicadaError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo };
    }

    if (error instanceof RegionInvalidaError) {
      return { ok: false, motivo: "REGION_INVALIDA" };
    }

    throw error;
  }
}
