import type { CandidatoAsignacionFormato } from "@/modules/formatos-excel/domain/entities/AsignacionFormato";

const MENSAJE_ERROR_CARGA = "No se pudo cargar la lista de notificadores. Intenta nuevamente.";

export type ResultadoObtencionCandidatos =
  | { ok: true; candidatos: CandidatoAsignacionFormato[] }
  | { ok: false; mensaje: string };

// Nunca rechaza: cualquier fallo se traduce a `{ ok: false }`, para que el `use()` del modal no
// dependa de un error boundary.
export async function obtenerCandidatosAsignacion(formatoId: string): Promise<ResultadoObtencionCandidatos> {
  try {
    const respuesta = await fetch(`/api/formatos-excel/${formatoId}/asignaciones`);

    if (!respuesta.ok) {
      const datosError = (await respuesta.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, mensaje: datosError?.error ?? MENSAJE_ERROR_CARGA };
    }

    const datos = (await respuesta.json().catch(() => null)) as { candidatos?: CandidatoAsignacionFormato[] } | null;
    return datos?.candidatos ? { ok: true, candidatos: datos.candidatos } : { ok: false, mensaje: MENSAJE_ERROR_CARGA };
  } catch {
    return { ok: false, mensaje: MENSAJE_ERROR_CARGA };
  }
}

export type FormatoObjetivoAsignacion = {
  id: string;
  nombre: string;
  // Creada en el manejador del click que abre el modal (no durante el render ni en un efecto) y
  // consumida con `use()` bajo `Suspense` en `ModalAsignarFormatoUsuarios`.
  candidatos: Promise<ResultadoObtencionCandidatos>;
};

// Punto de entrada para quien abre el modal: dispara la carga en el mismo evento del click.
export function prepararAsignacionFormato(id: string, nombre: string): FormatoObjetivoAsignacion {
  return { id, nombre, candidatos: obtenerCandidatosAsignacion(id) };
}
