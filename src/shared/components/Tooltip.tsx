"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  texto: string;
  children: ReactNode;
};

type Posicion = { arriba: number; izquierda: number };

// Tooltip propio (fondo azul, texto blanco) en reemplazo del `title` nativo. Se dibuja en un
// portal con `position: fixed` calculado desde el elemento: las tablas del panel tienen
// `overflow-x-auto`, que recortaría un tooltip posicionado dentro de ellas.
//
// El disparador es un `span` envolvente y no el hijo, porque un `<button disabled>` no emite
// eventos de puntero en todos los navegadores, y justo ahí es donde más importa explicar el motivo.
export function Tooltip({ texto, children }: TooltipProps) {
  const id = useId();
  const [posicion, setPosicion] = useState<Posicion | null>(null);

  function mostrar(elemento: HTMLElement) {
    const rect = elemento.getBoundingClientRect();
    setPosicion({ arriba: rect.top - 6, izquierda: rect.left + rect.width / 2 });
  }

  function ocultar() {
    setPosicion(null);
  }

  // Con el tooltip visible, desplazar la página o pulsar Escape lo cierra: su posición es fija
  // y quedaría flotando lejos del elemento.
  useEffect(() => {
    if (!posicion) return;
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") setPosicion(null);
    }
    function alDesplazar() {
      setPosicion(null);
    }
    window.addEventListener("keydown", alTeclear);
    window.addEventListener("scroll", alDesplazar, true);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener("scroll", alDesplazar, true);
    };
  }, [posicion]);

  return (
    <span
      className="inline-flex"
      onPointerEnter={(evento) => mostrar(evento.currentTarget)}
      onPointerLeave={ocultar}
      onFocus={(evento) => mostrar(evento.currentTarget)}
      onBlur={ocultar}
    >
      {children}
      {posicion
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={{ top: posicion.arriba, left: posicion.izquierda }}
              className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-md bg-gob-primary px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-md"
            >
              {texto}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
