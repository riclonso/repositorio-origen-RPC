"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import {
  CampoSelect,
  type GrupoOpcionesSelect,
  type OpcionSelect,
} from "@/shared/components/CampoSelect";
import { construirRutaComunas } from "./ruta-comunas";

const OPCION_TODAS_LAS_REGIONES: OpcionSelect = { valor: "", etiqueta: "Todas las regiones" };
const OPCION_TODAS_LAS_PROVINCIAS: OpcionSelect = { valor: "", etiqueta: "Todas las provincias" };

type FiltroComunasProps = {
  regionInicial: string;
  provinciaInicial: string;
  opcionesRegion: OpcionSelect[];
  gruposProvincia: GrupoOpcionesSelect[];
};

function leerSeleccion(datos: FormData, nombre: string): string | undefined {
  const valor = String(datos.get(nombre) ?? "");
  return valor === "" ? undefined : valor;
}

// Los filtros viven en la URL, no en un store ni en estado derivado: los selects son no
// controlados e independientes (el servidor los combina con AND) y el componente se remonta con
// la `key` de los filtros vigentes que pasa la página.
export function FiltroComunas({
  regionInicial,
  provinciaInicial,
  opcionesRegion,
  gruposProvincia,
}: FiltroComunasProps) {
  const router = useRouter();
  const [filtrando, iniciarFiltro] = useTransition();

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const datos = new FormData(evento.currentTarget);
    const ruta = construirRutaComunas({
      regionId: leerSeleccion(datos, "region"),
      provinciaId: leerSeleccion(datos, "provincia"),
    });

    iniciarFiltro(() => router.push(ruta));
  }

  return (
    <form
      onSubmit={manejarEnvio}
      aria-busy={filtrando || undefined}
      className="card-sistema mt-6 flex flex-wrap items-end gap-4 p-4"
    >
      <div className="min-w-64 flex-1 md:max-w-xs">
        <CampoSelect
          id="filtro-region"
          name="region"
          etiqueta="Región"
          opciones={[OPCION_TODAS_LAS_REGIONES, ...opcionesRegion]}
          defaultValue={regionInicial}
        />
      </div>

      <div className="min-w-64 flex-1 md:max-w-xs">
        <CampoSelect
          id="filtro-provincia"
          name="provincia"
          etiqueta="Provincia"
          opciones={[OPCION_TODAS_LAS_PROVINCIAS, ...gruposProvincia]}
          defaultValue={provinciaInicial}
        />
      </div>

      <Boton type="submit" variante="primario" cargando={filtrando} textoCargando="Filtrando...">
        Filtrar
      </Boton>
    </form>
  );
}
