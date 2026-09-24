import Link from "next/link";
import type {
  EstadoSolicitudReemplazoCarga,
  FiltroListadoSolicitudesReemplazo,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { solicitudVencida } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { listarSolicitudesReemplazoParaRevision } from "@/modules/solicitudes-reemplazo/application/use-cases/ListarSolicitudesReemplazoParaRevision";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { Paginacion } from "@/shared/components/Paginacion";
import { TablaSolicitudesReemplazo, type FilaSolicitudReemplazoVista } from "@/shared/components/TablaSolicitudesReemplazo";
import { formatearFechaHora } from "@/shared/utils/fecha";

const RUTA_API_REVISION = "/api/dashboard/solicitudes-reemplazo";

const PESTANAS: { estado: EstadoSolicitudReemplazoCarga; etiqueta: string }[] = [
  { estado: "PENDIENTE", etiqueta: "Pendientes" },
  { estado: "APROBADA", etiqueta: "Aprobadas" },
  { estado: "RECHAZADA", etiqueta: "Rechazadas" },
];

function PestanasEstado({
  estadoActivo,
  construirHref,
}: {
  estadoActivo: EstadoSolicitudReemplazoCarga;
  construirHref: (pagina: number, estado?: EstadoSolicitudReemplazoCarga) => string;
}) {
  return (
    <nav aria-label="Filtrar por estado" className="mt-4 flex flex-wrap gap-2">
      {PESTANAS.map((pestana) => {
        const activa = pestana.estado === estadoActivo;
        return (
          <Link
            key={pestana.estado}
            href={construirHref(1, pestana.estado)}
            aria-current={activa ? "page" : undefined}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              activa
                ? "border-gob-primary bg-gob-primary text-white"
                : "border-gob-accent bg-white text-gob-gray-a hover:bg-gob-neutral"
            }`}
          >
            {pestana.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

// Compartido entre `/dashboard/solicitudes` (ADMIN) y `/revisor/solicitudes` (REVISOR_REPOSITORIO):
// misma bandeja de revisión, mismo endpoint de escritura (`exigirAdminORevisor`), cada área solo
// aporta su propio constructor de URL de filtro/paginación.
type ListadoSolicitudesReemplazoProps = {
  filtro: FiltroListadoSolicitudesReemplazo & { estado: EstadoSolicitudReemplazoCarga };
  construirHref: (pagina: number, estado?: EstadoSolicitudReemplazoCarga) => string;
};

export async function ListadoSolicitudesReemplazo({ filtro, construirHref }: ListadoSolicitudesReemplazoProps) {
  const resultado = await listarSolicitudesReemplazoParaRevision(filtro, {
    repositorio: prismaSolicitudReemplazoCargaRepository,
  });

  const ahora = new Date();

  const filas: FilaSolicitudReemplazoVista[] = resultado.filas.map((solicitud) => ({
    id: solicitud.id,
    formatoExcelNombre: solicitud.formatoExcelNombre,
    anio: solicitud.anio,
    nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
    solicitadoPorNombre: solicitud.solicitadoPorNombre,
    solicitadoPorRut: solicitud.solicitadoPorRut,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    revisadoPorNombre: solicitud.revisadoPorNombre,
    revisadoEnTexto: solicitud.revisadoEn ? formatearFechaHora(solicitud.revisadoEn) : null,
    comentarioRevision: solicitud.comentarioRevision,
    vencida: solicitudVencida(solicitud, ahora),
    creadaElTexto: formatearFechaHora(solicitud.createdAt),
  }));

  return (
    <section>
      <PestanasEstado estadoActivo={filtro.estado} construirHref={construirHref} />

      <p aria-live="polite" className="mt-4 text-sm font-medium text-gob-gray-a">
        {resultado.paginacion.total === 1
          ? "1 solicitud encontrada"
          : `${resultado.paginacion.total} solicitudes encontradas`}
      </p>

      {filas.length > 0 ? (
        <>
          <TablaSolicitudesReemplazo filas={filas} rutaApiRevision={RUTA_API_REVISION} />
          <Paginacion
            pagina={resultado.paginacion.pagina}
            tamano={resultado.paginacion.tamano}
            total={resultado.paginacion.total}
            totalPaginas={resultado.paginacion.totalPaginas}
            cantidadEnPagina={filas.length}
            construirHref={(pagina) => construirHref(pagina, filtro.estado)}
          />
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">No hay solicitudes en este estado</p>
          <p className="mt-2 text-sm text-gob-gray-a">
            Cuando un notificador pida reemplazar una carga aprobada, aparecerá aquí.
          </p>
        </div>
      )}
    </section>
  );
}
