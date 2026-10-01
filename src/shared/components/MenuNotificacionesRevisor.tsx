"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { IconoNotificaciones } from "@/shared/components/iconos";

type MenuNotificacionesRevisorProps = {
  cantidad: number;
};

// La campana representa archivos que el notificador ya envió y que esperan revisión, no un
// contador local que pudiera quedar desactualizado. Su menú es un aviso breve con una salida
// directa a las ventanas donde ese trabajo se resuelve.
export function MenuNotificacionesRevisor({ cantidad }: MenuNotificacionesRevisorProps) {
  const [abierto, setAbierto] = useState(false);
  const referenciaContenedor = useRef<HTMLDivElement>(null);
  const referenciaBoton = useRef<HTMLButtonElement>(null);
  const referenciaEnlace = useRef<HTMLAnchorElement>(null);
  const idMenu = useId();
  const hayNotificaciones = cantidad > 0;
  const mensaje = hayNotificaciones
    ? `Tienes ${cantidad} ${cantidad === 1 ? "nueva notificación" : "nuevas notificaciones"}.`
    : "No tienes notificaciones nuevas.";

  function cerrarYDevolverFoco() {
    setAbierto(false);
    referenciaBoton.current?.focus();
  }

  useEffect(() => {
    if (!abierto) return;

    function alHacerClicFuera(evento: MouseEvent) {
      if (!referenciaContenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }

    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;

    function alPresionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") cerrarYDevolverFoco();
    }

    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, [abierto]);

  useEffect(() => {
    if (abierto && hayNotificaciones) referenciaEnlace.current?.focus();
  }, [abierto, hayNotificaciones]);

  return (
    <div ref={referenciaContenedor} className="relative">
      <button
        ref={referenciaBoton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idMenu}
        onClick={() => setAbierto((estabaAbierto) => !estabaAbierto)}
        className="relative inline-flex size-9 items-center justify-center rounded-full border border-gob-accent bg-white text-gob-primary transition-colors hover:border-gob-primary hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
      >
        <span className={hayNotificaciones ? "animate-campana" : undefined}>
          <IconoNotificaciones />
        </span>
        {hayNotificaciones ? (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[#c62828] px-1 text-[0.625rem] font-bold leading-4 text-white">
            {cantidad > 99 ? "99+" : cantidad}
          </span>
        ) : null}
        <span className="sr-only">{mensaje}</span>
      </button>

      {abierto ? (
        <div
          id={idMenu}
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-[#d7e2ed] bg-white p-4 shadow-[0_12px_28px_rgba(23,59,105,0.16)]"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f2fb] text-gob-primary">
              <IconoNotificaciones />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#173b69]">Notificaciones</p>
              <p className="mt-1 text-sm leading-5 text-[#526a82]">{mensaje}</p>
            </div>
          </div>

          {hayNotificaciones ? (
            <Link
              ref={referenciaEnlace}
              href="/revisor/ventanas-carga"
              onClick={cerrarYDevolverFoco}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-gob-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0f5fa5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
            >
              Ver ventanas de carga
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
