"use client";

import { useEffect, useId, useRef } from "react";
import type { FilaCargaExitosaVista } from "@/shared/components/mis-cargas-exitosas";

type ModalHistorialRechazosProps = {
  abierto: boolean;
  titulo: string;
  cargas: FilaCargaExitosaVista[];
  onCerrar: () => void;
};

// Historial de rechazos y reemplazos de una combinación (formato, ventana) en "Mis cargas". Es un
// `<dialog>` nativo, igual que `ModalVistaPreviaColumnas`: mantiene el foco dentro y se cierra con
// Escape.
export function ModalHistorialRechazos({ abierto, titulo, cargas, onCerrar }: ModalHistorialRechazosProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      onClose={onCerrar}
      className="m-auto w-[calc(100vw-2rem)] max-w-6xl overflow-hidden rounded-lg border border-gob-accent bg-white p-0 text-left text-gob-black shadow-2xl backdrop:bg-slate-950/55"
    >
      <header className="flex items-start justify-between gap-4 border-b border-gob-accent px-5 py-4">
        <div>
          <h2 id={idTitulo} className="text-lg font-semibold text-gob-tertiary">
            Historial de rechazos
          </h2>
          <p className="mt-0.5 text-sm text-gob-gray-a">{titulo}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar historial de rechazos"
          className="inline-flex size-8 items-center justify-center rounded text-2xl leading-none text-gob-gray-a hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          ×
        </button>
      </header>

      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <caption className="sr-only">Rechazos y reemplazos de esta combinación de formato y ventana</caption>
          <thead className="sticky top-0 bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
              <th scope="col" className="px-4 py-3 font-semibold">Tipo</th>
              <th scope="col" className="px-4 py-3 font-semibold">Archivo</th>
              <th scope="col" className="px-4 py-3 font-semibold">Motivo</th>
              <th scope="col" className="px-4 py-3 font-semibold">Rechazado por</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Descarga</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {cargas.map((carga) => (
              <tr key={carga.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gob-gray-a">{carga.desactivadaEl ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gob-danger">
                  {carga.motivoTipo === "REEMPLAZO" ? "Reemplazada" : "Rechazada"}
                </td>
                <th scope="row" className="min-w-40 break-all px-4 py-3 font-medium text-gob-black">
                  {carga.nombreArchivoOriginal}
                </th>
                <td className="min-w-48 max-w-xs px-4 py-3 text-gob-gray-a">{carga.motivo ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gob-gray-a">{carga.rechazadoPor ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <a
                    href={`/api/notificador/cargas/${carga.id}/archivo`}
                    className="font-medium text-gob-primary underline-offset-2 hover:underline"
                  >
                    Ver archivo
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex justify-end border-t border-gob-accent px-5 py-3">
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-black transition-colors hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}
