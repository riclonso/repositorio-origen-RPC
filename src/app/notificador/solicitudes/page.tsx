import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { listarSolicitudesReemplazoPropias } from "@/modules/solicitudes-reemplazo/application/use-cases/ListarSolicitudesReemplazoPropias";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { solicitudVencida } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { TablaMisSolicitudesReemplazo, type FilaMiSolicitudReemplazoVista } from "@/shared/components/TablaMisSolicitudesReemplazo";
import { formatearFechaHora } from "@/shared/utils/fecha";

export const metadata: Metadata = {
  title: "Mis solicitudes - Repositorio RPC - SEREMI de Salud Biobío",
};

export default async function MisSolicitudesPage() {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const resultado = await listarSolicitudesReemplazoPropias(sesion.sub, {
    repositorio: prismaSolicitudReemplazoCargaRepository,
  });

  const ahora = new Date();

  const filas: FilaMiSolicitudReemplazoVista[] = resultado.solicitudes.map((solicitud) => ({
    id: solicitud.id,
    formatoExcelNombre: solicitud.formatoExcelNombre,
    anio: solicitud.anio,
    nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    comentarioRevision: solicitud.comentarioRevision,
    vencida: solicitudVencida(solicitud, ahora),
    creadaElTexto: formatearFechaHora(solicitud.createdAt),
  }));

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-gob-black">Mis solicitudes</h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Seguimiento de tus solicitudes para reemplazar una carga ya aprobada.
        </p>
      </div>

      {filas.length > 0 ? (
        <TablaMisSolicitudesReemplazo filas={filas} />
      ) : (
        <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">Aún no has solicitado ningún reemplazo</p>
          <p className="mt-2 text-sm text-gob-gray-a">
            Si necesitas corregir una carga ya aprobada, solicita su reemplazo desde el inicio.
          </p>
        </div>
      )}
    </div>
  );
}
