"use client";

import type { LadoMensaje } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { ModalConversacionNotificador } from "@/shared/components/ModalConversacionNotificador";
import { ModalConversacionesRevisor } from "@/shared/components/ModalConversacionesRevisor";

type ModalMensajesVentanaProps = {
  lado: LadoMensaje;
  ventanaCargaId: string;
  tituloVentana: string;
  onCerrar: () => void;
  onLecturaIniciada: (lectura: Promise<unknown>) => void;
};

// RF-31: abre el modal de mensajes de una ventana que corresponde a cada lado. Lo comparten el
// aviso de las tarjetas (`BotonMensajesVentana`) y el banner de mensajes sin leer
// (`BannerMensajesSinLeer`) de ambos inicios.
export function ModalMensajesVentana({
  lado,
  ventanaCargaId,
  tituloVentana,
  onCerrar,
  onLecturaIniciada,
}: ModalMensajesVentanaProps) {
  return lado === "REVISOR" ? (
    <ModalConversacionesRevisor
      ventanaCargaId={ventanaCargaId}
      tituloVentana={tituloVentana}
      onCerrar={onCerrar}
      onLecturaIniciada={onLecturaIniciada}
    />
  ) : (
    <ModalConversacionNotificador
      ventanaCargaId={ventanaCargaId}
      tituloVentana={tituloVentana}
      onCerrar={onCerrar}
      onLecturaIniciada={onLecturaIniciada}
    />
  );
}
