import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { listarCargasPanelNotificador } from "@/modules/reporte-excel/application/use-cases/ListarCargasPanelNotificador";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  fechaVencimientoSolicitud,
  solicitudUtilizable,
  solicitudVencida,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { resolverTarjetasNotificador } from "./_lib/tarjetasNotificador";
import type { ReaperturaVigentePropiaVista } from "@/shared/components/BannerReaperturaCarga";
import {
  listarVentanasConNoLeidosSinTarjeta,
  obtenerResumenMensajesPorVentana,
} from "@/modules/mensajeria/application/use-cases/ObtenerResumenMensajesPorVentana";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { tituloVentanaMensajes, type VentanaMensajesSinLeerVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import {
  PanelCargaArchivo,
  type CargaResumenVista,
  type CombinacionCargaVista,
  type SolicitudReemplazoPropiaVista,
} from "./panel-carga-archivo";

export default async function NotificadorPage() {
  // El proxy ya garantiza una sesión de perfil notificador antes de llegar aquí; estas comprobaciones
  // son la red de seguridad para el caso borde de una cuenta borrada con el token aún vigente.
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);

  // Cuenta borrada con sesión vigente: se fuerza el reingreso en vez de saludar a una identidad que
  // ya no existe. Es el camino más robusto porque no deja renderizar un panel sin dueño. (El sistema
  // solo hace baja lógica, no borrado físico, así que es un escenario verdaderamente excepcional.)
  if (!usuario) {
    redirect("/login");
  }

  // Formatos asignados, ventanas con tarjeta (abiertas, o RF-36 cerradas con autorización),
  // solicitudes y reaperturas propias: `resolverTarjetasNotificador` es la FUENTE ÚNICA del predicado
  // de tarjeta (también autoriza la descarga de reglas de llenado, RF-45). `PanelCargaArchivo` muestra
  // un único mensaje genérico cuando el arreglo de combinaciones viene vacío, sin distinguir la causa.
  const ahora = new Date();
  const [tarjetasNotificador, cargasPropias, mensajesPorVentana] = await Promise.all([
    resolverTarjetasNotificador(sesion.sub, ahora),
    // Intentos recientes + las cargas que determinan el estado de cada tarjeta, para que una
    // `APROBADA` vigente o una pendiente finalizada nunca queden fuera de un corte de página.
    listarCargasPanelNotificador(sesion.sub, { repositorio: prismaCargaArchivoRepository }),
    // RF-31: avisos de mensajes del equipo revisor por ventana, solo del propio hilo (dos `groupBy`).
    obtenerResumenMensajesPorVentana(
      { lado: "NOTIFICADOR", notificadorId: sesion.sub },
      { repositorio: prismaMensajeCargaRepository },
    ),
  ]);
  const { solicitudesPropias, reaperturasVigentes, ventanasConTarjeta, tarjetas } = tarjetasNotificador;

  const combinaciones: CombinacionCargaVista[] = tarjetas.map(({ formato, ventana, cerrada }) => ({
    formatoExcelId: formato.id,
    formatoNombre: formato.nombre,
    anio: ventana.anio,
    ventanaCargaId: ventana.id,
    fechaApertura: ventana.fechaApertura.toISOString(),
    fechaVencimiento: ventana.fechaVencimiento.toISOString(),
    cerrada,
    // RF-45: solo el nombre del archivo de reglas (de la misma consulta de formatos), nunca quién lo subió.
    reglasLlenadoNombre: formato.reglasLlenadoNombre,
  }));

  const cargasIniciales: CargaResumenVista[] = cargasPropias.map((carga) => ({
    ...carga,
    createdAt: carga.createdAt.toISOString(),
    vistoBuenoEn: carga.vistoBuenoEn ? carga.vistoBuenoEn.toISOString() : null,
    finalizadaEn: carga.finalizadaEn ? carga.finalizadaEn.toISOString() : null,
  }));

  const solicitudesIniciales: SolicitudReemplazoPropiaVista[] = solicitudesPropias.solicitudes.map((solicitud) => ({
    id: solicitud.id,
    cargaArchivoId: solicitud.cargaArchivoId,
    ventanaCargaId: solicitud.ventanaCargaId,
    motivo: solicitud.motivo,
    comentarioRevision: solicitud.comentarioRevision,
    estado: solicitud.estado,
    origen: solicitud.origen,
    vencida: solicitudVencida(solicitud, ahora),
    utilizable: solicitudUtilizable(solicitud, ahora),
    venceEl: fechaVencimientoSolicitud(solicitud)?.toISOString() ?? null,
  }));

  // El aviso de rechazo solo se muestra si la ventana tiene tarjeta (publicada y abierta, o RF-36
  // cerrada por fecha con la reapertura vigente): con una ventana en borrador o archivada el
  // notificador no puede volver a subir, y el aviso solo generaría confusión.
  const idsVentanasConTarjeta = new Set(ventanasConTarjeta.map(({ ventana }) => ventana.id));
  const reaperturasIniciales: ReaperturaVigentePropiaVista[] = reaperturasVigentes
    .filter((reapertura) => idsVentanasConTarjeta.has(reapertura.ventanaCargaId))
    .map((reapertura) => ({
      ...reapertura,
      fechaLimite: reapertura.fechaLimite.toISOString(),
      rechazadoEn: reapertura.rechazadoEn.toISOString(),
    }));

  // RF-31: ventanas con mensajes sin leer que no tienen tarjeta en este panel (cerradas, no
  // publicadas o con el formato ya no asignado): se avisan en un banner aparte.
  const ventanasConNoLeidosSinTarjeta = await listarVentanasConNoLeidosSinTarjeta(
    mensajesPorVentana.noLeidosPorVentana,
    combinaciones.map((combinacion) => combinacion.ventanaCargaId),
    { repositorio: prismaMensajeCargaRepository },
  );
  const ventanasMensajesSinLeer: VentanaMensajesSinLeerVista[] = ventanasConNoLeidosSinTarjeta.map((ventana) => ({
    ventanaCargaId: ventana.ventanaCargaId,
    titulo: tituloVentanaMensajes(ventana.formatoExcelNombre, ventana.anio),
  }));

  return (
    <div className="mx-auto w-full max-w-7xl pb-8">
      <section className="flex flex-col justify-between gap-6 pb-8 sm:flex-row sm:items-end">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-gob-primary">Registro Poblacional de Cáncer</p>
          <h1 className="text-4xl font-bold tracking-tight text-gob-black">Hola, {usuario.nombres}</h1>
          <p className="text-base text-gob-gray-a max-w-2xl leading-relaxed">Centro de notificación y reporte de información del RPC.</p>
        </div>
      </section>

      <PanelCargaArchivo
        combinaciones={combinaciones}
        cargasIniciales={cargasIniciales}
        solicitudesIniciales={solicitudesIniciales}
        reaperturasIniciales={reaperturasIniciales}
        mensajesPorVentana={mensajesPorVentana.porVentana}
        ventanasMensajesSinLeer={ventanasMensajesSinLeer}
      />
    </div>
  );
}
