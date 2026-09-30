"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { construirRutaProvincias } from "./ruta-provincias";

const OPCION_TODAS_LAS_REGIONES: OpcionSelect = { valor: "", etiqueta: "Todas las regiones" };

type FiltroProvinciasProps = {
  regionInicial: string;
  opcionesRegion: OpcionSelect[];
};

// El filtro vive en la URL, no en un store ni en estado derivado: el select es no controlado y el
// componente se remonta con la `key` del filtro vigente que pasa la página.
export function FiltroProvincias({ regionInicial, opcionesRegion }: FiltroProvinciasProps) {
  const router = useRouter();
  const [filtrando, iniciarFiltro] = useTransition();

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const datos = new FormData(evento.currentTarget);
    const regionId = String(datos.get("region") ?? "");

    iniciarFiltro(() => router.push(construirRutaProvincias(regionId === "" ? undefined : regionId)));
  }

  return (
    <form
      onSubmit={manejarEnvio}
      aria-busy={filtrando || undefined}
      className="card-sistema mt-6 flex flex-wrap items-end gap-4 p-4"
    >
      <div className="min-w-64 flex-1 md:max-w-sm">
        <CampoSelect
          id="filtro-region"
          name="region"
          etiqueta="Región"
          opciones={[OPCION_TODAS_LAS_REGIONES, ...opcionesRegion]}
          defaultValue={regionInicial}
        />
      </div>

      <Boton type="submit" variante="primario" cargando={filtrando} textoCargando="Filtrando...">
        Filtrar
      </Boton>
    </form>
  );
}
