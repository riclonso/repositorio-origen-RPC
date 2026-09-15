import type { CargaArchivoResumen } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Vista liviana de una fila: solo lo que necesita esta tabla, no todo `CargaArchivoResumen`.
// `fechaReporte` ya llega formateada (con `formatearFechaHora`, no `formatearFechaCalendario`:
// `createdAt` es un timestamp real, no una fecha "de calendario") desde el Server Component que
// arma esta vista (`ListadoCargasVentana.tsx`), para no exportar un mapper no-componente desde
// este archivo (mismo criterio de `react-doctor/only-export-components` ya señalado en
// `TablaCargasAprobadas.tsx`, que este archivo evita a propósito).
export type FilaCargaVentanaVista = Pick<
  CargaArchivoResumen,
  "id" | "usuarioNombre" | "usuarioRut" | "nombreArchivoOriginal"
> & { fechaReporte: string };

// Detalle de las cargas ya APROBADAS de una ventana de carga puntual, compartido entre
// `/dashboard/ventanas-carga/[id]` (ADMIN) y `/revisor/ventanas-carga/[id]` (REVISOR_REPOSITORIO).
// La descarga reutiliza el endpoint existente `/api/dashboard/cargas/[id]/archivo`
// (guardado por `exigirAdminORevisor`, y que ya solo sirve binarios con `estado = APROBADA`), sin
// modificarlo, mismo criterio que `DetalleCargaAprobada.tsx`.
type TablaCargasVentanaProps = {
  filas: FilaCargaVentanaVista[];
};

export function TablaCargasVentana({ filas }: TablaCargasVentanaProps) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gob-accent bg-white">
      <table className="w-full min-w-2xl border-collapse text-left text-sm">
        <caption className="sr-only">Cargas aprobadas de la ventana</caption>
        <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
          <tr>
            <th scope="col" className="px-3 py-3 font-semibold">Reportado por</th>
            <th scope="col" className="px-3 py-3 font-semibold">Fecha de reporte</th>
            <th scope="col" className="px-3 py-3 font-semibold">Archivo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-accent/60">
          {filas.map((fila) => (
            <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
              <th scope="row" className="px-3 py-2 font-medium text-gob-black">
                {fila.usuarioNombre}
                <span className="block text-xs tabular-nums text-gob-gray-b">{fila.usuarioRut}</span>
              </th>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">{fila.fechaReporte}</td>
              <td className="min-w-40 break-all px-3 py-2 text-gob-gray-a">
                {fila.nombreArchivoOriginal}
                <a
                  href={`/api/dashboard/cargas/${fila.id}/archivo`}
                  className="ml-3 text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                >
                  Descargar
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
