import Link from "next/link";
import type { CargaArchivoResumen } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

export type FilaCargaAprobadaVista = Pick<
  CargaArchivoResumen,
  | "id"
  | "formatoExcelNombre"
  | "anio"
  | "usuarioNombre"
  | "usuarioRut"
  | "nombreArchivoOriginal"
  | "cantidadFilasDatos"
> & { vistoBuenoEl: string };

export function aFilaCargaAprobadaVista(carga: CargaArchivoResumen): FilaCargaAprobadaVista {
  return {
    id: carga.id,
    formatoExcelNombre: carga.formatoExcelNombre,
    anio: carga.anio,
    usuarioNombre: carga.usuarioNombre,
    usuarioRut: carga.usuarioRut,
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
    cantidadFilasDatos: carga.cantidadFilasDatos,
    vistoBuenoEl: carga.vistoBuenoEn ? formatearFechaHora(carga.vistoBuenoEn) : "—",
  };
}

// Listado de solo lectura de cargas ya aprobadas, compartido entre `/dashboard/cargas` (ADMIN) y
// `/revisor/cargas` (REVISOR_REPOSITORIO): misma tabla, cada área arma su propia ruta de detalle.
type TablaCargasAprobadasProps = {
  filas: FilaCargaAprobadaVista[];
  rutaDetalle: (id: string) => string;
};

export function TablaCargasAprobadas({ filas, rutaDetalle }: TablaCargasAprobadasProps) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gob-accent bg-white">
      <table className="w-full min-w-3xl border-collapse text-left text-sm">
        <caption className="sr-only">Cargas de archivo aprobadas</caption>
        <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
          <tr>
            <th scope="col" className="px-3 py-3 font-semibold">Archivo</th>
            <th scope="col" className="px-3 py-3 font-semibold">Formato</th>
            <th scope="col" className="px-3 py-3 font-semibold">Año</th>
            <th scope="col" className="px-3 py-3 font-semibold">Notificador</th>
            <th scope="col" className="px-3 py-3 font-semibold">Filas</th>
            <th scope="col" className="px-3 py-3 font-semibold">Visto bueno</th>
            <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
              Detalle
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-accent/60">
          {filas.map((fila) => (
            <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
              <th scope="row" className="min-w-40 break-all px-3 py-2 font-medium text-gob-black">
                {fila.nombreArchivoOriginal}
              </th>
              <td className="px-3 py-2 text-gob-gray-a">{fila.formatoExcelNombre}</td>
              <td className="px-3 py-2 tabular-nums text-gob-gray-a">{fila.anio}</td>
              <td className="px-3 py-2 text-gob-gray-a">
                {fila.usuarioNombre}
                <span className="block text-xs tabular-nums text-gob-gray-b">{fila.usuarioRut}</span>
              </td>
              <td className="px-3 py-2 tabular-nums text-gob-gray-a">{fila.cantidadFilasDatos}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                {fila.vistoBuenoEl}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <Link
                  href={rutaDetalle(fila.id)}
                  className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                >
                  Ver detalle
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
