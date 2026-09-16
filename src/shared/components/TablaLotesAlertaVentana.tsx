"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Paginacion } from "@/shared/components/Paginacion";
import { formatearFechaHora } from "@/shared/utils/fecha";

export type TipoLoteAlertaVista = "AUTOMATICA" | "MANUAL_MASIVA" | "MANUAL_INDIVIDUAL";
export type ResultadoAlertaVista = "EXITO" | "ERROR";

export type DestinatarioLoteVista = {
  usuarioId: string;
  nombreCompleto: string;
  email: string;
  resultado: ResultadoAlertaVista;
  detalleError: string | null;
  createdAt: string;
};

export type LoteAlertaVista = {
  loteId: string;
  tipo: TipoLoteAlertaVista;
  disparadoPorNombre: string | null;
  creadoEn: string;
  cantidadExitos: number;
  cantidadErrores: number;
  // Destinatarios ya precargados por el Server Component que arma la página (nunca una llamada de
  // red al expandir la fila).
  destinatarios: DestinatarioLoteVista[];
};

const ETIQUETA_TIPO: Record<TipoLoteAlertaVista, string> = {
  AUTOMATICA: "Automático",
  MANUAL_MASIVA: "Manual (masivo)",
  MANUAL_INDIVIDUAL: "Manual (individual)",
};

type TablaLotesAlertaVentanaProps = {
  titulo: string;
  lotes: LoteAlertaVista[];
  pagina: number;
  tamano: number;
  total: number;
  // Nombre del parámetro de query que esta tabla controla ("paginaAutomatica" o "paginaManual"):
  // reutilizable para ambas categorías sin repetir el componente.
  parametroPagina: "paginaAutomatica" | "paginaManual";
  mensajeVacio: string;
};

function totalPaginas(total: number, tamano: number): number {
  return Math.max(1, Math.ceil(total / tamano));
}

// RF-17: historial de envíos, reutilizable para ambas categorías (automática/manual). Una fila
// por lote, expandible a un acordeón local (sin llamada de red) con la lista de destinatarios.
export function TablaLotesAlertaVentana({
  titulo,
  lotes,
  pagina,
  tamano,
  total,
  parametroPagina,
  mensajeVacio,
}: TablaLotesAlertaVentanaProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loteExpandido, setLoteExpandido] = useState<string | null>(null);

  function construirHref(numeroPagina: number): string {
    const parametros = new URLSearchParams(searchParams.toString());
    if (numeroPagina > 1) parametros.set(parametroPagina, String(numeroPagina));
    else parametros.delete(parametroPagina);

    const query = parametros.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <section aria-labelledby={`titulo-lotes-${parametroPagina}`} className="rounded-lg border border-gob-accent bg-white p-4">
      <h3 id={`titulo-lotes-${parametroPagina}`} className="text-sm font-semibold text-gob-black">
        {titulo}
      </h3>

      {lotes.length === 0 ? (
        <p className="mt-3 text-sm text-gob-gray-a">{mensajeVacio}</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-2xl border-collapse text-left text-sm">
              <caption className="sr-only">{titulo}</caption>
              <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Fecha</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Tipo</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Disparado por</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Éxitos</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Errores</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gob-accent/60">
                {lotes.map((lote) => {
                  const expandido = loteExpandido === lote.loteId;

                  return (
                    <FragmentoLoteAlerta
                      key={lote.loteId}
                      lote={lote}
                      expandido={expandido}
                      onAlternar={() => setLoteExpandido(expandido ? null : lote.loteId)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            totalPaginas={totalPaginas(total, tamano)}
            cantidadEnPagina={lotes.length}
            construirHref={construirHref}
          />
        </>
      )}
    </section>
  );
}

type FragmentoLoteAlertaProps = {
  lote: LoteAlertaVista;
  expandido: boolean;
  onAlternar: () => void;
};

// Fila de lote + fila de detalle expandible, agrupadas en un fragmento propio para no anidar toda
// la ramificación del acordeón dentro del `map` de la tabla.
function FragmentoLoteAlerta({ lote, expandido, onAlternar }: FragmentoLoteAlertaProps) {
  return (
    <>
      <tr>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
          {formatearFechaHora(new Date(lote.creadoEn))}
        </td>
        <td className="px-3 py-2 text-gob-gray-a">{ETIQUETA_TIPO[lote.tipo]}</td>
        <td className="px-3 py-2 text-gob-gray-a">{lote.disparadoPorNombre ?? "Sistema (automático)"}</td>
        <td className="px-3 py-2 tabular-nums text-gob-primary">{lote.cantidadExitos}</td>
        <td className="px-3 py-2 tabular-nums text-gob-danger">{lote.cantidadErrores}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={expandido}
            className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
          >
            {expandido ? "Ocultar" : "Ver destinatarios"}
          </button>
        </td>
      </tr>
      {expandido ? (
        <tr>
          <td colSpan={6} className="bg-gob-neutral/50 px-3 py-3">
            <table className="w-full min-w-lg border-collapse text-left text-xs">
              <caption className="sr-only">Destinatarios del lote</caption>
              <thead className="uppercase tracking-wide text-gob-gray-a">
                <tr>
                  <th scope="col" className="px-2 py-1 font-semibold">Nombre</th>
                  <th scope="col" className="px-2 py-1 font-semibold">Correo</th>
                  <th scope="col" className="px-2 py-1 font-semibold">Hora</th>
                  <th scope="col" className="px-2 py-1 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gob-accent/60">
                {lote.destinatarios.map((destinatario) => (
                  <tr key={destinatario.usuarioId}>
                    <td className="px-2 py-1 text-gob-black">{destinatario.nombreCompleto}</td>
                    <td className="px-2 py-1 text-gob-gray-a">{destinatario.email}</td>
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums text-gob-gray-a">
                      {formatearFechaHora(new Date(destinatario.createdAt))}
                    </td>
                    <td className={`px-2 py-1 font-medium ${destinatario.resultado === "EXITO" ? "text-gob-primary" : "text-gob-danger"}`}>
                      {destinatario.resultado === "EXITO" ? "Éxito" : `Error${destinatario.detalleError ? `: ${destinatario.detalleError}` : ""}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}
