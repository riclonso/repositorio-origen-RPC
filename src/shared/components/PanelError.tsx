"use client";

import { Boton } from "@/shared/components/Boton";

type PanelErrorProps = {
  // Título del segmento (el mismo `h1` que muestra la pantalla cuando carga bien), para que el
  // fallback no cambie la estructura de la página.
  titulo: string;
  mensaje: string;
  onReintentar: () => void;
};

// Fallback reutilizable para los `error.tsx` de los mantenedores del panel. No muestra el detalle
// del error: puede contener información interna del sistema.
export function PanelError({ titulo, mensaje, onReintentar }: PanelErrorProps) {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gob-black">{titulo}</h1>

      <div role="alert" className="card-sistema mt-6 p-6 text-sm text-gob-gray-a">
        <p className="font-medium text-gob-danger">{mensaje}</p>
        <p className="mt-2">
          Vuelve a intentarlo. Si el problema continúa, avisa al equipo de soporte.
        </p>

        <Boton variante="primario" className="mt-4" onClick={onReintentar}>
          Reintentar
        </Boton>
      </div>
    </div>
  );
}
