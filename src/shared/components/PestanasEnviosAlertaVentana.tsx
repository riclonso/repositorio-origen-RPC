"use client";

import { useState, type ReactNode } from "react";

type PestanaId = "automaticos" | "manuales";

type PestanasEnviosAlertaVentanaProps = {
  enviosAutomaticos: ReactNode;
  totalAutomaticos: number;
  enviosManuales: ReactNode;
  totalManuales: number;
};

type DefinicionPestana = {
  id: PestanaId;
  etiqueta: string;
  total: number;
  contenido: ReactNode;
};

// Ambos paneles ya vienen resueltos desde el servidor (`TablaLotesAlertaVentana`, Server Component
// pasado como children): este componente solo alterna cuál se muestra, sin refetch al cambiar de
// pestaña. Mismo patrón que `PestanasNotificacionesVentana`.
export function PestanasEnviosAlertaVentana({
  enviosAutomaticos,
  totalAutomaticos,
  enviosManuales,
  totalManuales,
}: PestanasEnviosAlertaVentanaProps) {
  const [activa, setActiva] = useState<PestanaId>("automaticos");

  const pestanas: DefinicionPestana[] = [
    { id: "automaticos", etiqueta: "Envíos alertas automáticos", total: totalAutomaticos, contenido: enviosAutomaticos },
    { id: "manuales", etiqueta: "Envíos alertas manuales", total: totalManuales, contenido: enviosManuales },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-lg bg-white border border-gob-neutral/50 overflow-hidden">
        <div role="tablist" aria-label="Historial de envíos de alertas" className="flex flex-wrap gap-0 border-b-2 border-gob-neutral bg-gob-neutral/10 p-1">
          {pestanas.map((pestana) => (
            <button
              key={pestana.id}
              type="button"
              role="tab"
              id={`tab-envios-${pestana.id}`}
              aria-selected={activa === pestana.id}
              aria-controls={`panel-envios-${pestana.id}`}
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
              id={`panel-envios-${pestana.id}`}
              aria-labelledby={`tab-envios-${pestana.id}`}
              hidden={activa !== pestana.id}
            >
              {pestana.contenido}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
