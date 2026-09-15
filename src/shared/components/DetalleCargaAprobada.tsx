import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Compartido entre `/dashboard/cargas/[id]` y `/revisor/cargas/[id]`: misma información de solo
// lectura para ambos perfiles. La descarga usa siempre el endpoint bajo `/api/dashboard/cargas`
// (guardado por `exigirAdminORevisor`, visible a ambos), tal como quedó definido en el diseño.
type DetalleCargaAprobadaProps = {
  carga: CargaArchivo;
};

export function DetalleCargaAprobada({ carga }: DetalleCargaAprobadaProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="break-all text-xl font-semibold text-gob-black">{carga.nombreArchivoOriginal}</h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Formato: {carga.formatoExcelNombre} · Año {carga.anio} · Subido por {carga.usuarioNombre} (
          {carga.usuarioRut})
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-lg border border-gob-accent bg-white p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-gob-gray-a">Filas de datos</dt>
          <dd className="font-medium text-gob-black">{carga.cantidadFilasDatos}</dd>
        </div>
        <div>
          <dt className="text-gob-gray-a">Visto bueno</dt>
          <dd className="font-medium text-gob-black">
            {carga.vistoBuenoEn ? formatearFechaHora(carga.vistoBuenoEn) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-gob-gray-a">Subido el</dt>
          <dd className="font-medium text-gob-black">{formatearFechaHora(carga.createdAt)}</dd>
        </div>
      </dl>

      <a
        href={`/api/dashboard/cargas/${carga.id}/archivo`}
        className="inline-flex w-fit items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
      >
        Descargar archivo
      </a>
    </div>
  );
}
