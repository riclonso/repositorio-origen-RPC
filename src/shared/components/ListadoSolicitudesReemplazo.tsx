import type {
  EstadoSolicitudReemplazoCarga,
  FiltroListadoSolicitudesReemplazo,
  OrigenSolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { solicitudVencida } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { listarSolicitudesReemplazoParaRevision } from "@/modules/solicitudes-reemplazo/application/use-cases/ListarSolicitudesReemplazoParaRevision";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { Paginacion } from "@/shared/components/Paginacion";
import { PestanasEstadoSolicitud } from "@/shared/components/PestanasEstadoSolicitud";
import { TablaSolicitudesReemplazo, type FilaSolicitudReemplazoVista } from "@/shared/components/TablaSolicitudesReemplazo";
import { formatearFechaHora } from "@/shared/utils/fecha";

const RUTA_API_REVISION = "/api/dashboard/solicitudes-reemplazo";

// Mejora menor de UX (no bloqueante, ver diseño aprobado): distingue en el listado si la
// solicitud es para reemplazar una carga ya aprobada o una pendiente de decisión, sin afectar el
// flujo de aprobar/rechazar (idéntico para ambos orígenes).
const ETIQUETAS_ORIGEN: Record<OrigenSolicitudReemplazoCarga, string> = {
  CARGA_APROBADA: "Reemplazo de carga aprobada",
  CARGA_PENDIENTE_DECISION: "Reemplazo de carga pendiente de decisión",
};

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
    nombreReporte: solicitud.formatoExcelNombre,
    anio: solicitud.anio,
    nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
    solicitadoPorNombre: solicitud.solicitadoPorNombre,
    solicitadoPorRut: solicitud.solicitadoPorRut,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    etiquetaOrigen: ETIQUETAS_ORIGEN[solicitud.origen],
    revisadoPorNombre: solicitud.revisadoPorNombre,
    revisadoEnTexto: solicitud.revisadoEn ? formatearFechaHora(solicitud.revisadoEn) : null,
    comentarioRevision: solicitud.comentarioRevision,
    vencida: solicitudVencida(solicitud, ahora),
    creadaElTexto: formatearFechaHora(solicitud.createdAt),
  }));

  return (
    <section>
      <PestanasEstadoSolicitud estadoActivo={filtro.estado} construirHref={construirHref} />

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
