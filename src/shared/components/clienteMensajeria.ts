// RF-31: llamadas `fetch` de los componentes cliente de mensajería. Formato de error uniforme de
// la API: `{ error, codigo? }`.

export const MENSAJE_ERROR_MENSAJERIA = "No se pudo completar la operación. Intenta nuevamente.";

export type RespuestaApi<T> = { ok: true; datos: T } | { ok: false; error: string };

async function interpretar<T>(respuesta: Response): Promise<RespuestaApi<T>> {
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: cuerpo?.error ?? MENSAJE_ERROR_MENSAJERIA };
  }

  return { ok: true, datos: (await respuesta.json()) as T };
}

// Una petición abortada (modal cerrado o consulta reemplazada por otra más nueva) devuelve `null`:
// quien llama no debe tocar su estado en ese caso.
export async function pedirJson<T>(url: string, senal: AbortSignal): Promise<RespuestaApi<T> | null> {
  try {
    return await interpretar<T>(await fetch(url, { signal: senal, cache: "no-store" }));
  } catch {
    return senal.aborted ? null : { ok: false, error: MENSAJE_ERROR_MENSAJERIA };
  }
}

export async function enviarJson<T>(url: string, cuerpo: unknown): Promise<RespuestaApi<T>> {
  try {
    return await interpretar<T>(
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    );
  } catch {
    return { ok: false, error: MENSAJE_ERROR_MENSAJERIA };
  }
}
