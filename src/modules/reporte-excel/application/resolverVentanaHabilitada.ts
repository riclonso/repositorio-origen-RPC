import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { estaAbierta, ventanaAdmiteAutorizaciones } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { reaperturaVigente } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";

export type MotivoVentanaNoHabilitada = "SIN_VENTANA_ABIERTA" | "VENTANA_NO_PUBLICADA";

// ¿Tiene el notificador, en esta ventana cerrada por fecha, una habilitación fuera de plazo
// vigente? Reapertura por rechazo (RF-20/RF-22) o solicitud de reemplazo aprobada y utilizable
// sobre su `APROBADA` vigente (RF-36). Ninguna se consume aquí: se consumen al finalizar
// (`CargaArchivoRepository.finalizar()`). La reapertura primero: es una sola lectura y cubre
// también el camino RF-22, que habilita por reapertura.
async function tieneHabilitacionFueraDePlazo(
  ventana: VentanaCarga,
  usuarioId: string,
  ahora: Date,
  dependencias: { repositorio: CargaArchivoRepository; repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository },
): Promise<boolean> {
  const reapertura = await dependencias.repositorio.obtenerReaperturaPendientePorUsuarioYVentana(usuarioId, ventana.id);

  if (reapertura && reaperturaVigente(reapertura, { fechaVencimiento: ventana.fechaVencimiento }, ahora)) {
    return true;
  }

  const vigente = await dependencias.repositorio.obtenerAprobadaVigentePorUsuarioYVentana(usuarioId, ventana.id);

  if (!vigente) return false;

  const solicitud = await dependencias.repositorioSolicitudesReemplazo.obtenerAprobadaUtilizablePorCarga(vigente.id, ahora);
  return solicitud !== null;
}

// Regla única de "¿admite esta ventana una subida (o la finalización de una carga) de este
// notificador ahora?". La usan `RecibirArchivoCarga` y `FinalizarYEnviarCarga` (que revalida, para
// no aceptar la finalización de un archivo subido justo antes de que la ventana cerrara, se
// despublicara o se archivara). Orden (RF-36, ajuste aprobado):
//
// 1. Ventana inexistente o eliminada → `SIN_VENTANA_ABIERTA`.
// 2. Abierta: habilitada si está publicada y no archivada; si no → `VENTANA_NO_PUBLICADA` (el
//    llamador lo responde igual que `SIN_VENTANA_ABIERTA`, para no revelar que existe un borrador).
// 3. Cerrada por fecha: archivada o despublicada → `SIN_VENTANA_ABIERTA` (ninguna autorización
//    vale); publicada → habilitada solo con una reapertura vigente o una solicitud de reemplazo
//    aprobada y utilizable (`tieneHabilitacionFueraDePlazo`).
//
// Que la subida sea además un reemplazo autorizado lo decide aparte `resolverAutorizacionReemplazo`.
// Devuelve `null` si está habilitada.
export async function resolverVentanaHabilitada(
  entrada: { ventana: VentanaCarga | null; usuarioId: string; ahora: Date },
  dependencias: { repositorio: CargaArchivoRepository; repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository },
): Promise<MotivoVentanaNoHabilitada | null> {
  const { ventana } = entrada;

  if (!ventana || ventana.eliminadaEn !== null) {
    return "SIN_VENTANA_ABIERTA";
  }

  const admiteAutorizaciones = ventanaAdmiteAutorizaciones(ventana);

  if (estaAbierta(ventana, entrada.ahora)) {
    return admiteAutorizaciones ? null : "VENTANA_NO_PUBLICADA";
  }

  if (!admiteAutorizaciones) {
    return "SIN_VENTANA_ABIERTA";
  }

  const habilitada = await tieneHabilitacionFueraDePlazo(ventana, entrada.usuarioId, entrada.ahora, dependencias);
  return habilitada ? null : "SIN_VENTANA_ABIERTA";
}
