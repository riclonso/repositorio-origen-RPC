import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import { resolverAutorizacionReemplazo } from "@/modules/reporte-excel/application/resolverAutorizacionReemplazo";
import { resolverVentanaHabilitada } from "@/modules/reporte-excel/application/resolverVentanaHabilitada";

export type ResultadoFinalizarYEnviarCarga =
  | { ok: true; carga: CargaArchivo; solicitudReemplazoId: string | null }
  // Cubre "no existe", "no es del actor", "no está PENDIENTE_VISTO_BUENO", "ya finalizada" y "no es
  // el último intento de su combinación": indistinguibles, mismo criterio del resto del módulo.
  | { ok: false; motivo: "NO_ENCONTRADO" }
  // La ventana cerró (sin reapertura ni solicitud de reemplazo vigente), se despublicó o se archivó
  // entre la subida y la finalización.
  | { ok: false; motivo: "SIN_VENTANA_ABIERTA" }
  | { ok: false; motivo: "VENTANA_NO_PUBLICADA" }
  // Ya hay una `APROBADA` vigente y la autorización que habilitó la subida venció o fue consumida
  // entretanto (p.ej. por una finalización concurrente).
  | { ok: false; motivo: "REEMPLAZO_NO_AUTORIZADO" }
  // Otra carga de la misma combinación ya está finalizada y sin decidir.
  | { ok: false; motivo: "CARGA_PENDIENTE_DECISION" };

// Corrección (fin de la autoaprobación, RF-14/RF-20): este paso NO aprueba nada: marca que el
// notificador dueño de la carga terminó de revisarla y la envía a decisión de un tercero
// (ADMIN/REVISOR_REPOSITORIO). Mismo estado (`PENDIENTE_VISTO_BUENO`), solo se fija `finalizadaEn`.
// Irreversible y sin doble finalización.
//
// Es además el punto donde se CONSUMEN las autorizaciones (solicitud de reemplazo y reaperturas),
// no la subida: así un intento con errores, o uno sin errores que el notificador no llegó a
// finalizar, no lo deja bloqueado. Por eso revalida aquí, con un `ahora` fresco, la misma
// habilitación que la subida (ventana y autorización de reemplazo): pudo vencer entre ambos pasos.
export async function finalizarYEnviarCarga(
  id: string,
  usuarioId: string,
  dependencias: {
    repositorio: CargaArchivoRepository;
    repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository;
    repositorioVentanasCarga: VentanaCargaRepository;
  },
): Promise<ResultadoFinalizarYEnviarCarga> {
  const carga = await dependencias.repositorio.obtenerPropiaPorId(id, usuarioId);

  if (!carga || carga.estado !== "PENDIENTE_VISTO_BUENO" || carga.finalizadaEn !== null) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Solo el intento más reciente de la combinación (usuario, ventana) puede finalizarse: un
  // borrador anterior, superado por una subida posterior, no debe poder enviarse ni consumir la
  // autorización que habilitó a la última.
  const [ultima, ventana] = await Promise.all([
    dependencias.repositorio.obtenerUltimaPorUsuarioYVentana(usuarioId, carga.ventanaCargaId),
    dependencias.repositorioVentanasCarga.obtenerPorId(carga.ventanaCargaId),
  ]);

  if (!ultima || ultima.id !== carga.id) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const ahora = new Date();

  const motivoVentana = await resolverVentanaHabilitada(
    { ventana, usuarioId, ahora },
    {
      repositorio: dependencias.repositorio,
      repositorioSolicitudesReemplazo: dependencias.repositorioSolicitudesReemplazo,
    },
  );

  if (motivoVentana) {
    return { ok: false, motivo: motivoVentana };
  }

  const autorizacion = await resolverAutorizacionReemplazo(
    { usuarioId, ventanaCargaId: carga.ventanaCargaId, ahora },
    {
      repositorio: dependencias.repositorio,
      repositorioSolicitudesReemplazo: dependencias.repositorioSolicitudesReemplazo,
    },
  );

  if (!autorizacion.autorizado) {
    return { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" };
  }

  // El repositorio cierra las ventanas de carrera restantes en una sola transacción: doble
  // finalización (`NO_ENCONTRADO`), otra carga de la combinación finalizada entretanto
  // (`CARGA_PENDIENTE_DECISION`) y la solicitud consumida por otra petición
  // (`REEMPLAZO_NO_AUTORIZADO`).
  const resultado = await dependencias.repositorio.finalizar(id, usuarioId, {
    solicitudReemplazoId: autorizacion.solicitudReemplazoId,
  });

  if (!resultado.ok) {
    return { ok: false, motivo: resultado.motivo };
  }

  return { ok: true, carga: resultado.carga, solicitudReemplazoId: autorizacion.solicitudReemplazoId };
}
