"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

type FormularioAlertasVentanaProps = {
  ventanaCargaId: string;
  diasAnticipacionInicio: number | null;
  intervaloRepeticionDias: number | null;
};

// RF-17: activa/desactiva el envío automático de una ventana. Ambos campos vacíos desactiva el
// envío automático (el envío manual sigue disponible siempre); ambos con valor lo activa. La
// regla "ambos o ninguno" la revalida el servidor (`configurarAlertasVentanaCargaSchema`); este
// formulario solo evita el viaje de red obvio cuando falta uno de los dos.
export function FormularioAlertasVentana({
  ventanaCargaId,
  diasAnticipacionInicio,
  intervaloRepeticionDias,
}: FormularioAlertasVentanaProps) {
  const router = useRouter();
  const [dias, setDias] = useState(diasAnticipacionInicio === null ? "" : String(diasAnticipacionInicio));
  const [intervalo, setIntervalo] = useState(
    intervaloRepeticionDias === null ? "" : String(intervaloRepeticionDias),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const ambosVacios = dias.trim() === "" && intervalo.trim() === "";
    const ambosConValor = dias.trim() !== "" && intervalo.trim() !== "";

    if (!ambosVacios && !ambosConValor) {
      setError("Completa ambos valores, o deja ambos vacíos para desactivar el envío automático");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const respuesta = await fetch(`/api/dashboard/ventanas-carga/${ventanaCargaId}/alertas/configuracion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diasAnticipacionInicio: ambosVacios ? null : Number(dias),
          intervaloRepeticionDias: ambosVacios ? null : Number(intervalo),
        }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      router.refresh();
    } catch {
      setError(MENSAJE_ERROR_GENERICO);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-config-alertas" className="rounded-lg border border-gob-accent bg-white p-4">
      <h3 id="titulo-config-alertas" className="text-sm font-semibold text-gob-black">
        Envío automático
      </h3>
      <p className="mt-1 text-sm text-gob-gray-a">
        Deja ambos campos vacíos para desactivar el envío automático. El envío manual sigue disponible
        siempre.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="dias-anticipacion-inicio"
          etiqueta="Días de anticipación"
          type="number"
          min={1}
          max={365}
          value={dias}
          onChange={(evento) => setDias(evento.target.value)}
          disabled={guardando}
          ayuda="Días antes del cierre en que empieza a enviarse la alerta"
        />
        <CampoTexto
          id="intervalo-repeticion-dias"
          etiqueta="Repetir cada (días)"
          type="number"
          min={1}
          max={365}
          value={intervalo}
          onChange={(evento) => setIntervalo(evento.target.value)}
          disabled={guardando}
          ayuda="Cada cuántos días se repite desde el inicio"
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <Boton
        variante="primario"
        className="mt-4 w-fit"
        cargando={guardando}
        textoCargando="Guardando..."
        onClick={() => void guardar()}
      >
        Guardar configuración
      </Boton>
    </section>
  );
}
