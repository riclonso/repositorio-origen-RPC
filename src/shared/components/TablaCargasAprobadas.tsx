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
    <div className="overflow-x-auto rounded-lg border border-gob-neutral bg-white shadow-md">
      <table className="w-full min-w-3xl border-collapse text-left text-sm">
        <caption className="sr-only">Cargas de archivo aprobadas</caption>
        <thead className="bg-gob-primary text-xs uppercase tracking-wide text-white font-semibold">
          <tr>
            <th scope="col" className="px-4 py-4">Archivo</th>
            <th scope="col" className="px-4 py-4">Formato</th>
            <th scope="col" className="px-4 py-4">Año</th>
            <th scope="col" className="px-4 py-4">Notificador</th>
            <th scope="col" className="px-4 py-4">Filas</th>
            <th scope="col" className="px-4 py-4">Visto bueno</th>
            <th scope="col" className="whitespace-nowrap px-4 py-4 text-right">
              Detalle
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-neutral">
          {filas.map((fila) => (
            <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/40">
              <th scope="row" className="min-w-40 break-all px-4 py-3 font-medium text-gob-black">
                {fila.nombreArchivoOriginal}
              </th>
              <td className="px-4 py-3 text-gob-gray-a">{fila.formatoExcelNombre}</td>
              <td className="px-4 py-3 tabular-nums text-gob-gray-a">{fila.anio}</td>
              <td className="px-4 py-3 text-gob-gray-a">
                {fila.usuarioNombre}
                <span className="block text-xs tabular-nums text-gob-gray-b">{fila.usuarioRut}</span>
              </td>
              <td className="px-4 py-3 tabular-nums text-gob-gray-a">{fila.cantidadFilasDatos}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gob-gray-a">
                {fila.vistoBuenoEl}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <Link
                  href={rutaDetalle(fila.id)}
                  className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline transition-colors hover:text-gob-primary-oscuro"
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
