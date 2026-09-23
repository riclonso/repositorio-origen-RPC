"use client";

import { useState, type ReactNode } from "react";

type PestanaId = "archivo" | "rechazadas" | "notificadoresPendientes";

type PestanasNotificacionesVentanaProps = {
  notificacionesArchivo: ReactNode;
  totalArchivo: number;
  notificacionesRechazadas: ReactNode;
  totalRechazadas: number;
  notificadoresPendientes: ReactNode;
  totalNotificadoresPendientes: number;
};

type DefinicionPestana = {
  id: PestanaId;
  etiqueta: string;
  total: number;
  contenido: ReactNode;
};

// Todos los paneles ya vienen resueltos desde el servidor (Server Components pasados como
// children): este componente solo alterna cuál se muestra, sin refetch al cambiar de pestaña.
export function PestanasNotificacionesVentana({
  notificacionesArchivo,
  totalArchivo,
  notificacionesRechazadas,
  totalRechazadas,
  notificadoresPendientes,
  totalNotificadoresPendientes,
}: PestanasNotificacionesVentanaProps) {
  const [activa, setActiva] = useState<PestanaId>("archivo");

  const pestanas: DefinicionPestana[] = [
    { id: "archivo", etiqueta: "Notificaciones de archivo", total: totalArchivo, contenido: notificacionesArchivo },
    {
      id: "rechazadas",
      etiqueta: "Notificaciones rechazadas",
      total: totalRechazadas,
      contenido: notificacionesRechazadas,
    },
    {
      id: "notificadoresPendientes",
      etiqueta: "Notificadores pendientes",
      total: totalNotificadoresPendientes,
      contenido: notificadoresPendientes,
    },
  ];

  return (
    <section aria-labelledby="titulo-notificaciones-ventana" className="flex flex-col gap-5">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gob-primary">Detalle</p>
        <h2 id="titulo-notificaciones-ventana" className="text-2xl font-bold text-gob-black">
          Notificaciones
        </h2>
      </div>

      <div role="tablist" aria-label="Notificaciones de la ventana" className="flex flex-wrap gap-1 border-b-2 border-gob-neutral">
        {pestanas.map((pestana) => (
          <button
            key={pestana.id}
            type="button"
            role="tab"
            id={`tab-${pestana.id}`}
            aria-selected={activa === pestana.id}
            aria-controls={`panel-${pestana.id}`}
            onClick={() => setActiva(pestana.id)}
            className={`-mb-0.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activa === pestana.id
                ? "border-gob-primary text-gob-primary"
                : "border-transparent text-gob-gray-a hover:text-gob-black"
            }`}
          >
            {pestana.etiqueta} <span className="font-bold text-gob-primary">({pestana.total})</span>
          </button>
        ))}
      </div>

      {pestanas.map((pestana) => (
        <div
          key={pestana.id}
          role="tabpanel"
          id={`panel-${pestana.id}`}
          aria-labelledby={`tab-${pestana.id}`}
          hidden={activa !== pestana.id}
        >
          {pestana.contenido}
        </div>
      ))}
    </section>
  );
}
