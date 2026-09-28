"use client";

import { useMemo, useState } from "react";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import type { FilaCargaExitosaVista, GrupoCargaExitosaVista } from "@/shared/components/mis-cargas-exitosas";

// Opciones sintéticas que representan "sin filtro" en los `<select>` del buscador: no son un
// formato/año real, así que no pueden viajar como una de las opciones derivadas de `grupos`.
const OPCION_TODOS_LOS_FORMATOS: OpcionSelect = { valor: "", etiqueta: "Todos" };
const OPCION_TODOS_LOS_ANIOS: OpcionSelect = { valor: "", etiqueta: "Todos" };

// `FilaCargaExitosaVista` y `GrupoCargaExitosaVista` viven en `mis-cargas-exitosas.ts` (sin
// "use client") junto con `aGrupoCargaExitosaVista`, que este componente no invoca directamente:
// solo se tipa contra ellos. Ver ese módulo para el mapeo de dominio a vista.

type CriteriosBusquedaMisCargas = { filtroFormato: string; filtroAnio: string };

function filtrarGrupos(
  grupos: GrupoCargaExitosaVista[],
  criterios: CriteriosBusquedaMisCargas,
): GrupoCargaExitosaVista[] {
  return grupos.filter((grupo) => {
    if (criterios.filtroFormato && grupo.formatoExcelId !== criterios.filtroFormato) return false;
    if (criterios.filtroAnio && String(grupo.anio) !== criterios.filtroAnio) return false;
    return true;
  });
}

// Buscador y filtros del listado, resueltos en cliente sobre el arreglo ya cargado (misma
// convención que `BuscadorVentanasCarga` en `TablaVentanasCarga.tsx`): sin pedir nada nuevo al
// servidor. Extraído como componente propio para que `TablaMisCargasExitosas` no cargue también
// con el marcado del panel de filtros.
type BuscadorMisCargasExitosasProps = {
  filtroFormato: string;
  onCambiarFiltroFormato: (valor: string) => void;
  opcionesFormato: OpcionSelect[];
  filtroAnio: string;
  onCambiarFiltroAnio: (valor: string) => void;
  opcionesAnio: OpcionSelect[];
};

function BuscadorMisCargasExitosas({
  filtroFormato,
  onCambiarFiltroFormato,
  opcionesFormato,
  filtroAnio,
  onCambiarFiltroAnio,
  opcionesAnio,
}: BuscadorMisCargasExitosasProps) {
  return (
    <section aria-labelledby="titulo-buscador-mis-cargas" className="rounded-lg border border-gob-accent bg-white p-4">
      <h2 id="titulo-buscador-mis-cargas" className="text-sm font-semibold text-gob-black">
        Filtrar cargas
      </h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <CampoSelect
          id="filtro-formato-mis-cargas"
          etiqueta="Filtrar por formato de archivo"
          opciones={opcionesFormato}
          value={filtroFormato}
          onChange={(evento) => onCambiarFiltroFormato(evento.target.value)}
        />
        <CampoSelect
          id="filtro-anio-mis-cargas"
          etiqueta="Filtrar por año"
          opciones={opcionesAnio}
          value={filtroAnio}
          onChange={(evento) => onCambiarFiltroAnio(evento.target.value)}
        />
      </div>
    </section>
  );
}

// Historial de reemplazadas de un grupo, anidado dentro de su fila vigente (`<details>/<summary>`,
// mismo patrón accesible ya usado en `app/dashboard/logs/page.tsx`): colapsable sin JavaScript y
// operable por teclado.
function HistorialReemplazadas({ reemplazadas }: { reemplazadas: FilaCargaExitosaVista[] }) {
  if (reemplazadas.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-gob-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary">
        {reemplazadas.length} {reemplazadas.length === 1 ? "reemplazada" : "reemplazadas"}
      </summary>

      <div className="mt-2 overflow-x-auto rounded-md border border-gob-accent">
        <table className="w-full min-w-md border-collapse text-left text-sm">
          <caption className="sr-only">Cargas reemplazadas de esta combinación de formato y ventana</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Archivo</th>
              <th scope="col" className="px-3 py-2 font-semibold">Fecha de Rechazo</th>
              <th scope="col" className="px-3 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {reemplazadas.map((carga) => (
              <tr key={carga.id} className="align-middle">
                <th scope="row" className="min-w-40 break-all px-3 py-2 font-medium text-gob-black">
                  {carga.nombreArchivoOriginal}
                </th>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                  {carga.desactivadaEl ?? "—"}
                </td>
                <td className="min-w-56 px-3 py-2 text-gob-gray-a">
                  {carga.motivo ? (
                    <p>
                      <span className="font-medium text-gob-black">
                        {carga.motivoTipo === "RECHAZO" ? "Rechazada" : "Reemplazada"}:
                      </span>{" "}
                      {carga.motivo}
                    </p>
                  ) : null}
                  <a
                    href={`/api/notificador/cargas/${carga.id}/archivo`}
                    className="mt-1 inline-block text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                  >
                    Ver archivo
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function FilaGrupoCargaExitosa({ grupo }: { grupo: GrupoCargaExitosaVista }) {
  return (
    <tr className="align-top transition-colors hover:bg-gob-neutral/50">
      <th scope="row" className="min-w-40 break-all px-3 py-2 font-medium text-gob-black">
        {grupo.vigente.nombreArchivoOriginal}
        {grupo.vigente.motivoTipo === "RECHAZO" ? (
          <span className="mt-1 block rounded-md border border-gob-danger bg-white px-2 py-1 text-xs font-medium text-gob-danger">
            Rechazada: {grupo.vigente.motivo}
          </span>
        ) : null}
        <HistorialReemplazadas reemplazadas={grupo.reemplazadas} />
      </th>
      <td className="px-3 py-2 text-gob-gray-a">{grupo.formatoExcelNombre}</td>
      <td className="px-3 py-2 tabular-nums text-gob-gray-a">{grupo.anio}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">{grupo.vigente.vistoBuenoEl}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <a
          href={`/api/notificador/cargas/${grupo.vigente.id}/archivo`}
          className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
        >
          Ver archivo
        </a>
      </td>
    </tr>
  );
}

// Histórico de cargas exitosas del notificador (RF nuevo: "Mis cargas" movida al menú lateral),
// exclusivo de `/notificador/cargas`. Solo lectura: no hay acciones de escritura aquí, "Dar visto
// bueno" se queda en Inicio. Una fila por `ventanaCargaId` (la más reciente = vigente); si hay
// reemplazadas para esa misma combinación, quedan como historial anidado dentro de la misma fila.
type TablaMisCargasExitosasProps = {
  grupos: GrupoCargaExitosaVista[];
};

export function TablaMisCargasExitosas({ grupos }: TablaMisCargasExitosasProps) {
  const [filtroFormato, setFiltroFormato] = useState("");
  const [filtroAnio, setFiltroAnio] = useState("");

  const opcionesFormato: OpcionSelect[] = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const grupo of grupos) {
      vistos.set(grupo.formatoExcelId, grupo.formatoExcelNombre);
    }
    return [
      OPCION_TODOS_LOS_FORMATOS,
      ...Array.from(vistos, ([valor, etiqueta]) => ({ valor, etiqueta })),
    ];
  }, [grupos]);

  const opcionesAnio: OpcionSelect[] = useMemo(() => {
    const anios = Array.from(new Set(grupos.map((grupo) => grupo.anio))).sort((a, b) => b - a);
    return [OPCION_TODOS_LOS_ANIOS, ...anios.map((anio) => ({ valor: String(anio), etiqueta: String(anio) }))];
  }, [grupos]);

  const gruposFiltrados = useMemo(
    () => filtrarGrupos(grupos, { filtroFormato, filtroAnio }),
    [grupos, filtroFormato, filtroAnio],
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      <BuscadorMisCargasExitosas
        filtroFormato={filtroFormato}
        onCambiarFiltroFormato={setFiltroFormato}
        opcionesFormato={opcionesFormato}
        filtroAnio={filtroAnio}
        onCambiarFiltroAnio={setFiltroAnio}
        opcionesAnio={opcionesAnio}
      />

      {gruposFiltrados.length === 0 ? (
        <div className="rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">Ninguna carga coincide con el filtro</p>
          <p className="mt-2 text-sm text-gob-gray-a">Ajusta el formato o el año seleccionado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gob-accent bg-white">
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <caption className="sr-only">Cargas de archivo exitosas y finalizadas</caption>
            <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">Archivo</th>
                <th scope="col" className="px-3 py-3 font-semibold">Formato</th>
                <th scope="col" className="px-3 py-3 font-semibold">Año</th>
                <th scope="col" className="px-3 py-3 font-semibold">Aprobada el</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gob-accent/60">
              {gruposFiltrados.map((grupo) => (
                <FilaGrupoCargaExitosa key={grupo.ventanaCargaId} grupo={grupo} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
