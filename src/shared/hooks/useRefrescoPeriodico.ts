"use client";

import { useEffect, useEffectEvent } from "react";

// Intervalo de consulta mientras el modal está abierto y la pestaña visible (RF-31, sin tiempo
// real a propósito).
export const INTERVALO_REFRESCO_MS = 20_000;

// RF-31: consulta inmediata al cambiar `clave` (abrir el modal, cambiar de notificador), luego cada
// `INTERVALO_REFRESCO_MS` mientras la pestaña esté visible, y también apenas la pestaña vuelve a
// estar visible (sin esperar al próximo tic). Cada consulta aborta la anterior; el intervalo y el
// listener se limpian al desmontar (cerrar el modal) o al cambiar de clave. `clave = null`
// desactiva la consulta. RF-38: `intervaloMs` opcional (la validación de una carga consulta cada 5 s).
export function useRefrescoPeriodico(
  consultar: (senal: AbortSignal) => Promise<void>,
  clave: string | null,
  intervaloMs: number = INTERVALO_REFRESCO_MS,
): void {
  const consultarActual = useEffectEvent(consultar);

  useEffect(() => {
    if (clave === null) return;

    let controlador = new AbortController();

    function ejecutar() {
      controlador.abort();
      controlador = new AbortController();
      void consultarActual(controlador.signal);
    }

    function ejecutarSiVisible() {
      if (document.visibilityState === "visible") ejecutar();
    }

    ejecutar();

    const intervalo = window.setInterval(ejecutarSiVisible, intervaloMs);
    document.addEventListener("visibilitychange", ejecutarSiVisible);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", ejecutarSiVisible);
      controlador.abort();
    };
  }, [clave, intervaloMs]);
}
