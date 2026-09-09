"use client";

import { Boton } from "@/shared/components/Boton";

// No se muestra el detalle del error: puede contener información interna del sistema.
export default function ErrorUsuarios({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gob-black">Usuarios</h1>

      <div
        role="alert"
        className="mt-6 rounded-lg border border-gob-accent bg-white p-6 text-sm text-gob-gray-a"
      >
        <p className="font-medium text-gob-danger">
          No se pudo cargar el padrón de usuarios.
        </p>
        <p className="mt-2">
          Vuelve a intentarlo. Si el problema continúa, avisa al equipo de soporte.
        </p>

        <Boton variante="primario" className="mt-4" onClick={() => retry()}>
          Reintentar
        </Boton>
      </div>
    </div>
  );
}
