"use client";

import { useCallback, useState } from "react";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

// Las confirmaciones de este proyecto (eliminar, publicar/despublicar, archivar/desarchivar,
// enviar aviso masivo/individual...) comparten exactamente la misma forma: un objetivo pendiente
// de confirmación, un estado de "procesando" y un error, resueltos contra un `fetch` que el
// llamador aporta. Extraído de `TablaVentanasCarga.tsx` a `shared/` para que RF-17
// (`TablaNotificadoresPendientesVentana`) lo reutilice en vez de duplicarlo.
export function useAccionConfirmable<T>(ejecutar: (objetivo: T) => Promise<Response>, alExito: () => void) {
  const [objetivo, setObjetivo] = useState<T | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const solicitar = useCallback((valor: T) => {
    setError(null);
    setObjetivo(valor);
  }, []);

  const cancelar = useCallback(() => {
    if (procesando) return;
    setObjetivo(null);
    setError(null);
  }, [procesando]);

  const confirmar = useCallback(async () => {
    if (objetivo === null) return;

    setProcesando(true);
    setError(null);

    try {
      const respuesta = await ejecutar(objetivo);

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        setProcesando(false);
        return;
      }

      setObjetivo(null);
      setProcesando(false);
      alExito();
    } catch {
      setError(MENSAJE_ERROR_GENERICO);
      setProcesando(false);
    }
  }, [objetivo, ejecutar, alExito]);

  return { objetivo, procesando, error, solicitar, cancelar, confirmar };
}
