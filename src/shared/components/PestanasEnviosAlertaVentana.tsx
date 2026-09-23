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
    { id: "automaticos", etiqueta: "Envíos automáticos", total: totalAutomaticos, contenido: enviosAutomaticos },
    { id: "manuales", etiqueta: "Envíos manuales", total: totalManuales, contenido: enviosManuales },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Historial de envíos de alertas" className="flex flex-wrap gap-2 border-b border-gob-accent">
        {pestanas.map((pestana) => (
          <button
            key={pestana.id}
            type="button"
            role="tab"
            id={`tab-envios-${pestana.id}`}
            aria-selected={activa === pestana.id}
            aria-controls={`panel-envios-${pestana.id}`}
            onClick={() => setActiva(pestana.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activa === pestana.id
                ? "border-gob-primary text-gob-primary"
                : "border-transparent text-gob-gray-a hover:text-gob-black"
            }`}
          >
            {pestana.etiqueta} ({pestana.total})
          </button>
        ))}
      </div>

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
  );
}
