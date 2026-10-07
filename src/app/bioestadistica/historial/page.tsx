import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { listarHistorialBioestadistica } from "@/modules/bioestadistica/application/use-cases/ListarHistorialBioestadistica";
import type { CargaBioestadistica } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import { ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";
import { prismaSolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { formatearFechaHora } from "@/shared/utils/fecha";
import { formatearTamanoArchivo } from "@/shared/utils/tamanoArchivo";
import {
  TablaHistorialBioestadistica,
  type ArchivoHistorialVista,
  type GrupoHistorialVista,
} from "./tabla-historial-bioestadistica";

export const metadata: Metadata = {
  title: "Mis archivos - Bioestadística - Repositorio RPC - SEREMI de Salud Biobío",
};

function aArchivoVista(carga: CargaBioestadistica): ArchivoHistorialVista {
  return {
    id: carga.id,
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
    subidoElTexto: formatearFechaHora(carga.createdAt),
    cantidadFilasDatos: carga.cantidadFilasDatos,
    tamanoTexto: formatearTamanoArchivo(carga.tamanoBytes),
    desactivadoElTexto: carga.desactivadaEn ? formatearFechaHora(carga.desactivadaEn) : null,
  };
}

// RF-37: historial propio por año y tipo (vigente + reemplazados) con descarga y "Solicitar
// reemplazo" del vigente.
export default async function HistorialBioestadisticaPage() {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect("/login");

  const grupos = await listarHistorialBioestadistica(sesion.sub, new Date(), {
    repositorioCargas: prismaCargaBioestadisticaRepository,
    repositorioSolicitudes: prismaSolicitudReemplazoBioestadisticaRepository,
    repositorioVentanas: prismaVentanaCargaRepository,
  });

  const vistas: GrupoHistorialVista[] = grupos.map((grupo) => ({
    clave: `${grupo.anio}-${grupo.tipoArchivo}`,
    anio: grupo.anio,
    etiquetaTipo: ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA[grupo.tipoArchivo],
    vigente: grupo.vigente ? aArchivoVista(grupo.vigente) : null,
    reemplazados: grupo.reemplazadas.map(aArchivoVista),
    accionReemplazo: grupo.accionReemplazo.tipo,
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Mis archivos</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Archivos que reportaste por año. Cuando se reemplaza un archivo, el anterior queda desactivado y se conserva en
        la misma fila.
      </p>

      {vistas.length > 0 ? (
        <TablaHistorialBioestadistica grupos={vistas} />
      ) : (
        <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">Aún no has reportado archivos</p>
          <p className="mt-2 text-sm text-gob-gray-a">Sube tus archivos de Defunciones y Egresos desde el inicio.</p>
        </div>
      )}
    </div>
  );
}
