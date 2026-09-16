"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_ESTABLECIMIENTOS, construirRutaEstablecimientos } from "./ruta-establecimientos";

// Los tipos son datos del catálogo, no una lista fija en el código: llegan por props desde la
// página, que los lee de la base.
const OPCION_TODOS_LOS_TIPOS: OpcionSelect = { valor: "", etiqueta: "Todos los tipos" };

const OPCIONES_ESTADO = [
  { valor: "", etiqueta: "Todos los estados" },
  { valor: "true", etiqueta: "Activos" },
  { valor: "false", etiqueta: "Inactivos" },
];

type FiltrosEstablecimientosProps = {
  terminoInicial: string;
  tipoInicial: string;
  activoInicial: string;
  tamano: number;
  opcionesTipo: OpcionSelect[];
};

// El filtro vive en la URL, no en un store ni en estado derivado: los campos son no controlados y
// el componente se remonta con la `key` del filtro vigente que pasa la página.
export function FiltrosEstablecimientos({
  terminoInicial,
  tipoInicial,
  activoInicial,
  tamano,
  opcionesTipo,
}: FiltrosEstablecimientosProps) {
  const router = useRouter();
  const [buscando, iniciarBusqueda] = useTransition();

  // Toda navegación de filtro vuelve a la página 1: buscar desde la página 5 mostraría vacío.
  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const datos = new FormData(evento.currentTarget);
    const termino = String(datos.get("q") ?? "").trim();
    const tipo = String(datos.get("tipo") ?? "");
    const activo = String(datos.get("activo") ?? "");

    const ruta = construirRutaEstablecimientos(
      {
        termino: termino === "" ? undefined : termino,
        tipo: tipo === "" ? undefined : tipo,
        activo: activo === "" ? undefined : activo === "true",
        pagina: 1,
        tamano,
      },
      1,
    );

    iniciarBusqueda(() => router.push(ruta));
  }

  function limpiarFiltros() {
    iniciarBusqueda(() => router.push(RUTA_ESTABLECIMIENTOS));
  }

  return (
    <form onSubmit={manejarEnvio} aria-busy={buscando || undefined} className="card-sistema mt-6 p-4">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <CampoTexto
          id="filtro-q"
          name="q"
          etiqueta="Buscar"
          ayuda="Nombre, dirección o RUT. Se ignoran tildes y mayúsculas."
          type="search"
          defaultValue={terminoInicial}
          maxLength={100}
        />

        <CampoSelect
          id="filtro-tipo"
          name="tipo"
          etiqueta="Tipo"
          opciones={[OPCION_TODOS_LOS_TIPOS, ...opcionesTipo]}
          defaultValue={tipoInicial}
        />

        <CampoSelect
          id="filtro-activo"
          name="activo"
          etiqueta="Estado"
          opciones={OPCIONES_ESTADO}
          defaultValue={activoInicial}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Boton type="submit" variante="primario" cargando={buscando} textoCargando="Buscando...">
          Buscar
        </Boton>
        <Boton variante="secundario" onClick={limpiarFiltros} disabled={buscando}>
          Limpiar filtros
        </Boton>
      </div>
    </form>
  );
}
