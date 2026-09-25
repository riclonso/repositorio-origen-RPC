import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

// Vista de "Mis solicitudes" (`/notificador/solicitudes`): seguimiento propio, solo lectura. Sin
// acciones (aprobar/rechazar es exclusivo de `/dashboard/solicitudes` y `/revisor/solicitudes`),
// así que es un Server Component puro, sin interactividad de cliente, mismo criterio que
// `TablaCargasVentana.tsx`.
export type FilaMiSolicitudReemplazoVista = {
  id: string;
  formatoExcelNombre: string;
  anio: number;
  nombreArchivoOriginal: string;
  motivo: string;
  estado: EstadoSolicitudReemplazoCarga;
  comentarioRevision: string | null;
  vencida: boolean;
  creadaElTexto: string;
};

const ETIQUETAS_ESTADO: Record<EstadoSolicitudReemplazoCarga, string> = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

// Fondo de color + texto blanco (no solo borde/texto): mismo criterio que
// `shared/utils/estadoCargaArchivo.ts` para las cargas. Sin un token `gob-*` naranja en la paleta,
// "Pendiente" usa el naranjo genérico de Tailwind, igual que el chip de "Solicitudes" del menú
// lateral de ADMIN/REVISOR_REPOSITORIO (`NavegacionPanel.tsx`).
const CLASES_ESTADO: Record<EstadoSolicitudReemplazoCarga, string> = {
  PENDIENTE: "bg-orange-500 text-white border-orange-500",
  APROBADA: "bg-gob-success text-white border-gob-success",
  RECHAZADA: "bg-gob-danger text-white border-gob-danger",
};

function BadgeEstado({ fila }: { fila: FilaMiSolicitudReemplazoVista }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${CLASES_ESTADO[fila.estado]}`}
      >
        {ETIQUETAS_ESTADO[fila.estado]}
      </span>
      {fila.vencida ? (
        <span className="inline-flex items-center rounded-full border border-gob-gray-b bg-white px-2 py-0.5 text-xs font-semibold text-gob-gray-a">
          Vencida
        </span>
      ) : null}
    </span>
  );
}

type TablaMisSolicitudesReemplazoProps = {
  filas: FilaMiSolicitudReemplazoVista[];
};

export function TablaMisSolicitudesReemplazo({ filas }: TablaMisSolicitudesReemplazoProps) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gob-accent bg-white">
      <table className="w-full min-w-3xl border-collapse text-left text-sm">
        <caption className="sr-only">Mis solicitudes de reemplazo</caption>
        <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
          <tr>
            <th scope="col" className="px-3 py-3 font-semibold">Formato / Año</th>
            <th scope="col" className="px-3 py-3 font-semibold">Motivo</th>
            <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
            <th scope="col" className="px-3 py-3 font-semibold">Comentario</th>
            <th scope="col" className="px-3 py-3 font-semibold">Solicitada el</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-accent/60">
          {filas.map((fila) => (
            <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
              <th scope="row" className="min-w-40 px-3 py-2 font-medium text-gob-black">
                {fila.formatoExcelNombre} · {fila.anio}
                <span className="block break-all text-xs font-normal text-gob-gray-a">{fila.nombreArchivoOriginal}</span>
              </th>
              <td className="min-w-48 px-3 py-2 text-gob-gray-a">{fila.motivo}</td>
              <td className="whitespace-nowrap px-3 py-2">
                <BadgeEstado fila={fila} />
              </td>
              <td className="min-w-40 px-3 py-2 text-gob-gray-a">{fila.comentarioRevision ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">{fila.creadaElTexto}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
