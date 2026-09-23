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
    <section aria-labelledby="titulo-notificaciones-ventana" className="grid grid-cols-1 gap-6">
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gob-primary">Detalle</p>
        <h2 id="titulo-notificaciones-ventana" className="text-3xl font-bold text-gob-black">
          Notificaciones
        </h2>
      </div>

      <div className="rounded-lg bg-white border border-gob-neutral/50 overflow-hidden">
        <div role="tablist" aria-label="Notificaciones de la ventana" className="flex flex-wrap gap-0 border-b-2 border-gob-neutral bg-gob-neutral/10 p-1">
          {pestanas.map((pestana) => (
            <button
              key={pestana.id}
              type="button"
              role="tab"
              id={`tab-${pestana.id}`}
              aria-selected={activa === pestana.id}
              aria-controls={`panel-${pestana.id}`}
              onClick={() => setActiva(pestana.id)}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition-all rounded-md ${
                activa === pestana.id
                  ? "bg-gob-primary text-white shadow-sm"
                  : "text-gob-gray-a hover:text-gob-black hover:bg-white/50"
              }`}
            >
              <span className="truncate">{pestana.etiqueta}</span> <span className="font-bold whitespace-nowrap ml-1">({pestana.total})</span>
            </button>
          ))}
        </div>

        <div className="p-6">
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
        </div>
      </div>
    </section>
  );
}
