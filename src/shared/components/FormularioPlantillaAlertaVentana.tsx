"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import { EditorTextoEnriquecidoLimitado } from "@/shared/components/EditorTextoEnriquecidoLimitado";
import { PLANTILLA_ALERTA_POR_DEFECTO_HTML } from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

type FormularioPlantillaAlertaVentanaProps = {
  ventanaCargaId: string;
  plantillaAlerta: string;
};

// RF-17: edición de la plantilla HTML de la ventana. El HTML que produce el editor se envía tal
// cual al servidor; la sanitización real (`sanitizarPlantillaAlertaHtml`) ocurre en
// `application/ActualizarPlantillaAlertaVentanaCarga`, nunca en el cliente — este componente no es
// una barrera de seguridad, solo la superficie de edición.
export function FormularioPlantillaAlertaVentana({
  ventanaCargaId,
  plantillaAlerta,
}: FormularioPlantillaAlertaVentanaProps) {
  const router = useRouter();
  // Cambiar `valorInicial` fuerza un remount del editor (vía `key`), que es como se le "inyecta"
  // contenido nuevo a un editor Lexical no controlado: no hay una prop `value` que actualizar.
  const [valorInicial, setValorInicial] = useState(plantillaAlerta);
  const [html, setHtml] = useState(plantillaAlerta);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function restaurarPlantillaPorDefecto() {
    setValorInicial(PLANTILLA_ALERTA_POR_DEFECTO_HTML);
    setHtml(PLANTILLA_ALERTA_POR_DEFECTO_HTML);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);

    try {
      const respuesta = await fetch(`/api/dashboard/ventanas-carga/${ventanaCargaId}/alertas/plantilla`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantillaAlerta: html }),
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
    <section aria-labelledby="titulo-plantilla-alerta" className="rounded-lg border border-gob-accent bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="titulo-plantilla-alerta" className="text-sm font-semibold text-gob-black">
          Plantilla del mensaje
        </h3>
        <Boton variante="texto" disabled={guardando} onClick={restaurarPlantillaPorDefecto}>
          Restaurar plantilla por defecto
        </Boton>
      </div>

      <p className="mt-1 text-sm text-gob-gray-a">
        Placeholders disponibles: {"{{nombreUsuario}}"}, {"{{diasRestantes}}"}, {"{{formatoArchivo}}"},{" "}
        {"{{anio}}"}. El botón de enlace inserta siempre el enlace al sistema.
      </p>

      <div className="mt-3">
        <EditorTextoEnriquecidoLimitado
          key={valorInicial}
          idNamespace={`plantilla-alerta-${ventanaCargaId}`}
          valorInicialHtml={valorInicial}
          onChangeHtml={setHtml}
          disabled={guardando}
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
        Guardar plantilla
      </Boton>
    </section>
  );
}
