import type { CargaArchivoResumen } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Vista liviana de una fila rechazada: mismo criterio que `FilaCargaVentanaVista`, con el motivo y
// quién/cuándo rechazó ya formateados por el Server Component que arma esta vista
// (`ListadoCargasRechazadasVentana.tsx`).
export type FilaCargaRechazadaVista = Pick<
  CargaArchivoResumen,
  "id" | "usuarioNombre" | "usuarioRut" | "nombreArchivoOriginal"
> & { rechazadoPorNombre: string; motivo: string; rechazadoEl: string };

type TablaCargasRechazadasVentanaProps = {
  filas: FilaCargaRechazadaVista[];
};

// Sección "Rechazadas" del detalle de una ventana: solo lectura, sin acciones (el rechazo es
// irreversible, no hay nada que hacer aquí más que consultar el motivo).
export function TablaCargasRechazadasVentana({ filas }: TablaCargasRechazadasVentanaProps) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gob-accent bg-white">
      <table className="w-full min-w-3xl border-collapse text-left text-sm">
        <caption className="sr-only">Cargas rechazadas de la ventana</caption>
        <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
          <tr>
            <th scope="col" className="px-3 py-3 font-semibold">Reportado por</th>
            <th scope="col" className="px-3 py-3 font-semibold">Archivo</th>
            <th scope="col" className="px-3 py-3 font-semibold">Motivo del rechazo</th>
            <th scope="col" className="px-3 py-3 font-semibold">Rechazada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-accent/60">
          {filas.map((fila) => (
            <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
              <th scope="row" className="px-3 py-2 font-medium text-gob-black">
                {fila.usuarioNombre}
                <span className="block text-xs tabular-nums text-gob-gray-b">{fila.usuarioRut}</span>
              </th>
              <td className="min-w-40 break-all px-3 py-2 text-gob-gray-a">{fila.nombreArchivoOriginal}</td>
              <td className="min-w-48 break-words px-3 py-2 text-gob-gray-a">{fila.motivo}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                {fila.rechazadoEl}
                <span className="block text-xs text-gob-gray-b">por {fila.rechazadoPorNombre}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
