"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VolverSesionAdministrador() {
  const router = useRouter();
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function volver() {
    setProcesando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/sesion/delegada/restaurar", { method: "POST" });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setProcesando(false);
        setError(datos?.error ?? "No se pudo restaurar tu sesión de administrador.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setProcesando(false);
      setError("No se pudo restaurar tu sesión de administrador.");
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={volver}
        disabled={procesando}
        className="rounded-md border border-gob-primary px-3 py-1.5 text-xs font-semibold text-gob-primary transition-colors hover:bg-gob-neutral disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
      >
        {procesando ? "Volviendo..." : "Volver a mi sesión"}
      </button>
      {error ? <p role="alert" className="mt-1 max-w-56 text-xs text-gob-danger">{error}</p> : null}
    </div>
  );
}
