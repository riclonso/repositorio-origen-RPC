import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import { reaperturaAutorizaReemplazo } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";

export type ResultadoAutorizacionReemplazo =
  // `solicitudReemplazoId` no nulo solo cuando la autorización proviene de una
  // `SolicitudReemplazoCarga` que la finalización debe consumir; `null` cuando no hay una `APROBADA`
  // vigente (no es un reemplazo) o cuando autoriza una reapertura (que se consume siempre al
  // finalizar, sin id).
  | { autorizado: true; solicitudReemplazoId: string | null }
  | { autorizado: false };

// Regla única de "¿puede este notificador subir/finalizar un archivo para esta combinación
// (usuario, ventana) habiendo, o no, una carga ya aprobada?". La usan `ValidarYCargarArchivo` (al
// subir, sin consumir nada) y `FinalizarYEnviarCarga` (al finalizar, con `ahora` fresco, para
// consumir lo que corresponda). Mismo patrón que `validarEstablecimientoUsuario.ts` de `usuarios`:
// una función de aplicación compartida por varios casos de uso, contra interfaces de repositorio.
//
// 1. Sin `APROBADA` vigente (ver contrato de `obtenerAprobadaVigentePorUsuarioYVentana`): no es un
//    reemplazo, autorizado.
// 2. Con vigente, autorizado si existe una solicitud de reemplazo utilizable sobre ESA carga (se
//    prefiere: es la que debe consumirse), o una reapertura vigente posterior a la aprobación de esa
//    carga (`reaperturaAutorizaReemplazo`: p.ej. se rechazó la carga de reemplazo).
// 3. Si no, no autorizado (`REEMPLAZO_NO_AUTORIZADO` para el llamador).
export async function resolverAutorizacionReemplazo(
  entrada: { usuarioId: string; ventanaCargaId: string; ahora: Date },
  dependencias: {
    repositorio: CargaArchivoRepository;
    repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository;
  },
): Promise<ResultadoAutorizacionReemplazo> {
  const vigente = await dependencias.repositorio.obtenerAprobadaVigentePorUsuarioYVentana(
    entrada.usuarioId,
    entrada.ventanaCargaId,
  );

  if (!vigente) {
    return { autorizado: true, solicitudReemplazoId: null };
  }

  const [solicitud, reapertura] = await Promise.all([
    dependencias.repositorioSolicitudesReemplazo.obtenerAprobadaUtilizablePorCarga(vigente.id, entrada.ahora),
    dependencias.repositorio.obtenerReaperturaPendientePorUsuarioYVentana(entrada.usuarioId, entrada.ventanaCargaId),
  ]);

  if (solicitud) {
    return { autorizado: true, solicitudReemplazoId: solicitud.id };
  }

  if (
    reapertura &&
    reaperturaAutorizaReemplazo(reapertura, { fechaVencimiento: reapertura.ventanaFechaVencimiento }, vigente, entrada.ahora)
  ) {
    return { autorizado: true, solicitudReemplazoId: null };
  }

  return { autorizado: false };
}
