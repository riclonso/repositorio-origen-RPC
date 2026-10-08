import { fechaHoraNotificacion, type CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Compartido entre `/dashboard/cargas/[id]` y `/revisor/cargas/[id]`: misma información de solo
// lectura para ambos perfiles. La descarga usa siempre el endpoint bajo `/api/dashboard/cargas`
// (guardado por `exigirAdminORevisor`, visible a ambos), tal como quedó definido en el diseño. RF-38: la
// descarga principal lleva la columna "Fecha y hora de notificación"; el original, el archivo tal
// como se subió.
type DetalleCargaAprobadaProps = {
  carga: CargaArchivo;
};

export function DetalleCargaAprobada({ carga }: DetalleCargaAprobadaProps) {
  // Formateada en el servidor (este componente no es de cliente): sin desfases de zona horaria.
  const notificadaEn = fechaHoraNotificacion(carga);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="break-all text-xl font-semibold text-gob-black">{carga.nombreArchivoOriginal}</h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Formato: {carga.formatoExcelNombre} · Año {carga.anio} · Subido por {carga.usuarioNombre} (
          {carga.usuarioRut})
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-lg border border-gob-accent bg-white p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gob-gray-a">Filas de datos</dt>
          <dd className="font-medium text-gob-black">{carga.cantidadFilasDatos}</dd>
        </div>
        <div>
          <dt className="text-gob-gray-a">Notificado el</dt>
          <dd className="font-medium text-gob-black">{notificadaEn ? formatearFechaHora(notificadaEn) : "—"}</dd>
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

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={`/api/dashboard/cargas/${carga.id}/archivo`}
            className="inline-flex w-fit items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            Descargar archivo
          </a>
          <a
            href={`/api/dashboard/cargas/${carga.id}/archivo/original`}
            className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            Descargar original
          </a>
        </div>
        <p className="text-xs text-gob-gray-a">
          La descarga incluye la columna «Fecha y hora de notificación». El original es el archivo tal como lo subió
          el notificador.
        </p>
      </div>
    </div>
  );
}
