import { ViewTransition } from "react";
import Link from "next/link";
import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { ResumenErroresCarga } from "@/shared/components/ResumenErroresCarga";
import { ETIQUETAS_ESTADO } from "@/shared/utils/estadoCargaArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Detalle de una carga propia del notificador (RF-14 ampliación): encabezado con los datos de la
// subida, detalle completo de errores (reutiliza `ResumenErroresCarga`, mismo componente que ya
// se usa justo tras subir el archivo) y, si tiene errores, un enlace de descarga a
// `/api/notificador/cargas/[id]/errores`. Envuelto en `<ViewTransition>` porque es el contenido
// principal de su `page.tsx` (mismo patrón que `DetalleVentanaCarga.tsx`).
type DetalleCargaPropiaProps = {
  carga: CargaArchivo;
};

export function DetalleCargaPropia({ carga }: DetalleCargaPropiaProps) {
  return (
    <ViewTransition>
      <div className="flex flex-col gap-6">
        <Link
          href="/notificador"
          className="w-fit text-sm font-medium text-gob-primary underline-offset-4 hover:underline"
        >
           Volver a atrás
        </Link>

        <div>
          <h1 className="break-all text-xl font-semibold text-gob-black">{carga.nombreArchivoOriginal}</h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Formato: {carga.formatoExcelNombre} · Año {carga.anio}
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-4 rounded-lg border border-gob-accent bg-white p-4 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-gob-gray-a">Estado</dt>
            <dd className="font-medium text-gob-black">{ETIQUETAS_ESTADO[carga.estado]}</dd>
          </div>
          <div>
            <dt className="text-gob-gray-a">Filas de datos</dt>
            <dd className="font-medium text-gob-black">{carga.cantidadFilasDatos}</dd>
          </div>
          <div>
            <dt className="text-gob-gray-a">Total de errores</dt>
            <dd className="font-medium text-gob-black">
              {carga.errores.length > 0 ? (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gob-danger px-2 text-xs font-bold text-white">
                  {carga.errores.length}
                </span>
              ) : (
                "0"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gob-gray-a">Subido el</dt>
            <dd className="font-medium text-gob-black">{formatearFechaHora(carga.createdAt)}</dd>
          </div>
           <div>
            <dt className="text-gob-gray-a">Archivos con errores</dt>
            <dd className="font-medium text-gob-black"> {carga.cantidadErrores > 0 ? (
          <a
            href={`/api/notificador/cargas/${carga.id}/errores`}
            className="inline-flex w-fit items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            Descargar errores (Excel)
          </a>
        ) : null}</dd>
          </div>
        </dl>

        <ResumenErroresCarga errores={carga.errores} />

       
      </div>
    </ViewTransition>
  );
}
