"use client";

import { useState } from "react";
import type { LadoMensaje } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { IconoMensaje } from "@/shared/components/iconos";
import type { VentanaMensajesSinLeerVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { ModalMensajesVentana } from "@/shared/components/ModalMensajesVentana";
import { useRefrescoTrasLecturas } from "@/shared/hooks/useRefrescoTrasLecturas";

type BannerMensajesSinLeerProps = {
  lado: LadoMensaje;
  // Ventanas con mensajes sin leer (del lado contrario) que NO tienen tarjeta en este inicio:
  // cerradas o no listadas. Las que sí tienen tarjeta avisan en la propia tarjeta.
  ventanas: VentanaMensajesSinLeerVista[];
};

// RF-31: banner de los inicios del revisor y del notificador, con el mismo patrón visual que
// `BannerReaperturaCarga`. Cada entrada abre el MISMO modal de esa ventana que abre la tarjeta. Al
// cerrarlo se vuelve a pedir la página para que el banner refleje lo ya leído, DESPUÉS de que
// terminen las marcas de lectura en vuelo (ver `useRefrescoTrasLecturas`).
export function BannerMensajesSinLeer({ lado, ventanas }: BannerMensajesSinLeerProps) {
  const [ventanaAbierta, setVentanaAbierta] = useState<VentanaMensajesSinLeerVista | null>(null);
  const { registrarLectura, refrescarTrasLecturas } = useRefrescoTrasLecturas();

  if (ventanas.length === 0) return null;

  function cerrar() {
    setVentanaAbierta(null);
    refrescarTrasLecturas();
  }

  return (
    <section aria-label="Mensajes sin leer" className="rounded-lg border-2 border-gob-primary bg-gob-primary/5 p-4 shadow-sm">
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-gob-tertiary">
        <IconoMensaje className="shrink-0 text-gob-primary" />
        Tienes mensajes sin leer en:
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {ventanas.map((ventana) => (
          <li key={ventana.ventanaCargaId}>
            <button
              type="button"
              onClick={() => setVentanaAbierta(ventana)}
              className="inline-flex items-center gap-2 rounded-md bg-gob-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gob-primary-oscuro active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
            >
              {ventana.titulo}
            </button>
          </li>
        ))}
      </ul>

      {ventanaAbierta ? (
        <ModalMensajesVentana
          lado={lado}
          ventanaCargaId={ventanaAbierta.ventanaCargaId}
          tituloVentana={ventanaAbierta.titulo}
          onCerrar={cerrar}
          onLecturaIniciada={registrarLectura}
        />
      ) : null}
    </section>
  );
}
