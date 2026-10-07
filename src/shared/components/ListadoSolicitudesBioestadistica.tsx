import { listarSolicitudesBioestadisticaParaRevision } from "@/modules/bioestadistica/application/use-cases/ListarSolicitudesBioestadistica";
import { solicitudBioestadisticaVencida } from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import { ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import { prismaSolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository";
import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { Paginacion } from "@/shared/components/Paginacion";
import { PestanasEstadoSolicitud } from "@/shared/components/PestanasEstadoSolicitud";
import { TablaSolicitudesReemplazo, type FilaSolicitudReemplazoVista } from "@/shared/components/TablaSolicitudesReemplazo";
import { formatearFechaHora } from "@/shared/utils/fecha";

const RUTA_API_REVISION = "/api/dashboard/solicitudes-reemplazo-bioestadistica";

type ListadoSolicitudesBioestadisticaProps = {
  filtro: { estado: EstadoSolicitudReemplazoCarga; pagina: number; tamano: number };
  construirHref: (pagina: number, estado?: EstadoSolicitudReemplazoCarga) => string;
};

// RF-37: bandeja de solicitudes de reemplazo de Bioestadística, compartida por ADMIN y
// REVISOR_REPOSITORIO. Reutiliza la tabla y las pestañas de la bandeja del notificador; solo cambia
// el origen de los datos y el endpoint de revisión.
export async function ListadoSolicitudesBioestadistica({ filtro, construirHref }: ListadoSolicitudesBioestadisticaProps) {
  const resultado = await listarSolicitudesBioestadisticaParaRevision(filtro, {
    repositorio: prismaSolicitudReemplazoBioestadisticaRepository,
    repositorioVentanas: prismaVentanaCargaRepository,
  });

  const ahora = new Date();

  const filas: FilaSolicitudReemplazoVista[] = resultado.solicitudes.map((solicitud) => ({
    id: solicitud.id,
    nombreReporte: ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA[solicitud.tipoArchivo],
    anio: solicitud.anio,
    nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
    solicitadoPorNombre: solicitud.solicitadoPorNombre,
    solicitadoPorRut: solicitud.solicitadoPorRut,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    etiquetaOrigen: null,
    revisadoPorNombre: solicitud.revisadoPorNombre,
    revisadoEnTexto: solicitud.revisadoEn ? formatearFechaHora(solicitud.revisadoEn) : null,
    comentarioRevision: solicitud.comentarioRevision,
    vencida: solicitudBioestadisticaVencida(solicitud, resultado.resumenesPorAnio.get(solicitud.anio) ?? null, ahora),
    creadaElTexto: formatearFechaHora(solicitud.createdAt),
  }));

  return (
    <section>
      <PestanasEstadoSolicitud estadoActivo={filtro.estado} construirHref={construirHref} />

      <p aria-live="polite" className="mt-4 text-sm font-medium text-gob-gray-a">
        {resultado.paginacion.total === 1 ? "1 solicitud encontrada" : `${resultado.paginacion.total} solicitudes encontradas`}
      </p>

      {filas.length > 0 ? (
        <>
          <TablaSolicitudesReemplazo
            filas={filas}
            rutaApiRevision={RUTA_API_REVISION}
            encabezadoPrimeraColumna="Archivo / Año"
            descripcion="Solicitudes de reemplazo de archivos de Bioestadística"
          />
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
            Cuando alguien de Bioestadística pida reemplazar un archivo enviado, aparecerá aquí.
          </p>
        </div>
      )}
    </section>
  );
}
