import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { obtenerPanelBioestadistica } from "@/modules/bioestadistica/application/use-cases/ObtenerPanelBioestadistica";
import { MENSAJES_MOTIVO_FALLO } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import { ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";
import { prismaSolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { formatearFechaCalendario, formatearFechaHora } from "@/shared/utils/fecha";
import { PanelBioestadistica, type TarjetaBioestadisticaVista } from "./panel-bioestadistica";

export const metadata: Metadata = {
  title: "Inicio - Bioestadística - Repositorio RPC - SEREMI de Salud Biobío",
};

// RF-37: inicio del perfil Bioestadística. El proxy ya garantiza la sesión y el perfil; estas
// comprobaciones son la red de seguridad para una cuenta borrada con el token aún vigente.
export default async function BioestadisticaPage() {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect("/login");

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);
  if (!usuario) redirect("/login");

  const tarjetas = await obtenerPanelBioestadistica(sesion.sub, new Date(), {
    repositorioCargas: prismaCargaBioestadisticaRepository,
    repositorioSolicitudes: prismaSolicitudReemplazoBioestadisticaRepository,
    repositorioVentanas: prismaVentanaCargaRepository,
  });

  const vistas: TarjetaBioestadisticaVista[] = tarjetas.map((tarjeta) => ({
    clave: `${tarjeta.anio}-${tarjeta.tipoArchivo}`,
    anio: tarjeta.anio,
    tipoArchivo: tarjeta.tipoArchivo,
    etiquetaTipo: ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA[tarjeta.tipoArchivo],
    // Fecha de calendario de la ventana (hora de pared de Chile escrita en UTC).
    cierraElTexto: tarjeta.cierraEl ? formatearFechaCalendario(tarjeta.cierraEl) : null,
    estado: tarjeta.estado,
    cargaActiva: tarjeta.cargaActiva
      ? {
          id: tarjeta.cargaActiva.id,
          nombreArchivoOriginal: tarjeta.cargaActiva.nombreArchivoOriginal,
          subidoElTexto: formatearFechaHora(tarjeta.cargaActiva.createdAt),
          cantidadFilasDatos: tarjeta.cargaActiva.cantidadFilasDatos,
        }
      : null,
    venceElAutorizacionIso: tarjeta.venceElAutorizacion?.toISOString() ?? null,
    venceElAutorizacionTexto: tarjeta.venceElAutorizacion ? formatearFechaHora(tarjeta.venceElAutorizacion) : null,
    ultimoFallo: tarjeta.ultimoFallo
      ? {
          mensaje: MENSAJES_MOTIVO_FALLO[tarjeta.ultimoFallo.motivo],
          nombreArchivoOriginal: tarjeta.ultimoFallo.nombreArchivoOriginal,
          fechaTexto: formatearFechaHora(tarjeta.ultimoFallo.fecha),
        }
      : null,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl pb-8">
      <section className="space-y-3 pb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-gob-primary">Registro Poblacional de Cáncer</p>
        <h1 className="text-4xl font-bold tracking-tight text-gob-black">Hola, {usuario.nombres}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-gob-gray-a">
          Reporta los archivos de Defunciones y Egresos de cada año disponible, en Excel (.xlsx) o CSV, con la primera
          fila como encabezados.
        </p>
      </section>

      <PanelBioestadistica tarjetas={vistas} />
    </div>
  );
}
