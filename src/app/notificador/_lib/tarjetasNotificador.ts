import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import type { FormatoExcelAsignado } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { AutorizadorVentanaNotificador } from "@/modules/formatos-excel/application/ports";
import { listarVentanasDisponiblesParaNotificador } from "@/modules/ventanas-carga/application/use-cases/ListarVentanasDisponiblesParaNotificador";
import { listarVentanasQueAdmitenAutorizaciones } from "@/modules/ventanas-carga/application/use-cases/ListarVentanasQueAdmitenAutorizaciones";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { estaAbierta, type VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { listarSolicitudesReemplazoPropias } from "@/modules/solicitudes-reemplazo/application/use-cases/ListarSolicitudesReemplazoPropias";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { solicitudUtilizable } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { listarReaperturasVigentesPropias } from "@/modules/reporte-excel/application/use-cases/ListarReaperturasVigentesPropias";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";

// FUENTE ÚNICA del predicado "esta ventana tiene tarjeta en el panel del notificador". La usan
// `app/notificador/page.tsx` (para pintar las tarjetas) y RF-45 (para autorizar la descarga de las
// reglas de llenado de una ventana). Prohibido duplicarlo: si cambia el criterio del panel, cambia
// también quién puede descargar.

export type TarjetaVentanaNotificador = {
  formato: FormatoExcelAsignado;
  ventana: VentanaCarga;
  cerrada: boolean;
};

export type TarjetasNotificador = {
  formatos: FormatoExcelAsignado[];
  solicitudesPropias: Awaited<ReturnType<typeof listarSolicitudesReemplazoPropias>>;
  reaperturasVigentes: Awaited<ReturnType<typeof listarReaperturasVigentesPropias>>;
  // Ventanas con tarjeta (publicadas y abiertas, o cerradas con autorización), sin cruzar con formatos.
  ventanasConTarjeta: { ventana: VentanaCarga; cerrada: boolean }[];
  // Una entrada por cada par (formato asignado, ventana con tarjeta) cuyo formato coincide.
  tarjetas: TarjetaVentanaNotificador[];
};

export async function resolverTarjetasNotificador(usuarioId: string, ahora: Date): Promise<TarjetasNotificador> {
  // Sin un formato asignado, el notificador no puede subir nada (RF-14). Sin ninguna ventana de
  // carga publicada y abierta ahora mismo (RF-15 ampliación), tampoco.
  const [formatos, ventanasDisponibles, solicitudesPropias, reaperturasVigentes] = await Promise.all([
    prismaFormatoExcelRepository.listarAsignadosAUsuario(usuarioId),
    listarVentanasDisponiblesParaNotificador({ repositorio: prismaVentanaCargaRepository }, ahora),
    listarSolicitudesReemplazoPropias(usuarioId, { repositorio: prismaSolicitudReemplazoCargaRepository }),
    listarReaperturasVigentesPropias(usuarioId, { repositorio: prismaCargaArchivoRepository }),
  ]);

  const idsVentanasDisponibles = new Set(ventanasDisponibles.map((ventana) => ventana.id));

  // RF-36: ventanas ya cerradas por fecha en las que el notificador tiene una solicitud de reemplazo
  // en curso (PENDIENTE) o utilizable, o una reapertura vigente: también reciben su tarjeta, para
  // que pueda seguir la solicitud o subir fuera de plazo. Archivadas, despublicadas y eliminadas
  // quedan fuera (`listarVentanasQueAdmitenAutorizaciones`). Una sola consulta para todas.
  const idsVentanasConAutorizacion = new Set(
    [
      ...solicitudesPropias.solicitudes
        .filter((solicitud) => solicitud.estado === "PENDIENTE" || solicitudUtilizable(solicitud, ahora))
        .map((solicitud) => solicitud.ventanaCargaId),
      ...reaperturasVigentes.map((reapertura) => reapertura.ventanaCargaId),
    ].filter((id) => !idsVentanasDisponibles.has(id)),
  );
  const ventanasCerradas = (
    await listarVentanasQueAdmitenAutorizaciones([...idsVentanasConAutorizacion], {
      repositorio: prismaVentanaCargaRepository,
    })
  ).filter((ventana) => !estaAbierta(ventana, ahora));

  const ventanasConTarjeta = [
    ...ventanasDisponibles.map((ventana) => ({ ventana, cerrada: false })),
    ...ventanasCerradas.map((ventana) => ({ ventana, cerrada: true })),
  ];

  // El notificador solo debe ver la ventana para subir el archivo que le corresponde (RF-15
  // ampliación; comparación de id exacta del formato).
  const tarjetas = formatos.flatMap((formato) =>
    ventanasConTarjeta
      .filter(({ ventana }) => ventana.formatoExcelId === formato.id)
      .map(({ ventana, cerrada }) => ({ formato, ventana, cerrada })),
  );

  return { formatos, solicitudesPropias, reaperturasVigentes, ventanasConTarjeta, tarjetas };
}

// RF-45: autorización de la descarga de reglas por ventana con EXACTAMENTE el mismo predicado.
export const autorizadorVentanaNotificador: AutorizadorVentanaNotificador = {
  async formatoDeVentanaConTarjeta(usuarioId, ventanaCargaId) {
    const { tarjetas } = await resolverTarjetasNotificador(usuarioId, new Date());
    const tarjeta = tarjetas.find(({ ventana }) => ventana.id === ventanaCargaId);
    return tarjeta ? tarjeta.ventana.formatoExcelId : null;
  },
};
