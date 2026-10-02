import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { estaAbierta } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { reaperturaVigente } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";

export type MotivoVentanaNoHabilitada = "SIN_VENTANA_ABIERTA" | "VENTANA_NO_PUBLICADA";

// Regla única de "¿admite esta ventana una subida (o la finalización de una carga) de este
// notificador ahora?". La usan `ValidarYCargarArchivo` y `FinalizarYEnviarCarga` (que revalida, para
// no aceptar la finalización de un archivo subido justo antes de que la ventana cerrara o se
// despublicara). Mismo orden que tenía la subida:
//
// 1. Ventana inexistente o eliminada → `SIN_VENTANA_ABIERTA`.
// 2. Cerrada: solo habilitada si el notificador tiene una reapertura vigente (su carga anterior de
//    esta combinación fue rechazada y el plazo no expiró). Aquí NO se consume: se consume al
//    finalizar (`CargaArchivoRepository.finalizar()`).
// 3. No publicada (borrador) → `VENTANA_NO_PUBLICADA` (el llamador lo responde igual que
//    `SIN_VENTANA_ABIERTA`, para no revelar que existe un borrador).
//
// Devuelve `null` si está habilitada.
export async function resolverVentanaHabilitada(
  entrada: { ventana: VentanaCarga | null; usuarioId: string; ahora: Date },
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<MotivoVentanaNoHabilitada | null> {
  const { ventana } = entrada;

  if (!ventana || ventana.eliminadaEn !== null) {
    return "SIN_VENTANA_ABIERTA";
  }

  if (!estaAbierta(ventana, entrada.ahora)) {
    const reapertura = await dependencias.repositorio.obtenerReaperturaPendientePorUsuarioYVentana(
      entrada.usuarioId,
      ventana.id,
    );

    if (!reapertura || !reaperturaVigente(reapertura, { fechaVencimiento: ventana.fechaVencimiento }, entrada.ahora)) {
      return "SIN_VENTANA_ABIERTA";
    }
  }

  if (!ventana.publicada) {
    return "VENTANA_NO_PUBLICADA";
  }

  return null;
}
