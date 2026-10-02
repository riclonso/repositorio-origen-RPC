"use client";

import { useState } from "react";
import type { LadoMensaje } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { IconoConversacion, IconoMensaje } from "@/shared/components/iconos";
import { ModalMensajesVentana } from "@/shared/components/ModalMensajesVentana";
import { useRefrescoTrasLecturas } from "@/shared/hooks/useRefrescoTrasLecturas";
import estilosIndicador from "./IndicadorMensajes.module.css";

type BotonMensajesVentanaProps = {
  lado: LadoMensaje;
  ventanaCargaId: string;
  tituloVentana: string;
  // Mensajes del lado contrario todavía sin leer en esta ventana.
  noLeidos: number;
  variante?: "estandar" | "flotante";
};

function textoNoLeidos(lado: LadoMensaje, noLeidos: number): string {
  if (lado === "REVISOR") {
    return noLeidos === 1 ? "1 respuesta nueva" : `${noLeidos} respuestas nuevas`;
  }

  return noLeidos === 1 ? "1 mensaje nuevo del equipo revisor" : `${noLeidos} mensajes nuevos del equipo revisor`;
}

// RF-31: aviso clicable de la tarjeta de una ventana (inicio del revisor y del notificador). Solo
// se muestra si la ventana tiene mensajes: destacado cuando hay mensajes sin leer del otro lado,
// neutro ("Mensajes") cuando no los hay. Al cerrar el modal se vuelve a pedir la página al
// servidor para recalcular los avisos, DESPUÉS de que terminen las marcas de lectura en vuelo.
export function BotonMensajesVentana({
  lado,
  ventanaCargaId,
  tituloVentana,
  noLeidos,
  variante = "estandar",
}: BotonMensajesVentanaProps) {
  const [abierto, setAbierto] = useState(false);
  const { registrarLectura, refrescarTrasLecturas } = useRefrescoTrasLecturas();

  function cerrar() {
    setAbierto(false);
    refrescarTrasLecturas();
  }

  const etiquetaFlotante = noLeidos > 0 ? `Abrir mensajes, ${textoNoLeidos(lado, noLeidos)}` : "Abrir conversación";

  return (
    <>
      {variante === "flotante" ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={etiquetaFlotante}
          className={`${estilosIndicador.boton} ${noLeidos > 0 ? estilosIndicador.nuevo : ""}`}
        >
          <IconoConversacion />
          {noLeidos > 0 ? (
            <span aria-hidden="true" className={estilosIndicador.contador}>
              {noLeidos > 99 ? "99+" : noLeidos}
            </span>
          ) : null}
        </button>
      ) : noLeidos > 0 && lado === "REVISOR" ? (
        // Revisor: "Mensajes" + chip rojo con la cantidad de respuestas nuevas. El chip es
        // decorativo para lectores de pantalla; el texto completo va en `aria-label`.
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`Mensajes, ${textoNoLeidos(lado, noLeidos)}`}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-gob-danger bg-gob-warning-fondo px-3 py-1.5 text-sm font-semibold text-gob-danger transition-colors hover:brightness-95 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-danger"
        >
          <IconoMensaje className="shrink-0" />
          Mensajes
          <span
            aria-hidden="true"
            className="inline-flex min-w-6 items-center justify-center rounded-full bg-gob-danger px-1.5 py-0.5 text-xs font-bold leading-none text-white tabular-nums"
          >
            {noLeidos > 99 ? "99+" : noLeidos}
          </span>
        </button>
      ) : noLeidos > 0 ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-gob-danger bg-gob-warning-fondo px-3 py-1.5 text-sm font-semibold text-gob-danger transition-colors hover:brightness-95 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-danger"
        >
          <IconoMensaje className="shrink-0" />
          {textoNoLeidos(lado, noLeidos)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-gob-primary underline-offset-2 transition-colors hover:bg-gob-neutral hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          <IconoMensaje className="shrink-0" />
          Mensajes
        </button>
      )}

      {abierto ? (
        <ModalMensajesVentana
          lado={lado}
          ventanaCargaId={ventanaCargaId}
          tituloVentana={tituloVentana}
          onCerrar={cerrar}
          onLecturaIniciada={registrarLectura}
        />
      ) : null}
    </>
  );
}
