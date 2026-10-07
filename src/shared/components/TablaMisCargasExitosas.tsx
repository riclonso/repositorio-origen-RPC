"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { FormularioSolicitudReemplazo } from "@/shared/components/FormularioSolicitudReemplazo";
import { ModalHistorialRechazos } from "@/shared/components/ModalHistorialRechazos";
import type { FilaCargaExitosaVista, GrupoCargaExitosaVista } from "@/shared/components/mis-cargas-exitosas";

// Opciones sintéticas que representan "sin filtro" en los `<select>` del buscador: no son un
// formato/año real, así que no pueden viajar como una de las opciones derivadas de `grupos`.
const OPCION_TODOS_LOS_FORMATOS: OpcionSelect = { valor: "", etiqueta: "Todos" };
const OPCION_TODOS_LOS_ANIOS: OpcionSelect = { valor: "", etiqueta: "Todos" };

// Encabezados de la tabla, en el orden de las celdas de `FilaGrupoCargaExitosa` (la columna
// "Detalle", alineada a la derecha, va aparte).
const COLUMNAS_MIS_CARGAS = ["Archivo", "Estado", "Formato", "Año", "Aprobada el", "Reemplazo"] as const;

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

// Enlace "Detalle" de la columna Detalle: abre el historial de rechazos y reemplazos del grupo en
// un modal. Botón (no `<a>`) porque abre un diálogo en vez de navegar; se estiliza como enlace.
function DetalleHistorialRechazos({ titulo, cargas }: { titulo: string; cargas: FilaCargaExitosaVista[] }) {
  const [abierto, setAbierto] = useState(false);

  if (cargas.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className="mt-1 block w-full text-right text-sm font-medium text-gob-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
      >
        Historial rechazos ({cargas.length})
      </button>
      <ModalHistorialRechazos abierto={abierto} titulo={titulo} cargas={cargas} onCerrar={() => setAbierto(false)} />
    </>
  );
}

// RF-36: columna "Reemplazo" de la fila vigente. Se puede pedir aunque la ventana ya haya vencido
// (no si fue archivada, despublicada o eliminada: `NO_DISPONIBLE`). Tras enviar la solicitud se
// refresca la página para que la fila muestre su estado real desde el servidor.
function CeldaReemplazo({ grupo }: { grupo: GrupoCargaExitosaVista }) {
  const router = useRouter();
  const estado = grupo.estadoReemplazo;

  switch (estado.tipo) {
    case "SOLICITAR":
      return (
        <FormularioSolicitudReemplazo
          rutaApi="/api/notificador/solicitudes-reemplazo"
          cuerpo={{ cargaArchivoId: grupo.vigente.id }}
          idBase={grupo.vigente.id}
          placeholderMotivo="Explica por qué necesitas reemplazar esta carga ya aprobada"
          varianteBoton="texto"
          etiquetaAccesible={`Solicitar reemplazo de ${grupo.vigente.nombreArchivoOriginal}`}
          onExito={() => router.refresh()}
        />
      );
    case "SOLICITUD_PENDIENTE":
      return (
        <span className="w-fit rounded-full border border-gob-primary bg-white px-2 py-0.5 text-xs font-semibold text-gob-primary">
          Solicitud pendiente
        </span>
      );
    case "REEMPLAZO_AUTORIZADO":
      return (
        <span className="text-xs text-gob-gray-a">
          <span className="block w-fit rounded-full border border-gob-success bg-white px-2 py-0.5 font-semibold text-gob-success">
            Reemplazo autorizado
          </span>
          <span className="mt-1 block">
            Súbelo desde Inicio hasta el{" "}
            <time dateTime={estado.venceElIso} className="font-semibold tabular-nums">
              {estado.venceEl}
            </time>
          </span>
        </span>
      );
    default:
      return <span className="text-xs text-gob-gray-a">—</span>;
  }
}

// La fila principal de un grupo puede ser una carga RECHAZADA todavía sin sucesora aprobada (ver
// `FilaCargaExitosaVista`): se distingue con estado propio y fondo rojo claro para que no se lea
// como exitosa, y no muestra su fecha de aprobación original.
function FilaGrupoCargaExitosa({ grupo }: { grupo: GrupoCargaExitosaVista }) {
  const rechazada = grupo.vigente.motivoTipo === "RECHAZO";
  // Todos los rechazos/reemplazos del grupo, incluido el de la fila principal si está rechazada.
  const historial = (rechazada ? [grupo.vigente, ...grupo.reemplazadas] : grupo.reemplazadas).toSorted((a, b) =>
    (b.desactivadaEnIso ?? "").localeCompare(a.desactivadaEnIso ?? ""),
  );

  return (
    <tr
      className={`align-top transition-colors ${
        rechazada ? "bg-gob-danger/10 hover:bg-gob-danger/15" : "hover:bg-gob-neutral/50"
      }`}
    >
      <th scope="row" className="min-w-40 break-all px-3 py-2 font-medium text-gob-black">
        {grupo.vigente.nombreArchivoOriginal}
      </th>
      <td className="px-3 py-2">
        {rechazada ? (
          <span className="inline-flex flex-col gap-0.5">
            <span className="w-fit rounded-full border border-gob-danger bg-white px-2 py-0.5 text-xs font-semibold text-gob-danger">
              Rechazada
            </span>
          </span>
        ) : (
          <span className="rounded-full border border-gob-success bg-white px-2 py-0.5 text-xs font-semibold text-gob-success">
            Aprobada
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-gob-gray-a">{grupo.formatoExcelNombre}</td>
      <td className="px-3 py-2 tabular-nums text-gob-gray-a">{grupo.anio}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
        {rechazada ? "—" : grupo.vigente.vistoBuenoEl}
      </td>
      <td className="px-3 py-2">
        <CeldaReemplazo grupo={grupo} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {/* El enlace había quedado sin texto (invisible y sin nombre accesible). */}
        <a
          href={`/api/notificador/cargas/${grupo.vigente.id}/archivo`}
          aria-label={`Descargar ${grupo.vigente.nombreArchivoOriginal}`}
          className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
        >
          Descargar
        </a>
        <DetalleHistorialRechazos titulo={`${grupo.formatoExcelNombre} · ${grupo.anio}`} cargas={historial} />
      </td>
    </tr>
  );
}

// Histórico de cargas exitosas del notificador (RF nuevo: "Mis cargas" movida al menú lateral),
// exclusivo de `/notificador/cargas`. Única escritura: "Solicitar reemplazo" de la fila vigente
// (RF-36); la subida del reemplazo se hace en Inicio. Una fila por `ventanaCargaId` (la más reciente = vigente); si hay
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
                {COLUMNAS_MIS_CARGAS.map((columna) => (
                  <th key={columna} scope="col" className="px-3 py-3 font-semibold">
                    {columna}
                  </th>
                ))}
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
