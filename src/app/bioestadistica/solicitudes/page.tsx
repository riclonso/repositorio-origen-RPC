import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { listarSolicitudesBioestadisticaPropias } from "@/modules/bioestadistica/application/use-cases/ListarSolicitudesBioestadistica";
import { solicitudBioestadisticaVencida } from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import { ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import { prismaSolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { TablaMisSolicitudesReemplazo, type FilaMiSolicitudReemplazoVista } from "@/shared/components/TablaMisSolicitudesReemplazo";
import { formatearFechaHora } from "@/shared/utils/fecha";

export const metadata: Metadata = {
  title: "Mis solicitudes - Bioestadística - Repositorio RPC - SEREMI de Salud Biobío",
};

// RF-37: seguimiento propio de las solicitudes de reemplazo (solo lectura), con la misma tabla que
// el notificador.
export default async function MisSolicitudesBioestadisticaPage() {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect("/login");

  const { solicitudes, resumenesPorAnio } = await listarSolicitudesBioestadisticaPropias(sesion.sub, {
    repositorio: prismaSolicitudReemplazoBioestadisticaRepository,
    repositorioVentanas: prismaVentanaCargaRepository,
  });

  const ahora = new Date();

  const filas: FilaMiSolicitudReemplazoVista[] = solicitudes.map((solicitud) => ({
    id: solicitud.id,
    nombreReporte: ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA[solicitud.tipoArchivo],
    anio: solicitud.anio,
    nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    comentarioRevision: solicitud.comentarioRevision,
    vencida: solicitudBioestadisticaVencida(solicitud, resumenesPorAnio.get(solicitud.anio) ?? null, ahora),
    creadaElTexto: formatearFechaHora(solicitud.createdAt),
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Mis solicitudes</h1>
      <p className="mt-2 text-sm text-gob-gray-a">Seguimiento de tus solicitudes para reemplazar un archivo ya enviado.</p>

      {filas.length > 0 ? (
        <TablaMisSolicitudesReemplazo filas={filas} encabezadoPrimeraColumna="Archivo / Año" />
      ) : (
        <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">Aún no has solicitado ningún reemplazo</p>
          <p className="mt-2 text-sm text-gob-gray-a">
            Si necesitas corregir un archivo ya enviado, solicita su reemplazo desde el inicio o desde Mis archivos.
          </p>
        </div>
      )}
    </div>
  );
}
