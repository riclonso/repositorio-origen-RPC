import type { CampoUnicoComuna, Comuna } from "@/modules/comunas/domain/entities/Comuna";
import { ComunaDuplicadaError } from "@/modules/comunas/domain/errors/ComunaDuplicadaError";
import { ProvinciaInvalidaError } from "@/modules/comunas/domain/errors/ProvinciaInvalidaError";
import { derivarNombreNormalizado } from "@/modules/comunas/schemas/comuna.schema";
import type { DependenciasEscrituraComuna } from "./CrearComuna";
import { validarProvinciaDeComuna } from "./validarProvinciaDeComuna";

export type DatosActualizacionComuna = {
  nombre: string;
  codigo: string;
  // Puede cambiar: se permite mover una comuna a otra provincia, siempre que el código siga
  // empezando con el código de la provincia nueva.
  provinciaId: string;
};

export type ResultadoActualizarComuna =
  // `provinciaAnteriorId` solo viene si la comuna cambió de provincia (para auditarlo).
  | { ok: true; comuna: Comuna; provinciaAnteriorId?: string }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "PROVINCIA_INVALIDA" }
  | { ok: false; motivo: "CODIGO_NO_COINCIDE_PROVINCIA"; codigoProvincia: string }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnicoComuna | null };

export async function actualizarComuna(
  id: string,
  datos: DatosActualizacionComuna,
  dependencias: DependenciasEscrituraComuna,
): Promise<ResultadoActualizarComuna> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const validacion = await validarProvinciaDeComuna(
    datos.provinciaId,
    datos.codigo,
    dependencias.repositorioProvincias,
  );

  if (!validacion.ok) {
    return validacion;
  }

  const nombreNormalizado = derivarNombreNormalizado(datos.nombre);

  // Se excluye el propio id: guardar sin cambiar un valor único (p. ej. corregir una tilde del
  // nombre conservando el código) no debe chocar consigo mismo.
  const campoEnConflicto = await dependencias.repositorio.buscarConflicto(
    { codigo: datos.codigo, provinciaId: datos.provinciaId, nombreNormalizado },
    id,
  );

  if (campoEnConflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: campoEnConflicto };
  }

  try {
    const comuna = await dependencias.repositorio.actualizar(id, {
      nombre: datos.nombre,
      nombreNormalizado,
      codigo: datos.codigo,
      provinciaId: datos.provinciaId,
    });

    // Otra petición la eliminó entre la lectura y la escritura.
    if (!comuna) {
      return { ok: false, motivo: "NO_ENCONTRADO" };
    }

    return actual.provincia.id !== comuna.provincia.id
      ? { ok: true, comuna, provinciaAnteriorId: actual.provincia.id }
      : { ok: true, comuna };
  } catch (error) {
    if (error instanceof ComunaDuplicadaError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo };
    }

    if (error instanceof ProvinciaInvalidaError) {
      return { ok: false, motivo: "PROVINCIA_INVALIDA" };
    }

    throw error;
  }
}
