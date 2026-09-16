import type {
  DatosConfiguracionAlertasVentanaCarga,
  VentanaCargaRepository,
} from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

export type ResultadoConfigurarAlertasVentanaCarga =
  | { ok: true; ventana: VentanaCarga }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" };

// RF-17: activa/desactiva el envío automático de alertas de una ventana. La forma "ambos o
// ninguno" ya la garantiza `configurarAlertasVentanaCargaSchema` en el borde; este caso de uso
// solo orquesta la lectura/escritura, sin repetir esa regla.
export async function configurarAlertasVentanaCarga(
  id: string,
  datos: DatosConfiguracionAlertasVentanaCarga,
  dependencias: { repositorio: VentanaCargaRepository },
): Promise<ResultadoConfigurarAlertasVentanaCarga> {
  const actualizada = await dependencias.repositorio.configurarAlertas(id, datos);

  if (!actualizada) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  return { ok: true, ventana: actualizada };
}
