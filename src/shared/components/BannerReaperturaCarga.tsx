"use client";

import type { MouseEvent } from "react";
import { formatearFechaHora } from "@/shared/utils/fecha";
import { IconoSubir } from "@/shared/components/iconos";

// Desplazamiento suave hasta la tarjeta en vez del salto brusco del ancla. Respeta
// `prefers-reduced-motion`; sin JS el `href` sigue funcionando como ancla normal.
function irATarjeta(evento: MouseEvent<HTMLAnchorElement>, idTarjeta: string) {
  const tarjeta = document.getElementById(idTarjeta);
  if (!tarjeta) return;

  evento.preventDefault();
  const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  tarjeta.scrollIntoView({ behavior: reducirMovimiento ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${idTarjeta}`);
}

// Ancla de la tarjeta de subida de una ventana en `/notificador`: una ventana tiene un único
// formato, así que el id de la ventana basta para identificar la tarjeta.
export function idTarjetaVentana(ventanaCargaId: string): string {
  return `tarjeta-ventana-${ventanaCargaId}`;
}

// Vista liviana de `ReaperturaVigenteVista` (`application/use-cases/ListarReaperturasVigentesPropias`)
// con `fechaLimite` ya como texto ISO: mismo criterio que `CargaResumenVista` en
// `panel-carga-archivo.tsx` para cruzar el límite servidor → cliente, porque este banner ahora vive
// como estado de `PanelCargaArchivo` (Client Component) en vez de renderizarse directo desde el
// Server Component de la página, para poder quitarlo apenas el servidor confirma un "Finalizar y
// enviar" exitoso, sin esperar a que la página se vuelva a cargar.
export type ReaperturaVigentePropiaVista = {
  ventanaCargaId: string;
  formatoExcelNombre: string;
  anio: number;
  motivo: string;
  fechaLimite: string;
};

type BannerReaperturaCargaProps = {
  reaperturas: ReaperturaVigentePropiaVista[];
};

// Alerta visual en `/notificador` (home): visible SOLO para el notificador afectado, cuando tiene
// una carga rechazada con la reapertura de su ventana todavía vigente. Muestra el motivo del
// rechazo y el plazo límite para volver a subir el archivo (ver `reaperturaVigente()`/
// `fechaLimiteReapertura()` en `modules/reporte-excel/domain/entities/CargaArchivoRechazo.ts`).
export function BannerReaperturaCarga({ reaperturas }: BannerReaperturaCargaProps) {
  if (reaperturas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {reaperturas.map((reapertura) => (
        <div
          key={reapertura.ventanaCargaId}
          role="alert"
          className="rounded-lg border-2 border-gob-danger bg-gob-warning-fondo p-4 shadow-sm"
        >
          <p className="text-sm font-semibold text-gob-danger">
            Tu carga de {reapertura.formatoExcelNombre} ({reapertura.anio}) fue rechazada
          </p>
          <p className="mt-1 text-sm text-gob-gray-a">Motivo: {reapertura.motivo}</p>
          <p className="mt-1 text-sm text-gob-gray-a">
            Puedes volver a subir un archivo para esta combinación hasta el{" "}
            <strong>{formatearFechaHora(new Date(reapertura.fechaLimite))}</strong>
          </p>
          <a
            href={`#${idTarjetaVentana(reapertura.ventanaCargaId)}`}
            onClick={(evento) => irATarjeta(evento, idTarjetaVentana(reapertura.ventanaCargaId))}
            className="mt-3 inline-flex w-fit items-center gap-2 rounded-md bg-gob-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            <IconoSubir className="shrink-0" />
            Subir nuevo archivo
          </a>
        </div>
      ))}
    </div>
  );
}
